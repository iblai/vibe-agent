"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NotificationDisplay } from "@iblai/iblai-js/web-containers";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { LoadingScreen } from "@/components/loading-screen";

export default function NotificationsPage() {
  const params = useParams();
  const idParam = (params?.id as string[] | undefined) ?? undefined;
  const notificationId = idParam?.[0] ?? undefined;

  const [tenantKey, setTenantKey] = useState("");
  const [username, setUsername] = useState("");
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
    // A bounded, full-width surface: the SDK panel needs a definite height to
    // scroll its list and detail panes itself (the OS hosts it the same way).
    <div className="flex min-h-0 flex-1 flex-col">
      <NotificationDisplay
        className="h-full"
        org={tenantKey}
        userId={username}
        isAdmin={isAdmin}
        selectedNotificationId={notificationId}
      />
    </div>
  );
}
