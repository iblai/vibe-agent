"use client";

import { SetupScreen } from "@/components/setup/setup-screen";

/** Step 2: Which platform is this app for? Answered once — the onboarding
 * route refuses a change, so this route sends an already-configured app on. */
export default function PlatformStepPage() {
  return <SetupScreen step="platform" />;
}
