"use client";

import { AnalyticsTranscriptsStats } from "@iblai/iblai-js/web-containers";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsTranscriptsPage() {
  const mentorId = config.defaultAgentId();
  return (
    <AnalyticsTranscriptsStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
    />
  );
}
