// lib/paywall.ts — server-only helpers for the admin routes
// (app/api/paywall/admin/*): the caller's identity from their own DM token,
// the platform's Stripe proxy and connect endpoint on the admin's own path
// with that same token, and the platform-metadata store of the paywall
// choice. The app holds no platform key: every call here carries the
// caller's token. Never import from a client component.
// Relative import (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import config from "./iblai/config";

/** What this app is called on the platform (NEXT_PUBLIC_PAYWALL_APP_SLUG). */
export const PAYWALL_APP_SLUG = config.paywallAppSlug();

export type PaywallUser = { userId: number; username: string; email: string };

// ponytail: per-lambda Map cache, ~60s TTL — cold starts just re-fetch.
const identityCache = new Map<string, { user: PaywallUser | null; at: number }>();
const IDENTITY_TTL_MS = 60_000;

const verifyUrl = () => `${config.dmUrl()}/api/core/token/verify/`;

/** End-user identity from their DM token — the ONLY trusted identity source. */
export async function resolveUser(dmToken: string): Promise<PaywallUser | null> {
  const hit = identityCache.get(dmToken);
  if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.user;

  const res = await fetch(verifyUrl(), {
    headers: { Authorization: `Token ${dmToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null; // don't cache failures — token may be mid-refresh

  const body = await res.json().catch(() => null);
  // token/verify returns the token's own user: {user_id, username, email, …}.
  // Membership is not checked here: the platform decides on every call the
  // routes make with this token.
  const user = body?.username
    ? { userId: Number(body.user_id ?? 0), username: body.username, email: body.email ?? "" }
    : null;
  identityCache.set(dmToken, { user, at: Date.now() });
  return user;
}

/** The `Authorization: Token …` value on the request, or "". */
export function tokenFromRequest(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Token ") ? auth.slice(6).trim() : "";
}

/** Extract `Authorization: Token …` from the request and resolve the user. */
export async function userFromRequest(req: Request): Promise<PaywallUser | null> {
  const token = tokenFromRequest(req);
  return token ? resolveUser(token) : null;
}

/** The caller's own token plus their verified identity — the admin routes need both. */
export async function callerFromRequest(
  req: Request,
): Promise<{ token: string; user: PaywallUser } | null> {
  const token = tokenFromRequest(req);
  const user = token ? await resolveUser(token) : null;
  return user ? { token, user } : null;
}

/** RequestInit with plain-object headers, so they merge by spread. */
export type DmInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const stripeBase = (username: string) =>
  `${config.dmUrl()}/api/ai-mentor/orgs/${config.mainTenantKey()}` +
  `/users/${encodeURIComponent(username)}/providers/stripe`;

function dmFetchAs(token: string, url: string, init?: DmInit) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
}

/**
 * The platform's Stripe proxy as {username} with the caller's OWN DM token —
 * the admin rail. The platform enforces admin-only itself (403 for anyone
 * else), so a 2xx here is the proof that lets the setup route go on. It runs
 * on whichever Stripe source the platform resolves: a pasted `stripe` key
 * when one is set, else the connected account.
 */
export function dmStripeFetchAs(token: string, username: string, path: string, init?: DmInit) {
  return dmFetchAs(token, `${stripeBase(username)}/payments${path}`, init);
}

/**
 * Connect with Stripe on the admin's own path with the admin's OWN token:
 * GET the status (`source`, the publishable key and account the browser
 * needs), POST `{return_url}` for Stripe's authorize URL, DELETE to
 * disconnect. The platform decides who may (403 otherwise).
 */
export function dmConnectFetchAs(token: string, username: string, init?: DmInit) {
  return dmFetchAs(token, `${stripeBase(username)}/connect/`, init);
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

/**
 * POST the platform's self-join switch open with {authorization} (the
 * admin's own token, from the setup route). Membership is free here, so
 * anyone who signs in must be able to join.
 */
export async function openSelfJoinWith(authorization: string): Promise<void> {
  await dmJson(
    await fetch(`${config.dmUrl()}/api/core/users/platforms/config/`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ platform_key: config.mainTenantKey(), allow_self_linking: true }),
      cache: "no-store",
    }),
  );
}

// ---------------------------------------------------------------------------
// The app's paywall choice, kept in the platform's PUBLIC metadata under
// apps.<slug>. The DM's platform metadata is an unauthenticated read with an
// admin-only, deep-merging write — so only ids, amounts and public keys live
// here, never anything secret, and every key is written (nulls included)
// because the DM cannot delete keys.
// ---------------------------------------------------------------------------

export type Access = "free" | "one_time" | "monthly";

export type AppPaymentInfo = {
  version: 1;
  access: Access;
  /** Minor units (cents); null when free. Always USD. */
  amount: number | null;
  currency: "usd" | null;
  /**
   * Public by design: the platform's Stripe source when the choice was saved.
   * The pay modal takes the live values from the platform's checkout answer;
   * these are the record.
   */
  stripe: {
    product_id: string | null;
    price_id: string | null;
    /** The publishable key Stripe.js renders the checkout with (the platform's own on a connected account, the tenant's on a pasted key). */
    publishable_key?: string | null;
    /** The connected Stripe account, null on a pasted key. */
    stripe_account?: string | null;
  };
  updated_at: string;
  updated_by: string;
};

export const ACCESS_VALUES: readonly Access[] = ["free", "one_time", "monthly"];

/** The plan name buyers see (and the Stripe price nickname). */
export const planName = (access: Access) =>
  access === "monthly" ? "Monthly access" : "One-time access";

const metadataUrl = () => `${config.dmUrl()}/api/core/orgs/${config.mainTenantKey()}/metadata/`;

type InfoRead = {
  info: AppPaymentInfo | null;
  platformName: string;
  /** The platform's own sign-in copy, which this app preserves. */
  branding: LoginBranding;
};

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
  const branding = body?.metadata?.[LOGIN_BRANDING_KEY];
  infoCache = {
    at: Date.now(),
    info: isPaymentInfo(raw) ? raw : null,
    platformName: String(body?.platform_name ?? ""),
    // The same read carries the platform's branding; the write needs it to
    // leave the platform's own words alone.
    branding: branding && typeof branding === "object" ? branding : {},
  };
  return infoCache;
}

/** What the login screens say under the app's name: the price, or that it is free. USD only. */
export function priceLine(info: AppPaymentInfo): string {
  if (info.access === "free" || info.amount === null) return "Free";
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: info.amount % 100 ? 2 : 0,
  }).format(info.amount / 100);
  return info.access === "monthly" ? `${amount}/month` : amount;
}

/**
 * The login SPA brands its sign-in and sign-up screens for a platform from
 * `metadata.auth_web_<app>`, a public read it makes when the URL names the
 * platform: `display_title_info` is the heading, `title` the tab,
 * `display_description_info` the line under the heading. Its normalizer maps
 * every unknown `app` value — this app's `app=custom` — to `mentorai`, so
 * this is the key. The platform's own OS login reads the same key: one
 * platform, one app. Verified in the deployed bundle and in
 * sdk/main/apps/auth/hooks/use-app-information.ts.
 */
export const LOGIN_BRANDING_KEY = "auth_web_mentorai";

/** The three fields of the sign-in copy this app can touch. */
export type LoginBranding = {
  title?: string;
  display_title_info?: string;
  display_description_info?: string;
};

/** What separates the platform's own line from the price this app appends. */
const PRICE_SEPARATOR = " · ";
/** Exactly what priceLine() can produce: Free, $49, $29.90, and the monthly forms. */
const PRICE_LINE = /^(Free|\$\d[\d,]*(\.\d{2})?(\/month)?)$/;

/**
 * The platform's own description, with a price this app appended previously
 * taken back off, so saving twice never stacks two prices. A description that
 * is nothing but a price was written by this app before it learned to append
 * (or by an older release), so it counts as ours and goes.
 */
export function descriptionWithoutPrice(text: unknown): string {
  const line = typeof text === "string" ? text.trim() : "";
  if (!line || PRICE_LINE.test(line)) return "";
  const cut = line.lastIndexOf(PRICE_SEPARATOR);
  if (cut < 0) return line;
  const tail = line.slice(cut + PRICE_SEPARATOR.length).trim();
  return PRICE_LINE.test(tail) ? line.slice(0, cut).trim() : line;
}

/**
 * The branding to PUT beside the choice. The platform's title and heading are
 * never edited — they are written only when it has none, so a fresh platform
 * is not blank — and the price joins its description rather than replacing it.
 * The DM merges, so a field left out here keeps whatever is stored.
 */
export function loginBranding(
  info: AppPaymentInfo,
  platformName: string,
  existing: LoginBranding = {},
): LoginBranding {
  const name = config.appName() || platformName;
  const price = priceLine(info);
  const said = descriptionWithoutPrice(existing.display_description_info);
  return {
    ...(existing.title ? {} : { title: name }),
    ...(existing.display_title_info ? {} : { display_title_info: name }),
    display_description_info: said ? `${said}${PRICE_SEPARATOR}${price}` : price,
  };
}

/**
 * Write apps.<slug> and the login branding as the admin (their own token;
 * the DM checks the role). One deep-merge PUT: the platform's other keys
 * under the branding key (logo, images) survive, and so does everything it
 * already says — {existing} is what the platform's sign-in copy reads now.
 */
export async function writeAppPaymentInfo(
  token: string,
  info: AppPaymentInfo,
  platformName: string,
  existing: LoginBranding = {},
): Promise<void> {
  await dmJson(
    await fetch(metadataUrl(), {
      method: "PUT",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {
          apps: { [PAYWALL_APP_SLUG]: info },
          [LOGIN_BRANDING_KEY]: loginBranding(info, platformName, existing),
        },
      }),
      cache: "no-store",
    }),
  );
  invalidateAppPaymentInfo();
}
