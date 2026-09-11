// lib/setup-steps.ts — the order of the setup wizard, and nothing else.
//
// Every step is a URL (`/setup/<step>`), and `/setup` is only a redirect to
// whichever one the app is actually on. This module is the one place that knows
// which that is, so the providers, the redirect page and the screens themselves
// all agree, and every caller elsewhere can keep linking to plain `/setup`.
//
// A `.ts` module on purpose: vitest collects `__tests__/**/*.test.ts` only, so
// the rules a test must hold live here and never in the `.tsx` that renders them.
import config from "./iblai/config";
import { hasNonExpiredAuthToken } from "./iblai/auth-utils";
import { resolveAppTenant } from "./iblai/tenant";

export const SETUP_STEPS = ["start", "platform", "agent", "access", "connect"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** The route a step lives at. */
export const setupPath = (step: SetupStep) => `/setup/${step}`;

export const isSetupStep = (value: string): value is SetupStep =>
  (SETUP_STEPS as readonly string[]).includes(value);

/** What the app has answered so far, as the browser knows it. */
export type Answered = { signedIn: boolean; platform: string; agent: string };

/**
 * That state, read from the browser: the session the SDK stored at sign-in, and
 * the platform and agent the providers put on `window.__ENV__` from the server's
 * answer. The three places that route on it — the providers, `/setup` and the
 * wizard's own guard — read it here so they cannot disagree.
 */
export const readAnswered = (): Answered => ({
  signedIn: hasNonExpiredAuthToken(),
  platform: resolveAppTenant(),
  agent: config.defaultAgentId(),
});

/**
 * The step the app is on: the first thing still unanswered. `connect` is never
 * it — that screen is only reached from `access`, and only for a paid answer on
 * a platform with no Stripe source yet.
 */
export function currentSetupStep(a: Answered): SetupStep {
  if (!a.signedIn) return "start";
  if (!a.platform) return "platform";
  if (!a.agent) return "agent";
  return "access";
}

/**
 * Whether {step} still applies. Only `start` expires, at sign-in. The platform
 * step is "choose or change" — `currentSetupStep` stops sending anyone there
 * once one is stored, and the quiet link on the price step is the way back. The
 * rest stay reachable (the agent, the name and the price are all editable after
 * setup) but need a platform to ask anything about.
 */
export function stepApplies(step: SetupStep, a: Answered): boolean {
  if (step === "start") return !a.signedIn;
  if (step === "platform") return true;
  return !!a.platform;
}

/**
 * The steps the progress row counts: the ones from the first unanswered to the
 * end, so a first run reads 1..4 of 4 (start, platform, agent, access) and an
 * admin reopening the price question alone reads 1 of 1.
 *
 * {step} is in the list even when it is answered — that is how the agent step
 * counts when it is reopened from the quiet link, and how `connect` counts
 * before the Stripe source is known.
 */
export function stepSequence(
  step: SetupStep,
  a: Answered & { needsConnect: boolean },
): SetupStep[] {
  const steps: SetupStep[] = [];
  // Signing in and choosing a platform are one stretch: the visitor who sees
  // Start has all four ahead of them, and the count must not shrink when they
  // come back signed in.
  if (!a.platform) steps.push("start", "platform");
  if (!a.agent || step === "agent") steps.push("agent");
  steps.push("access");
  if (a.needsConnect || step === "connect") steps.push("connect");
  return steps;
}

/** {totalSteps, currentStep} for the SDK's OnboardingShell. */
export function stepProgress(
  step: SetupStep,
  a: Answered & { needsConnect: boolean },
): { totalSteps: number; currentStep: number } {
  const steps = stepSequence(step, a);
  return { totalSteps: steps.length, currentStep: Math.max(steps.indexOf(step), 0) + 1 };
}
