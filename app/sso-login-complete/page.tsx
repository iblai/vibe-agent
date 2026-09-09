"use client";

import { Suspense } from "react";

import { SsoLogin } from "@iblai/iblai-js/web-containers/next";
import { LoadingScreen } from "@/components/loading-screen";

/**
 * SSO Login Complete page.
 *
 * The Auth SPA redirects here after successful authentication with
 * user tokens in the query string. The SsoLogin component parses them,
 * stores them in localStorage, and redirects to the saved return path.
 */
export default function SsoLoginCompletePage() {
  // SsoLogin renders nothing while it stores the tokens and leaves for `/`:
  // the one loading screen covers that moment, as it does everywhere else.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoadingScreen />
      <SsoLogin
        localStorageKeys={{
          CURRENT_TENANT: "current_tenant",
          USER_DATA: "userData",
          TENANTS: "tenants",
          AXD_TOKEN: "axd_token",
          AXD_TOKEN_EXPIRES: "axd_token_expires",
          DM_TOKEN: "dm_token",
          DM_TOKEN_EXPIRES: "dm_token_expires",
          EDX_TOKEN_KEY: "edx_jwt_token",
        }}
        redirectPathKey="redirectTo"
        defaultRedirectPath="/"
      />
    </Suspense>
  );
}
