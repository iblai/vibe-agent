"use client";

import { AnalyticsMemoryStats } from "@iblai/iblai-js/web-containers";
import { useUsername } from "@iblai/iblai-js/web-utils";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

export default function AnalyticsMemoryPage() {
  const mentorId = config.defaultAgentId();
  const username = useUsername();
  return (
    <AnalyticsMemoryStats
      tenantKey={resolveAppTenant()}
      mentorId={mentorId}
      selectedMentorId={mentorId}
      userId={username ?? ""}
    />
  );
}
