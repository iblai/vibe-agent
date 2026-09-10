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
 * The login SPA's join page for the app's platform, built the way the SDK
 * (`getAuthSpaJoinUrl`) and the OS build it. It makes the account or signs an
 * existing one in, links it to the platform (the platform's self-join, which
 * every setup save opens) and comes back to {origin}/sso-login-complete.
 * Every visitor without a session goes here, so nobody arrives as a
 * non-member and the SDK `TenantProvider` only confirms the membership.
 * Everything is env: NEXT_PUBLIC_AUTH_URL, NEXT_PUBLIC_MAIN_TENANT_KEY, and
 * {origin} is where the app runs (NEXT_PUBLIC_TAURI_CUSTOM_SCHEME on mobile).
 */
export const authJoinUrl = (origin: string) =>
  `${config.authUrl()}/join?tenant=${encodeURIComponent(resolveAppTenant())}&redirect-to=${encodeURIComponent(origin)}`;

/** Where SsoLogin sends the browser once the Auth SPA returns (the key it reads, then clears). */
export const saveReturnPath = (path: string) => localStorage.setItem("redirectTo", path);

/**
 * Send the browser to the login SPA's join page. The SDK passes a platform
 * key of its own on some paths and asks for a forced re-login on others
 * (`logout`); this app has one platform, from env, and the join page has no
 * such switch — a live SPA session passes straight through with fresh tokens
 * and gets linked — so both arguments are ignored.
 */
export async function redirectToAuthSpa(
  redirectTo?: string,
  _platformKey?: string,
  _logout?: boolean,
  saveRedirect?: boolean,
) {
  const path = redirectTo ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  if (saveRedirect) saveReturnPath(path);

  // All platforms (web, desktop Tauri, mobile Tauri): navigate the window
  // to the Auth SPA.  On desktop Tauri the auth page loads in-app, and
  // the Rust on_navigation filter opens OAuth providers (Google, Apple)
  // in a popup window automatically.
  window.location.href = authJoinUrl(getRedirectOrigin());
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
 * Sign out: clear the app's state and go to the SPA's logout page (the
 * SDK's, the OS's and the starter's contract). It drops the SPA's own
 * session and returns to the app, whose AuthProvider sends the signed-out
 * visitor to the join page.
 */
export function handleLogout() {
  localStorage.clear();
  window.location.href = `${config.authUrl()}/logout?redirect-to=${encodeURIComponent(getRedirectOrigin())}&tenant=${encodeURIComponent(resolveAppTenant())}`;
}
