import { describe, it, expect } from "vitest";

import {
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

  it("is never connect: that screen is reached from access, for a paid answer", () => {
    for (const state of [fresh, signedIn, withPlatform, configured])
      expect(currentSetupStep(state)).not.toBe("connect");
  });
});

describe("stepApplies", () => {
  it("expires start at sign-in, and only start", () => {
    expect(stepApplies("start", fresh)).toBe(true);
    expect(stepApplies("start", signedIn)).toBe(false);
  });

  it("keeps the platform step open once one is stored: that visit is a change", () => {
    expect(stepApplies("platform", signedIn)).toBe(true);
    expect(stepApplies("platform", withPlatform)).toBe(true);
    // Nobody is sent there by the ladder, though — the quiet link is the way in.
    expect(currentSetupStep(withPlatform)).not.toBe("platform");
  });

  it("keeps the agent, the price and Stripe reachable, but only with a platform", () => {
    for (const step of ["agent", "access", "connect"] as const) {
      expect(stepApplies(step, configured)).toBe(true);
      expect(stepApplies(step, signedIn)).toBe(false);
    }
  });
});

describe("stepSequence", () => {
  const counts = (state: typeof fresh & { needsConnect?: boolean }) =>
    (["start", "platform", "agent", "access"] as const).map((step) =>
      stepProgress(step, { needsConnect: false, ...state }),
    );

  it("counts a first run as four, and does not shrink at sign-in", () => {
    // The lie this replaces: the Start screen said 1 of 4 and the platform step
    // then said 1 of 3.
    expect(counts(fresh)[0]).toEqual({ totalSteps: 4, currentStep: 1 });
    expect(counts(signedIn)[1]).toEqual({ totalSteps: 4, currentStep: 2 });
    expect(counts(signedIn)[2]).toEqual({ totalSteps: 4, currentStep: 3 });
    expect(counts(signedIn)[3]).toEqual({ totalSteps: 4, currentStep: 4 });
  });

  it("adds Stripe as a fifth when a paid answer has no source yet", () => {
    const paid = { ...signedIn, needsConnect: true };
    expect(stepProgress("access", paid)).toEqual({ totalSteps: 5, currentStep: 4 });
    expect(stepProgress("connect", paid)).toEqual({ totalSteps: 5, currentStep: 5 });
  });

  it("counts the connect screen when it is the one being shown", () => {
    // Reached before the platform's Stripe source is known.
    expect(stepProgress("connect", { ...configured, needsConnect: false })).toEqual({
      totalSteps: 2,
      currentStep: 2,
    });
  });

  it("is one step for an admin reopening the price question", () => {
    expect(stepProgress("access", { ...configured, needsConnect: false })).toEqual({
      totalSteps: 1,
      currentStep: 1,
    });
  });

  it("is two when they reopen the agent from the quiet link", () => {
    expect(stepSequence("agent", { ...configured, needsConnect: false })).toEqual([
      "agent",
      "access",
    ]);
    expect(stepProgress("agent", { ...configured, needsConnect: false })).toEqual({
      totalSteps: 2,
      currentStep: 1,
    });
  });
});

describe("setupPath", () => {
  it("is the route the step lives at, and only the five are steps", () => {
    expect(setupPath("access")).toBe("/setup/access");
    expect(isSetupStep("access")).toBe(true);
    expect(isSetupStep("question")).toBe(false);
  });
});
