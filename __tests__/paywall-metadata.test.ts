import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The app's paywall choice lives in the platform's PUBLIC metadata
 * (apps.<slug>). These tests pin: the read needs no credential and is cached;
 * the write is one deep-merge PUT with the admin's own token and every key
 * present — the Stripe source's public values included — carrying the login
 * SPA's branding key beside the choice; and upstream refusals pass through
 * instead of being swallowed.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "NEXT_PUBLIC_PAYWALL_APP_SLUG",
  "NEXT_PUBLIC_APP_NAME",
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
  Response.json({ platform_key: "testorg", platform_name: "Acme", metadata: { apps, theme: "x" } });

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
  process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG = "demo-app";
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
  it("PUTs one deep-merge body — the choice and the login branding — with the admin's own token and drops the read cache", async () => {
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
    await writeAppPaymentInfo("dm-abc", info() as never, "Acme");
    expect((await readAppPaymentInfo()).info).toEqual(info());

    const [putUrl, putInit] = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT") as [
      string,
      RequestInit,
    ];
    expect(putUrl).toBe(META_URL);
    expect((putInit.headers as Record<string, string>).Authorization).toBe("Token dm-abc");
    expect(JSON.parse(putInit.body as string)).toEqual({
      metadata: {
        apps: { "demo-app": info() },
        // What login.iblai.app shows for the platform: the app's name (env,
        // else the platform's) and the price line.
        auth_web_mentorai: {
          title: "Acme",
          display_title_info: "Acme",
          display_description_info: "$29/month",
        },
      },
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
    await expect(writeAppPaymentInfo("dm-abc", info() as never, "Acme")).rejects.toBeInstanceOf(
      PaywallUpstreamError,
    );
  });
});
