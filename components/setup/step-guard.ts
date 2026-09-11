"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  currentSetupStep,
  readAnswered,
  setupPath,
  stepApplies,
  type SetupStep,
} from "@/lib/setup-steps";

/**
 * A step's route, guarded: a link to one that no longer applies — `/setup/start`
 * once signed in, `/setup/platform` once one is stored, anything under `/setup`
 * before a platform is — sends the visitor to the step the app is actually on
 * instead of showing a question that cannot be answered.
 *
 * Read once, on mount: the providers hold this tree until the client has
 * mounted, and every answer here is saved by a full page load, so nothing can
 * change underneath it. False means a redirect is in flight.
 */
export function useStepGuard(step: SetupStep): boolean {
  const router = useRouter();
  const [applies] = useState(() => stepApplies(step, readAnswered()));

  useEffect(() => {
    if (!applies) router.replace(setupPath(currentSetupStep(readAnswered())));
  }, [applies, router]);

  return applies;
}
