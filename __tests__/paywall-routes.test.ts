import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The /api/paywall route handlers are the only holders of the org-wide
 * Api-Token, the only writers of the platform's paywall choice and the only
 * callers of the platform's link API, so their contracts are load-bearing:
 * sign-in-first 401s, a LOUD 500 when PAYWALL_APP_SLUG or IBLAI_API_KEY is
 * missing or still a placeholder (misconfiguration must fail visibly the
 * moment a route is used, never silently grant), the sellable-price allowlist
 * (PAYWALL_PRICE_IDS, else the chosen price), the checkout minted on the
 * platform's account in the DM's own shape (a Customer and a session both
 * named after the buyer, on the key owner's path), the return verified before
 * anyone is linked (never someone else's session), a recorded payer's lapse
 * ending the membership, verbatim DM passthrough (DM 4xx bodies are
 * actionable), and — on the setup route — the admin's OWN token going to the
 * DM, the Stripe objects created in order, the self-join switch following the
 * answer, and the choice recorded only after the DM said yes.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "IBLAI_API_KEY",
  "PAYWALL_APP_SLUG",
  "PAYWALL_PRICE_IDS",
  "NEXT_PUBLIC_AUTH_URL",
  "IBLAI_APP_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};

// The handlers (and lib/paywall.ts they import) capture process.env and keep
// caches at module scope — arrange env first, then import a fresh instance.
const loadAccess = async () => await import("../app/api/paywall/access/route");
const loadCheckout = async () => await import("../app/api/paywall/checkout/route");
const loadPrices = async () => await import("../app/api/paywall/prices/route");
const loadSetup = async () => await import("../app/api/paywall/admin/setup/route");

const DM = "https://api.example.edu/dm";
const META_URL = `${DM}/api/core/orgs/testorg/metadata/`;
const LINK_URL = `${DM}/api/core/users/platforms/`;
const CONFIG_URL = `${DM}/api/core/users/platforms/config/`;
const proxyFor = (username: string) =>
  `${DM}/api/ai-mentor/orgs/testorg/users/${username}/providers/stripe/payments`;
// Calls the app makes AS the platform run on the Api-Token owner's path; the
// ledger calls about the buyer run on the buyer's own.
const PROXY = proxyFor("owner");
const BUYER_PROXY = proxyFor("jane");

let dmCalls: { url: string; init?: RequestInit }[] = [];
let metaWrites: { headers: Record<string, string>; body: any }[] = [];
let linkWrites: { headers: Record<string, string>; body: any }[] = [];
let configWrites: { headers: Record<string, string>; body: any }[] = [];

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
 * fetch stub: token/verify answers identity (the buyer's token names the
 * buyer, the org-wide key names its owner); the platform metadata URL answers
 * with `apps` (and records PUTs); the link and self-join URLs record writes;
 * everything else is "the DM" (Stripe proxy). Every stub starts a fresh call
 * log — tests re-stub mid-test.
 */
const stubFetch = ({
  member = true,
  apps = {} as Record<string, unknown>,
  dm = () => Response.json({}),
  selfJoin = () => Response.json({ platform_key: "testorg" }),
}: {
  member?: boolean;
  apps?: Record<string, unknown>;
  dm?: (url: string, init?: RequestInit) => Response;
  selfJoin?: () => Response;
} = {}) => {
  dmCalls = [];
  metaWrites = [];
  linkWrites = [];
  configWrites = [];
  return vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (url.includes("/api/core/token/verify/")) {
        if (headers.Authorization?.startsWith("Api-Token "))
          return Response.json({ user_id: 1, username: "owner", email: "owner@x.io" });
        return member
          ? Response.json({ user_id: 7, username: "jane", email: "jane@x.io" })
          : new Response("invalid token", { status: 401 });
      }
      if (url === META_URL) {
        if (init?.method === "PUT") {
          metaWrites.push({ headers, body: JSON.parse(init.body as string) });
          return Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: {} });
        }
        return Response.json({
          platform_key: "testorg",
          platform_name: "Acme",
          metadata: { apps },
        });
      }
      if (url === LINK_URL) {
        linkWrites.push({ headers, body: JSON.parse(init?.body as string) });
        return new Response(null, { status: 201 });
      }
      if (url === CONFIG_URL) {
        configWrites.push({ headers, body: JSON.parse(init?.body as string) });
        return selfJoin();
      }
      dmCalls.push({ url, init });
      return dm(url, init);
    }),
  );
};

