"use client";

import { useState } from "react";
import { AnalyticsOverview } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { useAdminMode } from "@/lib/iblai/admin-mode";

export default function AnalyticsPage() {
  const mentorId = config.defaultAgentId();
  const [tenantKey] = useState(resolveAppTenant);
  const { adminMode } = useAdminMode();

  if (!mentorId) {
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        NEXT_PUBLIC_DEFAULT_AGENT_ID is not set. Add the agent’s uuid to .env.local (see README).
      </p>
    );
  }
  if (!adminMode) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        Analytics is available to organization admins only.
      </p>
    );
  }
  if (!tenantKey) return null;

  return (
    <div className="mx-auto w-full px-4 py-8 md:w-[75vw] md:px-0">
      <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-white">
        <AnalyticsOverview tenantKey={tenantKey} mentorId={mentorId} />
      </div>
    </div>
  );
}
