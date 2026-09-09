import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/paywall-client.ts is the buyer rail: the browser talks to the platform
 * itself, with the signed-in member's own token on their own username path,
 * and reads what is for sale from the platform's public metadata. These tests
 * pin the URLs and bodies on the wire, that no platform key exists anywhere,
 * that nothing for sale grants without asking the platform, and that a
 * refusal rejects with the platform's own words — never a silent pass.
 */

const ENV: Record<string, string> = {
  NEXT_PUBLIC_API_BASE_URL: "https://api.example.edu",
  NEXT_PUBLIC_MAIN_TENANT_KEY: "testorg",
  NEXT_PUBLIC_PAYWALL_APP_SLUG: "demo-app",
};
const savedEnv: Record<string, string | undefined> = {};

const DM = "https://api.example.edu/dm";
const META_URL = `${DM}/api/core/orgs/testorg/metadata/`;
const PAYWALL = `${DM}/api/ai-mentor/orgs/testorg/users/jane/providers/stripe/payments/paywall`;

const info = (over: Record<string, unknown> = {}) => ({
  version: 1,
  access: "monthly",
  amount: 2900,
  currency: "usd",
  stripe: {
    product_id: "prod_1",
    price_id: "price_1",
    publishable_key: "pk_test_platform",
    stripe_account: "acct_1",
  },
  updated_at: "2026-09-04T00:00:00.000Z",
  updated_by: "jane",
  ...over,
});

const metadataResponse = (apps: Record<string, unknown>) =>
  Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: { apps } });

let calls: { url: string; init?: RequestInit }[] = [];

/** fetch stub: the metadata URL answers `apps`; the paywall calls answer `dm`. */
const stubFetch = (
  apps: Record<string, unknown>,
  dm: (url: string, init?: RequestInit) => Response = () => Response.json({}),
) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push({ url, init });
      return url === META_URL ? metadataResponse(apps) : dm(url, init);
    }),
  );
};

const paywallCalls = () => calls.filter((c) => c.url !== META_URL);

