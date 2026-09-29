import { describe, it, expect } from "vitest";

import {
  beingConfigured,
  currentSetupStep,
  isSetupStep,
  setupPath,
  stepApplies,
  stepProgress,
  stepSequence,
} from "../lib/setup-steps";

/**
 * The wizard's order, which is now the URL. These tests pin: which step the app
 * is on for every combination of answers; the two steps that expire, so a stale
 * link sends the visitor on rather than showing a question that cannot be
 * answered; and the progress row, which must not shrink between signing in and
 * choosing a platform.
 */

const fresh = { signedIn: false, platform: "", agent: "" };
const signedIn = { ...fresh, signedIn: true };
const withPlatform = { ...signedIn, platform: "acme" };
const configured = { ...withPlatform, agent: "uuid-1" };

describe("currentSetupStep", () => {
  it("walks down the ladder as each answer lands", () => {
    expect(currentSetupStep(fresh)).toBe("start");
    expect(currentSetupStep(signedIn)).toBe("platform");
    expect(currentSetupStep(withPlatform)).toBe("agent");
    expect(currentSetupStep(configured)).toBe("access");
  });

  it("ends at access: connecting Stripe is that step's own button, not a step", () => {
    expect(currentSetupStep(configured)).toBe("access");
    expect(isSetupStep("connect")).toBe(false);
  });
});

describe("stepApplies", () => {
  it("expires start at sign-in, and only start", () => {
    expect(stepApplies("start", fresh)).toBe(true);
    expect(stepApplies("start", signedIn)).toBe(false);
  });

  it("expires the platform step once one is stored: the platform is answered once", () => {
    expect(stepApplies("platform", signedIn)).toBe(true);
    expect(stepApplies("platform", withPlatform)).toBe(false);
    expect(currentSetupStep(withPlatform)).not.toBe("platform");
  });

  it("keeps the agent and the price reachable, but only with a platform", () => {
    for (const step of ["agent", "access"] as const) {
      expect(stepApplies(step, configured)).toBe(true);
      expect(stepApplies(step, signedIn)).toBe(false);
    }
  });

  it("offers no step but start without a session: every other one saves on the admin's token", () => {
    // Otherwise a signed-out visitor who types /setup/access is handed a
    // question whose Save can only ever answer 401.
    const signedOutOnAClaimedApp = { ...configured, signedIn: false };
    for (const step of ["platform", "agent", "access"] as const)
      expect(stepApplies(step, signedOutOnAClaimedApp)).toBe(false);
    expect(stepApplies("start", signedOutOnAClaimedApp)).toBe(true);
    expect(currentSetupStep(signedOutOnAClaimedApp)).toBe("start");
  });
});

describe("beingConfigured", () => {
  const signedOut = (over: Partial<typeof configured> = {}) => ({
    ...configured,
    signedIn: false,
    ...over,
  });

  it("holds a signed-out visitor while any question is unanswered", () => {
    expect(beingConfigured(signedOut({ agent: "" }), false)).toBe(true);
    expect(beingConfigured(signedOut({ agent: "" }), true)).toBe(true);
    // Agent chosen, price question still open.
    expect(beingConfigured(signedOut(), false)).toBe(true);
  });

  it("lets them through once the whole wizard is answered", () => {
    expect(beingConfigured(signedOut(), true)).toBe(false);
  });

  it("never holds anyone with a session: the admin is mid-wizard, a member belongs here", () => {
    expect(beingConfigured({ ...configured, agent: "" }, false)).toBe(false);
    expect(beingConfigured(configured, false)).toBe(false);
  });

  it("leaves a fresh clone to the wizard: unclaimed is not being configured", () => {
    expect(beingConfigured(fresh, false)).toBe(false);
    expect(beingConfigured(signedOut({ platform: "", agent: "" }), false)).toBe(false);
  });
});

describe("stepSequence", () => {
  const counts = (state: typeof fresh) =>
    (["start", "platform", "agent", "access"] as const).map((step) => stepProgress(step, state));

  it("counts a first run as four, and does not shrink at sign-in", () => {
    // The lie this replaces: the Start screen said 1 of 4 and the platform step
    // then said 1 of 3.
    expect(counts(fresh)[0]).toEqual({ totalSteps: 4, currentStep: 1 });
    expect(counts(signedIn)[1]).toEqual({ totalSteps: 4, currentStep: 2 });
    expect(counts(signedIn)[2]).toEqual({ totalSteps: 4, currentStep: 3 });
    expect(counts(signedIn)[3]).toEqual({ totalSteps: 4, currentStep: 4 });
  });

  it("never adds a fifth: a paid answer with no Stripe source connects from the access step", () => {
    expect(stepProgress("access", signedIn)).toEqual({ totalSteps: 4, currentStep: 4 });
    expect(stepSequence("access", configured)).toEqual(["access"]);
  });

  it("is one step for an admin reopening the price question", () => {
    expect(stepProgress("access", configured)).toEqual({
      totalSteps: 1,
      currentStep: 1,
    });
  });

  it("is two when they reopen the agent from the quiet link", () => {
    expect(stepSequence("agent", configured)).toEqual(["agent", "access"]);
    expect(stepProgress("agent", configured)).toEqual({
      totalSteps: 2,
      currentStep: 1,
    });
  });
});

describe("setupPath", () => {
  it("is the route the step lives at, and only the four are steps", () => {
    expect(setupPath("access")).toBe("/setup/access");
    expect(isSetupStep("access")).toBe(true);
    expect(isSetupStep("question")).toBe(false);
  });
});
