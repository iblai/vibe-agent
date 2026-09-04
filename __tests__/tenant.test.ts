import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/iblai/tenant.ts: this is a single-platform app. The platform comes from
 * NEXT_PUBLIC_MAIN_TENANT_KEY alone; a platform left in localStorage by another
 * vibe app on the same origin must never win, and a missing or placeholder key
 * resolves to "" so the providers can fail loudly.
 */

const ENV_KEY = "NEXT_PUBLIC_MAIN_TENANT_KEY";
let savedEnv: string | undefined;
let savedWindow: unknown;
let savedStorage: unknown;

// Minimal browser globals: the module only needs `window` to exist and a
// localStorage with getItem/setItem.
function installBrowserGlobals() {
  const store = new Map<string, string>();
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
}

// config.ts captures process.env at module scope, so each test re-imports a
// fresh module instance after arranging the env.
const loadTenant = async () => import("../lib/iblai/tenant");

beforeEach(() => {
  vi.resetModules();
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  installBrowserGlobals();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
  const g = globalThis as Record<string, unknown>;
  g.window = savedWindow;
  g.localStorage = savedStorage;
});

describe("resolveAppTenant", () => {
  it("returns the env platform even when localStorage holds another app's platform", async () => {
    process.env[ENV_KEY] = "acme";
    localStorage.setItem("app_tenant", "other-app");
    localStorage.setItem("tenant", "other-sdk");
    const { resolveAppTenant } = await loadTenant();
    expect(resolveAppTenant()).toBe("acme");
  });

  it("resolves to '' for a placeholder key instead of falling back to localStorage", async () => {
    process.env[ENV_KEY] = "your-platform";
    localStorage.setItem("app_tenant", "other-app");
    const { resolveAppTenant } = await loadTenant();
    expect(resolveAppTenant()).toBe("");
  });

  it("resolves to '' when the key is unset", async () => {
    localStorage.setItem("tenant", "other-sdk");
    const { resolveAppTenant } = await loadTenant();
    expect(resolveAppTenant()).toBe("");
  });
});

describe("isTenantAdmin", () => {
  it("is true only for is_admin on the pinned platform", async () => {
    process.env[ENV_KEY] = "acme";
    const { isTenantAdmin } = await loadTenant();
    localStorage.setItem(
      "tenants",
      JSON.stringify([
        { key: "other", is_admin: true },
        { key: "acme", is_admin: false },
      ]),
    );
    expect(isTenantAdmin()).toBe(false);
    localStorage.setItem("tenants", JSON.stringify([{ key: "acme", is_admin: true }]));
    expect(isTenantAdmin()).toBe(true);
  });
});
