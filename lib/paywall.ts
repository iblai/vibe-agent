// lib/paywall.ts — server-only paywall helpers. Uses IBLAI_API_KEY via
// config.apiKey(); never import from a client component.
// Relative import (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import config from "./iblai/config";

export const PAYWALL_APP_SLUG = process.env.PAYWALL_APP_SLUG ?? "";

export type PaywallUser = { username: string; email: string };

export type CataloguePrice = {
  id: string;
  productId: string;
  name: string;
  /** Minor units (cents), as Stripe stores it. */
  unitAmount: number;
  currency: string;
  interval: "month" | "year" | null;
};

// ponytail: per-lambda Map cache, ~60s TTL — cold starts just re-fetch.
const identityCache = new Map<string, { user: PaywallUser | null; at: number }>();
const IDENTITY_TTL_MS = 60_000;

/** End-user identity from their DM token — the ONLY trusted identity source. */
export async function resolveUser(dmToken: string): Promise<PaywallUser | null> {
  const hit = identityCache.get(dmToken);
  if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.user;

  const res = await fetch(`${config.dmUrl()}/api/core/token/verify/`, {
    headers: { Authorization: `Token ${dmToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null; // don't cache failures — token may be mid-refresh

  const body = await res.json().catch(() => null);
  // token/verify returns the token's own user: {username, email, …}. Platform
  // membership is enforced server-side by the payments endpoints (404 for
  // non-members), so there is no client-side membership check to get wrong.
  const user = body?.username ? { username: body.username, email: body.email ?? "" } : null;
  identityCache.set(dmToken, { user, at: Date.now() });
  return user;
}

/** The `Authorization: Token …` value on the request, or "". */
export function tokenFromRequest(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Token ") ? auth.slice(6).trim() : "";
}

/** Extract `Authorization: Token …` from the request and resolve the member. */
export async function userFromRequest(req: Request): Promise<PaywallUser | null> {
  const token = tokenFromRequest(req);
  return token ? resolveUser(token) : null;
}

/** The caller's own token plus their verified identity — the admin route needs both. */
export async function callerFromRequest(
  req: Request,
): Promise<{ token: string; user: PaywallUser } | null> {
  const token = tokenFromRequest(req);
  const user = token ? await resolveUser(token) : null;
  return user ? { token, user } : null;
}

/** RequestInit with plain-object headers, so they merge by spread. */
export type DmInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const proxyBase = (username: string) =>
  `${config.dmUrl()}/api/ai-mentor/orgs/${config.mainTenantKey()}` +
  `/users/${encodeURIComponent(username)}/providers/stripe/payments`;

function dmFetch(authorization: string, username: string, path: string, init?: DmInit) {
  return fetch(`${proxyBase(username)}${path}`, {
    ...init,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
}

/** Call a DM paywall endpoint as {username} with the org-wide Api-Token. */
export function dmPaywallFetch(username: string, path: string, init?: DmInit) {
  return dmFetch(`Api-Token ${config.apiKey()}`, username, path, init);
}

/**
 * Call the DM Stripe proxy as {username} with the caller's OWN DM token — the
 * admin rail. The DM enforces admin-only itself (403 for anyone else), so a
 * 2xx here is the proof that lets the setup route go on. The org-wide
 * Api-Token never travels this path.
 */
export function dmStripeFetchAs(token: string, username: string, path: string, init?: DmInit) {
  return dmFetch(`Token ${token}`, username, path, init);
}

/** A DM/Stripe failure to pass through verbatim (status + body). */
export class PaywallUpstreamError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`DM responded ${status}`);
    this.name = "PaywallUpstreamError";
  }
}

/** Parse a DM response; anything but 2xx becomes a passthrough error. */
export async function dmJson(res: Response): Promise<any> {
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new PaywallUpstreamError(res.status, body ?? { error: `DM responded ${res.status}` });
  return body;
}

/** A Stripe price (product expanded or passed alongside) as a catalogue row. */
export function toCataloguePrice(price: any, product?: any): CataloguePrice {
  const expanded = typeof price?.product === "object" && price.product ? price.product : undefined;
  const prod = product ?? expanded;
  const interval = price?.recurring?.interval;
  return {
    id: String(price?.id ?? ""),
    productId: String(prod?.id ?? (typeof price?.product === "string" ? price.product : "")),
    name: String(price?.nickname || prod?.name || ""),
    unitAmount: Number(price?.unit_amount ?? 0),
    currency: String(price?.currency ?? ""),
    interval: interval === "month" || interval === "year" ? interval : null,
  };
}

/** PAYWALL_PRICE_IDS, read at call time; it wins over the platform's choice. */
export function envPriceIds(): string[] {
  return (process.env.PAYWALL_PRICE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// The app's paywall choice, kept in the platform's PUBLIC metadata under
// apps.<slug>. The DM's platform metadata is an unauthenticated read with an
// admin-only, deep-merging write — so only ids and amounts live here, never
// anything secret, and every key is written (nulls included) because the DM
// cannot delete keys.
// ---------------------------------------------------------------------------

export type Access = "free" | "one_time" | "monthly";

export type AppPaymentInfo = {
  version: 1;
  access: Access;
  /** Minor units (cents); null when free. Always USD. */
  amount: number | null;
  currency: "usd" | null;
  stripe: { product_id: string | null; price_id: string | null };
  updated_at: string;
  updated_by: string;
};

export const ACCESS_VALUES: readonly Access[] = ["free", "one_time", "monthly"];

/** The plan name buyers see (and the Stripe price nickname). */
export const planName = (access: Access) =>
  access === "monthly" ? "Monthly access" : "One-time access";

const metadataUrl = () => `${config.dmUrl()}/api/core/orgs/${config.mainTenantKey()}/metadata/`;

type InfoRead = { info: AppPaymentInfo | null; platformName: string };

// ponytail: 60s cache per lambda; the setup route invalidates after writing.
let infoCache: (InfoRead & { at: number }) | null = null;
const INFO_TTL_MS = 60_000;

export function invalidateAppPaymentInfo(): void {
  infoCache = null;
}

const isPaymentInfo = (x: unknown): x is AppPaymentInfo =>
  !!x &&
  typeof x === "object" &&
  ACCESS_VALUES.includes((x as { access?: Access }).access as Access) &&
  typeof (x as { stripe?: unknown }).stripe === "object";

/** apps.<slug> from the platform's metadata — a public read, no credential. */
export async function readAppPaymentInfo(): Promise<InfoRead> {
  if (infoCache && Date.now() - infoCache.at < INFO_TTL_MS) return infoCache;
  const body = await dmJson(await fetch(metadataUrl(), { cache: "no-store" }));
  const raw = body?.metadata?.apps?.[PAYWALL_APP_SLUG];
  infoCache = {
    at: Date.now(),
    info: isPaymentInfo(raw) ? raw : null,
    platformName: String(body?.platform_name ?? ""),
  };
  return infoCache;
}

/** Write apps.<slug> as the admin (their own token; the DM checks the role). */
export async function writeAppPaymentInfo(token: string, info: AppPaymentInfo): Promise<void> {
  await dmJson(
    await fetch(metadataUrl(), {
      method: "PUT",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { apps: { [PAYWALL_APP_SLUG]: info } } }),
      cache: "no-store",
    }),
  );
  invalidateAppPaymentInfo();
}

/** The ids this app may sell right now: env override, else the platform's choice. */
export async function allowedPriceIds(): Promise<string[]> {
  const env = envPriceIds();
  if (env.length) return env;
  const { info } = await readAppPaymentInfo();
  return info && info.access !== "free" && info.stripe.price_id ? [info.stripe.price_id] : [];
}

// ponytail: display data for env-listed ids — one Stripe retrieve each, ~60s
// cache. Only the env-override path needs it.
const displayCache = new Map<string, { price: CataloguePrice; at: number }>();
const DISPLAY_TTL_MS = 60_000;

async function fetchPriceDisplay(username: string, id: string): Promise<CataloguePrice> {
  const hit = displayCache.get(id);
  if (hit && Date.now() - hit.at < DISPLAY_TTL_MS) return hit.price;
  const price = toCataloguePrice(
    await dmJson(
      await dmPaywallFetch(username, `/prices/${encodeURIComponent(id)}/?expand[]=product`),
    ),
  );
  displayCache.set(id, { price, at: Date.now() });
  return price;
}

export type Catalogue = {
  /** Something is for sale: members must pay. */
  paywall: boolean;
  /** The admin has made a choice (or env decides). */
  decided: boolean;
  source: "env" | "metadata" | "none";
  prices: CataloguePrice[];
  settings: { access: Access; amount: number | null } | null;
};

/** What the paywall page sells, with display data. */
export async function resolveCatalogue(username: string): Promise<Catalogue> {
  const env = envPriceIds();
  const { info } = await readAppPaymentInfo();
  const settings = info ? { access: info.access, amount: info.amount } : null;
  if (env.length) {
    const prices: CataloguePrice[] = [];
    for (const id of env) prices.push(await fetchPriceDisplay(username, id));
    return { paywall: true, decided: true, source: "env", prices, settings };
  }
  if (!info) return { paywall: false, decided: false, source: "none", prices: [], settings };
  if (info.access === "free" || !info.stripe.price_id)
    return { paywall: false, decided: true, source: "metadata", prices: [], settings };
  return {
    paywall: true,
    decided: true,
    source: "metadata",
    prices: [
      {
        id: info.stripe.price_id,
        productId: info.stripe.product_id ?? "",
        name: planName(info.access),
        unitAmount: info.amount ?? 0,
        currency: info.currency ?? "usd",
        interval: info.access === "monthly" ? "month" : null,
      },
    ],
    settings,
  };
}
