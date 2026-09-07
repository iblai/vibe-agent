import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/paywall.ts is the server-side trust boundary for the app paywall: it
 * turns the browser's `Authorization: Token <dm_token>` into a verified
 * identity (never trusting a client-sent username) and calls the DM Stripe
 * proxy with the org-wide Api-Token key — as that user, or as the platform on
 * the key owner's path. These tests pin the proxy URL composition, the two
 * auth schemes staying on their own rails, the loud refusal of a placeholder
 * key, and the ~60s identity caches (one token/verify fetch, not one per
 * request).
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "IBLAI_API_KEY",
  "PAYWALL_APP_SLUG",
  "NEXT_PUBLIC_AUTH_URL",
  "IBLAI_APP_BASE_URL",
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
  process.env.IBLAI_API_KEY = "platform-key";
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

describe("dmPaywallFetch", () => {
  it("composes the DM proxy URL from config and the encoded username", async () => {
    const mock = stubFetch(() => Response.json({}));
    const { dmPaywallFetch } = await loadPaywall();

    await dmPaywallFetch("j.doe+x", "/paywall/access/?app=demo");

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.example.edu/dm/api/ai-mentor/orgs/testorg" +
        "/users/j.doe%2Bx/providers/stripe/payments/paywall/access/?app=demo",
    );
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Api-Token platform-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.cache).toBe("no-store");
  });
});

describe("userFromRequest", () => {
  it("resolves a Token authorization header via token/verify", async () => {
    const mock = stubFetch(() =>
      Response.json({ user_id: 7, username: "jane", email: "jane@x.io" }),
    );
    const { userFromRequest } = await loadPaywall();

    const req = new Request("http://app.test/api/paywall/access", {
      headers: { Authorization: "Token dm-abc" },
    });
    expect(await userFromRequest(req)).toEqual({ userId: 7, username: "jane", email: "jane@x.io" });

    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe("https://api.example.edu/dm/api/core/token/verify/");
    // The user's own token, never the org-wide Api-Token.
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

describe("appBaseUrl", () => {
  const req = { url: "http://localhost:3000/api/paywall/prices" };

  it("is the request's origin unless IBLAI_APP_BASE_URL says otherwise", async () => {
    const { appBaseUrl } = await loadPaywall();
    expect(appBaseUrl(req)).toBe("http://localhost:3000");
    process.env.IBLAI_APP_BASE_URL = "https://agent.example.com/";
    expect(appBaseUrl(req)).toBe("https://agent.example.com");
    process.env.IBLAI_APP_BASE_URL = "agent.example.com";
    expect(() => appBaseUrl(req)).toThrow(/IBLAI_APP_BASE_URL/);
  });
});

describe("ensureUser", () => {
  const scimUrl = "https://api.example.edu/dm/api/orgs/testorg/scim/v2/Users";
  const created = (body: any, over: Record<string, unknown> = {}) =>
    Response.json(
      { id: "77", userName: body.userName, emails: body.emails, ...over },
      { status: 201 },
    );

  it("creates the account through SCIM with the app's key and no platform link", async () => {
    const mock = stubFetch((_url, init) => created(JSON.parse(init?.body as string)));
    const { ensureUser } = await loadPaywall();
    const user = await ensureUser("new.buyer@x.io");
    expect(user).toEqual({
      userId: 77,
      username: expect.stringMatching(/^newbuyer_[0-9a-f]{6}$/),
      email: "new.buyer@x.io",
    });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(scimUrl);
    expect(((init?.headers ?? {}) as Record<string, string>).Authorization).toBe(
      "Api-Token platform-key",
    );
    const body = JSON.parse(init?.body as string);
    expect(body.platformOrgs).toBeUndefined();
    expect(body.emails).toEqual([{ value: "new.buyer@x.io", primary: true }]);
  });

  it("tries one more suffix when SCIM hands back someone else's account, then gives up loudly", async () => {
    const seen: string[] = [];
    const mock = stubFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      seen.push(body.userName);
      return seen.length === 1
        ? created(body, { emails: [{ value: "someone.else@x.io", primary: true }] })
        : created(body);
    });
    const { ensureUser, PaywallUpstreamError } = await loadPaywall();
    expect((await ensureUser("new.buyer@x.io")).username).toBe(seen[1]);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(seen[0]).not.toBe(seen[1]);

    vi.resetModules();
    stubFetch((_url, init) =>
      created(JSON.parse(init?.body as string), { emails: [{ value: "someone.else@x.io" }] }),
    );
    const fresh = await loadPaywall();
    await expect(fresh.ensureUser("new.buyer@x.io")).rejects.toBeInstanceOf(
      fresh.PaywallUpstreamError,
    );
    expect(PaywallUpstreamError).toBeDefined();
  });

  it("turns the platform's 'username mismatch' 400 (a known email) into a 409 that says to sign in", async () => {
    stubFetch(() =>
      Response.json({ error: "Username mismatch in error response" }, { status: 400 }),
    );
    const { ensureUser } = await loadPaywall();
    const err = await ensureUser("known@x.io").catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.body.error).toContain("Sign in");
  });
});

describe("provisionTokens", () => {
  const buyer = { userId: 77, username: "newbuyer_abc123", email: "new.buyer@x.io" };

  it("is null (and says so once) while ibl.ai has not enabled provisioning for the platform", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    stubFetch(() => Response.json({ detail: "Not found." }, { status: 404 }));
    const { provisionTokens } = await loadPaywall();
    expect(await provisionTokens(buyer)).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });

  it("maps the platform's bundle to the Auth SPA's data shape", async () => {
    const mock = stubFetch(() =>
      Response.json({
        data: {
          user: { user_id: 77, user_nicename: "newbuyer_abc123", user_email: "new.buyer@x.io" },
          axd_token: { token: "axd-1", expires: "2030-01-01T00:00:00Z" },
          dm_token: { token: "dm-1", expires: "2030-01-02T00:00:00Z" },
          edx_jwt_token: { token: "jwt-1", expires: "2030-01-03T00:00:00Z" },
        },
      }),
    );
    const { provisionTokens } = await loadPaywall();
    expect(await provisionTokens(buyer)).toEqual({
      axd_token: "axd-1",
      axd_token_expires: "2030-01-01T00:00:00Z",
      dm_token: "dm-1",
      dm_token_expires: "2030-01-02T00:00:00Z",
      edx_jwt_token: "jwt-1",
      userData: JSON.stringify({
        user_id: 77,
        user_nicename: "newbuyer_abc123",
        user_email: "new.buyer@x.io",
      }),
      tenant: "testorg",
      current_tenant: JSON.stringify({ key: "testorg" }),
    });
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://api.example.edu/dm/api/core/consolidated-token/provision/");
    expect(JSON.parse(init?.body as string)).toEqual({
      username: "newbuyer_abc123",
      email: "new.buyer@x.io",
      platform_key: "testorg",
    });
  });

  it("passes any other refusal through", async () => {
    stubFetch(() => Response.json({ detail: "Invalid Request" }, { status: 403 }));
    const { provisionTokens, PaywallUpstreamError } = await loadPaywall();
    await expect(provisionTokens(buyer)).rejects.toBeInstanceOf(PaywallUpstreamError);
  });
});

