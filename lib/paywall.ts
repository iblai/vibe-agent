// lib/paywall.ts — server-only paywall helpers. Uses IBLAI_API_KEY via
// config.apiKey(); never import from a client component.
// Relative import (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import { randomBytes } from "node:crypto";
import config from "./iblai/config";

export const PAYWALL_APP_SLUG = process.env.PAYWALL_APP_SLUG ?? "";

/**
 * Where the app is reached from outside: IBLAI_APP_BASE_URL when set, else the
 * origin this request arrived on (right on localhost and on ibl.ai hosting).
 */
export function appBaseUrl(req: { url: string }): string {
  const env = (process.env.IBLAI_APP_BASE_URL ?? "").replace(/\/+$/, "");
  if (env && !/^https?:\/\/\S+$/.test(env))
    throw new Error(`IBLAI_APP_BASE_URL must be an absolute http(s) origin, got "${env}"`);
  return env || new URL(req.url).origin;
}
/**
 * Why the buyer rail cannot run: IBLAI_API_KEY unset or still the template
 * placeholder. "" when fine. Routes answer 500 with it, loudly, the moment
 * they are used — the platform would otherwise answer 401 and the buyer
 * would read "couldn't start checkout".
 */
export function apiKeyProblem(): string {
  const key = config.apiKey();
  return !key || key === "your-token"
    ? "IBLAI_API_KEY is not set (or is still the placeholder). Put the Platform API Token in .env.local."
    : "";
}

export type PaywallUser = { userId: number; username: string; email: string };

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
  // Membership of the platform is not required here: a buyer who is not a
  // member yet is exactly who the checkout is for.
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

const apiTokenHeader = () => `Api-Token ${config.apiKey()}`;

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
  return dmFetch(apiTokenHeader(), username, path, init);
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

// ponytail: the Api-Token's owner is a member of the platform (the DM checks
// that when it authenticates the key), so calls the app makes AS the platform
// — customers, sessions, the ledger — run on that path user. token/verify with
// the key answers with the owner's own profile; cached like buyer identities.
let keyOwner: { username: string; at: number } | null = null;

export async function keyOwnerUsername(): Promise<string> {
  if (keyOwner && Date.now() - keyOwner.at < IDENTITY_TTL_MS) return keyOwner.username;
  const body = await dmJson(
    await fetch(verifyUrl(), { headers: { Authorization: apiTokenHeader() }, cache: "no-store" }),
  );
  const username = String(body?.username ?? "");
  if (!username)
    throw new PaywallUpstreamError(502, { error: "token/verify named no user for IBLAI_API_KEY" });
  keyOwner = { username, at: Date.now() };
  return username;
}

/** Call the DM Stripe proxy as the platform (Api-Token, the key owner on the path). */
export async function dmPlatformFetch(path: string, init?: DmInit) {
  return dmPaywallFetch(await keyOwnerUsername(), path, init);
}

// ponytail: one verdict per lambda per window; a bad key is re-checked sooner
// so a fixed .env.local takes effect without waiting.
let keyVerdict: { problem: string; at: number } | null = null;
const KEY_OK_TTL_MS = 300_000;
const KEY_BAD_TTL_MS = 30_000;

/**
 * Why the app must not render: "" when IBLAI_API_KEY is a real key of this
 * platform, else the reason. Asks the platform for its membership config — a
 * side-effect-free read that answers 200 only for a valid key bound to
 * NEXT_PUBLIC_MAIN_TENANT_KEY. A refusal is 403 either way (the platform's
 * first auth class has no challenge, so it never says 401): the body's
 * `detail` tells a bad key ("Invalid token.", "User inactive…") from a real
 * key that is not this platform's admin key. 404: no such platform. A
 * platform hiccup is logged and lets the app render: it is not the key's
 * fault, and it is not silent — the SDK fails visibly too.
 */
