// lib/paywall-client.ts — browser-side helpers for the paywall routes. The
// user's DM token (written to localStorage by the SDK at sign-in) is the only
// credential the browser holds; the server maps it to an identity and, for
// the setup route, forwards it to the platform, which decides who is an
// admin. Never import from a server file.

export type Access = "free" | "one_time" | "monthly";

export type CataloguePriceView = {
  id: string;
  productId: string;
  name: string;
  /** Minor units (cents). */
  unitAmount: number;
  currency: string;
  interval: "month" | "year" | null;
};

export type CatalogueView = {
  app: string;
  paywall: boolean;
  decided: boolean;
  source: "env" | "metadata" | "none";
  platformName: string;
  /** The platform's own $0 sign-up for a stranger; it returns here signed in. */
  signUpUrl: string;
  prices: CataloguePriceView[];
  settings: { access: Access; amount: number | null } | null;
};

/** /api/paywall/access: with a session_id, whether the buyer is in now; without one, a member's standing. */
export type AccessView = {
  joined?: boolean;
  has_access?: boolean;
  payer?: boolean;
  paywall?: boolean;
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

/** fetch() a paywall route, signed in when a token exists; a non-2xx throws the server's message. */
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
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new PaywallRequestError(
      res.status,
      data?.error ?? data?.detail ?? `Request failed (${res.status})`,
    );
  return data as T;
}

export const fetchCatalogue = () => paywallFetch<CatalogueView>("/api/paywall/prices");

// ponytail: one public read per page life; a failure reads as "free", which
// sends the visitor to the login SPA exactly as before this feature.
let paidCache: Promise<boolean> | null = null;

/** Does joining this platform cost money? */
export function platformIsPaid(): Promise<boolean> {
  paidCache ??= fetchCatalogue()
    .then((c) => !!c.paywall)
    .catch(() => false);
  return paidCache;
}

/** The DM's message for a failed request, or a generic one. */
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong; try again.";

/** The route's message with its status, for errors a person has to act on. */
export const errorWithStatus = (e: unknown) =>
  e instanceof PaywallRequestError ? `${e.message} (${e.status})` : errorMessage(e);

const SETUP_OK_KEY = "paywall_setup_ok_at";
const SETUP_TTL_MS = 600_000;

/** This admin session already knows the paywall choice has been made. */
export function setupSettled(): boolean {
  return Date.now() - Number(sessionStorage.getItem(SETUP_OK_KEY) ?? 0) < SETUP_TTL_MS;
}
export const markSetupDone = () => sessionStorage.setItem(SETUP_OK_KEY, String(Date.now()));

/** "decided" (a choice exists, or env decides), "undecided" (first run), "unknown" (hiccup). */
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

const ACCESS_OK_KEY = "paywall_ok_at";
const ACCESS_TTL_MS = 60_000;

/** This member's standing was checked in the last minute. */
export function memberAccessSettled(): boolean {
  return Date.now() - Number(sessionStorage.getItem(ACCESS_OK_KEY) ?? 0) < ACCESS_TTL_MS;
}

/**
 * A member's standing: true unless the platform says a lapsed payment ended
 * their membership. A hiccup reads as true — never lock a member out for it.
 */
export async function checkMemberAccess(): Promise<boolean> {
  try {
    const { has_access } = await paywallFetch<AccessView>("/api/paywall/access");
    if (has_access !== false) sessionStorage.setItem(ACCESS_OK_KEY, String(Date.now()));
    return has_access !== false;
  } catch (e) {
    console.error("[paywall] access check failed:", e);
    return true;
  }
}

/** The DM masks a key to its first 3 and last 2 characters; show just those. */
export const maskedKeyShort = (masked: string) =>
  masked.length > 5 ? `${masked.slice(0, 3)}…${masked.slice(-2)}` : masked;

// ponytail: minor units / 100 — wrong for zero-decimal currencies (JPY, KRW);
// the app sells in USD only, so this never bites today.
export function formatAmount(unitAmount: number, currency: string): string {
  const major = unitAmount / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    }).format(major);
  } catch {
    return `${major} ${currency.toUpperCase()}`;
  }
}
