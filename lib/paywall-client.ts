// lib/paywall-client.ts — the browser side of the paywall. Two rails, one
// credential: the signed-in member's own DM token (`localStorage.dm_token`,
// written by the SDK at sign-in). The buyer rail goes straight from the
// browser to the platform on the member's own username path (catalogue from
// the platform's public metadata, checkout, access); the admin rail is the
// app's own routes under /api/paywall/admin/*, which forward that same token.
// The app holds no platform key. Never import from a server file.
// Relative import (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import config from "./iblai/config";

export type Access = "free" | "one_time" | "monthly";

export type CataloguePrice = {
  id: string;
  productId: string;
  name: string;
  /** Minor units (cents). */
  unitAmount: number;
  currency: string;
  interval: "month" | null;
};

export type Catalogue = {
  app: string;
  /** Something is for sale: a member has to pay to send. */
  paywall: boolean;
  /** The admin has answered the question. */
  decided: boolean;
  platformName: string;
  settings: { access: Access; amount: number | null } | null;
  price: CataloguePrice | null;
};

/** The platform's answer to a checkout: what Stripe.js renders in the pay modal. */
export type CheckoutSession = {
  client_secret: string;
  session_id: string;
  /** The platform's own publishable key on a connected account, the tenant's own on a pasted key. */
  publishable_key: string;
  /** The connected Stripe account, null on a pasted key. Always passed to Stripe.js as given. */
  stripe_account: string | null;
};

export type AccessView = { has_access: boolean };

/** The platform's Stripe source right now (GET /api/paywall/admin/connect). */
export type ConnectStatus = {
  connected: boolean;
  /** False while the platform's backend lacks the Connect migration. */
  available: boolean;
  key_credential_set: boolean;
  /** A pasted `stripe` key wins, else the connected account, else nothing. */
  source: "key" | "connected" | null;
  publishable_key: string;
  stripe_account: string | null;
  account_id?: string;
  livemode?: boolean;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  business_name?: string;
  email?: string;
  connected_at?: string;
  stale?: boolean;
};

export class PaywallRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PaywallRequestError";
  }
}

export const dmToken = () =>
  typeof window === "undefined" ? "" : (localStorage.getItem("dm_token") ?? "");

/** The signed-in username the SDK stores at sign-in. */
export function readUsername(): string {
  try {
    return JSON.parse(localStorage.getItem("userData") ?? "{}").user_nicename ?? "";
  } catch {
    return "";
  }
}

/** The DM's message for a failed request, or a generic one. */
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong; try again.";

/** The route's message with its status, for errors a person has to act on. */
export const errorWithStatus = (e: unknown) =>
  e instanceof PaywallRequestError ? `${e.message} (${e.status})` : errorMessage(e);

/** A response's JSON; a non-2xx throws the platform's own message (error/detail), never swallowed. */
async function answer<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new PaywallRequestError(
      res.status,
      data?.error ?? data?.detail ?? `Request failed (${res.status})`,
    );
  return data as T;
}

/**
 * fetch() as the signed-in member — the app's own admin routes (a path) or
 * the platform itself (an absolute URL) — with `Authorization: Token` when a
 * token exists; a non-2xx throws the server's message.
 */
