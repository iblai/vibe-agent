"use client";

import { AnalyticsAuditLogStats } from "@iblai/iblai-js/web-containers";
import { useUsername } from "@iblai/iblai-js/web-utils";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsAuditPage() {
  const mentorId = config.defaultAgentId();
  const username = useUsername();
  return (
    <AnalyticsAuditLogStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
      userId={username ?? ""}
    />
  );
}
