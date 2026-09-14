import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * lib/deploy-token.ts: the Platform API Token the deploy skill publishes with,
 * minted at the local platform save so nobody makes one by hand. These pin:
 * iblai.env is created from the example and every other line survives a
 * write; the placeholder is not a token; a real one already there is kept and
 * the DM is not asked; the mint carries the admin's own token and names the
 * key after the slug; a refusal or an outage answers "missing" with the file
 * still carrying the platform and the username; the key never comes back in
 * the answer; and nothing is written on the hosting.
 */

const ENV_KEYS = ["NEXT_PUBLIC_API_BASE_URL", "VERCEL_ENV"] as const;
const saved: Record<string, string | undefined> = {};
let dir = "";

const EXAMPLE = [
  "# ibl.ai Platform Configuration",
  "DOMAIN=iblai.app",
  "PLATFORM=your-platform",
  "TOKEN=your-platform-api-key",
  "",
  "# Auth interface",
  "AUTH_TITLE=your-platform-name",
  "",
].join("\n");

const load = async () => await import("../lib/deploy-token");
const envPath = () => join(dir, "iblai.env");
const lines = () => readFileSync(envPath(), "utf8").split("\n");
const line = (key: string) => lines().find((l) => l.startsWith(`${key}=`));

const mintCall = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  dir = mkdtempSync(join(tmpdir(), "vibe-deploy-token-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  writeFileSync(join(dir, "iblai.env.example"), EXAMPLE);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("writeIblaiEnv", () => {
  it("creates the file from the example, keeping its comments, and sets or adds lines", async () => {
    const { writeIblaiEnv } = await load();
    writeIblaiEnv({ PLATFORM: "acme", IBLAI_USERNAME: "jane" });
    expect(line("PLATFORM")).toBe("PLATFORM=acme");
    expect(line("IBLAI_USERNAME")).toBe("IBLAI_USERNAME=jane");
    expect(line("TOKEN")).toBe("TOKEN=your-platform-api-key");
    expect(lines()[0]).toBe("# ibl.ai Platform Configuration");
    expect(readFileSync(envPath(), "utf8")).toMatch(/[^\n]\n$/);
  });

  it("keeps the rest of a file that already exists", async () => {
    writeFileSync(envPath(), "DOMAIN=iblai.org\nTOKEN=existing\nCUSTOM=kept\n");
    const { writeIblaiEnv } = await load();
    writeIblaiEnv({ PLATFORM: "acme" });
    expect(lines().filter(Boolean)).toEqual([
      "DOMAIN=iblai.org",
      "TOKEN=existing",
      "CUSTOM=kept",
      "PLATFORM=acme",
    ]);
  });

  it("never writes on the hosting", async () => {
    process.env.VERCEL_ENV = "production";
    const { writeIblaiEnv } = await load();
    expect(() => writeIblaiEnv({ PLATFORM: "acme" })).toThrow(/hosting/);
    expect(existsSync(envPath())).toBe(false);
  });
});

describe("hasRealToken", () => {
  it("is false with no file, the example's placeholder, or an empty value", async () => {
    const { hasRealToken } = await load();
    expect(hasRealToken()).toBe(false);
    writeFileSync(envPath(), "TOKEN=your-platform-api-key\n");
    expect(hasRealToken()).toBe(false);
    writeFileSync(envPath(), "TOKEN=\n");
    expect(hasRealToken()).toBe(false);
    writeFileSync(envPath(), "TOKEN=real-one\n");
    expect(hasRealToken()).toBe(true);
  });
});

describe("mintDeployToken", () => {
  it("mints on the platform as the admin, named after the slug, and writes everything publishing needs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ key: "tok-secret", name: "vibe-agent-3f2a9b1c" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { mintDeployToken } = await load();

    const result = await mintDeployToken(
      "dm-abc",
      "acme",
      "3f2a9b1c-0000-4000-8000-000000000000",
      "jane",
    );

    expect(result).toBe("minted");
    const [url, init] = mintCall(fetchMock);
    expect(url).toBe("https://api.example.edu/dm/api/core/platform/api-tokens/?platform_key=acme");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token dm-abc");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "vibe-agent-3f2a9b1c",
      platform_key: "acme",
    });
    expect(line("TOKEN")).toBe("TOKEN=tok-secret");
    expect(line("PLATFORM")).toBe("PLATFORM=acme");
    expect(line("IBLAI_USERNAME")).toBe("IBLAI_USERNAME=jane");
  });

  it("keeps a real token already there and does not ask the DM", async () => {
    writeFileSync(envPath(), "TOKEN=existing\n");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { mintDeployToken } = await load();

    expect(await mintDeployToken("dm-abc", "acme", "slug", "jane")).toBe("kept");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(line("TOKEN")).toBe("TOKEN=existing");
    expect(line("PLATFORM")).toBe("PLATFORM=acme");
    expect(line("IBLAI_USERNAME")).toBe("IBLAI_USERNAME=jane");
  });

  it("answers missing when the platform refuses, with the platform and username still on file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "no" }, { status: 403 })),
    );
    const { mintDeployToken } = await load();

    expect(await mintDeployToken("dm-abc", "acme", "slug", "jane")).toBe("missing");
    expect(line("TOKEN")).toBe("TOKEN=your-platform-api-key");
    expect(line("PLATFORM")).toBe("PLATFORM=acme");
    expect(line("IBLAI_USERNAME")).toBe("IBLAI_USERNAME=jane");
  });

  it("answers missing when the DM is unreachable, or answers without a key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await (await load()).mintDeployToken("dm-abc", "acme", "slug", "jane")).toBe("missing");

    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "vibe-agent-slug" })),
    );
    expect(await (await load()).mintDeployToken("dm-abc", "acme", "slug", "jane")).toBe("missing");
    expect(line("TOKEN")).toBe("TOKEN=your-platform-api-key");
  });
});
