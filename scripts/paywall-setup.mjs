#!/usr/bin/env node
// scripts/paywall-setup.mjs — the paywall setup, from the terminal: free,
// one-time or monthly (USD). Run by the Get and run procedure in AGENTS.md (or
// by any platform admin) with the platform API token from .env.local; nothing
// in the app changes the choice. Node built-ins only.
//
//   node scripts/paywall-setup.mjs free
//   node scripts/paywall-setup.mjs one_time 49       # USD
//   node scripts/paywall-setup.mjs monthly 29.99
//   STRIPE_KEY=rk_… node scripts/paywall-setup.mjs monthly 29.99   # saves the key first
//
// Paid: retire the recorded price → reuse the product tagged for this app or
// create it → create the price → close self-join (payment is the only way in)
// → record the choice in the platform's public metadata (apps.<slug>). Free
// makes ZERO Stripe calls — it must never need a Stripe key — opens self-join
// and records the choice. Every platform call carries the platform API token
// and the DM decides: 403 = the token is another platform's; 400 "No Stripe
// credential configured" = no key on file yet: run again with STRIPE_KEY=rk_…
// in front and the key is saved first, as the platform's `stripe` integration
// credential, through the DM's own endpoint — never a file, never the OS.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ACCESS_VALUES = ["free", "one_time", "monthly"];

/**
 * KEY=value lines; surrounding quotes stripped; comments and blanks skipped.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return env;
}

/** A DM/Stripe refusal, passed through verbatim (status + body). */
export class SetupError extends Error {
  /**
   * @param {number} status
   * @param {unknown} body
   */
  constructor(status, body) {
    super(`DM responded ${status}`);
    this.name = "SetupError";
    this.status = status;
    this.body = body;
  }
}

/** @typedef {{ method?: string, headers?: Record<string, string>, body?: string }} Init */

/** @param {string} access */
const planName = (access) => (access === "monthly" ? "Monthly access" : "One-time access");

/** @param {any} x */
const isPaymentInfo = (x) =>
  !!x && typeof x === "object" && ACCESS_VALUES.includes(x.access) && typeof x.stripe === "object";

/**
 * The whole setup, in the order the platform needs. `amount` is integer cents
 * (null for free). Resolves to the recorded choice; the first refusal throws a
 * SetupError, so nothing after it runs and nothing is recorded.
 * @param {{
 *   dmUrl: string, platform: string, token: string, slug: string, appName?: string,
 *   access: string, amount?: number | null, stripeKey?: string,
 * }} args
 * @param {typeof fetch} [fetchImpl]
 */
