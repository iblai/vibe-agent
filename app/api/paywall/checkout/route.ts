import { NextRequest, NextResponse } from "next/server";
// Relative import (not @/): __tests__ invoke this handler under vitest, which
// resolves no path alias.
import {
  PAYWALL_APP_SLUG,
  PaywallUpstreamError,
  allowedPriceIds,
  apiKeyProblem,
  appBaseUrl,
  createCheckout,
  ensureUser,
  userFromRequest,
} from "../../../../lib/paywall";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Start a Checkout Session; paying makes the buyer a member. Signed in: the
 * caller's own account. Not signed in: an account is made for the email (the
 * ledger needs the username on the session), one Stripe page and no sign-up.
 */
export async function POST(req: NextRequest) {
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  const keyProblem = apiKeyProblem();
  if (keyProblem) return NextResponse.json({ error: keyProblem }, { status: 500 });
  const { price_id, email } = await req.json().catch(() => ({}) as any);
  const address = String(email ?? "")
    .trim()
    .toLowerCase();
  try {
    // PAYWALL_PRICE_IDS if set, else the price the admin chose at /setup: only
    // a price this app sells goes on the wire.
    if (!price_id || !(await allowedPriceIds()).includes(price_id))
      return NextResponse.json({ error: "Unknown price_id" }, { status: 400 });
    let buyer = await userFromRequest(req);
    if (!buyer) {
      if (!EMAIL.test(address))
        return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
      buyer = await ensureUser(address);
    }
    return NextResponse.json(await createCheckout(buyer, price_id, appBaseUrl(req)));
  } catch (e) {
    // DM statuses are actionable (no credential, a rejected key, Stripe down): pass through.
    if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
    throw e;
  }
}