/**
 * A DM that answers Stripe-proxy calls by "METHOD path" (path relative to the
 * owner's proxy; the buyer's own path is prefixed `jane:`); unknown calls are a
 * test bug.
 */
const stripeDm =
  (answers: Record<string, (init?: RequestInit) => unknown>) =>
  (url: string, init?: RequestInit) => {
    const path = url.startsWith(PROXY)
      ? url.slice(PROXY.length)
      : url.startsWith(BUYER_PROXY)
        ? `jane:${url.slice(BUYER_PROXY.length)}`
        : url;
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in answers)) throw new Error(`unexpected DM call ${key}`);
    const answer = answers[key](init);
    return answer instanceof Response ? answer : Response.json(answer);
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
const calledPaths = () =>
  dmCalls.map(
    (c) =>
      `${c.init?.method ?? "GET"} ${c.url.startsWith(PROXY) ? c.url.slice(PROXY.length) : `jane:${c.url.slice(BUYER_PROXY.length)}`}`,
  );
const sentHeaders = (i: number) => dmCalls[i].init?.headers as Record<string, string>;
const sentBody = (i: number) => JSON.parse(dmCalls[i].init?.body as string);
const customerSearch = `GET /customers/search/?${new URLSearchParams({
  query: "metadata['ibl_username']:'jane'",
  limit: "1",
})}`;

describe("POST /api/paywall/checkout", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/paywall/checkout", {
      method: "POST",
      headers,
      body,
    });

  it("401s without a sign-in", async () => {
    stubFetch();
    const { POST } = await loadCheckout();
    const res = await POST(post(JSON.stringify({ price_id: "price_a" })));
    expect(res.status).toBe(401);
    expect(dmCalls).toHaveLength(0);
  });

  it("500s loudly, naming IBLAI_API_KEY, while it is empty or the placeholder", async () => {
    for (const key of ["your-token", undefined]) {
      if (key === undefined) delete process.env.IBLAI_API_KEY;
      else process.env.IBLAI_API_KEY = key;
      vi.resetModules();
      stubFetch();
      const { POST } = await loadCheckout();
      const res = await POST(post(JSON.stringify({ price_id: "price_a" }), authed));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toContain("IBLAI_API_KEY");
      expect(dmCalls).toHaveLength(0);
    }
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
    stubFetch({ apps: { "demo-app": monthly() } });
    const { POST } = await loadCheckout();
    expect((await POST(post(JSON.stringify({ price_id: "price_a" }), authed))).status).toBe(400);
    expect(dmCalls).toHaveLength(0);

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

  it("mints the session on the platform's account in the DM's own shape, named after the buyer", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({
      dm: stripeDm({
        "GET /prices/price_a/?expand[]=product": () => ({
          id: "price_a",
          unit_amount: 2900,
          currency: "usd",
          recurring: { interval: "month" },
          product: { id: "prod_a", name: "Acme" },
        }),
        [customerSearch]: () => ({ data: [] }),
        "POST /customers/": () => ({ id: "cus_9" }),
        "POST /checkout-sessions/": () => ({
          id: "cs_123",
          url: "https://checkout.stripe.com/c/pay/cs_123",
        }),
      }),
    });
    const { POST } = await loadCheckout();

    const res = await POST(post(JSON.stringify({ price_id: "price_a" }), authed));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      checkout_url: "https://checkout.stripe.com/c/pay/cs_123",
      session_id: "cs_123",
    });
    expect(calledPaths()).toEqual([
      "GET /prices/price_a/?expand[]=product",
      customerSearch,
      "POST /customers/",
      "POST /checkout-sessions/",
    ]);
    // Every call as the platform: the org-wide key, on its owner's path.
    for (let i = 0; i < dmCalls.length; i++) {
      expect(sentHeaders(i).Authorization).toBe("Api-Token platform-key");
      expect(dmCalls[i].url.startsWith(PROXY)).toBe(true);
    }
    expect(sentBody(2)).toEqual({ email: "jane@x.io", metadata: { ibl_username: "jane" } });
    expect(sentBody(3)).toEqual({
      mode: "subscription",
      customer: "cus_9",
      line_items: [{ price: "price_a", quantity: 1 }],
      // Literal Stripe placeholder — Stripe substitutes it, the app never does.
      // On the origin the request arrived on (IBLAI_APP_BASE_URL unset).
      success_url: "http://localhost:3000/paywall/return?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "http://localhost:3000/paywall",
      metadata: { ibl_username: "jane", app: "demo-app" },
    });
  });

  it("reuses the buyer's Customer and sells a one-time plan in payment mode", async () => {
    stubFetch({
      apps: { "demo-app": monthly({ access: "one_time" }) },
      dm: stripeDm({
        [customerSearch]: () => ({ data: [{ id: "cus_1" }] }),
        "POST /checkout-sessions/": () => ({ id: "cs_1", url: "https://stripe.test/cs_1" }),
      }),
    });
    const { POST } = await loadCheckout();
    const res = await POST(post(JSON.stringify({ price_id: "price_1" }), authed));
    expect(res.status).toBe(200);
    expect(calledPaths()).toEqual([customerSearch, "POST /checkout-sessions/"]);
    expect(sentBody(1)).toMatchObject({ mode: "payment", customer: "cus_1" });
  });

  it("passes the DM's refusal through (no Stripe credential yet)", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: () => Response.json({ error: "No Stripe credential configured" }, { status: 400 }),
    });
    const { POST } = await loadCheckout();
    const res = await POST(post(JSON.stringify({ price_id: "price_1" }), authed));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No Stripe credential configured" });
  });
});