export async function setupPaywall(
  { dmUrl, platform, token, slug, appName = "", access, amount = null, stripeKey = "" },
  fetchImpl = fetch,
) {
  if (!ACCESS_VALUES.includes(access)) throw new Error("access must be free, one_time or monthly");
  const paid = access !== "free";
  if (paid && (!Number.isInteger(amount) || Number(amount) <= 0))
    throw new Error("amount must be a positive integer (cents)");

  const auth = { Authorization: `Api-Token ${token}`, "Content-Type": "application/json" };
  /** @param {string} url @param {Init} [init] */
  const call = async (url, init = {}) => {
    const res = await fetchImpl(url, { ...init, headers: { ...auth, ...init.headers } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new SetupError(res.status, body ?? { error: `DM responded ${res.status}` });
    return body;
  };
  const run = randomUUID();
  /** @param {string} suffix */
  const idem = (suffix) => ({ "Idempotency-Key": `${run}-${suffix}` });

  // 1. The token's owner: the Stripe proxy runs on a member's path.
  const username = String((await call(`${dmUrl}/api/core/token/verify/`))?.username ?? "");
  if (!username) throw new SetupError(502, { error: "token/verify named no user for the token" });
  const proxy =
    `${dmUrl}/api/ai-mentor/orgs/${platform}/users/${encodeURIComponent(username)}` +
    "/providers/stripe/payments";
  /** @param {string} path @param {Init} [init] */
  const stripe = (path, init) => call(`${proxy}${path}`, init);

  // 2. The Stripe key, when given: the platform's `stripe` integration
  //    credential, through the DM's own endpoint (409 = exists → PATCH). The
  //    proxy below reads it from there; it is written nowhere else.
  if (stripeKey) {
    const credentialUrl = `${dmUrl}/api/ai-account/orgs/${platform}/integration-credential/`;
    const body = JSON.stringify({ name: "stripe", value: { key: stripeKey }, platform });
    try {
      await call(credentialUrl, { method: "POST", body });
    } catch (e) {
      if (!(e instanceof SetupError && e.status === 409)) throw e;
      await call(credentialUrl, { method: "PATCH", body });
    }
  }

  // 3. The current choice (a public read) and the platform's name.
  const metadataUrl = `${dmUrl}/api/core/orgs/${platform}/metadata/`;
  const meta = await call(metadataUrl);
  const raw = meta?.metadata?.apps?.[slug];
  const current = isPaymentInfo(raw) ? raw : null;
  const platformName = String(meta?.platform_name ?? "");

  let productId = current?.stripe?.product_id ?? null;
  let priceId = null;
  if (paid) {
    // 4. The previous price stops being sellable. Paid only: archiving needs
    //    the platform's Stripe key, which free must never require. A price left
    //    behind by a paid → free switch stays active on Stripe but is never
    //    sold — the app sells only the recorded price_id (null for free).
    if (current?.stripe?.price_id)
      await stripe(`/prices/${encodeURIComponent(current.stripe.price_id)}/`, {
        method: "POST",
        headers: idem("archive"),
        body: JSON.stringify({ active: false }),
      });
    // The product: reuse ours while it is still active and tagged, else create.
    if (productId) {
      let product = null;
      try {
        product = await stripe(`/products/${encodeURIComponent(productId)}/`);
      } catch (e) {
        if (!(e instanceof SetupError && e.status === 404)) throw e;
      }
      if (product?.active === false || product?.metadata?.app !== slug) productId = null;
    }
    if (!productId) {
      const product = await stripe("/products/", {
        method: "POST",
        headers: idem("product"),
        body: JSON.stringify({ name: appName || platformName || slug, metadata: { app: slug } }),
      });
      productId = String(product.id);
    }
    // The price. USD only; monthly is a subscription.
    const price = await stripe("/prices/", {
      method: "POST",
      headers: idem("price"),
      body: JSON.stringify({
        product: productId,
        unit_amount: amount,
        currency: "usd",
        nickname: planName(access),
        ...(access === "monthly" && { recurring: { interval: "month" } }),
      }),
    });
    priceId = String(price.id);
  }

  // 5. Who may join by signing in: everyone when free, nobody when paid.
  await call(`${dmUrl}/api/core/users/platforms/config/`, {
    method: "POST",
    body: JSON.stringify({ platform_key: platform, allow_self_linking: !paid }),
  });

  // 6. Record the choice (nulls included: the DM merges and cannot delete keys).
  const info = {
    version: 1,
    access,
    amount: paid ? amount : null,
    currency: paid ? "usd" : null,
    stripe: { product_id: productId, price_id: priceId },
    updated_at: new Date().toISOString(),
    updated_by: username,
  };
  await call(metadataUrl, {
    method: "PUT",
    body: JSON.stringify({ metadata: { apps: { [slug]: info } } }),
  });
  return info;
}

/**
 * The one line a failure prints. The "no Stripe key" case names the fix,
 * because that line is what the Get and run procedure acts on.
 * @param {unknown} e
 */
export function failureLine(e) {
  if (e instanceof SetupError) {
    if (e.status === 400 && /credential/i.test(JSON.stringify(e.body)))
      return (
        "paywall setup failed: no Stripe key on the platform yet — run again with STRIPE_KEY=rk_… in front " +
        "(a restricted key from the creator's Stripe account); it is saved on the platform, never in a file"
      );
    return `paywall setup failed: ${e.status} ${JSON.stringify(e.body).slice(0, 300)}`;
  }
  return `paywall setup failed: ${e instanceof Error ? e.message : String(e)}`;
}

/** @param {string | undefined} v */
const placeholder = (v) => !v || v.startsWith("your-");

/** @param {string[]} argv */
function main(argv) {
  const [access, usd] = argv;
  if (!ACCESS_VALUES.includes(access) || (access === "free") !== (usd === undefined)) {
    console.error(
      "usage: [STRIPE_KEY=rk_…] node scripts/paywall-setup.mjs free | one_time <usd> | monthly <usd>",
    );
    process.exit(2);
  }
  const amount = access === "free" ? null : Math.round(Number(usd) * 100);
  if (amount !== null && !(amount > 0)) {
    console.error("the amount is a positive USD number, e.g. 29.99");
    process.exit(2);
  }
  let env;
  try {
    env = parseEnvFile(readFileSync(".env.local", "utf8"));
  } catch {
    console.error("no .env.local here: run from the app's directory (copy .env.example first)");
    process.exit(2);
  }
  const platform = env.NEXT_PUBLIC_MAIN_TENANT_KEY;
  const token = env.IBLAI_API_KEY;
  const slug = env.PAYWALL_APP_SLUG;
  for (const [name, value] of [
    ["NEXT_PUBLIC_MAIN_TENANT_KEY", platform],
    ["IBLAI_API_KEY", token],
    ["PAYWALL_APP_SLUG", slug],
  ])
    if (placeholder(value)) {
      console.error(`${name} is missing or a placeholder in .env.local`);
      process.exit(2);
    }
  // Hosted iblai.app by default; a self-hosted consolidated API sets the base.
  const base = (env.NEXT_PUBLIC_API_BASE_URL || "https://api.iblai.app").replace(/\/+$/, "");
  setupPaywall(
    {
      dmUrl: `${base}/dm`,
      platform,
      token,
      slug,
      appName: env.NEXT_PUBLIC_APP_NAME,
      access,
      amount,
      // The one secret that passes through here: from the environment only,
      // never argv (process lists) and never a file.
      stripeKey: process.env.STRIPE_KEY ?? "",
    },
    fetch,
  ).then(
    (info) => {
      const saved = process.env.STRIPE_KEY ? " · stripe key saved" : "";
      if (info.access === "free") {
        console.log(`paywall: free · self-join open${saved}`);
        return;
      }
      const price = `$${(Number(info.amount) / 100).toFixed(2)}${info.access === "monthly" ? "/month" : " once"}`;
      console.log(`paywall: ${price} · price ${info.stripe.price_id} · self-join closed${saved}`);
    },
    (e) => {
      console.error(failureLine(e));
      process.exit(1);
    },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2));