// The module (and the config it imports) captures process.env and keeps
// caches at module scope: arrange env and the browser globals, then import a
// fresh instance.
const load = async () => import("../lib/paywall-client");

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  const store = new Map<string, string>([
    ["dm_token", "dm-abc"],
    ["userData", JSON.stringify({ user_nicename: "jane", user_email: "jane@x.io" })],
  ]);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("fetchCatalogue", () => {
  it("reads apps.<slug> from the public metadata, with no credential, once per minute", async () => {
    stubFetch({ "demo-app": info() });
    const { fetchCatalogue } = await load();
    const first = await fetchCatalogue();
    const second = await fetchCatalogue();
    expect(first).toEqual({
      app: "demo-app",
      paywall: true,
      decided: true,
      platformName: "Acme",
      settings: { access: "monthly", amount: 2900 },
      price: {
        id: "price_1",
        productId: "prod_1",
        name: "Monthly access",
        unitAmount: 2900,
        currency: "usd",
        interval: "month",
      },
    });
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(META_URL);
    expect((calls[0].init?.headers ?? {}) as Record<string, string>).not.toHaveProperty(
      "Authorization",
    );
  });

  it("is undecided with no entry, decided and free for a free choice, one-time without an interval", async () => {
    stubFetch({});
    let { fetchCatalogue } = await load();
    expect(await fetchCatalogue()).toMatchObject({
      paywall: false,
      decided: false,
      settings: null,
      price: null,
    });

    vi.resetModules();
    stubFetch({
      "demo-app": info({
        access: "free",
        amount: null,
        currency: null,
        stripe: { product_id: "prod_1", price_id: null },
      }),
    });
    ({ fetchCatalogue } = await load());
    expect(await fetchCatalogue()).toMatchObject({
      paywall: false,
      decided: true,
      settings: { access: "free", amount: null },
      price: null,
    });

    vi.resetModules();
    stubFetch({ "demo-app": info({ access: "one_time", amount: 4900 }) });
    ({ fetchCatalogue } = await load());
    expect((await fetchCatalogue()).price).toMatchObject({
      name: "One-time access",
      unitAmount: 4900,
      interval: null,
    });
  });

  it("passes the platform's refusal through instead of pretending the app is free, and does not cache it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "Not found." }, { status: 404 })),
    );
    const { fetchCatalogue, PaywallRequestError } = await load();
    await expect(fetchCatalogue()).rejects.toMatchObject({ status: 404, message: "Not found." });
    await expect(fetchCatalogue()).rejects.toBeInstanceOf(PaywallRequestError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("startCheckout", () => {
  it("mints the member's own embedded session on their own path with their own token", async () => {
    stubFetch({ "demo-app": info() }, () =>
      Response.json({
        client_secret: "cs_1_secret",
        session_id: "cs_1",
        publishable_key: "pk_test_platform",
        stripe_account: "acct_1",
      }),
    );
    const { startCheckout } = await load();
    expect(await startCheckout("price_1")).toEqual({
      client_secret: "cs_1_secret",
      session_id: "cs_1",
      publishable_key: "pk_test_platform",
      stripe_account: "acct_1",
    });
    expect(paywallCalls()).toHaveLength(1);
    const { url, init } = paywallCalls()[0];
    expect(url).toBe(`${PAYWALL}/checkout/`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Token dm-abc",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      app: "demo-app",
      price_id: "price_1",
      ui_mode: "embedded",
      payment_method_types: ["card"],
    });
  });

  it("surfaces the platform's 400 (not the recorded price, no publishable key) verbatim", async () => {
    stubFetch({ "demo-app": info() }, () =>
      Response.json(
        { error: "price_id is not the price recorded for app demo-app" },
        { status: 400 },
      ),
    );
    const { startCheckout } = await load();
    await expect(startCheckout("price_evil")).rejects.toMatchObject({
      status: 400,
      message: "price_id is not the price recorded for app demo-app",
    });
  });
});

describe("checkAccess", () => {
  it("asks the platform on the member's own path, with the session they just completed when given", async () => {
    stubFetch({ "demo-app": info() }, () => Response.json({ has_access: true, mode: "payment" }));
    const { checkAccess } = await load();
    expect(await checkAccess()).toMatchObject({ has_access: true });
    expect(await checkAccess("cs_42")).toMatchObject({ has_access: true });
    expect(paywallCalls().map((c) => c.url)).toEqual([
      `${PAYWALL}/access/?app=demo-app`,
      `${PAYWALL}/access/?app=demo-app&session_id=cs_42`,
    ]);
    for (const { init } of paywallCalls()) {
      expect(init?.method ?? "GET").toBe("GET");
      expect(((init?.headers ?? {}) as Record<string, string>).Authorization).toBe("Token dm-abc");
    }
  });
});

describe("hasPaidAccess", () => {
  it("grants without asking the platform while there is nothing for sale (undecided or free)", async () => {
    stubFetch({});
    let { hasPaidAccess } = await load();
    expect(await hasPaidAccess()).toBe(true);
    expect(paywallCalls()).toHaveLength(0);

    vi.resetModules();
    stubFetch({
      "demo-app": info({ access: "free", stripe: { product_id: "prod_1", price_id: null } }),
    });
    ({ hasPaidAccess } = await load());
    expect(await hasPaidAccess()).toBe(true);
    expect(paywallCalls()).toHaveLength(0);
  });

  it("answers from the platform while something is for sale, once per minute", async () => {
    stubFetch({ "demo-app": info() }, () => Response.json({ has_access: false, mode: null }));
    const { hasPaidAccess } = await load();
    expect(await hasPaidAccess()).toBe(false);
    expect(await hasPaidAccess()).toBe(false);
    expect(paywallCalls().map((c) => c.url)).toEqual([`${PAYWALL}/access/?app=demo-app`]);
  });

  it("rejects with the platform's words on a refusal — never a silent pass — and does not cache it", async () => {
    stubFetch({ "demo-app": info() }, () =>
      Response.json({ error: "Permission denied" }, { status: 403 }),
    );
    const { hasPaidAccess, resetPaidAccess } = await load();
    await expect(hasPaidAccess()).rejects.toMatchObject({
      status: 403,
      message: "Permission denied",
    });
    await expect(hasPaidAccess()).rejects.toMatchObject({ status: 403 });
    expect(paywallCalls()).toHaveLength(2);
    resetPaidAccess();
    await expect(hasPaidAccess()).rejects.toMatchObject({ status: 403 });
    expect(paywallCalls()).toHaveLength(3);
  });
});

describe("errorWithStatus", () => {
  it("adds the status to the platform's message, for errors a person has to act on", async () => {
    const { errorWithStatus, PaywallRequestError, errorMessage } = await load();
    expect(errorWithStatus(new PaywallRequestError(403, "Permission denied"))).toBe(
      "Permission denied (403)",
    );
    expect(errorWithStatus(new Error("boom"))).toBe("boom");
    expect(errorMessage("junk")).toBe("Something went wrong; try again.");
  });
});
