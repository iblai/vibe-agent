import { describe, it, expect } from "vitest";
import { parseEnvFile, setupPaywall, SetupError } from "../scripts/paywall-setup.mjs";

/**
 * scripts/paywall-setup.mjs is the only writer of the platform's paywall
 * choice, so its contract is load-bearing: validation before any platform
 * call, the platform API token on every call, the Stripe objects created in
 * order and tagged for this app, free making ZERO Stripe calls, the self-join
 * switch following the answer, and the choice recorded only after the DM said
 * yes — a refusal anywhere records nothing.
 */

const DM = "https://api.example.edu/dm";
const VERIFY_URL = `${DM}/api/core/token/verify/`;
const META_URL = `${DM}/api/core/orgs/testorg/metadata/`;
const CONFIG_URL = `${DM}/api/core/users/platforms/config/`;
// The Stripe proxy runs on the key owner's path.
const PROXY = `${DM}/api/ai-mentor/orgs/testorg/users/owner/providers/stripe/payments`;

const args = {
  dmUrl: DM,
  platform: "testorg",
  token: "platform-key",
  slug: "demo-app",
  appName: "Caveman Coach",
};

const monthly = (over: Record<string, unknown> = {}) => ({
  version: 1,
  access: "monthly",
  amount: 2900,
  currency: "usd",
  stripe: { product_id: "prod_1", price_id: "price_1" },
  updated_at: "2026-09-04T00:00:00.000Z",
  updated_by: "owner",
  ...over,
});

type Call = { url: string; init?: RequestInit };
const headersOf = (c: Call) => (c.init?.headers ?? {}) as Record<string, string>;
const bodyOf = (c: Call) => JSON.parse(c.init?.body as string);

/**
 * A DM stub: token/verify names the key's owner; the metadata URL answers with
 * `apps` and records PUTs; the self-join URL records writes; everything else is
 * the Stripe proxy, answered by `dm` (default: "unexpected", a test bug).
 */
function stubDm({
  apps = {},
  dm = (url) => {
    throw new Error(`unexpected DM call ${url}`);
  },
  selfJoin = () => Response.json({ platform_key: "testorg" }),
}: {
  apps?: Record<string, unknown>;
  dm?: (url: string, init?: RequestInit) => Response;
  selfJoin?: () => Response;
} = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (url === VERIFY_URL)
      return Response.json({ user_id: 1, username: "owner", email: "owner@x.io" });
    if (url === META_URL)
      return init?.method === "PUT"
        ? Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: {} })
        : Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: { apps } });
    if (url === CONFIG_URL) return selfJoin();
    return dm(url, init);
  }) as typeof fetch;
  return {
    fetchImpl,
    calls,
    stripe: () => calls.filter((c) => c.url.startsWith(PROXY)),
    stripePaths: () =>
      calls
        .filter((c) => c.url.startsWith(PROXY))
        .map((c) => `${c.init?.method ?? "GET"} ${c.url.slice(PROXY.length)}`),
    configWrites: () => calls.filter((c) => c.url === CONFIG_URL),
    metaWrites: () => calls.filter((c) => c.url === META_URL && c.init?.method === "PUT"),
  };
}

