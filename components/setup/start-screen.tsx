"use client";

import { useState } from "react";
import {
  OnboardingShell,
  StepHeader,
  onboardingPrimaryButtonClass,
  onboardingSecondaryButtonClass,
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
 *   platform question answers itself. Only while no platform is fixed: a
 *   published app's is, and a platform made now could never be this app's.
 */
export function StartScreen() {
  /** The overlay's message while the browser is leaving; "" when it is not. */
  const [busy, setBusy] = useState("");
  const [platformFixed] = useState(() => !!readAnswered().platform);

  const leaveFor = (message: string, url: () => string) => () => {
    saveReturnPath("/setup");
    setBusy(message);
    window.location.href = url();
  };

  const start = leaveFor("Opening sign-in…", () =>
    authLoginUrl(window.location.origin),
  );
  const register = leaveFor("Opening ibl.ai…", () =>
    createPlatformUrl(window.location.origin),
  );

  return (
    <OnboardingShell
      {...stepProgress("start", { ...readAnswered(), needsConnect: false })}
    >
      {busy && <LoadingScreen overlay message={busy} />}
      <StepHeader
        title="Set up your app"
        subtitle={
          platformFixed
            ? "Sign in with your ibl.ai account. Three short questions and it is live."
            : "Sign in with your ibl.ai account, or register for a free one. Four short questions and it is live."
        }
      />
      {/* One of the two is the answer for almost everyone who reaches this
          screen: a creator with nothing yet, for whom Register makes the account
          and the platform in one $0 trip. It leads, and signing in is the quiet
          line under it. Where the platform is already fixed (a published app)
          there is no Register at all, so Start takes the emphasis back rather
          than leaving the screen nothing but a grey link. */}
      <div className="mt-6 space-y-3">
        {!platformFixed && (
          <button
            type="button"
            disabled={!!busy}
            className={onboardingPrimaryButtonClass}
            onClick={register}
          >
            Register
          </button>
        )}
        <button
          type="button"
          disabled={!!busy}
          className={
            platformFixed
              ? onboardingPrimaryButtonClass
              : onboardingSecondaryButtonClass
          }
          onClick={start}
        >
          {platformFixed ? "Start" : "Already have an account? Login instead."}
        </button>
      </div>
    </OnboardingShell>
  );
}
