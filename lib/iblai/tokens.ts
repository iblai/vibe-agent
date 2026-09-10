/**
 * Platform-scoped tokens.
 *
 * The platform's Stripe paywall surface binds the caller to the platform its
 * credential was minted for: a `dm_token` carries the platform that issued it,
 * and a call on another platform's path answers 403 "not your token's
 * platform". The SDK mints fresh tokens only when it switches platforms
 * through its public-route path, never after the self-join this app relies on
 * — so a member the SDK joins keeps the token of the platform they came from
 * and every paywall call refuses. Minting here after a join closes that.
 *
 * Relative imports (not @/): __tests__ load this module under vitest.
 */

import config from "./config";

/** The mint's answer: the platform-scoped pair the SDK's own switch stores. */
export type PlatformTokens = {
  axd_token?: { token: string; expires: string };
  dm_token?: { token: string; expires: string };
};

/** Store a token pair under the keys the SDK reads (`getHeaders`). */
export function saveTokens(tokens: PlatformTokens | undefined): void {
  if (tokens?.axd_token) {
    localStorage.setItem("axd_token", tokens.axd_token.token);
    localStorage.setItem("axd_token_expires", tokens.axd_token.expires);
  }
  if (tokens?.dm_token) {
    localStorage.setItem("dm_token", tokens.dm_token.token);
    localStorage.setItem("dm_token_expires", tokens.dm_token.expires);
  }
}

/**
 * Mint the app platform's own token pair for the signed-in user and store it,
 * on the user's edX JWT — the SDK's `getAppTokens` call. The platform mints
 * only for a platform the user is linked to, so this runs after a join.
 *
 * A failure is logged and answered `false`, never thrown or faked: the join
 * itself succeeded, and whatever the stale token cannot do says so with the
 * platform's own message where it happens.
 */
export async function mintPlatformTokens(): Promise<boolean> {
  const jwt = localStorage.getItem("edx_jwt_token") ?? "";
  const platform = config.mainTenantKey();
  if (!jwt || !platform) {
    console.error("[ibl.ai] no edX token or platform: tokens not minted");
    return false;
  }
  const body = new FormData();
  body.append("platform_key", platform);
  try {
    const res = await fetch(`${config.lmsUrl()}/api/ibl/manager/consolidated-token/proxy/`, {
      method: "POST",
      // The SDK's rule for this host: a long token is a JWT, a short one a
      // session key.
      headers: { Authorization: `${jwt.length > 30 ? "JWT" : "Bearer"} ${jwt}` },
      body,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`platform responded ${res.status}`);
    const answer = await res.json();
    saveTokens(answer?.data);
    return true;
  } catch (e) {
    console.error("[ibl.ai] could not mint platform tokens:", e);
    return false;
  }
}
