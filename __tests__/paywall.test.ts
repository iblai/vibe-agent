import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/paywall.ts is the server-side trust boundary for the admin rail: it
 * turns the browser's `Authorization: Token <dm_token>` into a verified
 * identity (never trusting a client-sent username) and calls the platform's
 * Stripe proxy and connect endpoint on that user's own path with that same
 * token — the app holds no platform key. These tests pin the URL composition
 * of both, the token on the wire, and the ~60s identity cache (one
 * token/verify fetch, not one per request).
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "NEXT_PUBLIC_PAYWALL_APP_SLUG",
  "NEXT_PUBLIC_AUTH_URL",
] as const;

const saved: Record<string, string | undefined> = {};

// paywall.ts (and the config it imports) capture process.env at module scope,
// so each test re-imports a fresh module instance after arranging the env.
const loadPaywall = async () => await import("../lib/paywall");

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const stubFetch = (impl: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    impl(String(input), init),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
};

describe("dmStripeFetchAs", () => {
  it("composes the proxy URL from config and the encoded username, with that user's own token", async () => {
    const mock = stubFetch(() => Response.json({}));
    const { dmStripeFetchAs } = await loadPaywall();

    await dmStripeFetchAs("dm-abc", "j.doe+x", "/products/?limit=1");

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.example.edu/dm/api/ai-mentor/orgs/testorg" +
        "/users/j.doe%2Bx/providers/stripe/payments/products/?limit=1",
    );
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Token dm-abc");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.cache).toBe("no-store");
  });
});

describe("dmConnectFetchAs", () => {
  it("targets the connect endpoint on the user's own path with their token, verb and body as given", async () => {
    const mock = stubFetch(() => Response.json({}));
    const { dmConnectFetchAs } = await loadPaywall();

    await dmConnectFetchAs("dm-abc", "jane");
    await dmConnectFetchAs("dm-abc", "jane", {
      method: "POST",
      body: JSON.stringify({ return_url: "http://localhost:3000/setup" }),
    });

    expect(mock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.example.edu/dm/api/ai-mentor/orgs/testorg/users/jane/providers/stripe/connect/",
      "https://api.example.edu/dm/api/ai-mentor/orgs/testorg/users/jane/providers/stripe/connect/",
    ]);
    expect(mock.mock.calls[0][1]?.method).toBeUndefined();
    expect(mock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ return_url: "http://localhost:3000/setup" }),
      headers: { Authorization: "Token dm-abc", "Content-Type": "application/json" },
      cache: "no-store",
    });
  });
});

describe("userFromRequest", () => {
  it("resolves a Token authorization header via token/verify", async () => {
    const mock = stubFetch(() =>
      Response.json({ user_id: 7, username: "jane", email: "jane@x.io" }),
    );
    const { userFromRequest } = await loadPaywall();

    const req = new Request("http://app.test/api/paywall/admin/setup", {
      headers: { Authorization: "Token dm-abc" },
    });
    expect(await userFromRequest(req)).toEqual({ userId: 7, username: "jane", email: "jane@x.io" });

    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.example.edu/dm/api/core/token/verify/");
    // The user's own token: the only credential the app ever sends.
    expect(((init?.headers ?? {}) as Record<string, string>).Authorization).toBe("Token dm-abc");
  });

  it("rejects missing or non-Token schemes without touching the network", async () => {
    const mock = stubFetch(() => Response.json({ username: "jane", email: "" }));
    const { userFromRequest } = await loadPaywall();

    expect(await userFromRequest(new Request("http://app.test/"))).toBeNull();
    expect(
      await userFromRequest(
        new Request("http://app.test/", { headers: { Authorization: "Bearer dm-abc" } }),
      ),
    ).toBeNull();
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("resolveUser identity cache", () => {
  it("fetches token/verify once, then serves the ~60s cache", async () => {
    const mock = stubFetch(() =>
      Response.json({ user_id: 7, username: "jane", email: "jane@x.io" }),
    );
    const { resolveUser } = await loadPaywall();

    const first = await resolveUser("dm-abc");
    const second = await resolveUser("dm-abc");

    expect(first).toEqual({ userId: 7, username: "jane", email: "jane@x.io" });
    expect(second).toEqual(first);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not cache verify failures — the token may be mid-refresh", async () => {
    const mock = stubFetch(() => new Response("invalid", { status: 401 }));
    const { resolveUser } = await loadPaywall();

    expect(await resolveUser("dm-bad")).toBeNull();
    expect(await resolveUser("dm-bad")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
