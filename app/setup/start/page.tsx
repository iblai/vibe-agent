"use client";

import { LoadingScreen } from "@/components/loading-screen";
import { StartScreen } from "@/components/setup/start-screen";
import { useStepGuard } from "@/components/setup/step-guard";

/** Step 1: sign in. The one screen the wizard shows before there is a session. */
export default function StartStepPage() {
  return useStepGuard("start") ? <StartScreen /> : <LoadingScreen />;
}
