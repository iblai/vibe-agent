"use client";

import { useState } from "react";
import {
  OnboardingShell,
  StepHeader,
  onboardingPrimaryButtonClass,
} from "@iblai/iblai-js/web-containers";
import { LoadingScreen } from "@/components/loading-screen";
import { authLoginUrl, saveReturnPath } from "@/lib/iblai/auth-utils";
import { createPlatformUrl } from "@/lib/onboarding-client";
import { readAnswered, stepProgress } from "@/lib/setup-steps";

/**
 * The first thing a fresh clone shows, and the only screen before there is a
 * session. Two ways in, both leaving the page:
 *
 * - **Start** signs in on the login SPA with no platform named — none is known
 *   yet — and the wizard picks up at /setup on the way back.
 * - **Register** is for a visitor with nothing at all: ibl.ai's own $0 sign-up
 *   makes the account *and* a platform (an account alone is not enough — this
 *   wizard needs one they administer), and returns through the login SPA, which
 *   finishes the account and lands them back on /setup. They come back signed in
 *   on the new platform, which is then the only one they administer, so the
 *   platform question answers itself.
 */
export function StartScreen() {
  /** The overlay's message while the browser is leaving; "" when it is not. */
  const [busy, setBusy] = useState("");

  const leaveFor = (message: string, url: () => string) => () => {
    saveReturnPath("/setup");
    setBusy(message);
    window.location.href = url();
  };

  const start = leaveFor("Opening sign-in…", () => authLoginUrl(window.location.origin));
  const register = leaveFor("Opening ibl.ai…", () => createPlatformUrl(window.location.origin));

  return (
    <OnboardingShell {...stepProgress("start", { ...readAnswered(), needsConnect: false })}>
      {busy && <LoadingScreen overlay message={busy} />}
      <StepHeader
        title="Set up your app"
        subtitle="Sign in with your ibl.ai account, or register for a free one. Four short questions and it is live."
      />
      {/* Both ways in carry the same weight: for a visitor with no ibl.ai
          account, Register is the one that matters. `flex-1` is what makes them
          exactly equal — the SDK's class already carries `w-full`. */}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={!!busy}
          className={`flex-1 ${onboardingPrimaryButtonClass}`}
          onClick={register}
        >
          Register
        </button>
        <button
          type="button"
          disabled={!!busy}
          className={`flex-1 ${onboardingPrimaryButtonClass}`}
          onClick={start}
        >
          Start
        </button>
      </div>
    </OnboardingShell>
  );
}
