"use client";

import { SetupScreen } from "@/components/setup/setup-screen";

/** Step 3: Which agent does this app front, and what the app is called. Stays
 * reachable afterwards, from the quiet link under Save on the price step. */
export default function AgentStepPage() {
  return <SetupScreen step="agent" />;
}
