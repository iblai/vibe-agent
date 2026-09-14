import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * instrumentation.ts: how a hosted app learns which platform it fronts. These
 * pin: off Vercel nothing happens, the identity file is the store; on Vercel
 * the DM is asked once, by project id, and the answer lands in process.env; a
 * 404 means not ours (env is the way); a DM error fails the instance; a carried
 * identity file naming another platform fails it too, naming both; and the
 * edge runtime never asks.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_RUNTIME",
  "VERCEL_PROJECT_ID",
  "VERCEL_ENV",
  "IBLAI_PLATFORM_KEY",
] as const;
const saved: Record<string, string | undefined> = {};
let dir = "";

const load = async () => await import("../instrumentation");
const LOOKUP = "https://api.example.edu/dm/api/ai-mentor/providers/vercel/hosting/projects/prj_x/";

const carry = (platform: string) => {
  mkdirSync(join(dir, "data"), { recursive: true });
  writeFileSync(join(dir, "data", "onboarding.json"), JSON.stringify({ platform, slug: "s" }));
};

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  process.env.NEXT_RUNTIME = "nodejs";
  dir = mkdtempSync(join(tmpdir(), "vibe-instrumentation-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("register", () => {
  it("does nothing off Vercel: the identity file is the store", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await (await load()).register();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(process.env.IBLAI_PLATFORM_KEY).toBeUndefined();
  });

  it("asks the DM which platform owns the project and leaves the answer in process.env", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_x";
    process.env.VERCEL_ENV = "production";
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ platform_key: "acme" }));
    vi.stubGlobal("fetch", fetchMock);

    await (await load()).register();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(LOOKUP);
    expect(process.env.IBLAI_PLATFORM_KEY).toBe("acme");
  });

  it("treats a 404 as not ours: on Vercel, but not through ibl.ai hosting", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_x";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "no" }, { status: 404 })),
    );
    await (await load()).register();
    expect(process.env.IBLAI_PLATFORM_KEY).toBeUndefined();
  });

  it("fails the instance loudly when the DM errors", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_x";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    await expect((await load()).register()).rejects.toThrow(/prj_x answered 503/);
    expect(process.env.IBLAI_PLATFORM_KEY).toBeUndefined();
  });

  it("fails loudly when the carried identity names another platform, naming both", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_x";
    process.env.VERCEL_ENV = "production";
    carry("beta");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ platform_key: "acme" })),
    );
    await expect((await load()).register()).rejects.toThrow(
      /set up for platform "beta" but hosted under "acme"/,
    );
    expect(process.env.IBLAI_PLATFORM_KEY).toBeUndefined();
  });

  it("accepts a carried identity for the same platform", async () => {
    process.env.VERCEL_PROJECT_ID = "prj_x";
    process.env.VERCEL_ENV = "production";
    carry("acme");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ platform_key: "acme" })),
    );
    await (await load()).register();
    expect(process.env.IBLAI_PLATFORM_KEY).toBe("acme");
  });

  it("does nothing in the edge runtime, which needs no platform", async () => {
    process.env.NEXT_RUNTIME = "edge";
    process.env.VERCEL_PROJECT_ID = "prj_x";
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await (await load()).register();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
