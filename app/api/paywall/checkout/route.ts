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
  userFromRequest,
} from "../../../../lib/paywall";

/** Start a Checkout Session for the signed-in buyer; paying makes them a member. */
export async function POST(req: NextRequest) {
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  const keyProblem = apiKeyProblem();
  if (keyProblem) return NextResponse.json({ error: keyProblem }, { status: 500 });
  const buyer = await userFromRequest(req);
  if (!buyer) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });

  const { price_id } = await req.json().catch(() => ({}) as any);
  try {
    // PAYWALL_PRICE_IDS if set, else the price the admin chose at /setup: only
    // a price this app sells goes on the wire.
    if (!price_id || !(await allowedPriceIds()).includes(price_id))
      return NextResponse.json({ error: "Unknown price_id" }, { status: 400 });
    return NextResponse.json(await createCheckout(buyer, price_id, appBaseUrl(req)));
  } catch (e) {
    // DM statuses are actionable (no credential, a rejected key, Stripe down): pass through.
    if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
    throw e;
  }
}