describe("apiKeyProblem", () => {
  it("names IBLAI_API_KEY while it is empty or the template placeholder", async () => {
    delete process.env.IBLAI_API_KEY;
    expect((await loadPaywall()).apiKeyProblem()).toContain("IBLAI_API_KEY");
    process.env.IBLAI_API_KEY = "your-token";
    vi.resetModules();
    expect((await loadPaywall()).apiKeyProblem()).toContain("IBLAI_API_KEY");
    process.env.IBLAI_API_KEY = "sk-real";
    vi.resetModules();
    expect((await loadPaywall()).apiKeyProblem()).toBe("");
  });
});

describe("dmPlatformFetch", () => {
  it("runs on the Api-Token owner's path, resolved once from token/verify with the key", async () => {
    const mock = stubFetch((url) =>
      url.endsWith("/api/core/token/verify/")
        ? Response.json({ user_id: 1, username: "owner", email: "owner@x.io" })
        : Response.json({ data: [] }),
    );
    const { dmPlatformFetch } = await loadPaywall();

    await dmPlatformFetch("/customers/search/?query=x");
    await dmPlatformFetch("/customers/");

    const calls = mock.mock.calls.map(([url, init]) => [
      String(url),
      ((init?.headers ?? {}) as Record<string, string>).Authorization,
    ]);
    expect(calls).toEqual([
      ["https://api.example.edu/dm/api/core/token/verify/", "Api-Token platform-key"],
      [
        "https://api.example.edu/dm/api/ai-mentor/orgs/testorg/users/owner/providers/stripe/payments/customers/search/?query=x",
        "Api-Token platform-key",
      ],
      [
        "https://api.example.edu/dm/api/ai-mentor/orgs/testorg/users/owner/providers/stripe/payments/customers/",
        "Api-Token platform-key",
      ],
    ]);
  });
});

describe("apiKeyVerdict", () => {
  const CONFIG_URL =
    "https://api.example.edu/dm/api/core/users/platforms/config/?platform_key=testorg";
  const answering = (
    status: number,
    detail = "You do not have permission to perform this action.",
  ) =>
    stubFetch(() =>
      Response.json(status === 200 ? { platform_key: "testorg" } : { detail }, { status }),
    );

  it("names the placeholder without asking the platform", async () => {
    process.env.IBLAI_API_KEY = "your-token";
    const mock = answering(200);
    expect(await (await loadPaywall()).apiKeyVerdict()).toContain("IBLAI_API_KEY");
    expect(mock).not.toHaveBeenCalled();
  });

  it("asks the platform's config read with the key, once, and renders on 200", async () => {
    const mock = answering(200);
    const { apiKeyVerdict } = await loadPaywall();
    expect(await apiKeyVerdict()).toBe("");
    expect(await apiKeyVerdict()).toBe("");
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toBe(CONFIG_URL);
    expect(((init?.headers ?? {}) as Record<string, string>).Authorization).toBe(
      "Api-Token platform-key",
    );
  });

  it("reads the refusal's body: a bad key is 'rejected', a foreign admin key 'different platform'", async () => {
    // The platform answers 403 for a bad key too (no 401 challenge on its
    // first auth class), so the body's detail is what tells the two apart.
    answering(403, "Invalid token.");
    expect(await (await loadPaywall()).apiKeyVerdict()).toContain("rejected");
    vi.resetModules();
    answering(401, "User inactive for platform.");
    expect(await (await loadPaywall()).apiKeyVerdict()).toContain("rejected");
    vi.resetModules();
    answering(403);
    expect(await (await loadPaywall()).apiKeyVerdict()).toContain("different platform");
    vi.resetModules();
    answering(404, "Platform not found");
    expect(await (await loadPaywall()).apiKeyVerdict()).toContain("no active platform");
  });

  it("lets the app render, loudly, when the platform cannot be asked", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    answering(502);
    expect(await (await loadPaywall()).apiKeyVerdict()).toBe("");
    vi.resetModules();
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    expect(await (await loadPaywall()).apiKeyVerdict()).toBe("");
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
