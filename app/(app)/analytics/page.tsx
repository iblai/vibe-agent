"use client";

import { AnalyticsOverview } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsPage() {
  const mentorId = config.defaultAgentId();
  return (
    <AnalyticsOverview
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
    />
  );
}
