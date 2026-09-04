// lib/paywall-admin.ts — shared plumbing for the admin setup route
// (app/api/paywall/admin/setup). Server-only. Relative imports for vitest.
import { NextResponse } from "next/server";
import { PAYWALL_APP_SLUG, PaywallUpstreamError, callerFromRequest } from "./paywall";

export type AdminCaller = { token: string; username: string };

/** The caller's token and username, or the response that says why not. */
export async function adminCaller(req: Request): Promise<AdminCaller | NextResponse> {
  const caller = await callerFromRequest(req);
  if (!caller) return NextResponse.json({ error: "Not a platform member" }, { status: 401 });
  if (!PAYWALL_APP_SLUG)
    return NextResponse.json({ error: "PAYWALL_APP_SLUG not set" }, { status: 500 });
  return { token: caller.token, username: caller.user.username };
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

/**
 * DM statuses pass through verbatim (403 = not a tenant admin, 400 = no
 * `stripe` credential, 502 = Stripe rejected the key). Anything else is a
 * real bug: rethrow.
 */
export function failure(e: unknown): NextResponse {
  if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
  throw e;
}

/** Parse a JSON body; garbage is an empty object, so field checks 400 instead of crashing. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
