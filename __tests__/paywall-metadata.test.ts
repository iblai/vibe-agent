import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The app's paywall choice lives in the platform's PUBLIC metadata
 * (apps.<slug>). These tests pin: the read needs no credential and is cached;
 * the write is one deep-merge PUT with the admin's own token and every key
 * present; env > metadata > nothing when resolving what is for sale; and
 * upstream refusals pass through instead of turning into a silent "free".
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

// The module keeps caches at module scope: arrange env, then import fresh.
const loadPaywall = async () => await import("../lib/paywall");

const META_URL = "https://api.example.edu/dm/api/core/orgs/testorg/metadata/";

const info = (over: Record<string, unknown> = {}) => ({
  version: 1,
  access: "monthly",
  amount: 2900,
  currency: "usd",
  stripe: { product_id: "prod_1", price_id: "price_1" },
  updated_at: "2026-09-04T00:00:00.000Z",
  updated_by: "jane",
  ...over,
});

const metadataResponse = (apps: Record<string, unknown>) =>
  Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: { apps, theme: "x" } });

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

describe("readAppPaymentInfo", () => {
  it("reads apps.<slug> from the public metadata endpoint with no credential, once per minute", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => metadataResponse({ "demo-app": info() }));
    vi.stubGlobal("fetch", fetchMock);
    const { readAppPaymentInfo } = await loadPaywall();

    const first = await readAppPaymentInfo();
    const second = await readAppPaymentInfo();
    expect(first).toMatchObject({ info: info(), platformName: "Acme" });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(String(url)).toBe(META_URL);
    expect(init?.headers).toBeUndefined();
  });

  it("treats a missing or malformed entry as undecided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        metadataResponse({ "other-app": info(), "demo-app": "junk" }),
      ),
    );
    const { readAppPaymentInfo } = await loadPaywall();
    expect((await readAppPaymentInfo()).info).toBeNull();
  });
});

describe("writeAppPaymentInfo", () => {
  it("PUTs one deep-merge body with the admin's own token and drops the read cache", async () => {
    let stored: Record<string, unknown> = {};
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === "PUT") {
        stored = JSON.parse(init.body as string).metadata.apps;
        return Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: {} });
      }
      return metadataResponse(stored);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { readAppPaymentInfo, writeAppPaymentInfo } = await loadPaywall();

    expect((await readAppPaymentInfo()).info).toBeNull();
    await writeAppPaymentInfo("dm-abc", info() as never);
    expect((await readAppPaymentInfo()).info).toEqual(info());

    const [putUrl, putInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT") as [
      string,
      RequestInit,
    ];
    expect(putUrl).toBe(META_URL);
    expect((putInit.headers as Record<string, string>).Authorization).toBe("Token dm-abc");
    expect(JSON.parse(putInit.body as string)).toEqual({
      metadata: { apps: { "demo-app": info() } },
    });
  });

  it("passes the DM's refusal through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        Response.json({ error: "Permission denied" }, { status: 403 }),
      ),
    );
    const { writeAppPaymentInfo, PaywallUpstreamError } = await loadPaywall();
    await expect(writeAppPaymentInfo("dm-abc", info() as never)).rejects.toBeInstanceOf(
      PaywallUpstreamError,
    );
  });
});

describe("resolveCatalogue / allowedPriceIds", () => {
  it("is undecided and free when the platform has no entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => metadataResponse({})),
    );
    const { resolveCatalogue, allowedPriceIds } = await loadPaywall();
    expect(await resolveCatalogue("jane")).toEqual({
      paywall: false,
      decided: false,
      source: "none",
      prices: [],
      settings: null,
    });
    expect(await allowedPriceIds()).toEqual([]);
  });

  it("is decided and free for a free choice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        metadataResponse({
          "demo-app": info({
            access: "free",
            amount: null,
            currency: null,
            stripe: { product_id: "prod_1", price_id: null },
          }),
        }),
      ),
    );
    const { resolveCatalogue, allowedPriceIds } = await loadPaywall();
    expect(await resolveCatalogue("jane")).toMatchObject({
      paywall: false,
      decided: true,
      source: "metadata",
      prices: [],
      settings: { access: "free", amount: null },
    });
    expect(await allowedPriceIds()).toEqual([]);
  });

  it("sells the one chosen price for a paid choice, with display data from the metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => metadataResponse({ "demo-app": info() }));
    vi.stubGlobal("fetch", fetchMock);
    const { resolveCatalogue, allowedPriceIds } = await loadPaywall();
    expect(await resolveCatalogue("jane")).toEqual({
      paywall: true,
      decided: true,
      source: "metadata",
      prices: [
        {
          id: "price_1",
          productId: "prod_1",
          name: "Monthly access",
          unitAmount: 2900,
          currency: "usd",
          interval: "month",
        },
      ],
      settings: { access: "monthly", amount: 2900 },
    });
    expect(await allowedPriceIds()).toEqual(["price_1"]);
    // No Stripe call: the metadata carries what the page shows.
    expect(fetchMock.mock.calls.every(([url]) => url === META_URL)).toBe(true);
  });

  it("lets PAYWALL_PRICE_IDS win, describing each id with one cached Stripe retrieve", async () => {
    process.env.PAYWALL_PRICE_IDS = "price_env";
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = input as string;
      if (url === META_URL) return metadataResponse({ "demo-app": info({ access: "free" }) });
      return Response.json({
        id: "price_env",
        nickname: "",
        unit_amount: 500,
        currency: "usd",
        recurring: null,
        product: { id: "prod_9", name: "Day pass" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { resolveCatalogue, allowedPriceIds } = await loadPaywall();

    expect(await allowedPriceIds()).toEqual(["price_env"]);
    const first = await resolveCatalogue("jane");
    const second = await resolveCatalogue("jane");
    expect(first).toMatchObject({
      paywall: true,
      decided: true,
      source: "env",
      prices: [
        { id: "price_env", productId: "prod_9", name: "Day pass", unitAmount: 500, interval: null },
      ],
    });
    expect(second).toEqual(first);
    const stripeCalls = fetchMock.mock.calls.filter(([url]) => url !== META_URL);
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0][0]).toBe(
      "https://api.example.edu/dm/api/ai-mentor/orgs/testorg" +
        "/users/jane/providers/stripe/payments/prices/price_env/?expand[]=product",
    );
    // Display lookups are the buyer-side rail: the org-wide key, never a user token.
    expect(
      ((stripeCalls[0][1] as RequestInit).headers as Record<string, string>).Authorization,
    ).toBe("Api-Token platform-key");
  });

  it("passes the DM's refusal through instead of pretending the app is free", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ detail: "Not found." }, { status: 404 })),
    );
    const { resolveCatalogue, allowedPriceIds, PaywallUpstreamError } = await loadPaywall();
    await expect(resolveCatalogue("jane")).rejects.toBeInstanceOf(PaywallUpstreamError);
    await expect(allowedPriceIds()).rejects.toMatchObject({ status: 404 });
  });
});
