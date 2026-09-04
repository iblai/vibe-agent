"use client";

import { AnalyticsReports } from "@iblai/iblai-js/web-containers";
import { useGetMentorPublicSettingsQuery } from "@iblai/iblai-js/data-layer";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

// Reports key on the agent's database id, not its uuid; the public settings
// carry it.
export default function AnalyticsReportsPage() {
  const mentorId = config.defaultAgentId();
  const tenantKey = resolveAppTenant();
  const { data } = useGetMentorPublicSettingsQuery(
    { mentor: mentorId, org: tenantKey },
    { skip: !mentorId || !tenantKey },
  );
  const dbId = data?.mentor_id == null ? undefined : String(data.mentor_id);
  return (
    <AnalyticsReports tenantKey={tenantKey} selectedMentorId={mentorId} selectedMentorDbId={dbId} />
  );
}
