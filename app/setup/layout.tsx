"use client";

import { useState } from "react";
import { OnboardingShell } from "@iblai/iblai-js/web-containers";
import { isTenantAdmin, resolveAppTenant } from "@/lib/iblai/tenant";
import { readAnswered } from "@/lib/setup-steps";

// Outside the (app) group on purpose: sign-in gated by the providers, but no
// navbar — the SDK's onboarding canvas is the whole page. Platform admins only;
// the platform enforces the same rule on every call the screens make. One gate
// for every step's route.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  // Read once on the client: the providers hold this tree until mounted. Two
  // kinds of visitor have no membership to be an admin of and are let through
  // anyway: one on an app with no platform yet (the wizard's own first step asks
  // which platform is theirs), and one with no session at all — the only step
  // they can reach is `start`, which is the sign-in button, and this is the way
  // in from the "being configured" screen. The platform refuses every write the
  // screens make if they are not an admin.
  const [mayPass] = useState(
    () =>
      typeof window !== "undefined" &&
      (!readAnswered().signedIn || !resolveAppTenant() || isTenantAdmin()),
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
