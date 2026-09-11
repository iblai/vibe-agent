"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/loading-screen";
import { currentSetupStep, readAnswered, setupPath } from "@/lib/setup-steps";

/**
 * `/setup` has no screen of its own: it sends the browser to whichever step the
 * app is actually on. That is why everything else — the admin redirect in the
 * app shell, the quiet "Payments setup" link on /account, the no-agent alert,
 * the return path saved before signing in — keeps linking here and none of them
 * has to know the order.
 */
export default function SetupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(setupPath(currentSetupStep(readAnswered())));
  }, [router]);

  return <LoadingScreen />;
}
