"use client";

import { useEffect, useState } from "react";
import { Profile } from "@iblai/iblai-js/web-containers";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { LoadingScreen } from "@/components/loading-screen";

export default function ProfilePage() {
  const [tenantKey, setTenantKey] = useState("");
  const [username, setUsername] = useState("");
  const [tenants, setTenants] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userData");
      if (raw) {
        const parsed = JSON.parse(raw);
        setUsername(parsed.user_nicename ?? parsed.username ?? "");
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
    // needs a definite height for its rail, scrolling content pane and pinned
    // Save bar (the OS shows it in a p-0 bg-white dialog of fixed height).
    <div className="min-h-0 flex-1 bg-white">
      <Profile
        tenant={tenantKey}
        tenants={tenants}
        username={username}
        isAdmin={isAdmin}
        onClose={() => {}}
        customization={{
          showPlatformName: true,
          useGravatarPicFallback: true,
        }}
        targetTab="basic"
      />
    </div>
  );
}
