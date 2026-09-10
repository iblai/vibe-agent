import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/iblai/auth-utils.ts: every trip to the login SPA is its join page for
 * the app's platform (from env), whatever platform or logout flag the SDK
 * passes — it makes the account or signs one in and links it to the
 * platform, so nobody arrives as a non-member; sign-out goes to the SPA's
 * logout page, which comes back to the app.
 */

const ENV: Record<string, string> = {
  NEXT_PUBLIC_MAIN_TENANT_KEY: "acme",
  NEXT_PUBLIC_AUTH_URL: "https://login.example.test",
};
const JOIN =
  "https://login.example.test/join?tenant=acme&redirect-to=http%3A%2F%2Flocalhost%3A3000";
const LOGOUT =
  "https://login.example.test/logout?redirect-to=http%3A%2F%2Flocalhost%3A3000&tenant=acme";

const savedEnv: Record<string, string | undefined> = {};
let savedWindow: unknown;
let savedStorage: unknown;
let loc: { origin: string; pathname: string; href: string };

// config.ts captures process.env at module scope, so each test re-imports a
// fresh module instance after arranging the env.
const load = async () => import("../lib/iblai/auth-utils");

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  savedWindow = g.window;
  savedStorage = g.localStorage;
  loc = { origin: "http://localhost:3000", pathname: "/", href: "" };
  g.window = { location: loc };
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  const g = globalThis as Record<string, unknown>;
  g.window = savedWindow;
  g.localStorage = savedStorage;
});

describe("authJoinUrl", () => {
  it("is the SPA's join page for the env platform, both values encoded", async () => {
    const { authJoinUrl } = await load();
    expect(authJoinUrl("http://localhost:3000")).toBe(JOIN);
  });
});

describe("redirectToAuthSpa", () => {
  it("ignores the platform and the logout flag the SDK passes", async () => {
    const { redirectToAuthSpa } = await load();
    await redirectToAuthSpa(undefined, "other", true);
    expect(loc.href).toBe(JOIN);
  });

  it("remembers where to come back to when asked", async () => {
    const { redirectToAuthSpa } = await load();
    await redirectToAuthSpa("/account", undefined, false, true);
    expect(localStorage.getItem("redirectTo")).toBe("/account");
    expect(loc.href).toBe(JOIN);
  });
});

describe("handleLogout", () => {
  it("clears the app's state and goes to the SPA's logout page", async () => {
    const { handleLogout } = await load();
    localStorage.setItem("dm_token", "t");
    handleLogout();
    expect(localStorage.getItem("dm_token")).toBeNull();
    expect(loc.href).toBe(LOGOUT);
  });
});
