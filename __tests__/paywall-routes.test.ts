import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The /api/paywall route handlers are the only holders of the org-wide
 * Api-Token and the only writers of the tenant's paywall choice, so their
 * contracts are load-bearing: auth-first 401s, a LOUD 500 when
 * PAYWALL_APP_SLUG is missing (misconfiguration must fail visibly the moment
 * a route is used, never silently grant), "nothing for sale means everyone
 * in", the sellable-price allowlist (PAYWALL_PRICE_IDS, else the chosen
 * price), Stripe's literal {CHECKOUT_SESSION_ID} placeholder, verbatim DM
 * passthrough (DM 4xx bodies are actionable), and — on the setup route — the
 * admin's OWN token going to the DM, the Stripe objects created in order, and
 * the choice recorded only after the DM said yes.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "IBLAI_API_KEY",
  "PAYWALL_APP_SLUG",
  "PAYWALL_PRICE_IDS",
] as const;

const saved: Record<string, string | undefined> = {};

// The handlers (and lib/paywall.ts they import) capture process.env and keep
// caches at module scope — arrange env first, then import a fresh instance.
const loadAccess = async () => await import("../app/api/paywall/access/route");
const loadCheckout = async () => await import("../app/api/paywall/checkout/route");
const loadPrices = async () => await import("../app/api/paywall/prices/route");
const loadSetup = async () => await import("../app/api/paywall/admin/setup/route");

const META_URL = "https://api.example.edu/dm/api/core/orgs/testorg/metadata/";
const PROXY =
  "https://api.example.edu/dm/api/ai-mentor/orgs/testorg/users/jane/providers/stripe/payments";

let dmCalls: { url: string; init?: RequestInit }[] = [];
let metaWrites: { headers: Record<string, string>; body: any }[] = [];

const monthly = (over: Record<string, unknown> = {}) => ({
  version: 1,
  access: "monthly",
  amount: 2900,
  currency: "usd",
  stripe: { product_id: "prod_1", price_id: "price_1" },
  updated_at: "2026-09-04T00:00:00.000Z",
  updated_by: "jane",
  ...over,
});

/**
 * fetch stub: token/verify answers identity; the tenant metadata URL answers
 * with `apps` (and records PUTs); everything else is "the DM" (Stripe proxy).
 * Every stub starts a fresh call log — tests re-stub mid-test.
 */
const stubFetch = ({
  member = true,
  apps = {} as Record<string, unknown>,
  dm = () => Response.json({}),
}: {
  member?: boolean;
  apps?: Record<string, unknown>;
  dm?: (url: string, init?: RequestInit) => Response;
} = {}) => {
  dmCalls = [];
  metaWrites = [];
  return vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/api/core/token/verify/"))
        return member
          ? Response.json({ username: "jane", email: "jane@x.io" })
          : new Response("invalid token", { status: 401 });
      if (url === META_URL) {
        if (init?.method === "PUT") {
          metaWrites.push({
            headers: init.headers as Record<string, string>,
            body: JSON.parse(init.body as string),
          });
          return Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: {} });
        }
        return Response.json({
          platform_key: "testorg",
          platform_name: "Acme",
          metadata: { apps },
        });
      }
      dmCalls.push({ url, init });
      return dm(url, init);
    }),
  );
};

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
  process.env.IBLAI_API_KEY = "platform-key";
  process.env.PAYWALL_APP_SLUG = "demo-app";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const authed = { Authorization: "Token dm-abc" };
const sentHeaders = (i: number) => dmCalls[i].init?.headers as Record<string, string>;
const sentBody = (i: number) => JSON.parse(dmCalls[i].init?.body as string);

