// lib/paywall-admin.ts — shared plumbing for the admin routes
// (app/api/paywall/admin/*). Server-only. Relative imports for vitest.
import { NextResponse } from "next/server";
import { appSlug, PaywallUpstreamError, callerFromRequest, openSelfJoinWith } from "./paywall";

export type AdminCaller = { token: string; username: string };

/** The caller's token and username, or the response that says why not. */
export async function adminCaller(req: Request): Promise<AdminCaller | NextResponse> {
  const caller = await callerFromRequest(req);
  if (!caller) return NextResponse.json({ error: "Not a platform member" }, { status: 401 });
  // The slug has a code default, so this fires only when someone has set
  // NEXT_PUBLIC_PAYWALL_APP_SLUG to an empty value — getEnv coalesces with
  // `??`, so an empty string beats the default. That is a real
  // misconfiguration and still fails loudly; a missing env file is not one.
  if (!appSlug())
    return NextResponse.json({ error: "NEXT_PUBLIC_PAYWALL_APP_SLUG not set" }, { status: 500 });
  return { token: caller.token, username: caller.user.username };
}

export const isResponse = (x: unknown): x is NextResponse => x instanceof NextResponse;

/**
 * DM statuses pass through verbatim (403 = not a platform admin, 400 = no
 * Stripe source yet or a bad return URL, 409 = already connected, 502 =
 * Stripe rejected the platform's credential, 503 = Connect not available on
 * this platform's backend yet). Anything else is a real bug: rethrow.
 */
export function failure(e: unknown): NextResponse {
  if (e instanceof PaywallUpstreamError) return NextResponse.json(e.body, { status: e.status });
  throw e;
}

/**
 * Who may join by signing in: everyone, always — membership is free here, and
 * a payment is checked when a member sends. The admin's own token; the DM
 * decides who may flip the switch.
 */
export const openSelfJoin = (token: string) => openSelfJoinWith(`Token ${token}`);

/** Parse a JSON body; garbage is an empty object, so field checks 400 instead of crashing. */
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
