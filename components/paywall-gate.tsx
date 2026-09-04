"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isTenantAdmin } from "@/lib/iblai/tenant";
import { checkPaywallSetup, setupSettled } from "@/lib/paywall-client";
import { LoadingScreen } from "@/components/loading-screen";

const OK_KEY = "paywall_ok_at";
const OK_TTL_MS = 60_000;

/** GET /api/paywall/access with the user's dm_token; stamps the grant cache. */
export async function checkPaywallAccess(sessionId?: string): Promise<boolean> {
  const token = localStorage.getItem("dm_token") ?? "";
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  const res = await fetch(`/api/paywall/access${qs}`, {
    headers: { Authorization: `Token ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (data?.has_access) sessionStorage.setItem(OK_KEY, String(Date.now()));
  return !!data?.has_access;
}

export function PaywallGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  // ponytail: sessionStorage grant cache (~60s) only de-flashes hard
  // navigations; the DM stays the entitlement authority.
  const [ok, setOk] = useState(() => {
    if (typeof window === "undefined") return false;
    // Tenant admins (the creator and their staff) skip the pay gate — UI-only,
    // the DM stays the entitlement authority for everyone else — and get the
    // setup question instead, once per session, until they have answered it.
    if (isTenantAdmin()) return setupSettled();
    return Date.now() - Number(sessionStorage.getItem(OK_KEY) ?? 0) < OK_TTL_MS;
  });

  // Mount-only check. ponytail: enforcement is client-side — this starter's
  // server HTML carries no user data, so a bypass only shows the empty shell;
  // real data still requires the user's own tokens.
  useEffect(() => {
    if (ok) return;
    if (isTenantAdmin()) {
      // "unknown" (a hiccup) lets the creator in — never lock them out.
      void checkPaywallSetup().then((state) =>
        state === "undecided" ? router.replace("/setup") : setOk(true),
      );
      return;
    }
    checkPaywallAccess()
      .then((granted) => (granted ? setOk(true) : router.replace("/paywall")))
      .catch(() => router.replace("/paywall"));
  }, [ok, router]);

  if (!ok) return <LoadingScreen />;
  return <>{children}</>;
}