describe("POST /api/paywall/checkout", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/paywall/checkout", {
      method: "POST",
      headers,
      body,
    });

  it("401s without a platform member token", async () => {
    stubFetch();
    const { POST } = await loadCheckout();
    const res = await POST(post(JSON.stringify({ price_id: "price_a" })));
    expect(res.status).toBe(401);
    expect(dmCalls).toHaveLength(0);
  });

  it("400s a price_id outside PAYWALL_PRICE_IDS without calling the DM", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a,price_b";
    stubFetch();
    const { POST } = await loadCheckout();
    const res = await POST(post(JSON.stringify({ price_id: "price_evil" }), authed));
    expect(res.status).toBe(400);
    expect(dmCalls).toHaveLength(0);
  });

  it("sells only the chosen price when PAYWALL_PRICE_IDS is unset, and nothing when free", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: () => Response.json({ checkout_url: "https://checkout.stripe.com/c/pay/cs_9" }),
    });
    const { POST } = await loadCheckout();
    expect((await POST(post(JSON.stringify({ price_id: "price_a" }), authed))).status).toBe(400);
    expect(dmCalls).toHaveLength(0);
    expect((await POST(post(JSON.stringify({ price_id: "price_1" }), authed))).status).toBe(200);
    expect(sentBody(0).price_id).toBe("price_1");

    vi.resetModules();
    stubFetch({
      apps: {
        "demo-app": monthly({ access: "free", stripe: { product_id: "prod_1", price_id: null } }),
      },
    });
    const fresh = await loadCheckout();
    expect((await fresh.POST(post(JSON.stringify({ price_id: "price_1" }), authed))).status).toBe(
      400,
    );
    expect(dmCalls).toHaveLength(0);
  });

  it("400s an unparseable body instead of crashing", async () => {
    stubFetch();
    const { POST } = await loadCheckout();
    const res = await POST(post("not json", authed));
    expect(res.status).toBe(400);
  });

  it("mints the session via the DM with origin-derived URLs and returns checkout_url", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a,price_b";
    stubFetch({
      dm: () => Response.json({ checkout_url: "https://checkout.stripe.com/c/pay/cs_123" }),
    });
    const { POST } = await loadCheckout();

    const res = await POST(
      post(JSON.stringify({ price_id: "price_a" }), {
        ...authed,
        origin: "https://demo.vercel.app",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      checkout_url: "https://checkout.stripe.com/c/pay/cs_123",
    });

    expect(dmCalls).toHaveLength(1);
    expect(dmCalls[0].url).toBe(`${PROXY}/paywall/checkout/`);
    expect(dmCalls[0].init?.method).toBe("POST");
    expect(sentBody(0)).toEqual({
      price_id: "price_a",
      app: "demo-app",
      // Literal Stripe placeholder — Stripe substitutes it, the app never does.
      success_url: "https://demo.vercel.app/paywall/return?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://demo.vercel.app/paywall",
    });
  });
});

describe("GET /api/paywall/access", () => {
  const get = (qs = "", headers: Record<string, string> = {}) =>
    new NextRequest(`http://localhost:3000/api/paywall/access${qs}`, { headers });

  it("401s when token/verify rejects the token (non-member)", async () => {
    stubFetch({ member: false });
    const { GET } = await loadAccess();
    const res = await GET(get("", authed));
    expect(res.status).toBe(401);
    expect(dmCalls).toHaveLength(0);
  });

  it("500s loudly when PAYWALL_APP_SLUG is unset — unconfigured routes fail visibly when used", async () => {
    delete process.env.PAYWALL_APP_SLUG;
    stubFetch();
    const { GET } = await loadAccess();
    const res = await GET(get("", authed));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "PAYWALL_APP_SLUG not set" });
    expect(dmCalls).toHaveLength(0);
  });

  it("grants without asking the DM while there is nothing for sale (undecided or free)", async () => {
    stubFetch();
    const { GET } = await loadAccess();
    expect(await (await GET(get("", authed))).json()).toEqual({ has_access: true, paywall: false });
    expect(dmCalls).toHaveLength(0);

    vi.resetModules();
    stubFetch({
      apps: {
        "demo-app": monthly({ access: "free", stripe: { product_id: "prod_1", price_id: null } }),
      },
    });
    const fresh = await loadAccess();
    expect(await (await fresh.GET(get("", authed))).json()).toEqual({
      has_access: true,
      paywall: false,
    });
    expect(dmCalls).toHaveLength(0);
  });

  it("passes the DM's JSON and status through verbatim once something is for sale, forwarding session_id", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: () => Response.json({ has_access: true, source: "recorded" }),
    });
    const { GET } = await loadAccess();

    const res = await GET(get("?session_id=cs_42", authed));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ has_access: true, source: "recorded" });
    expect(dmCalls).toHaveLength(1);
    expect(dmCalls[0].url).toBe(`${PROXY}/paywall/access/?app=demo-app&session_id=cs_42`);
  });

  it("passes non-200 DM statuses through too", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({ dm: () => Response.json({ detail: "Not found." }, { status: 404 }) });
    const { GET } = await loadAccess();
    const res = await GET(get("", authed));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not found." });
  });
});

describe("GET /api/paywall/prices", () => {
  const get = (headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/paywall/prices", { headers });

  it("401s without a member token and 500s without PAYWALL_APP_SLUG", async () => {
    stubFetch();
    const { GET } = await loadPrices();
    expect((await GET(get())).status).toBe(401);
    delete process.env.PAYWALL_APP_SLUG;
    vi.resetModules();
    const fresh = await loadPrices();
    expect((await fresh.GET(get(authed))).status).toBe(500);
  });

  it("reports the choice: undecided, free, or the one plan", async () => {
    stubFetch();
    const { GET } = await loadPrices();
    expect(await (await GET(get(authed))).json()).toEqual({
      app: "demo-app",
      paywall: false,
      decided: false,
      source: "none",
      prices: [],
      settings: null,
    });

    vi.resetModules();
    stubFetch({ apps: { "demo-app": monthly() } });
    const fresh = await loadPrices();
    expect(await (await fresh.GET(get(authed))).json()).toMatchObject({
      paywall: true,
      decided: true,
      source: "metadata",
      prices: [{ id: "price_1", name: "Monthly access", unitAmount: 2900, interval: "month" }],
      settings: { access: "monthly", amount: 2900 },
    });
  });

  it("passes the DM's refusal through when env ids need a Stripe lookup", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({
      dm: () => Response.json({ error: "No Stripe credential configured" }, { status: 400 }),
    });
    const { GET } = await loadPrices();
    const res = await GET(get(authed));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No Stripe credential configured" });
  });
});