/** Stripe-proxy answers by "METHOD path"; an unknown call is a test bug. */
const stripeDm =
  (answers: Record<string, (init?: RequestInit) => unknown>) =>
  (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.slice(PROXY.length)}`;
    if (!(key in answers)) throw new Error(`unexpected DM call ${key}`);
    const answer = answers[key](init);
    return answer instanceof Response ? answer : Response.json(answer);
  };

describe("parseEnvFile", () => {
  it("reads KEY=value lines, strips quotes, skips comments and blanks", () => {
    expect(
      parseEnvFile(
        "# a comment\nA=1\nB=\"two words\"\nC='three'\n\nD=\r\n  E = spaced \nnot a line\n",
      ),
    ).toEqual({ A: "1", B: "two words", C: "three", D: "", E: "spaced" });
  });
});

describe("setupPaywall", () => {
  it("validates before any platform call", async () => {
    const s = stubDm();
    for (const bad of [
      { access: "weekly" },
      { access: "monthly" },
      { access: "one_time", amount: 0 },
      { access: "monthly", amount: 29.5 },
    ]) {
      await expect(setupPaywall({ ...args, ...bad }, s.fetchImpl)).rejects.toThrow(
        /access must be|amount must be/,
      );
    }
    expect(s.calls).toHaveLength(0);
  });

  it("free: opens self-join and records the choice without any Stripe call, even after a paid plan", async () => {
    // Any proxy call throws: free must never need the platform's Stripe key.
    const s = stubDm({ apps: { "demo-app": monthly() } });
    const info = await setupPaywall({ ...args, access: "free" }, s.fetchImpl);
    expect(s.stripe()).toHaveLength(0);
    expect(s.configWrites().map(bodyOf)).toEqual([
      { platform_key: "testorg", allow_self_linking: true },
    ]);
    expect(s.metaWrites()).toHaveLength(1);
    expect(bodyOf(s.metaWrites()[0])).toEqual({
      metadata: {
        apps: {
          "demo-app": {
            version: 1,
            access: "free",
            amount: null,
            currency: null,
            // The tagged product is kept for a later paid answer.
            stripe: { product_id: "prod_1", price_id: null },
            updated_at: expect.any(String),
            updated_by: "owner",
          },
        },
      },
    });
    expect(info.access).toBe("free");
    // The platform API token on every call, the key owner on the path.
    for (const c of s.calls) expect(headersOf(c).Authorization).toBe("Api-Token platform-key");
  });

  it("monthly, first time: creates the product (named after the app, tagged) and a recurring USD price, then closes self-join", async () => {
    const s = stubDm({
      dm: stripeDm({
        "POST /products/": () => ({ id: "prod_new", name: "Caveman Coach" }),
        "POST /prices/": () => ({ id: "price_new" }),
      }),
    });
    const info = await setupPaywall({ ...args, access: "monthly", amount: 2900 }, s.fetchImpl);
    expect(s.stripePaths()).toEqual(["POST /products/", "POST /prices/"]);
    const [product, price] = s.stripe();
    expect(bodyOf(product)).toEqual({ name: "Caveman Coach", metadata: { app: "demo-app" } });
    expect(headersOf(product)["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}-product$/);
    expect(bodyOf(price)).toEqual({
      product: "prod_new",
      unit_amount: 2900,
      currency: "usd",
      nickname: "Monthly access",
      recurring: { interval: "month" },
    });
    expect(headersOf(price)["Idempotency-Key"]).toMatch(/-price$/);
    expect(s.configWrites().map(bodyOf)).toEqual([
      { platform_key: "testorg", allow_self_linking: false },
    ]);
    expect(bodyOf(s.metaWrites()[0]).metadata.apps["demo-app"]).toMatchObject({
      access: "monthly",
      amount: 2900,
      currency: "usd",
      stripe: { product_id: "prod_new", price_id: "price_new" },
      updated_by: "owner",
    });
    expect(info.stripe).toEqual({ product_id: "prod_new", price_id: "price_new" });
    for (const c of s.calls) expect(headersOf(c).Authorization).toBe("Api-Token platform-key");
  });

  it("names the product after the platform when the app has no name", async () => {
    const s = stubDm({
      dm: stripeDm({
        "POST /products/": () => ({ id: "prod_new" }),
        "POST /prices/": () => ({ id: "price_new" }),
      }),
    });
    await setupPaywall({ ...args, appName: "", access: "one_time", amount: 100 }, s.fetchImpl);
    expect(bodyOf(s.stripe()[0]).name).toBe("Acme");
  });

  it("one-time, changing plan: archives the old price, reuses the still-tagged product, no recurring", async () => {
    const s = stubDm({
      apps: { "demo-app": monthly() },
      dm: stripeDm({
        "POST /prices/price_1/": () => ({ id: "price_1", active: false }),
        "GET /products/prod_1/": () => ({
          id: "prod_1",
          active: true,
          metadata: { app: "demo-app" },
        }),
        "POST /prices/": () => ({ id: "price_2" }),
      }),
    });
    await setupPaywall({ ...args, access: "one_time", amount: 4900 }, s.fetchImpl);
    expect(s.stripePaths()).toEqual([
      "POST /prices/price_1/",
      "GET /products/prod_1/",
      "POST /prices/",
    ]);
    expect(bodyOf(s.stripe()[0])).toEqual({ active: false });
    expect(headersOf(s.stripe()[0])["Idempotency-Key"]).toMatch(/-archive$/);
    expect(bodyOf(s.stripe()[2])).toEqual({
      product: "prod_1",
      unit_amount: 4900,
      currency: "usd",
      nickname: "One-time access",
    });
    expect(bodyOf(s.metaWrites()[0]).metadata.apps["demo-app"]).toMatchObject({
      access: "one_time",
      amount: 4900,
      stripe: { product_id: "prod_1", price_id: "price_2" },
    });
  });

  it("replaces a product that is gone or no longer tagged", async () => {
    const s = stubDm({
      apps: { "demo-app": monthly({ stripe: { product_id: "prod_old", price_id: null } }) },
      dm: (url, init) =>
        url.endsWith("/products/prod_old/")
          ? Response.json({ detail: "Not found." }, { status: 404 })
          : Response.json(
              init?.method === "POST" && url.endsWith("/products/")
                ? { id: "prod_new" }
                : { id: "price_new" },
            ),
    });
    await setupPaywall({ ...args, access: "monthly", amount: 100 }, s.fetchImpl);
    expect(bodyOf(s.metaWrites()[0]).metadata.apps["demo-app"].stripe).toEqual({
      product_id: "prod_new",
      price_id: "price_new",
    });
  });

  it("passes the DM's 403 through (another platform's token) and records nothing", async () => {
    const s = stubDm({ dm: () => Response.json({ error: "Permission denied" }, { status: 403 }) });
    const err = await setupPaywall({ ...args, access: "monthly", amount: 2900 }, s.fetchImpl).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SetupError);
    expect(err).toMatchObject({ status: 403, body: { error: "Permission denied" } });
    expect(s.configWrites()).toHaveLength(0);
    expect(s.metaWrites()).toHaveLength(0);
  });

  it("records nothing when the self-join switch is refused", async () => {
    const s = stubDm({
      selfJoin: () => Response.json({ error: "Permission denied" }, { status: 403 }),
    });
    await expect(setupPaywall({ ...args, access: "free" }, s.fetchImpl)).rejects.toMatchObject({
      status: 403,
    });
    expect(s.metaWrites()).toHaveLength(0);
  });
});
