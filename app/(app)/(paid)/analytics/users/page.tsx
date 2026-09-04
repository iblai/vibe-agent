"use client";

import { AnalyticsUsersStats } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsUsersPage() {
  const mentorId = config.defaultAgentId();
  return (
    <AnalyticsUsersStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
    />
  );
}
