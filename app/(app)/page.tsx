"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chat, type ChatConfig } from "@iblai/iblai-js/web-containers/next";
import {
  useUsername,
  useAxdToken,
  useUserTenants,
  useVisitingTenant,
  useCachedSessionId,
} from "@iblai/iblai-js/web-utils";
import { PayGate } from "@/components/pay-gate";
import { LoadingScreen } from "@/components/loading-screen";
import { redirectToAuthSpa } from "@/lib/iblai/auth-utils";
import config from "@/lib/iblai/config";
import { resolveAppTenant } from "@/lib/iblai/tenant";
import { useAdminMode } from "@/lib/iblai/admin-mode";

export default function HomePage() {
  // useSearchParams() needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <AgentChat />
    </Suspense>
  );
}

function AgentChat() {
  const mentorId = config.defaultAgentId();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resume (`?session=<id>`) or new chat (`?new=<nonce>`). The SDK reads its
  // per-mentor cached-session map once at <Chat> mount, so seed or clear it
  // before mounting and key <Chat> on the params so a switch remounts it.
  // That key is the only legitimate remount: any other remount wedges voice.
  const restoreSessionId = searchParams.get("session") ?? undefined;
  const newParam = searchParams.get("new") ?? undefined;
  const [cachedSessionId, saveCachedSessionId] = useCachedSessionId();
  const [seededFor, setSeededFor] = useState<string | undefined>(
    restoreSessionId || newParam ? undefined : "none",
  );
  useEffect(() => {
    if (!mentorId) {
      setSeededFor("none");
      return;
    }
    const map = { ...((cachedSessionId ?? {}) as Record<string, string>) };
    if (restoreSessionId) {
      if (map[mentorId] !== restoreSessionId) {
        saveCachedSessionId({ ...map, [mentorId]: restoreSessionId });
      }
      setSeededFor(restoreSessionId);
    } else if (newParam) {
      if (map[mentorId]) {
        delete map[mentorId];
        saveCachedSessionId(map);
      }
      setSeededFor(`new:${newParam}`);
    } else {
      setSeededFor("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreSessionId, newParam, mentorId]);
  const sessionReady = restoreSessionId
    ? seededFor === restoreSessionId
    : newParam
      ? seededFor === `new:${newParam}`
      : true;

  const [tenantKey] = useState(resolveAppTenant);
  const { adminMode } = useAdminMode();
  const username = useUsername();
  const axdToken = useAxdToken();
  const { userTenants } = useUserTenants();
  const { visitingTenant } = useVisitingTenant();

  const chatConfig: ChatConfig = {
    baseWsUrl: () => config.baseWsUrl(),
    supportEmail: () => config.supportEmail(),
    authUrl: () => config.authUrl(),
    mainTenantKey: config.mainTenantKey(),
    navigateToAdminBilling: () => router.push("/account"),
    // Single-agent app: there is nothing else to explore.
    navigateToExplore: () => router.push("/"),
    navigateToMentor: () => router.push("/"),
  };

  // A member who is already signed in, on an app whose owner has not finished:
  // the same words a signed-out visitor gets (`BeingConfigured` in the
  // providers), and no link — /setup is the owner's, and it refuses them. An
  // admin never reads this for long: the shell redirects them to the wizard.
  if (!mentorId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-gray-900">This app is being configured</p>
        <p className="mt-1 text-sm text-gray-500">
          Its owner is still setting it up. Check back soon.
        </p>
      </div>
    );
  }
  // Signing in, or the platform still resolving: the arc, not a blank frame.
  if (!tenantKey || !sessionReady) return <LoadingScreen className="min-h-0 flex-1" />;

  // The gate sits around the SDK's composer: an unpaid member's send opens the
  // pay modal instead (components/pay-gate.tsx).
  return (
    <PayGate>
      <Chat
        key={`${mentorId}:${restoreSessionId ?? ""}:${newParam ?? ""}`}
        isPreviewMode={false}
        mentorId={mentorId}
        tenantKey={tenantKey}
        config={chatConfig}
        redirectToAuthSpa={(to, key, logout) => void redirectToAuthSpa(to, key, logout)}
        username={username ?? null}
        userTenants={userTenants ?? []}
        visitingTenant={visitingTenant}
        axdToken={axdToken ?? ""}
        userIsStudent={!adminMode}
        showExploreMentors={false}
      />
    </PayGate>
  );
}
