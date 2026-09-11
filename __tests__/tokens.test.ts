import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/iblai/tokens.ts mints the app platform's own token pair after the SDK
 * self-joins a member: the platform's paywall binds a caller to the platform
 * their token was minted for, so a member who arrives on another platform's
 * token is refused until this runs. These tests pin the call on the wire, the
 * keys it writes, and that a failure is answered rather than thrown — the
 * join already succeeded, and a faked success would hide the refusal.
 */

const ENV: Record<string, string> = {
  NEXT_PUBLIC_API_BASE_URL: "https://api.example.edu",
  NEXT_PUBLIC_MAIN_TENANT_KEY: "acme",
};
const MINT_URL = "https://api.example.edu/lms/api/ibl/manager/consolidated-token/proxy/";
const JWT = "j".repeat(40);

const savedEnv: Record<string, string | undefined> = {};
let savedWindow: unknown;
let savedStorage: unknown;
let store: Map<string, string>;
let calls: { url: string; init?: RequestInit }[];

const answer = {
  data: {
    user: { username: "jane" },
    axd_token: { token: "axd-new", expires: "2026-10-01T00:00:00Z" },
    dm_token: { token: "dm-new", expires: "2026-10-02T00:00:00Z" },
  },
};

const stubFetch = (respond: () => Response) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: input instanceof Request ? input.url : String(input), init });
      return respond();
    }),
  );
};

// config.ts captures process.env at module scope: arrange env, then import a
// fresh module instance.
const load = async () => import("../lib/iblai/tokens");

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  store = new Map<string, string>([
    ["edx_jwt_token", JWT],
    ["dm_token", "dm-old"],
    ["axd_token", "axd-old"],
  ]);
  const g = globalThis as Record<string, unknown>;
  savedWindow = g.window;
  savedStorage = g.localStorage;
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  const g = globalThis as Record<string, unknown>;
  g.window = savedWindow;
  g.localStorage = savedStorage;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saveTokens", () => {
  it("writes each pair under the keys the SDK reads", async () => {
    const { saveTokens } = await load();
    saveTokens(answer.data);
    expect(store.get("axd_token")).toBe("axd-new");
    expect(store.get("axd_token_expires")).toBe("2026-10-01T00:00:00Z");
    expect(store.get("dm_token")).toBe("dm-new");
    expect(store.get("dm_token_expires")).toBe("2026-10-02T00:00:00Z");
  });

  it("leaves a missing half alone", async () => {
    const { saveTokens } = await load();
    saveTokens({ dm_token: { token: "dm-only", expires: "2026-10-03T00:00:00Z" } });
    expect(store.get("dm_token")).toBe("dm-only");
    expect(store.get("axd_token")).toBe("axd-old");
    saveTokens(undefined);
    expect(store.get("dm_token")).toBe("dm-only");
  });
});

describe("mintPlatformTokens", () => {
  it("asks the platform for this platform's pair on the member's edX token", async () => {
    stubFetch(() => Response.json(answer));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(MINT_URL);
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`JWT ${JWT}`);
    expect((calls[0].init?.body as FormData).get("platform_key")).toBe("acme");
    expect(store.get("dm_token")).toBe("dm-new");
  });

  it("mints for the platform it is given — the setup wizard's, not the app's", async () => {
    stubFetch(() => Response.json(answer));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens("other-platform")).toBe(true);
    expect((calls[0].init?.body as FormData).get("platform_key")).toBe("other-platform");
  });

  it("sends a short token as a session key, the SDK's own rule", async () => {
    store.set("edx_jwt_token", "short-token");
    stubFetch(() => Response.json(answer));
    const { mintPlatformTokens } = await load();
    await mintPlatformTokens();
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer short-token",
    );
  });

  it("asks nothing when the member has no edX token", async () => {
    store.delete("edx_jwt_token");
    stubFetch(() => Response.json(answer));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens()).toBe(false);
    expect(calls).toHaveLength(0);
    expect(store.get("dm_token")).toBe("dm-old");
  });

  it("asks nothing when no platform is configured", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "";
    stubFetch(() => Response.json(answer));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("keeps the tokens it has when the platform refuses, and throws nothing", async () => {
    stubFetch(() => Response.json({ detail: "no" }, { status: 403 }));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens()).toBe(false);
    expect(store.get("dm_token")).toBe("dm-old");
    expect(store.has("dm_token_expires")).toBe(false);
  });

  it("survives a platform that answers something else entirely", async () => {
    stubFetch(() => new Response("<html>gateway</html>", { status: 200 }));
    const { mintPlatformTokens } = await load();
    expect(await mintPlatformTokens()).toBe(false);
    expect(store.get("dm_token")).toBe("dm-old");
  });
});