describe("GET /api/paywall/access?session_id= (back from Stripe)", () => {
  const get = (qs = "", headers: Record<string, string> = {}) =>
    new NextRequest(`http://localhost:3000/api/paywall/access${qs}`, { headers });
  const session = (over: Record<string, unknown> = {}) => ({
    id: "cs_42",
    status: "complete",
    mode: "payment",
    payment_status: "paid",
    metadata: { ibl_username: "jane", app: "demo-app" },
    ...over,
  });
  const retrieve = "GET /checkout-sessions/cs_42/?expand[]=subscription";
  const ledger = "GET jane:/paywall/access/?app=demo-app&session_id=cs_42";

  it("401s without a sign-in", async () => {
    stubFetch({ member: false });
    const { GET } = await loadAccess();
    const res = await GET(get("?session_id=cs_42", authed));
    expect(res.status).toBe(401);
    expect(dmCalls).toHaveLength(0);
    expect(linkWrites).toHaveLength(0);
  });

  it("verifies the session, links the buyer with the org-wide key, then records the payment", async () => {
    stubFetch({
      dm: stripeDm({ [retrieve]: () => session(), [ledger]: () => ({ has_access: true }) }),
    });
    const { GET } = await loadAccess();
    const res = await GET(get("?session_id=cs_42", authed));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ joined: true });
    expect(calledPaths()).toEqual([retrieve, ledger]);
    expect(linkWrites).toEqual([
      {
        headers: expect.objectContaining({ Authorization: "Api-Token platform-key" }),
        body: { user_id: 7, platform_key: "testorg", active: true },
      },
    ]);
  });

  it("refuses someone else's session and links nobody", async () => {
    stubFetch({
      dm: stripeDm({
        [retrieve]: () => session({ metadata: { ibl_username: "mallory", app: "demo-app" } }),
      }),
    });
    const { GET } = await loadAccess();
    const res = await GET(get("?session_id=cs_42", authed));
    expect(res.status).toBe(403);
    expect(linkWrites).toHaveLength(0);
    expect(calledPaths()).toEqual([retrieve]);
  });

  it("answers joined: false, linking nobody, while the session is not paid", async () => {
    stubFetch({ dm: stripeDm({ [retrieve]: () => session({ status: "open" }) }) });
    const { GET } = await loadAccess();
    expect(await (await GET(get("?session_id=cs_42", authed))).json()).toEqual({ joined: false });
    expect(linkWrites).toHaveLength(0);
  });

  it("joins on a live subscription, not on a canceled one", async () => {
    const sub = (status: string) =>
      session({ mode: "subscription", payment_status: "paid", subscription: { status } });
    stubFetch({
      dm: stripeDm({ [retrieve]: () => sub("trialing"), [ledger]: () => ({ has_access: true }) }),
    });
    const { GET } = await loadAccess();
    expect(await (await GET(get("?session_id=cs_42", authed))).json()).toEqual({ joined: true });
    expect(linkWrites).toHaveLength(1);

    vi.resetModules();
    stubFetch({ dm: stripeDm({ [retrieve]: () => sub("canceled") }) });
    const fresh = await loadAccess();
    expect(await (await fresh.GET(get("?session_id=cs_42", authed))).json()).toEqual({
      joined: false,
    });
    expect(linkWrites).toHaveLength(0);
  });

  it("joins even if the ledger update fails — bookkeeping never blocks the buyer", async () => {
    stubFetch({
      dm: stripeDm({
        [retrieve]: () => session(),
        [ledger]: () => Response.json({ detail: "Not found." }, { status: 404 }),
      }),
    });
    const { GET } = await loadAccess();
    expect(await (await GET(get("?session_id=cs_42", authed))).json()).toEqual({ joined: true });
    expect(linkWrites).toHaveLength(1);
  });
});

