import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * lib/iblai/config.ts URL resolution: hosted-iblai.app defaults live in code,
 * so the app works with no env file at all, and hosted deployments can never
 * silently fall back to the per-service subdomains that reject Auth-SPA
 * session tokens (iblai/vibe#155). Distributed mode stays reachable for
 * self-hosted domains only.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_PLATFORM_BASE_DOMAIN",
  "NEXT_PUBLIC_AUTH_URL",
  "NEXT_PUBLIC_BASE_WS_URL",
  "NEXT_PUBLIC_LEGACY_LMS_URL",
  "NEXT_PUBLIC_MFE_URL",
  "NEXT_PUBLIC_PAYWALL_APP_SLUG",
] as const;

const saved: Record<string, string | undefined> = {};

// config.ts captures process.env at module scope, so each test re-imports a
// fresh module instance after arranging the env.
const loadConfig = async () => (await import("../lib/iblai/config")).default;

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("hosted defaults in code", () => {
  it("routes through the consolidated API with no env vars at all", async () => {
    const config = await loadConfig();
    expect(config.lmsUrl()).toBe("https://api.iblai.app/lms");
    expect(config.dmUrl()).toBe("https://api.iblai.app/dm");
    expect(config.axdUrl()).toBe("https://api.iblai.app/axd");
    expect(config.authUrl()).toBe("https://login.iblai.app");
    // edX hosts are NOT under the consolidated API base.
    expect(config.legacyLmsUrl()).toBe("https://learn.iblai.app");
    expect(config.mfeUrl()).toBe("https://apps.learn.iblai.app");
    // The two .env.example no longer lists, so nothing else pins them.
    expect(config.baseWsUrl()).toBe("wss://asgi.data.iblai.app");
    expect(config.platformBaseDomain()).toBe("iblai.app");
  });

  it("uses an explicit NEXT_PUBLIC_API_BASE_URL verbatim", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
    const config = await loadConfig();
    expect(config.lmsUrl()).toBe("https://api.example.edu/lms");
    expect(config.dmUrl()).toBe("https://api.example.edu/dm");
    expect(config.axdUrl()).toBe("https://api.example.edu/axd");
  });

  it("keeps distributed mode for self-hosted domains without an API base", async () => {
    process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN = "example.edu";
    const config = await loadConfig();
    expect(config.lmsUrl()).toBe("https://learn.example.edu");
    expect(config.dmUrl()).toBe("https://base.manager.example.edu");
    expect(config.axdUrl()).toBe("https://base.manager.example.edu");
    expect(config.authUrl()).toBe("https://login.example.edu");
    expect(config.legacyLmsUrl()).toBe("https://learn.example.edu");
    expect(config.mfeUrl()).toBe("https://apps.learn.example.edu");
  });

  it("honors explicit overrides for auth and edX hosts", async () => {
    process.env.NEXT_PUBLIC_AUTH_URL = "https://sso.example.edu";
    process.env.NEXT_PUBLIC_LEGACY_LMS_URL = "https://edx.example.edu";
    process.env.NEXT_PUBLIC_MFE_URL = "https://mfe.example.edu";
    const config = await loadConfig();
    expect(config.authUrl()).toBe("https://sso.example.edu");
    expect(config.legacyLmsUrl()).toBe("https://edx.example.edu");
    expect(config.mfeUrl()).toBe("https://mfe.example.edu");
  });
});

describe("paywallAppSlug", () => {
  it("defaults in code when unset — a fresh clone has no env file at all", async () => {
    expect((await loadConfig()).paywallAppSlug()).toBe("vibe-agent");
    process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG = "demo-app";
    vi.resetModules();
    expect((await loadConfig()).paywallAppSlug()).toBe("demo-app");
  });
});
