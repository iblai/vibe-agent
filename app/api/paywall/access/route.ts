import { NextRequest, NextResponse } from "next/server";
// Relative import (not @/): __tests__ invoke this handler under vitest, which
// resolves no path alias.
import {
  PAYWALL_APP_SLUG,
  PaywallUpstreamError,
  allowedPriceIds,
  apiKeyProblem,
  endMembership,
  isRecordedPayer,
  liveAccess,
  userFromRequest,
  verifyAndJoin,
} from "../../../../lib/paywall";

/**
 * With `session_id`: the buyer is back from Stripe — verify the session and
 * make them a member. Without: a member's standing — a recorded payer whose
 * payment no longer grants loses the membership; everyone else (invited
 * members, admins, one-time payers) is in.
 */
export async function GET(req: NextRequest) {
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  const keyProblem = apiKeyProblem();
  if (keyProblem) return NextResponse.json({ error: keyProblem }, { status: 500 });
  const user = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("session_id");
  try {
    if (sessionId) return NextResponse.json({ joined: await verifyAndJoin(user, sessionId) });
    // Nothing for sale (free, or not decided yet): nothing can lapse.
    if ((await allowedPriceIds()).length === 0)
      return NextResponse.json({ has_access: true, paywall: false });
    if (!(await isRecordedPayer(user.username)))
      return NextResponse.json({ has_access: true, payer: false });
    const access = await liveAccess(user.username);
    if (!access.has_access) await endMembership(user.userId);
    return NextResponse.json({ ...access, payer: true });
  } catch (e) {
    if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
    throw e;
  }
}
