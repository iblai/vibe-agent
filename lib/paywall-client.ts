// lib/paywall-client.ts — browser-side helpers for the paywall routes. The
// member's DM token (written to localStorage by the SDK TenantProvider) is the
// only credential the browser holds; the server maps it to an identity and,
// for the setup route, forwards it to the platform, which decides who is an
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
  prices: CataloguePriceView[];
  settings: { access: Access; amount: number | null } | null;
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

/** fetch() a paywall route as the signed-in member; a non-2xx throws the server's message. */
export async function paywallFetch<T = unknown>(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string>; json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      Authorization: `Token ${dmToken()}`,
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

/** The DM's message for a failed request, or a generic one. */
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong; try again.";

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