describe("GET /api/paywall/access (a member's standing)", () => {
  const get = (headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost:3000/api/paywall/access", { headers });
  const payments = "GET /paywall/payments/?app=demo-app&username=jane&limit=1";
  const live = "GET jane:/paywall/access/?app=demo-app";

  it("500s loudly when PAYWALL_APP_SLUG is unset — unconfigured routes fail visibly when used", async () => {
    delete process.env.PAYWALL_APP_SLUG;
    stubFetch();
    const { GET } = await loadAccess();
    const res = await GET(get(authed));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "PAYWALL_APP_SLUG not set" });
    expect(dmCalls).toHaveLength(0);
  });

  it("grants without asking the DM while there is nothing for sale (undecided or free)", async () => {
    stubFetch();
    const { GET } = await loadAccess();
    expect(await (await GET(get(authed))).json()).toEqual({ has_access: true, paywall: false });
    expect(dmCalls).toHaveLength(0);

    vi.resetModules();
    stubFetch({
      apps: {
        "demo-app": monthly({ access: "free", stripe: { product_id: "prod_1", price_id: null } }),
      },
    });
    const fresh = await loadAccess();
    expect(await (await fresh.GET(get(authed))).json()).toEqual({
      has_access: true,
      paywall: false,
    });
    expect(dmCalls).toHaveLength(0);
  });

  it("lets a member who never paid in without a live check (invited members, admins)", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: stripeDm({ [payments]: () => ({ count: 0, results: [] }) }),
    });
    const { GET } = await loadAccess();
    expect(await (await GET(get(authed))).json()).toEqual({ has_access: true, payer: false });
    expect(calledPaths()).toEqual([payments]);
    expect(linkWrites).toHaveLength(0);
  });

  it("checks a payer live and keeps the membership while the payment grants", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: stripeDm({
        [payments]: () => ({ count: 1, results: [{ status: "active" }] }),
        [live]: () => ({ has_access: true, mode: "subscription" }),
      }),
    });
    const { GET } = await loadAccess();
    expect(await (await GET(get(authed))).json()).toEqual({ has_access: true, payer: true });
    expect(calledPaths()).toEqual([payments, live]);
    expect(linkWrites).toHaveLength(0);
  });

  it("ends the membership when a payer's payment no longer grants", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      dm: stripeDm({
        [payments]: () => ({ count: 1, results: [{ status: "canceled" }] }),
        [live]: () => ({ has_access: false, mode: null }),
      }),
    });
    const { GET } = await loadAccess();
    expect(await (await GET(get(authed))).json()).toEqual({ has_access: false, payer: true });
    expect(linkWrites).toEqual([
      {
        headers: expect.objectContaining({ Authorization: "Api-Token platform-key" }),
        body: { user_id: 7, platform_key: "testorg", active: false },
      },
    ]);
  });

  it("passes non-200 DM statuses through too", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({ dm: () => Response.json({ detail: "Not found." }, { status: 404 }) });
    const { GET } = await loadAccess();
    const res = await GET(get(authed));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not found." });
  });
});

