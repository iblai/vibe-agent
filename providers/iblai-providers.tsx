"use client";

/**
 * ibl.ai Provider wrapper.
 *
 * Wrap your root layout children with <IblaiProviders> to get:
 *  - Redux store (RTK Query for IBL APIs)
 *  - AuthProvider  (SSO redirect, JWT validation, cross-SPA sync)
 *  - TenantProvider (multi-platform routing)
 *
 * Usage in app/layout.tsx:
 *
 *   import { IblaiProviders } from "@/providers/iblai-providers";
 *   export default function RootLayout({ children }) {
 *     return <html><body><IblaiProviders>{children}</IblaiProviders></body></html>;
 *   }
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { usePathname } from "next/navigation";
import { initializeDataLayer, type TokenResponse } from "@iblai/iblai-js/data-layer";
import { AuthProvider, TenantProvider, ServiceWorkerProvider } from "@iblai/iblai-js/web-utils";
import { Toaster } from "sonner";
import { WebContainersI18nProvider } from "@iblai/iblai-js/web-containers/next";
import { RadixPointerEventsGuard } from "@/components/radix-pointer-events-guard";
import { LoadingScreen } from "@/components/loading-screen";

import { iblaiStore } from "@/store/iblai-store";
import { LocalStorageService } from "@/lib/iblai/storage-service";
import config from "@/lib/iblai/config";
import {
  checkTenantMismatch,
  isTenantMember,
  paywallEntry,
  readTenants,
  resolveAppTenant,
} from "@/lib/iblai/tenant";
import { redirectToAuthSpa } from "@/lib/iblai/auth-utils";
import { platformIsPaid } from "@/lib/paywall-client";

const storageService = LocalStorageService.getInstance();

// The SDK dropdown labels its learner-mode item "Learner / Instructor"; this
// app calls the modes User / Admin. Deep-merged over the SDK's English catalog.
const SDK_MESSAGES = {
  userProfileDropdownIndex: { learner: "User", instructor: "Admin" },
};

/** Routes that do NOT require authentication. */
const PUBLIC_ROUTES = new Map<RegExp, () => Promise<boolean>>([
  [new RegExp("^/sso-login"), async () => false],
  // The join page and the checkout return: the visitor may not be signed in yet.
  [new RegExp("^/paywall"), async () => false],
]);

