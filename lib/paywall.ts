// lib/paywall.ts — server-only helpers for the admin routes
// (app/api/paywall/admin/*): the caller's identity from their own DM token,
// the platform's Stripe proxy and connect endpoint on the admin's own path
// with that same token, and the platform-metadata store of the paywall
// choice. The app holds no platform key: every call here carries the
// caller's token. Never import from a client component.
// Relative import (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import config from "./iblai/config";
import { platformKey, storedSlug } from "./onboarding";

/**
 * What this app is called on the platform: the slug the setup wizard minted from
 * the app's name, else the NEXT_PUBLIC_PAYWALL_APP_SLUG override, else the
 * shared default every install used before slugs were minted.
 *
 * A function, not a constant: it is answered during setup now, so reading it
 * once at import would freeze whatever was true when the server booted.
 */
export const appSlug = (): string => storedSlug() || config.paywallAppSlug();

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
  `${config.dmUrl()}/api/ai-mentor/orgs/${platformKey()}` +
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
 *
 * {platform} is for the onboarding route, where the platform being answered
 * for is not the stored one yet. The DM refuses a non-admin, so a 2xx here is
 * also the proof that the caller may configure that platform.
 */
export async function openSelfJoinWith(
  authorization: string,
  platform: string = platformKey(),
): Promise<void> {
  await dmJson(
    await fetch(`${config.dmUrl()}/api/core/users/platforms/config/`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ platform_key: platform, allow_self_linking: true }),
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

// {platform} for the one caller that names another: releasing this app from the
// platform it is leaving, which is no longer the stored one by then.
const metadataUrl = (platform: string = platformKey()) =>
  `${config.dmUrl()}/api/core/orgs/${platform}/metadata/`;

type InfoRead = {
  info: AppPaymentInfo | null;
  platformName: string;
  /** The platform's own sign-in copy, which this app preserves. */
  branding: LoginBranding;
  /** The setup wizard's answers, in the same apps.<slug> object. */
  agent: string;
  name: string;
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

/**
 * apps.<slug> from the platform's metadata — a public read, no credential.
 *
 * {fresh} skips the cache for the setup wizard's own reads: the cache is per
 * module instance, and Next loads this file once per layer and once per function
 * instance, so the copy the root layout renders from would serve the answer from
 * before the wizard wrote for up to a minute.
 */
export async function readAppPaymentInfo(fresh = false): Promise<InfoRead> {
  if (!fresh && infoCache && Date.now() - infoCache.at < INFO_TTL_MS) return infoCache;
  const body = await dmJson(await fetch(metadataUrl(), { cache: "no-store" }));
  const raw = body?.metadata?.apps?.[appSlug()];
  const branding = body?.metadata?.[LOGIN_BRANDING_KEY];
  infoCache = {
    at: Date.now(),
    info: isPaymentInfo(raw) ? raw : null,
    platformName: String(body?.platform_name ?? ""),
    // The same read carries the platform's branding; the write needs it to
    // leave the platform's own words alone.
    branding: branding && typeof branding === "object" ? branding : {},
    // Read off `raw`, not `info`: isPaymentInfo rejects the object until the
    // price question is answered, and the wizard writes these before that.
    agent: String(raw?.agent ?? ""),
    name: String(raw?.name ?? ""),
  };
  return infoCache;
}

export type AppSetup = { platform: string; agent: string; name: string; slug: string };

/**
 * What this app is configured as: the platform from `.env.local` or env, the
 * agent and the name from the platform's metadata, each falling back to its
 * NEXT_PUBLIC_* key so an app configured the old way keeps working. An empty
 * platform means nobody has answered yet, and the setup wizard takes over.
 *
 * The metadata read is uncached: this runs in the root layout, and the wizard
 * reloads the page to see what it just saved. Next memoises identical fetch GETs
 * across one render pass, so generateMetadata and the layout still share one
 * call — one DM read per full page load.
 */
export async function resolveSetup(): Promise<AppSetup> {
  const platform = platformKey();
  if (!platform) return { platform: "", agent: "", name: "", slug: "" };
  let stored = { agent: "", name: "" };
  try {
    const read = await readAppPaymentInfo(true);
    stored = { agent: read.agent, name: read.name };
  } catch {
    // A public read that hiccuped must not blank a configured app: fall back
    // to env rather than showing the wizard to everyone.
  }
  return {
    platform,
    agent: stored.agent || config.defaultAgentId(),
    name: stored.name || config.appName(),
    // The browser's own paywall calls key on this too (lib/paywall-client.ts).
    slug: appSlug(),
  };
}

/**
 * Record the wizard's agent and name beside the paywall choice, as the admin
 * (their own token; the DM checks the role). The DM deep-merges, so the
 * choice's own keys survive a write that never mentions them.
 */
export async function writeAppConfig(
  token: string,
  patch: { agent?: string; name?: string },
): Promise<void> {
  await dmJson(
    await fetch(metadataUrl(), {
      method: "PUT",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { apps: { [appSlug()]: patch } } }),
      cache: "no-store",
    }),
  );
  invalidateAppPaymentInfo();
}

/**
 * Take this app's data off {platform} — the one it is leaving, so the caller's
 * token has to be that platform's own (the DM refuses a token minted elsewhere).
 * Its entry goes, and the price this app appended to the sign-in copy comes back
 * off, leaving whatever the platform itself said.
 *
 * `null` is how a key is deleted here: the DM's metadata write recurses into
 * dict values and replaces anything else, and it has no DELETE — so a key can be
 * emptied but never removed. Every reader treats null as nothing
 * (`isPaymentInfo` rejects it, `raw?.agent` is undefined), which is what lets the
 * wizard reopen unanswered on the new platform.
 *
 * The slug is the same on both platforms: it is what names the entry here, which
 * is exactly why the wizard keeps it across a move.
 *
 * Left alone on purpose: the Stripe product and price (nothing references them
 * once the entry is gone — the same state a paid → free switch leaves), the
 * self-join switch (this app opened it, but the platform may now depend on it),
 * and the platform's own title and heading.
 */
export async function releaseApp(token: string, platform: string): Promise<void> {
  const body = await dmJson(await fetch(metadataUrl(platform), { cache: "no-store" }));
  const branding = body?.metadata?.[LOGIN_BRANDING_KEY];
  await dmJson(
    await fetch(metadataUrl(platform), {
      method: "PUT",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {
          apps: { [appSlug()]: null },
          [LOGIN_BRANDING_KEY]: {
            display_description_info: descriptionWithoutPrice(branding?.display_description_info),
          },
        },
      }),
      cache: "no-store",
    }),
  );
  invalidateAppPaymentInfo();
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
  appName: string = config.appName(),
): LoginBranding {
  const name = appName || platformName;
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
  appName?: string,
): Promise<void> {
  await dmJson(
    await fetch(metadataUrl(), {
      method: "PUT",
      headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: {
          apps: { [appSlug()]: info },
          [LOGIN_BRANDING_KEY]: loginBranding(info, platformName, existing, appName),
        },
      }),
      cache: "no-store",
    }),
  );
  invalidateAppPaymentInfo();
}
