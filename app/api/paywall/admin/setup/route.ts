import { NextRequest, NextResponse } from "next/server";
// Relative imports (not @/): __tests__ invoke this handler under vitest.
import config from "../../../../../lib/iblai/config";
import {
  ACCESS_VALUES,
  PAYWALL_APP_SLUG,
  PaywallUpstreamError,
  dmConnectFetchAs,
  dmJson,
  dmStripeFetchAs,
  invalidateAppPaymentInfo,
  planName,
  readAppPaymentInfo,
  writeAppPaymentInfo,
  type Access,
  type AppPaymentInfo,
  type DmInit,
} from "../../../../../lib/paywall";
import {
  adminCaller,
  failure,
  isResponse,
  jsonBody,
  openSelfJoin,
} from "../../../../../lib/paywall-admin";

/**
 * The whole paywall setup in one call: free, one-time or monthly (USD).
 * Every platform call carries the admin's OWN token, so the DM decides who may
 * do this (403 otherwise). Paid order: ask the platform which Stripe source it
 * runs on (a connected account, or a pasted key; none, or one without a
 * publishable key → 400, nothing touched) → retire the previous price (a 404
 * is nothing to retire: after a reconnect it lives on another account) → make
 * sure there is a product tagged for this
 * app → create the price → record the choice, with that source's publishable
 * key and account, in the platform metadata. Free makes ZERO Stripe or
 * connect calls, ever — it only records the choice — because free must never
 * need a Stripe account. Either way the platform's self-join switch is opened
 * (membership is free; the payment is checked at the send). A client
 * Idempotency-Key makes a retried submit safe.
 */
export async function POST(req: NextRequest) {
  const caller = await adminCaller(req);
  if (isResponse(caller)) return caller;
  const { access, amount } = await jsonBody(req);
  if (!ACCESS_VALUES.includes(access as Access))
    return NextResponse.json(
      { error: "access must be free, one_time or monthly" },
      { status: 400 },
    );
  const paid = access !== "free";
  if (paid && (!Number.isInteger(amount) || (amount as number) <= 0))
    return NextResponse.json(
      { error: "amount must be a positive integer (cents)" },
      { status: 400 },
    );

  const key = req.headers.get("idempotency-key");
  const idem = (suffix: string): Record<string, string> =>
    key ? { "Idempotency-Key": `${key}-${suffix}` } : {};
  const stripe = (path: string, init?: DmInit) =>
    dmStripeFetchAs(caller.token, caller.username, path, init).then(dmJson);

  try {
    invalidateAppPaymentInfo();
    const { info: current, platformName } = await readAppPaymentInfo();
    // The platform's Stripe source right now: what the product and price are
    // created on, and whose publishable key and account the record carries.
    const source = paid
      ? await dmJson(await dmConnectFetchAs(caller.token, caller.username))
      : null;
    if (paid && !source?.source)
      return NextResponse.json({ error: "Connect a Stripe account first" }, { status: 400 });
    // Embedded checkout renders with the source's publishable key: recording a
    // paid plan without one would let every member's checkout fail instead.
    if (paid && !source.publishable_key)
      return NextResponse.json(
        {
          error:
            source.source === "key"
              ? "Add the publishable key (pk_…) to the platform’s Stripe credential in the OS, then save again."
              : "The platform’s backend has no publishable key for connected accounts yet; contact ibl.ai support.",
        },
        { status: 400 },
      );
    let productId = current?.stripe.product_id ?? null;
    let priceId: string | null = null;

    if (paid) {
      // 1. The previous price stops being sellable. Paid only: archiving needs
      //    the platform's Stripe source, which free must never require. A price left
      //    behind by a paid → free switch stays active on Stripe but is never
      //    sold — the app sells only the recorded price_id (null for free).
      if (current?.stripe.price_id) {
        try {
          await stripe(`/prices/${encodeURIComponent(current.stripe.price_id)}/`, {
            method: "POST",
            headers: idem("archive"),
            body: JSON.stringify({ active: false }),
          });
        } catch (e) {
          // Gone (another Stripe account after a reconnect, or deleted):
          // nothing to retire. Anything else is real.
          if (!(e instanceof PaywallUpstreamError && e.status === 404)) throw e;
        }
      }
      // 2. The product: reuse ours while it is still active and tagged, else create
      //    (named after the app — what the Stripe Checkout page shows — else the platform).
      if (productId) {
        let product: any = null;
        try {
          product = await stripe(`/products/${encodeURIComponent(productId)}/`);
        } catch (e) {
          if (!(e instanceof PaywallUpstreamError && e.status === 404)) throw e;
        }
        if (product?.active === false || product?.metadata?.app !== PAYWALL_APP_SLUG)
          productId = null;
      }
      if (!productId) {
        const product = await stripe("/products/", {
          method: "POST",
          headers: idem("product"),
          body: JSON.stringify({
            name: config.appName() || platformName || PAYWALL_APP_SLUG,
            metadata: { app: PAYWALL_APP_SLUG },
          }),
        });
        productId = String(product.id);
      }
      // 3. The price. USD only; monthly is a subscription.
      const price = await stripe("/prices/", {
        method: "POST",
        headers: idem("price"),
        body: JSON.stringify({
          product: productId,
          unit_amount: amount,
          currency: "usd",
          nickname: planName(access as Access),
          ...(access === "monthly" && { recurring: { interval: "month" } }),
        }),
      });
      priceId = String(price.id);
    }

    // 4. Anyone who signs in is a member; payment is checked when they send.
    //    Written on every save, so a platform set up before that rule opens too.
    await openSelfJoin(caller.token);

    // 5. Record the choice (nulls included: the DM merges and cannot delete
    //    keys) and brand the login screens with the app's name and price.
    const info: AppPaymentInfo = {
      version: 1,
      access: access as Access,
      amount: paid ? (amount as number) : null,
      currency: paid ? "usd" : null,
      stripe: {
        product_id: productId,
        price_id: priceId,
        publishable_key: (paid && source.publishable_key) || null,
        stripe_account: (paid && source.stripe_account) || null,
      },
      updated_at: new Date().toISOString(),
      updated_by: caller.username,
    };
    await writeAppPaymentInfo(caller.token, info, platformName);
    return NextResponse.json({ info });
  } catch (e) {
    return failure(e);
  }
}