export function IblaiProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // initializeDataLayer MUST be called synchronously before any children
  // render so that Config.lmsUrl / Config.dmUrl are set before RTK Query
  // hooks (e.g. inside the Profile component) fire their first queries.
  // useState initializer runs during the render cycle, not after it.
  const [isInitialized] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      // data-layer v1.2+ signature:
      // (dmUrl, lmsUrl, legacyLmsUrl, storageService, httpErrorHandler)
      initializeDataLayer(
        config.dmUrl(),
        config.lmsUrl(),
        // Dedicated edX host (learn.*) — NOT lmsUrl: on hosted defaults that
        // is the consolidated API path (api.iblai.app/lms), and the
        // legacy-LMS endpoints + edX iframes live on the real LMS host.
        config.legacyLmsUrl(),
        storageService,
        {
          401: () => redirectToAuthSpa(undefined, undefined, true),
        },
      );
    } catch (e) {
      console.error("[ibl.ai] initializeDataLayer failed:", e);
    }
    return true;
  });

  // `isInitialized` is false during SSR but true on the client's first render,
  // so gating the tree on it alone makes server and client markup disagree and
  // React throws a hydration mismatch on every route. Gate on a mount flag
  // instead: server and first client render both produce LOADING, and the tree
  // appears on the next commit. The data layer is still initialized
  // synchronously above, before any child can fire a query.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // TenantProvider reports a user it could not place in the pinned platform
  // through onAuthFailure and then stays in its loading state, so the message
  // has to come from the fallback we hand it.
  const [authFailure, setAuthFailure] = useState<string | null>(null);

  const username = useMemo(() => {
    if (typeof window === "undefined") return "";
    try {
      const raw = localStorage.getItem("userData");
      if (raw) return JSON.parse(raw).user_nicename ?? "";
    } catch {
      /* ignore */
    }
    return "";
  }, [isInitialized]);

  // Platform resolution: env only (single-platform app).
  const tenantKey = useMemo(() => resolveAppTenant(), [isInitialized]);

  const isSsoRoute = pathname?.startsWith("/sso-login") ?? false;
  const isPaywallRoute = pathname?.startsWith("/paywall") ?? false;

  // A user the pinned platform does not know goes to the join page when joining
  // costs money (the SDK's own answer is a logout round trip that ends on a red
  // "no access" paragraph); everyone else goes to the login SPA as before.
  const authRedirect = async (
    redirectTo?: string,
    platformKey?: string,
    logout?: boolean,
    saveRedirect?: boolean,
  ) => {
    const entry = paywallEntry({
      member: isTenantMember(readTenants(), tenantKey),
      paid: await platformIsPaid(),
    });
    if (entry) {
      window.location.assign(entry);
      return;
    }
    await redirectToAuthSpa(redirectTo, platformKey, logout, saveRedirect);
  };

  const LOADING = <LoadingScreen />;

  if (!isInitialized || !mounted) return LOADING;

  // Single-platform app: no platform means misconfiguration, not "pick one".
  if (!tenantKey) {
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        NEXT_PUBLIC_MAIN_TENANT_KEY is not set (or is still a placeholder). Set it in .env.local.
      </p>
    );
  }

  const AUTH_FAILURE = (
    <div className="flex min-h-screen items-center justify-center">
      <p role="alert" className="max-w-md p-8 text-sm text-destructive">
        {authFailure}
      </p>
    </div>
  );

  return (
    <ReduxProvider store={iblaiStore}>
      <RadixPointerEventsGuard />
      <Toaster />
      <ServiceWorkerProvider basePath="">
        <AuthProvider
          skip={isSsoRoute}
          redirectToAuthSpa={authRedirect}
          username={username}
          pathname={pathname ?? "/"}
          storageService={storageService}
          middleware={PUBLIC_ROUTES}
          enableStorageSync
          fallback={LOADING}
        >
          <TenantProvider
            skip={isSsoRoute || isPaywallRoute}
            currentTenant={tenantKey}
            requestedTenant={tenantKey}
            saveCurrentTenant={(t: any) => {
              const key = typeof t === "string" ? t : (t?.key ?? String(t));
              localStorage.setItem("current_tenant", key);
              localStorage.setItem("tenant", key);

              // If the SDK resolved a different platform than what the app
              // expects, redirect to re-login for the correct platform.
              checkTenantMismatch();
            }}
            saveUserTenants={(t: unknown) => localStorage.setItem("tenants", JSON.stringify(t))}
            // TenantProvider re-authenticates against the requested platform and
            // hands back a fresh, platform-scoped token pair. Without persisting it
            // the next membership check still runs on the pre-switch tokens, so
            // the provider loops on
            //   "User still does not belong to tenant after re-auth"
            // and the app never leaves its loading state. iblai/os wires these up
            // (providers/index.tsx -> saveUserTokens).
            saveUserTokens={(tokens: TokenResponse) => {
              if (tokens?.axd_token) {
                localStorage.setItem("axd_token", tokens.axd_token.token);
                localStorage.setItem("axd_token_expires", tokens.axd_token.expires);
              }
              if (tokens?.dm_token) {
                localStorage.setItem("dm_token", tokens.dm_token.token);
                localStorage.setItem("dm_token_expires", tokens.dm_token.expires);
              }
            }}
            saveTenant={(t: string) => localStorage.setItem("tenant", t)}
            onAuthFailure={(reason: string) => {
              console.error("[TenantProvider] Auth failure:", reason);
              setAuthFailure(reason);
            }}
            handleTenantSwitch={async () => {
              const tenant = resolveAppTenant();
              void redirectToAuthSpa(undefined, tenant, false, true);
            }}
            redirectToAuthSpa={authRedirect}
            username={username}
            fallback={authFailure ? AUTH_FAILURE : LOADING}
          >
            <WebContainersI18nProvider messages={SDK_MESSAGES}>
              {children}
            </WebContainersI18nProvider>
          </TenantProvider>
        </AuthProvider>
      </ServiceWorkerProvider>
    </ReduxProvider>
  );
}