describe("GET /api/paywall/prices", () => {
  const pricesReq = () => new NextRequest("http://localhost:3000/api/paywall/prices");

  it("is public, and 500s without PAYWALL_APP_SLUG", async () => {
    stubFetch();
    const { GET } = await loadPrices();
    expect((await GET(pricesReq())).status).toBe(200);
    delete process.env.PAYWALL_APP_SLUG;
    vi.resetModules();
    const fresh = await loadPrices();
    expect((await fresh.GET(pricesReq())).status).toBe(500);
  });

  it("reports the choice: undecided, free, or the one plan, with the platform's name", async () => {
    stubFetch();
    const { GET } = await loadPrices();
    expect(await (await GET(pricesReq())).json()).toEqual({
      app: "demo-app",
      paywall: false,
      decided: false,
      source: "none",
      // The platform's $0 sign-up, returning through the Auth SPA to this origin.
      signUpUrl: expect.stringContaining(
        `/stripe/checkout/redirect/credits-free-plan/?redirect_url=${encodeURIComponent("https://login.iblai.app/login?app=custom&redirect-to=http://localhost:3000&tenant=testorg")}`,
      ),
      platformName: "Acme",
      prices: [],
      settings: null,
    });

    vi.resetModules();
    stubFetch({ apps: { "demo-app": monthly() } });
    const fresh = await loadPrices();
    expect(await (await fresh.GET(pricesReq())).json()).toMatchObject({
      paywall: true,
      decided: true,
      source: "metadata",
      platformName: "Acme",
      prices: [{ id: "price_1", name: "Monthly access", unitAmount: 2900, interval: "month" }],
      settings: { access: "monthly", amount: 2900 },
    });
  });

  it("describes env-listed prices from Stripe, on the key owner's path", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({
      dm: stripeDm({
        "GET /prices/price_a/?expand[]=product": () => ({
          id: "price_a",
          unit_amount: 4900,
          currency: "usd",
          product: { id: "prod_a", name: "Acme access" },
        }),
      }),
    });
    const { GET } = await loadPrices();
    expect(await (await GET(pricesReq())).json()).toMatchObject({
      source: "env",
      prices: [{ id: "price_a", name: "Acme access", unitAmount: 4900, interval: null }],
    });
    expect(sentHeaders(0).Authorization).toBe("Api-Token platform-key");
  });

  it("passes the DM's refusal through when env ids need a Stripe lookup", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_a";
    stubFetch({
      dm: () => Response.json({ error: "No Stripe credential configured" }, { status: 400 }),
    });
    const { GET } = await loadPrices();
    const res = await GET(pricesReq());
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
  /** The setup route runs on the admin's own path. */
  const adminDm = (answers: Record<string, (init?: RequestInit) => unknown>) =>
    stripeDm(
      Object.fromEntries(Object.entries(answers).map(([k, v]) => [k.replace(" /", " jane:/"), v])),
    );

  it("401s without a sign-in and validates before any platform call", async () => {
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
    expect(configWrites).toHaveLength(0);
    expect(metaWrites).toHaveLength(0);
  });

  it("free: opens self-join and records the choice without any Stripe call, even after a paid plan", async () => {
    stubFetch({
      apps: { "demo-app": monthly() },
      // Any proxy call throws: free must never need the platform's Stripe key.
      dm: adminDm({}),
    });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "free" }, { "Idempotency-Key": "k" }));
    expect(res.status).toBe(200);
    expect(dmCalls).toHaveLength(0);
    expect(configWrites).toEqual([
      {
        headers: expect.objectContaining({ Authorization: "Token dm-abc" }),
        body: { platform_key: "testorg", allow_self_linking: true },
      },
    ]);
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
            // The tagged product is kept for a later paid answer.
            stripe: { product_id: "prod_1", price_id: null },
            updated_at: expect.any(String),
            updated_by: "jane",
          },
        },
      },
    });
    expect((await res.json()).info.access).toBe("free");
  });

  it("monthly, first time: creates the product (named after the platform, tagged) and a recurring USD price, then closes self-join", async () => {
    stubFetch({
      dm: adminDm({
        "POST /products/": () => ({ id: "prod_new", name: "Acme" }),
        "POST /prices/": () => ({ id: "price_new" }),
      }),
    });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "monthly", amount: 2900 }, { "Idempotency-Key": "k" }));
    expect(res.status).toBe(200);
    expect(calledPaths()).toEqual(["POST jane:/products/", "POST jane:/prices/"]);
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
    expect(configWrites.map((w) => w.body)).toEqual([
      { platform_key: "testorg", allow_self_linking: false },
    ]);
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
      dm: adminDm({
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
    expect(calledPaths()).toEqual([
      "POST jane:/prices/price_1/",
      "GET jane:/products/prod_1/",
      "POST jane:/prices/",
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
    expect(configWrites).toHaveLength(0);
    expect(metaWrites).toHaveLength(0);
  });

  it("records nothing when the self-join switch is refused", async () => {
    stubFetch({
      selfJoin: () => Response.json({ error: "Permission denied" }, { status: 403 }),
    });
    const { POST } = await loadSetup();
    const res = await POST(post({ access: "free" }));
    expect(res.status).toBe(403);
    expect(metaWrites).toHaveLength(0);
  });
});
