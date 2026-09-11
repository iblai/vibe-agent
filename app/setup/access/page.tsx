"use client";

import { SetupScreen } from "@/components/setup/setup-screen";

/** Step 4: How people get in: free, one-time or monthly. The quiet “Payments
 * setup” link on /account comes back here. */
export default function AccessStepPage() {
  return <SetupScreen step="access" />;
}
