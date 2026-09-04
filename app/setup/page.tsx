"use client";

import { useState } from "react";
import { OnboardingShell } from "@iblai/iblai-js/web-containers";
import { isTenantAdmin } from "@/lib/iblai/tenant";
import { SetupScreen } from "@/components/setup/setup-screen";

// Outside the (app) group on purpose: sign-in gated by the providers, but no
// navbar — the SDK's onboarding canvas is the whole page. Tenant admins only;
// the platform enforces the same rule on every call the screens make.
export default function SetupPage() {
  // Read once on the client: the providers hold this tree until mounted.
  const [isAdmin] = useState(() => typeof window !== "undefined" && isTenantAdmin());

  if (isAdmin) return <SetupScreen />;
  return (
    <OnboardingShell totalSteps={1} currentStep={1}>
      <p role="alert" className="text-sm text-destructive">
        Only tenant admins can set up payments.
      </p>
    </OnboardingShell>
  );
}
