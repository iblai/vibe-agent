/**
 * Tenant resolution for a single-tenant ibl.ai app.
 *
 * The tenant comes from NEXT_PUBLIC_MAIN_TENANT_KEY only. A tenant left in
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

/** The app's tenant key from env, or "" when unset or still a placeholder. */
export function resolveAppTenant(): string {
  const envTenant = config.mainTenantKey();
  return envTenant && !PLACEHOLDER_PLATFORMS.has(envTenant) ? envTenant : "";
}

/**
 * Check if the SDK's current tenant matches the app's pinned tenant.
 *
 * If they differ, redirect to the auth SPA to re-login for the correct
 * tenant. Returns `true` if a redirect was triggered (caller should stop
 * rendering).
 */
export function checkTenantMismatch(): boolean {
  if (typeof window === "undefined") return false;

  const appTenant = resolveAppTenant();
  const sdkTenant = localStorage.getItem("tenant") ?? "";

  if (appTenant && sdkTenant && sdkTenant !== appTenant) {
    // Use dynamic import to avoid hard dependency on auth-utils from tenant module.
    void import("./auth-utils").then(({ redirectToAuthSpa }) => {
      void redirectToAuthSpa(undefined, appTenant, false, false);
    });
    return true;
  }
  return false;
}

/**
 * Whether the signed-in user is an admin of the app's tenant, from the
 * `tenants` list SsoLogin / TenantProvider persist. Not the SDK's
 * `useIsAdmin()`: that JSON-parses `current_tenant`, which this app stores
 * as a plain key string.
 */
export function isTenantAdmin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const tenants = JSON.parse(localStorage.getItem("tenants") ?? "[]") as {
      key: string;
      is_admin?: boolean;
    }[];
    return !!tenants.find((t) => t.key === resolveAppTenant())?.is_admin;
  } catch {
    return false;
  }
}
