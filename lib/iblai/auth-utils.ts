/**
 * ibl.ai auth helper utilities.
 *
 * These are thin wrappers used by IblaiProviders. You can customise the
 * redirect behaviour here without touching the provider component.
 */

import config from "./config";
import { resolveAppTenant } from "./tenant";

/** Check if running inside a Tauri app. */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

/** Check if running inside a Tauri mobile app (iOS/Android). */
export function isTauriMobile(): boolean {
  if (!isTauri()) return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Get the redirect origin for the Auth SPA.
 *  - Mobile Tauri: custom scheme (e.g. `iblai-skills://`)
 *  - Desktop Tauri / Web: window.location.origin
 */
function getRedirectOrigin(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (isTauriMobile()) {
    const scheme = config.tauriCustomScheme();
    if (scheme) return `${scheme}://`;
  }
  return origin;
}

/**
 * The Auth SPA's login URL that comes back to {origin}/sso-login-complete,
 * always scoped to the app's platform (NEXT_PUBLIC_MAIN_TENANT_KEY): the SPA
 * brands its screens from that platform's metadata, and a member of it lands
 * on it. A non-member's login reaches the SPA's completion step without the
 * tenant (the SPA drops it on that hop), so the SPA never tries to join
 * them; the SDK `TenantProvider` self-joins them on arrival (every setup
 * save opens the platform's self-join switch).
 *
 * `enforce-login=1` is the SPA's own "the form, fresh session" switch (it
 * uses it after creating an organisation). Without it, a `tenant=` on the
 * URL makes the SPA's login page look the platform's SSO login URL up once
 * its custom-domain check on `redirect-to` settles — after it has already
 * rendered the form — so the form gives way to a spinner and comes back: a
 * flicker on every arrival. The price: the SPA drops its own session on
 * arrival, so someone signed in to another ibl.ai app in this browser types
 * their credentials once instead of being passed through.
 */
export const authLoginUrl = (origin: string) =>
  `${config.authUrl()}/login?app=custom&redirect-to=${origin}&tenant=${encodeURIComponent(resolveAppTenant())}&enforce-login=1`;

/** Where SsoLogin sends the browser once the Auth SPA returns (the key it reads, then clears). */
export const saveReturnPath = (path: string) => localStorage.setItem("redirectTo", path);

/**
 * Redirect the browser to the ibl.ai Auth SPA for login. The SDK passes a
 * platform key of its own on some paths (`platformKey`); this app has one
 * platform, so the URL always carries the env key and that argument is
 * ignored.
 */
export async function redirectToAuthSpa(
  redirectTo?: string,
  _platformKey?: string,
  logout?: boolean,
  saveRedirect?: boolean,
) {
  const redirectOrigin = getRedirectOrigin();
  const path = redirectTo ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  if (saveRedirect) saveReturnPath(path);

  let authUrl = authLoginUrl(redirectOrigin);
  if (logout) authUrl += "&logout=1";

  // All platforms (web, desktop Tauri, mobile Tauri): navigate the window
  // to the Auth SPA.  On desktop Tauri the auth page loads in-app, and
  // the Rust on_navigation filter opens OAuth providers (Google, Apple)
  // in a popup window automatically.
  window.location.href = authUrl;
}

/** Check whether a non-expired auth token exists in localStorage. */
export function hasNonExpiredAuthToken(): boolean {
  if (typeof window === "undefined") return false;
  const token = localStorage.getItem("axd_token");
  if (!token) return false;
  const expiry = localStorage.getItem("axd_token_expires");
  if (!expiry) return false;
  return new Date(expiry) > new Date();
}

/**
 * Sign out: clear the app's state and go straight to the login form. The
 * SPA's login page logs its own session out on `enforce-login` exactly as
 * its /logout page does, and that page would only send the browser back
 * here to be bounced to the form: three page loads for one.
 */
export function handleLogout() {
  localStorage.clear();
  window.location.href = authLoginUrl(getRedirectOrigin());
}
