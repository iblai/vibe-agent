"use client";

import { useState } from "react";
import Image from "next/image";
import { useGetMentorPublicSettingsQuery } from "@iblai/iblai-js/data-layer";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";

// Edit this: what the agent is for and who made it.
const ABOUT_COPY = "An AI agent built on the ibl.ai platform.";

export default function AboutPage() {
  const mentorId = config.defaultAgentId();
  const [tenantKey] = useState(resolveAppTenant);
  const { data, error } = useGetMentorPublicSettingsQuery(
    { mentor: mentorId, org: tenantKey },
    { skip: !mentorId || !tenantKey },
  );

  if (!mentorId) {
    return (
      <p role="alert" className="p-8 text-sm text-destructive">
        NEXT_PUBLIC_DEFAULT_AGENT_ID is not set. Add the agent’s uuid to .env.local (see README).
      </p>
    );
  }

  return (
    <div className="mx-auto w-full px-4 py-8 md:w-3/4 md:px-0">
      <div className="space-y-4 rounded-lg border border-[var(--border-color)] bg-white p-8">
        {data?.profile_image && (
          <Image
            src={data.profile_image}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 rounded-full object-cover"
          />
        )}
        <h1 className="text-xl font-semibold text-foreground">
          {data?.display_name ?? "About this agent"}
        </h1>
        {data?.initial_message && (
          <p className="text-sm text-muted-foreground">{data.initial_message}</p>
        )}
        <p className="text-sm text-muted-foreground">{ABOUT_COPY}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the agent’s details.
          </p>
        ) : null}
      </div>
    </div>
  );
}
