"use client";

import { SetupScreen } from "@/components/setup/setup-screen";

/** Step 5: Monetize Your Agent: Connect with Stripe, for a paid answer on a
 * platform with no Stripe source yet. Stripe’s consent page returns here. */
export default function ConnectStepPage() {
  return <SetupScreen step="connect" />;
}
