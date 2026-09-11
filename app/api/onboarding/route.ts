// app/api/onboarding/route.ts — what the setup wizard writes.
//
// GET answers what the app is configured as, so the browser can tell when a
// write has landed. POST takes one or more of {platform, agent, name} with the
// caller's own DM token: the platform goes to the local database, the agent and
// the name to the platform's metadata.
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
  readAppPaymentInfo,
  releaseApp,
  resolveSetup,
  writeAppConfig,
} from "../../../lib/paywall";
import { makeSlug, platformKey, storedSlug, writeSetup } from "../../../lib/onboarding";
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

  // A platform in the body always wins: this is both the first answer and the
  // move to another one. The browser releases the old platform's copy itself,
  // with that platform's own token — this one's is no good there.
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

  if (platform && platform !== stored) {
    try {
      writeSetup({ platform: target }, caller.username);
      // The metadata cache is not keyed by platform, so the old platform's read
      // would answer for this one for up to a minute.
      invalidateAppPaymentInfo();
    } catch {
      // A deployed app's filesystem is read-only. Say so instead of pretending
      // the answer was kept.
      return NextResponse.json(
        {
          error: "This deployment cannot change its platform: set it up locally and publish again.",
        },
        { status: 500 },
      );
    }
  }

  if (agent || name) {
    try {
      // The app's own slug, minted from its name the first time it is set up and
      // never again: it keys apps.<slug> in the platform's metadata and tags the
      // Stripe product, so changing it later would orphan both. An app that was
      // set up before slugs were minted has none stored and keeps the shared
      // default, which is where its entry already is. The read is uncached: a
      // stale empty answer here would mint a slug for such an app and orphan
      // both its metadata entry and its Stripe product.
      if (name && !storedSlug() && !(await readAppPaymentInfo(true)).agent) {
        writeSetup({ slug: makeSlug(name) }, caller.username);
      }
      await writeAppConfig(caller.token, { ...(agent && { agent }), ...(name && { name }) });
    } catch (e) {
      return failure(e);
    }
  }

  return NextResponse.json(await resolveSetup());
}

/**
 * Take this app's data off the platform named in `?platform=` — the one it has
 * just left. The caller's token must be that platform's own, which is why the
 * browser keeps it before minting the new one: the DM refuses a token minted
 * elsewhere, and that refusal is also the admin check, so there is none here.
 *
 * Not the stored platform, on purpose: by the time this runs the app is already
 * on the new one.
 */
export async function DELETE(req: Request) {
  const caller = await adminCaller(req);
  if (isResponse(caller)) return caller;

  const platform = new URL(req.url).searchParams.get("platform")?.trim() ?? "";
  if (!platform)
    return NextResponse.json({ error: "Name the platform to release" }, { status: 400 });

  try {
    await releaseApp(caller.token, platform);
  } catch (e) {
    return failure(e);
  }
  return NextResponse.json({ released: platform });
}
