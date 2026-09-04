import { NextRequest, NextResponse } from "next/server";
// Relative imports (not @/): __tests__ invoke this handler under vitest.
import {
  ACCESS_VALUES,
  PAYWALL_APP_SLUG,
  PaywallUpstreamError,
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
import { adminCaller, failure, isResponse, jsonBody } from "../../../../../lib/paywall-admin";

/**
 * The whole paywall setup in one call: free, one-time or monthly (USD).
 * Every platform call carries the admin's OWN token, so the DM decides who may
 * do this (403 otherwise). Order: retire the previous price → make sure there
 * is a product tagged for this app → create the price → record the choice in
 * the tenant metadata. A client Idempotency-Key makes a retried submit safe.
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
    let productId = current?.stripe.product_id ?? null;
    let priceId: string | null = null;

    // 1. The previous price stops being sellable, whatever comes next.
    if (current?.stripe.price_id)
      await stripe(`/prices/${encodeURIComponent(current.stripe.price_id)}/`, {
        method: "POST",
        headers: idem("archive"),
        body: JSON.stringify({ active: false }),
      });

    if (paid) {
      // 2. The product: reuse ours while it is still active and tagged, else create.
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
            name: platformName || PAYWALL_APP_SLUG,
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

    // 4. Record the choice (nulls included: the DM merges and cannot delete keys).
    const info: AppPaymentInfo = {
      version: 1,
      access: access as Access,
      amount: paid ? (amount as number) : null,
      currency: paid ? "usd" : null,
      stripe: { product_id: productId, price_id: priceId },
      updated_at: new Date().toISOString(),
      updated_by: caller.username,
    };
    await writeAppPaymentInfo(caller.token, info);
    return NextResponse.json({ info });
  } catch (e) {
    return failure(e);
  }
}
