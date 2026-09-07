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
  joinFromSession,
  liveAccess,
  provisionTokens,
  retrieveSession,
  sessionBuyer,
  userFromRequest,
  verifyAndJoin,
} from "../../../../lib/paywall";

/**
 * With `session_id`: the buyer is back from Stripe — verify the session and
 * make them a member; not signed in, the session's own metadata names them,
 * and tokens are minted for them when the platform allows it and the email
 * they typed on the join page (same browser) is the one that paid. Without: a member's standing — a recorded payer whose
 * payment no longer grants loses the membership; everyone else (invited
 * members, admins, one-time payers) is in.
 */
export async function GET(req: NextRequest) {
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  const keyProblem = apiKeyProblem();
  if (keyProblem) return NextResponse.json({ error: keyProblem }, { status: 500 });
  const user = await userFromRequest(req);
  const sessionId = req.nextUrl.searchParams.get("session_id");
  try {
    if (sessionId && !user) {
      const session = await retrieveSession(sessionId);
      if (!(await joinFromSession(session))) return NextResponse.json({ joined: false });
      const claimed = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
      const paid = String(session?.customer_details?.email ?? "").toLowerCase();
      const buyer = sessionBuyer(session);
      const tokens =
        buyer && claimed && claimed === paid
          ? await provisionTokens({ ...buyer, email: paid })
          : null;
      return NextResponse.json(tokens ? { joined: true, session: tokens } : { joined: true });
    }
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
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
