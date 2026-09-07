"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Account } from "@iblai/iblai-js/web-containers/next";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { LoadingScreen } from "@/components/loading-screen";

export default function AccountPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [tenantKey, setTenantKey] = useState("");
  const [tenants, setTenants] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userData");
      if (raw) {
        const parsed = JSON.parse(raw);
        setUsername(parsed.user_nicename ?? parsed.username ?? "");
        setEmail(parsed.user_email ?? parsed.email ?? "");
      }
    } catch {}

    const resolved = resolveAppTenant();
    setTenantKey(resolved);

    try {
      const tenantsRaw = localStorage.getItem("tenants");
      if (tenantsRaw) {
        const parsed = JSON.parse(tenantsRaw);
        setTenants(parsed);
        const match = parsed.find((t: any) => t.key === resolved);
        if (match) setIsAdmin(!!match.is_admin);
      }
    } catch {}

    setReady(true);
  }, []);

  if (!ready || !tenantKey) {
    return <LoadingScreen className="min-h-0 flex-1" />;
  }

  return (
    // A bounded, full-width white surface: the SDK panel is transparent and
    // needs a definite height for its rail and scrolling content pane.
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {isAdmin && (
        // The way back to the paywall question, deliberately quiet.
        <div className="flex shrink-0 justify-end px-4 pt-3">
          <Link
            href="/setup"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Payments setup
          </Link>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Account
          tenant={tenantKey}
          tenants={tenants}
          username={username}
          email={email}
          mainPlatformKey={config.mainTenantKey()}
          isAdmin={isAdmin}
          authURL={config.authUrl()}
          currentPlatformBaseDomain={config.platformBaseDomain()}
          currentSPA="agent"
          onInviteClick={() => {}}
          onClose={() => router.push("/")}
          targetTab="organization"
          showPlatformName={true}
          useGravatarPicFallback={true}
        />
      </div>
    </div>
  );
}
