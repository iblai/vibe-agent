import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/iblai/auth-utils.ts: every trip to the login SPA carries the app's
 * platform and the SPA's `enforce-login` switch (the form once, no SSO
 * lookup after its custom-domain check), whatever platform the SDK passes;
 * a forced logout adds `logout=1`; sign-out goes straight to that form.
 */

const ENV: Record<string, string> = {
  NEXT_PUBLIC_MAIN_TENANT_KEY: "acme",
  NEXT_PUBLIC_AUTH_URL: "https://login.example.test",
};
const LOGIN =
  "https://login.example.test/login?app=custom&redirect-to=http://localhost:3000&tenant=acme&enforce-login=1";

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

describe("authLoginUrl", () => {
  it("scopes the SPA to the env platform and asks for the form once", async () => {
    const { authLoginUrl } = await load();
    expect(authLoginUrl("http://localhost:3000")).toBe(LOGIN);
  });
});

describe("redirectToAuthSpa", () => {
  it("ignores the platform the SDK passes and marks a forced logout", async () => {
    const { redirectToAuthSpa } = await load();
    await redirectToAuthSpa(undefined, "other", true);
    expect(loc.href).toBe(`${LOGIN}&logout=1`);
  });

  it("remembers where to come back to when asked", async () => {
    const { redirectToAuthSpa } = await load();
    await redirectToAuthSpa("/account", undefined, false, true);
    expect(localStorage.getItem("redirectTo")).toBe("/account");
    expect(loc.href).toBe(LOGIN);
  });
});

describe("handleLogout", () => {
  it("clears the app's state and goes straight to the login form", async () => {
    const { handleLogout } = await load();
    localStorage.setItem("dm_token", "t");
    handleLogout();
    expect(localStorage.getItem("dm_token")).toBeNull();
    expect(loc.href).toBe(LOGIN);
  });
});
