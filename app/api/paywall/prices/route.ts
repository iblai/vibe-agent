import { NextRequest, NextResponse } from "next/server";
// Relative import (not @/): __tests__ invoke this handler under vitest, which
// resolves no path alias.
import {
  PAYWALL_APP_SLUG,
  PaywallUpstreamError,
  appBaseUrl,
  resolveCatalogue,
  signUpUrl,
} from "../../../../lib/paywall";

/** What this app sells (env override, else the platform's choice) and where a stranger signs up — public: the join page needs no sign-in. */
export async function GET(req: NextRequest) {
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  try {
    return NextResponse.json({
      app: PAYWALL_APP_SLUG,
      signUpUrl: signUpUrl(appBaseUrl(req)),
      ...(await resolveCatalogue()),
    });
  } catch (e) {
    // The metadata read or the env-override display lookup was refused
    // upstream (e.g. 400: no `stripe` credential yet) — actionable, pass it through.
    if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
    throw e;
  }
}
