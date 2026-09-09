"use client";

import { AnalyticsFinancialStats } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsCostsPage() {
  const mentorId = config.defaultAgentId();
  return (
    <AnalyticsFinancialStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
    />
  );
}
