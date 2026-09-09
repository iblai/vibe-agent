"use client";

import { AnalyticsTopicsStats } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsTopicsPage() {
  const mentorId = config.defaultAgentId();
  return (
    <AnalyticsTopicsStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
    />
  );
}
