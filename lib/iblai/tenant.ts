/**
 * Platform resolution for a single-platform ibl.ai app.
 *
 * The platform comes from NEXT_PUBLIC_MAIN_TENANT_KEY only. A platform left in
 * localStorage (every vibe-starter app on this origin writes one) is never
 * consulted, and a missing or placeholder key resolves to "" so the providers
 * can fail loudly instead of adopting whatever the SDK finds.
 */

import config from "./config";

const PLACEHOLDER_PLATFORMS = new Set([
  "your-main-platform",
  "your-platform",
  "your-tenant",
  "your-tenant-key",
  "test-tenant",
  "main",
  "",
]);

/** The app's platform key from env, or "" when unset or still a placeholder. */
export function resolveAppTenant(): string {
  const envTenant = config.mainTenantKey();
  return envTenant && !PLACEHOLDER_PLATFORMS.has(envTenant) ? envTenant : "";
}

/**
 * Check if the SDK's current platform matches the app's pinned platform.
 *
 * If they differ, redirect to the auth SPA to re-login for the correct
 * platform. Returns `true` if a redirect was triggered (caller should stop
 * rendering).
 */
export function checkTenantMismatch(): boolean {
  if (typeof window === "undefined") return false;

  const appTenant = resolveAppTenant();
  const sdkTenant = localStorage.getItem("tenant") ?? "";

  if (appTenant && sdkTenant && sdkTenant !== appTenant) {
    // Use dynamic import to avoid hard dependency on auth-utils from this module.
    void import("./auth-utils").then(({ redirectToAuthSpa }) => {
      void redirectToAuthSpa(undefined, appTenant, false, false);
    });
    return true;
  }
  return false;
}

export type TenantEntry = { key: string; is_admin?: boolean };

/** The platforms the sign-in handed the browser (`tenants`), or [] when signed out. */
export function readTenants(): TenantEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem("tenants") ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Is {key} among the user's platforms? */
export const isTenantMember = (tenants: TenantEntry[], key: string) =>
  tenants.some((t) => t?.key === key);

/**
 * The platform ended this user's membership (a lapsed payment): forget it
 * locally too, so the join page offers the plan instead of "you're a member".
 */
export function dropTenant(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("tenants", JSON.stringify(readTenants().filter((t) => t?.key !== key)));
}

/**
 * Where a user the pinned platform does not know is sent: the join page when
 * joining costs money, otherwise the login SPA (null), where a free platform
 * signs them up and the SDK joins them silently.
 */
export function paywallEntry({
  member,
  paid,
}: {
  member: boolean;
  paid: boolean;
}): "/paywall" | null {
  return paid && !member ? "/paywall" : null;
}

/**
 * Whether the signed-in user is an admin of the app's platform, from the
 * `tenants` list SsoLogin / TenantProvider persist. Not the SDK's
 * `useIsAdmin()`: that JSON-parses `current_tenant`, which this app stores
 * as a plain key string.
 */
export function isTenantAdmin(): boolean {
  return !!readTenants().find((t) => t.key === resolveAppTenant())?.is_admin;
}
