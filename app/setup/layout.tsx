"use client";

import { useState } from "react";
import { OnboardingShell } from "@iblai/iblai-js/web-containers";
import { isTenantAdmin, resolveAppTenant } from "@/lib/iblai/tenant";

// Outside the (app) group on purpose: sign-in gated by the providers, but no
// navbar — the SDK's onboarding canvas is the whole page. Platform admins only;
// the platform enforces the same rule on every call the screens make. One gate
// for every step's route.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  // Read once on the client: the providers hold this tree until mounted. With
  // no platform chosen yet there is no membership to be an admin of — the
  // wizard's own first step asks which platform is theirs, and the platform
  // refuses the write if it is not.
  const [mayPass] = useState(
    () => typeof window !== "undefined" && (!resolveAppTenant() || isTenantAdmin()),
  );

  if (mayPass) return children;
  return (
    <OnboardingShell totalSteps={1} currentStep={1}>
      <p role="alert" className="text-sm text-destructive">
        Only platform admins can set this app up.
      </p>
    </OnboardingShell>
  );
}