export async function paywallFetch<T = unknown>(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string>; json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = dmToken();
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(token && { Authorization: `Token ${token}` }),
      ...(json !== undefined && { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  return answer<T>(res);
}

const app = () => config.paywallAppSlug();
const orgUrl = () => `${config.dmUrl()}/api/core/orgs/${config.mainTenantKey()}`;

/** The platform's paywall on the member's OWN path: another user's path is a 403 by design. */
const paywallBase = () =>
  `${config.dmUrl()}/api/ai-mentor/orgs/${config.mainTenantKey()}` +
  `/users/${encodeURIComponent(readUsername())}/providers/stripe/payments`;

const CATALOGUE_TTL_MS = 60_000;
// ponytail: 60 s module cache; the setup screen invalidates after a save.
let catalogueCache: { at: number; value: Promise<Catalogue> } | null = null;

export function invalidateCatalogue(): void {
  catalogueCache = null;
}

/** apps.<slug> from the platform's public metadata — no credential, no DM auth. */
export function fetchCatalogue(): Promise<Catalogue> {
  if (catalogueCache && Date.now() - catalogueCache.at < CATALOGUE_TTL_MS)
    return catalogueCache.value;
  const value = (async (): Promise<Catalogue> => {
    const body = await answer<any>(await fetch(`${orgUrl()}/metadata/`, { cache: "no-store" }));
    const slug = app();
    const info = body?.metadata?.apps?.[slug];
    const valid =
      !!info &&
      typeof info === "object" &&
      ["free", "one_time", "monthly"].includes(info.access) &&
      typeof info.stripe === "object";
    const priceId = valid && info.access !== "free" ? info.stripe?.price_id : null;
    return {
      app: slug,
      paywall: !!priceId,
      decided: valid,
      platformName: String(body?.platform_name ?? ""),
      settings: valid ? { access: info.access, amount: info.amount ?? null } : null,
      price: priceId
        ? {
            id: String(priceId),
            productId: String(info.stripe.product_id ?? ""),
            name: info.access === "monthly" ? "Monthly access" : "One-time access",
            unitAmount: Number(info.amount ?? 0),
            currency: String(info.currency ?? "usd"),
            interval: info.access === "monthly" ? "month" : null,
          }
        : null,
    };
  })();
  catalogueCache = { at: Date.now(), value };
  value.catch(() => {
    catalogueCache = null;
  });
  return value;
}

/**
 * Mint the member's own embedded Checkout Session on the platform's Stripe
 * source. Card fields only: each further method Stripe's dynamic list would
 * add is a row in the embedded form, and the modal has to fit a laptop screen.
 */
export const startCheckout = (priceId: string) =>
  paywallFetch<CheckoutSession>(`${paywallBase()}/paywall/checkout/`, {
    method: "POST",
    json: { app: app(), price_id: priceId, ui_mode: "embedded", payment_method_types: ["card"] },
  });

/** The platform's verdict for the signed-in member; with sessionId, the session they just completed. */
export const checkAccess = (sessionId?: string) =>
  paywallFetch<AccessView>(
    `${paywallBase()}/paywall/access/?${new URLSearchParams({
      app: app(),
      ...(sessionId && { session_id: sessionId }),
    })}`,
  );

const SETUP_OK_KEY = "paywall_setup_ok_at";
const SETUP_TTL_MS = 600_000;

/** This admin session already knows the paywall choice has been made. */
export function setupSettled(): boolean {
  return Date.now() - Number(sessionStorage.getItem(SETUP_OK_KEY) ?? 0) < SETUP_TTL_MS;
}
export const markSetupDone = () => sessionStorage.setItem(SETUP_OK_KEY, String(Date.now()));

/** "decided" (a choice exists), "undecided" (first run), "unknown" (hiccup). */
export async function checkPaywallSetup(): Promise<"decided" | "undecided" | "unknown"> {
  try {
    const { decided } = await fetchCatalogue();
    if (!decided) return "undecided";
    markSetupDone();
    return "decided";
  } catch (e) {
    console.error("[paywall] setup check failed:", e);
    return "unknown";
  }
}

const ACCESS_TTL_MS = 60_000;
let accessCache: { at: number; verdict: Promise<boolean> } | null = null;

/** A payment just went through in the modal: the next ask goes to the platform. */
export function resetPaidAccess(): void {
  accessCache = null;
}

/**
 * Does the signed-in member's payment grant? Nothing for sale (free, or not
 * decided yet) grants everyone without asking the platform; else the
 * platform answers, once per minute (it caches its own for as long, so a
 * lapse shows within that). A refused or failed request rejects, so the
 * caller can say so: never a silent pass.
 */
export function hasPaidAccess(): Promise<boolean> {
  if (accessCache && Date.now() - accessCache.at < ACCESS_TTL_MS) return accessCache.verdict;
  const verdict = fetchCatalogue().then((c) =>
    c.paywall ? checkAccess().then((a) => a.has_access !== false) : true,
  );
  accessCache = { at: Date.now(), verdict };
  verdict.catch(() => {
    accessCache = null;
  });
  return verdict;
}