export async function apiKeyVerdict(): Promise<string> {
  const problem = apiKeyProblem();
  if (problem) return problem;
  const ttl = keyVerdict?.problem ? KEY_BAD_TTL_MS : KEY_OK_TTL_MS;
  if (keyVerdict && Date.now() - keyVerdict.at < ttl) return keyVerdict.problem;

  const key = config.mainTenantKey();
  let status: number;
  let detail = "";
  try {
    const res = await fetch(
      `${config.dmUrl()}/api/core/users/platforms/config/?${new URLSearchParams({ platform_key: key })}`,
      { headers: { Authorization: apiTokenHeader() }, cache: "no-store" },
    );
    status = res.status;
    detail = String((await res.json().catch(() => null))?.detail ?? "");
  } catch (e) {
    console.error("[paywall] could not verify IBLAI_API_KEY:", e);
    return "";
  }
  const refused = status === 401 || status === 403;
  const verdict = refused
    ? /invalid|inactive|token/i.test(detail)
      ? "IBLAI_API_KEY was rejected by the platform (invalid or revoked). Put the platform's API token in .env.local."
      : `IBLAI_API_KEY is not an admin key of NEXT_PUBLIC_MAIN_TENANT_KEY (${key}); it belongs to a different platform.`
    : status === 404
      ? `The platform knows no active platform with the key NEXT_PUBLIC_MAIN_TENANT_KEY (${key}).`
      : "";
  if (!verdict && (status < 200 || status >= 300)) {
    console.error(`[paywall] could not verify IBLAI_API_KEY: the platform answered ${status}`);
    return "";
  }
  keyVerdict = { problem: verdict, at: Date.now() };
  return verdict;
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
  /** The one agent this app fronts and what it calls itself — the same object, written by the Get and run procedure. */
  agent_id?: string | null;
  app_name?: string | null;
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

async function fetchPriceDisplay(id: string): Promise<CataloguePrice> {
  const hit = displayCache.get(id);
  if (hit && Date.now() - hit.at < DISPLAY_TTL_MS) return hit.price;
  const price = toCataloguePrice(
    await dmJson(await dmPlatformFetch(`/prices/${encodeURIComponent(id)}/?expand[]=product`)),
  );
  displayCache.set(id, { price, at: Date.now() });
  return price;
}

export type Catalogue = {
  /** Something is for sale: joining costs money. */
  paywall: boolean;
  /** The admin has made a choice (or env decides). */
  decided: boolean;
  source: "env" | "metadata" | "none";
  /** apps.<slug>.app_name, the name the join page and the tab use. */
  appName: string;
  platformName: string;
  prices: CataloguePrice[];
  settings: { access: Access; amount: number | null } | null;
};

/** What the join page sells, with display data. */
export async function resolveCatalogue(): Promise<Catalogue> {
  const env = envPriceIds();
  const { info, platformName } = await readAppPaymentInfo();
  const settings = info ? { access: info.access, amount: info.amount } : null;
  const names = { appName: String(info?.app_name ?? ""), platformName };
  if (env.length) {
    const prices: CataloguePrice[] = [];
    for (const id of env) prices.push(await fetchPriceDisplay(id));
    return { paywall: true, decided: true, source: "env", ...names, prices, settings };
  }
  if (!info)
    return { paywall: false, decided: false, source: "none", ...names, prices: [], settings };
  if (info.access === "free" || !info.stripe.price_id)
    return {
      paywall: false,
      decided: true,
      source: "metadata",
      ...names,
      prices: [],
      settings,
    };
  return {
    paywall: true,
    decided: true,
    source: "metadata",
    ...names,
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

// ---------------------------------------------------------------------------
// Paying to join. The buyer has an ibl.ai account (made here from their
// email, or their own) but is not a member of the platform, so the DM's
// per-user paywall — which refuses non-members — cannot be asked to sell to them. The app does what
// that endpoint does through the platform's generic Stripe proxy (customer,
// then session, both named after the buyer), and on the way back verifies the
// session itself and links the buyer with the DM's admin link API. From then
// on the buyer is a member, and the DM's per-user paywall keeps the ledger.
// ---------------------------------------------------------------------------

/** Escape a value for a single-quoted Stripe search-query string (as the DM does). */
const escapeSearchValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findOrCreateCustomer(buyer: PaywallUser): Promise<string> {
  const qs = new URLSearchParams({
    query: `metadata['ibl_username']:'${escapeSearchValue(buyer.username)}'`,
    limit: "1",
  });
  const found = await dmJson(await dmPlatformFetch(`/customers/search/?${qs}`));
  const hit = found?.data?.[0]?.id;
  if (hit) return String(hit);
  const created = await dmJson(
    await dmPlatformFetch("/customers/", {
      method: "POST",
      body: JSON.stringify({
        ...(buyer.email && { email: buyer.email }),
        metadata: { ibl_username: buyer.username },
      }),
    }),
  );
  return String(created.id);
}

/**
 * A Checkout Session on the platform's Stripe account for {buyer} and
 * {priceId}. The Customer carries metadata.ibl_username (the DM's customer
 * search key) and the session carries {ibl_username, app}: exactly the shape
 * the DM's own paywall checkout mints, so its access check and ledger
 * recognise the purchase afterwards.
 */
export async function createCheckout(
  buyer: PaywallUser,
  priceId: string,
  origin: string,
): Promise<{ checkout_url: string; session_id: string }> {
  const price = (await resolveCatalogue()).prices.find((p) => p.id === priceId);
  const mode = price?.interval ? "subscription" : "payment";
  const customer = await findOrCreateCustomer(buyer);
  const session = await dmJson(
    await dmPlatformFetch("/checkout-sessions/", {
      method: "POST",
      body: JSON.stringify({
        mode,
        customer,
        line_items: [{ price: priceId, quantity: 1 }],
        // Literal Stripe placeholder — Stripe substitutes it, the app never does.
        success_url: `${origin}/paywall/return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/paywall`,
        // ibl_user_id: the return path links the buyer without a sign-in.
        metadata: {
          ibl_username: buyer.username,
          ibl_user_id: String(buyer.userId),
          app: PAYWALL_APP_SLUG,
        },
      }),
    }),
  );
  return { checkout_url: String(session.url ?? ""), session_id: String(session.id ?? "") };
}

const ACTIVE_SUBSCRIPTION = new Set(["active", "trialing"]);

/** A complete one-time payment, or a complete subscription that is live. */
function sessionPaid(session: any): boolean {
  if (session?.status !== "complete") return false;
  if (session.mode !== "subscription") return session.payment_status === "paid";
  const sub = session.subscription;
  return !!sub && typeof sub === "object" && ACTIVE_SUBSCRIPTION.has(String(sub.status));
}

/** The DM's admin link API: make {userId} an active member, or end the membership. */
async function setMembership(userId: number, active: boolean): Promise<void> {
  await dmJson(
    await fetch(`${config.dmUrl()}/api/core/users/platforms/`, {
      method: "POST",
      headers: { Authorization: apiTokenHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform_key: config.mainTenantKey(), active }),
      cache: "no-store",
    }),
  );
}

/** The session from the platform's own Stripe account, subscription expanded. */
export async function retrieveSession(sessionId: string): Promise<any> {
  return dmJson(
    await dmPlatformFetch(
      `/checkout-sessions/${encodeURIComponent(sessionId)}/?expand[]=subscription`,
    ),
  );
}

/** Whom a session of this app was minted for, from the metadata the app stamped. */
export function sessionBuyer(session: any): { userId: number; username: string } | null {
  const m = session?.metadata ?? {};
  if (m.app !== PAYWALL_APP_SLUG || !m.ibl_username || !m.ibl_user_id) return null;
  return { userId: Number(m.ibl_user_id), username: String(m.ibl_username) };
}

/**
 * Paid → the buyer named on the session becomes a member and the DM records
 * the payment in its ledger. True once they are in; false while the session
 * is not paid (yet). A session of another app is refused. {fallback} names
 * the buyer for sessions minted before ibl_user_id was stamped.
 */
export async function joinFromSession(session: any, fallback?: PaywallUser): Promise<boolean> {
  const buyer =
    sessionBuyer(session) ??
    (fallback && session?.metadata?.app === PAYWALL_APP_SLUG ? fallback : null);
  if (!buyer)
    throw new PaywallUpstreamError(403, { error: "This checkout session is not this app's" });
  if (!sessionPaid(session)) return false;
  await setMembership(buyer.userId, true);
  // The ledger: the DM observes the session on the buyer's own path (a member
  // now) and can re-check the subscription later. Bookkeeping never blocks
  // the join.
  const qs = new URLSearchParams({ app: PAYWALL_APP_SLUG, session_id: String(session?.id ?? "") });
  await dmPaywallFetch(buyer.username, `/paywall/access/?${qs}`).catch((e: unknown) =>
    console.error("[paywall] ledger update failed:", e),
  );
  return true;
}

/**
 * A signed-in buyer is back from Stripe: the session must be theirs (a leaked
 * return URL joins nobody), then it is verified and joined like any other.
 */
export async function verifyAndJoin(buyer: PaywallUser, sessionId: string): Promise<boolean> {
  const session = await retrieveSession(sessionId);
  if (session?.metadata?.ibl_username !== buyer.username)
    throw new PaywallUpstreamError(403, { error: "This checkout session is not yours" });
  return joinFromSession(session, buyer);
}

/** Has the DM ever recorded a payment by {username} for this app? (Invited members have none.) */
export async function isRecordedPayer(username: string): Promise<boolean> {
  const qs = new URLSearchParams({ app: PAYWALL_APP_SLUG, username, limit: "1" });
  const body = await dmJson(await dmPlatformFetch(`/paywall/payments/?${qs}`));
  return Number(body?.count ?? 0) > 0;
}

/** The DM's live answer for a member who paid: does the payment still grant? */
export async function liveAccess(username: string): Promise<{ has_access: boolean }> {
  const qs = new URLSearchParams({ app: PAYWALL_APP_SLUG });
  const body = await dmJson(await dmPaywallFetch(username, `/paywall/access/?${qs}`));
  return { has_access: !!body?.has_access };
}

/** A payer's subscription lapsed: their membership ends. */
export const endMembership = (userId: number) => setMembership(userId, false);

// ---------------------------------------------------------------------------
// Accounts for strangers. The DM's paywall ledger recognises a payment only by
// the username stamped on the Checkout Session when it is minted, so a buyer's
// account exists before Stripe: created through the platform's SCIM endpoint
// with the app's key — no password, no platform link yet (membership comes
// with the payment). Sign-in afterwards is the platform's business: provision
// (tokens minted for the key, when ibl.ai has enabled it) or an email code.
// ---------------------------------------------------------------------------

const scimUrl = () => `${config.dmUrl()}/api/orgs/${config.mainTenantKey()}/scim/v2/Users`;

/** The DM's own SSO derivation: a short local part plus a random suffix. */
function scimUsername(email: string): string {
  const local =
    email
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 20) || "user";
  return `${local}_${randomBytes(3).toString("hex")}`;
}

async function scimCreate(email: string, userName: string): Promise<any> {
  const res = await fetch(scimUrl(), {
    method: "POST",
    headers: { Authorization: apiTokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName,
      name: { formatted: email.split("@")[0] },
      emails: [{ value: email, primary: true }],
      active: true,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  // A fresh username with an email the platform already knows answers 400
  // ("Username mismatch"): that person has an account and signs in instead.
  if (res.status === 400 || res.status === 409)
    throw new PaywallUpstreamError(409, {
      error: "This email already has an ibl.ai account. Sign in to continue.",
    });
  if (!res.ok)
    throw new PaywallUpstreamError(res.status, body ?? { error: `DM responded ${res.status}` });
  return body;
}

/** The ibl.ai user for {email}: created now (no password, no membership). */
export async function ensureUser(email: string): Promise<PaywallUser> {
  // ponytail: a suffix collision makes SCIM answer 200 with someone else's
  // account, so the answer's email is checked and one more suffix is tried.
  for (let attempt = 0; ; attempt++) {
    const userName = scimUsername(email);
    const user = await scimCreate(email, userName);
    const emails: string[] = (user?.emails ?? []).map((e: any) =>
      String(e?.value ?? "").toLowerCase(),
    );
    if (emails.length === 0 || emails.includes(email.toLowerCase()))
      return { userId: Number(user?.id ?? 0), username: String(user?.userName ?? userName), email };
    if (attempt >= 1)
      throw new PaywallUpstreamError(502, { error: "Could not create an account for this email" });
  }
}

/** The Auth SPA's `data=` shape: what SsoLogin stores, key for key. */
export type ProvisionedSession = {
  axd_token: string;
  axd_token_expires: string;
  dm_token: string;
  dm_token_expires: string;
  edx_jwt_token: string;
  userData: string;
  tenant: string;
  current_tenant: string;
};

/**
 * Tokens for a buyer who just became a member, minted by the platform for the
 * app's key (consolidated-token/provision). null while ibl.ai has not enabled
 * provisioning for this platform (404): the buyer signs in by email code then.
 */
export async function provisionTokens(buyer: PaywallUser): Promise<ProvisionedSession | null> {
  const key = config.mainTenantKey();
  const res = await fetch(`${config.dmUrl()}/api/core/consolidated-token/provision/`, {
    method: "POST",
    headers: { Authorization: apiTokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ username: buyer.username, email: buyer.email, platform_key: key }),
    cache: "no-store",
  });
  if (res.status === 404) {
    console.info("[paywall] provisioning is off for this platform; the buyer signs in by email");
    return null;
  }
  const data = (await dmJson(res))?.data;
  if (!data?.dm_token?.token)
    throw new PaywallUpstreamError(502, { error: "provision returned no tokens" });
  return {
    axd_token: String(data.axd_token?.token ?? ""),
    axd_token_expires: String(data.axd_token?.expires ?? ""),
    dm_token: String(data.dm_token.token),
    dm_token_expires: String(data.dm_token.expires ?? ""),
    edx_jwt_token: String(data.edx_jwt_token?.token ?? ""),
    userData: JSON.stringify(data.user ?? {}),
    tenant: key,
    current_tenant: JSON.stringify({ key }),
  };
}
