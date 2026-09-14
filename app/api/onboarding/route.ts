// app/api/onboarding/route.ts — what the setup wizard writes.
//
// GET answers what the app is configured as, so the browser can tell when a
// write has landed. POST takes one or more of {platform, agent, name} with the
// caller's own DM token: the platform goes to the identity file, once, and the
// agent and the name to the platform's metadata.
//
// There is no admin check here. `openSelfJoinWith` is admin-only on the
// platform and answers 403 to anyone else, so a 2xx from it IS the proof —
// which is also why it runs before anything is written. It is a write used as
// a probe: it opens self-join at platform-pick time, before the price question
// is answered. That matches how this app already works — membership is free
// and payment is the entitlement, checked when a member sends.
//
// Relative imports (not @/): __tests__ load this handler under vitest, which
// resolves no path alias.
import { NextResponse } from "next/server";

import { adminCaller, failure, isResponse, jsonBody } from "../../../lib/paywall-admin";
import {
  invalidateAppPaymentInfo,
  openSelfJoinWith,
  resolveSetup,
  writeAppConfig,
} from "../../../lib/paywall";
import { hosted, platformKey, writeSetup } from "../../../lib/onboarding";
import { mintDeployToken, type DeployToken } from "../../../lib/deploy-token";
import { isRealPlatform } from "../../../lib/iblai/tenant";

/** A trimmed string field, or "" when absent. Length-capped: this ends up in public metadata. */
const field = (body: Record<string, unknown>, key: string): string =>
  typeof body[key] === "string" ? body[key].trim().slice(0, 200) : "";

export async function GET() {
  return NextResponse.json(await resolveSetup());
}

export async function POST(req: Request) {
  const caller = await adminCaller(req);
  if (isResponse(caller)) return caller;

  const body = await jsonBody(req);
  const platform = field(body, "platform");
  const agent = field(body, "agent");
  const name = field(body, "name");
  const stored = platformKey();

  // The platform is answered once. Sending the stored one again is a no-op;
  // any other is refused before the platform is even asked.
  if (platform && stored && platform !== stored)
    return NextResponse.json(
      { error: "This app’s platform is set and cannot be changed." },
      { status: 409 },
    );
  const target = platform || stored;
  if (!target) return NextResponse.json({ error: "Choose a platform first" }, { status: 400 });
  if (!isRealPlatform(target))
    return NextResponse.json(
      { error: "“main” is ibl.ai’s shared platform, not yours: choose or create your own." },
      { status: 400 },
    );

  try {
    // Admin-only on the platform: this both opens self-join and proves the
    // caller may configure `target`. Nothing is written until it succeeds.
    await openSelfJoinWith(`Token ${caller.token}`, target);
  } catch (e) {
    return failure(e);
  }

  let deployToken: DeployToken | undefined;
  if (platform && !stored) {
    let slug: string;
    try {
      ({ slug } = writeSetup(target, caller.username));
      // The metadata cache is not keyed by platform: a read made before the
      // answer would stand for this platform for up to a minute.
      invalidateAppPaymentInfo();
    } catch (e) {
      // A published app has no file of its own; say so instead of pretending
      // the answer was kept. Anything else names its reason. A read-only
      // filesystem means the same thing and has to read the same way: Vercel
      // exposes VERCEL_ENV only where the project enables system env vars, so
      // its absence cannot be trusted to mean "local".
      const readOnly = ["EROFS", "EACCES"].includes((e as NodeJS.ErrnoException).code ?? "");
      const why = hosted() || readOnly ? "publish it through ibl.ai hosting" : (e as Error).message;
      return NextResponse.json({ error: `Could not save the platform: ${why}.` }, { status: 500 });
    }
    // The deploy token, so publishing asks for nothing. The key stays in
    // iblai.env: only how it went comes back.
    deployToken = await mintDeployToken(caller.token, target, slug, caller.username);
  }

  if (agent || name) {
    try {
      await writeAppConfig(caller.token, { ...(agent && { agent }), ...(name && { name }) });
    } catch (e) {
      return failure(e);
    }
  }

  return NextResponse.json({ ...(await resolveSetup()), ...(deployToken && { deployToken }) });
}