describe("POST /api/paywall/admin/setup", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/paywall/admin/setup", {
      method: "POST",
      headers: { ...authed, ...headers },
      body: JSON.stringify(body),
    });
  /** A DM that answers Stripe calls by path; unknown paths are a test bug. */
  const stripeDm =
    (answers: Record<string, (init?: RequestInit) => unknown>) =>
    (url: string, init?: RequestInit) => {
      const path = url.slice(PROXY.length);
      const key = `${init?.method ?? "GET"} ${path}`;
      if (!(key in answers)) throw new Error(`unexpected DM call ${key}`);
      return Response.json(answers[key](init));
    };

  it("401s without a member token and validates before any platform call", async () => {
    stubFetch();
    const { POST } = await loadSetup();
    expect((await POST(post({ access: "free" }, { Authorization: "" }))).status).toBe(401);
    for (const bad of [
      { access: "weekly" },
      { access: "monthly" },
      { access: "one_time", amount: 0 },
      { access: "monthly", amount: 29.5 },
    ]) {
      expect((await POST(post(bad))).status).toBe(400);
    }
    expect(dmCalls).toHaveLength(0);
    expect(metaWrites).toHaveLength(0);
  });

  it("free: retires the previous price and records the choice with the admin's token", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: stripeDm({ "POST /prices/price_1/": () => ({ id: "price_1", active: false }) }),
    });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "free" }, { "Idempotency-Key": "k" }));
    expect(res.status).toBe(200);
    expect(sentBody(0)).toEqual({ active: false });
    expect(sentHeaders(0).Authorization).toBe("Token dm-abc");
    expect(sentHeaders(0)["Idempotency-Key"]).toBe("k-archive");
    expect(metaWrites).toHaveLength(1);
    expect(metaWrites[0].headers.Authorization).toBe("Token dm-abc");
    expect(metaWrites[0].body).toEqual({
      metadata: {
        apps: {
          "demo-app": {
            version: 1,
            access: "free",
            amount: null,
            currency: null,
            stripe: { product_id: "prod_1", price_id: null },
            updated_at: expect.any(String),
            updated_by: "jane",
          },
        },
      },
    });
    expect((await res.json()).info.access).toBe("free");
  });

  it("monthly, first time: creates the product (named after the platform, tagged) and a recurring USD price", async () => {
    stubFetch({
      dm: stripeDm({
        "POST /products/": () => ({ id: "prod_new", name: "Acme" }),
        "POST /prices/": () => ({ id: "price_new" }),
      }),
    });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "monthly", amount: 2900 }, { "Idempotency-Key": "k" }));
    expect(res.status).toBe(200);
    expect(dmCalls.map((c) => c.url.slice(PROXY.length))).toEqual(["/products/", "/prices/"]);
    expect(sentBody(0)).toEqual({ name: "Acme", metadata: { app: "demo-app" } });
    expect(sentHeaders(0)["Idempotency-Key"]).toBe("k-product");
    expect(sentBody(1)).toEqual({
      product: "prod_new",
      unit_amount: 2900,
      currency: "usd",
      nickname: "Monthly access",
      recurring: { interval: "month" },
    });
    expect(sentHeaders(1)["Idempotency-Key"]).toBe("k-price");
    expect(metaWrites[0].body.metadata.apps["demo-app"]).toMatchObject({
      access: "monthly",
      amount: 2900,
      currency: "usd",
      stripe: { product_id: "prod_new", price_id: "price_new" },
    });
  });

  it("one-time, changing plan: archives the old price, reuses the still-tagged product, no recurring", async () => {
    stubFetch({
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
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "one_time", amount: 4900 }));
    expect(res.status).toBe(200);
    expect(dmCalls.map((c) => `${c.init?.method ?? "GET"} ${c.url.slice(PROXY.length)}`)).toEqual([
      "POST /prices/price_1/",
      "GET /products/prod_1/",
      "POST /prices/",
    ]);
    expect(sentBody(2)).toEqual({
      product: "prod_1",
      unit_amount: 4900,
      currency: "usd",
      nickname: "One-time access",
    });
    expect(metaWrites[0].body.metadata.apps["demo-app"]).toMatchObject({
      access: "one_time",
      amount: 4900,
      stripe: { product_id: "prod_1", price_id: "price_2" },
    });
  });

  it("replaces a product that is gone or no longer tagged", async () => {
    stubFetch({
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
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "monthly", amount: 100 }));
    expect(res.status).toBe(200);
    expect(metaWrites[0].body.metadata.apps["demo-app"].stripe).toEqual({
      product_id: "prod_new",
      price_id: "price_new",
    });
  });

  it("passes the DM's 403 through (not an admin) and records nothing", async () => {
    stubFetch({ dm: () => Response.json({ error: "Permission denied" }, { status: 403 }) });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "monthly", amount: 2900 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Permission denied" });
    expect(metaWrites).toHaveLength(0);
  });
});
