import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where the setup wizard's answers live. These tests pin: the platform comes
 * from the app's own database first and env second, so a published app and a
 * self-hoster both keep working; placeholders and ibl.ai's shared `main` never
 * count as an answer; a write is visible to the very next read; a filesystem
 * that cannot be written says so; and the agent and the name come off the
 * platform's metadata over env, with a failed public read falling back to env
 * instead of blanking a working app. The metadata write names only its own two
 * keys, so the paywall choice beside it survives the deep merge.
 *
 * process.cwd() is redirected at every turn: without it these would read the
 * developer's own data/ and pass or fail by accident.
 */

const ENV_KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_MAIN_TENANT_KEY",
  "NEXT_PUBLIC_DEFAULT_AGENT_ID",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_PAYWALL_APP_SLUG",
] as const;

const saved: Record<string, string | undefined> = {};
let dir = "";

// Both modules keep caches at module scope: arrange env, then import fresh.
const loadOnboarding = async () => await import("../lib/onboarding");
const loadPaywall = async () => await import("../lib/paywall");

const metadataResponse = (app: Record<string, unknown>) =>
  Response.json({ platform_name: "Acme", metadata: { apps: { "demo-app": app } } });

/** Read the row back the way anything else would, not through the module under test. */
const storedPlatform = (): string | null => {
  const db = new DatabaseSync(join(dir, "data", "onboarding.db"), { readOnly: true });
  try {
    const row = db.prepare("select platform, updated_by from setup where id = 1").get() as
      | { platform: string; updated_by: string }
      | undefined;
    return row?.platform ?? null;
  } finally {
    db.close();
  }
};

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG = "demo-app";
  dir = mkdtempSync(join(tmpdir(), "vibe-onboarding-"));
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

describe("platformKey", () => {
  it("is empty with no database at all — a fresh clone, which is the wizard", async () => {
    expect((await loadOnboarding()).platformKey()).toBe("");
  });

  it("takes the stored answer over env", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "from-env";
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup({ platform: "acme" }, "jane");
    expect(platformKey()).toBe("acme");
  });

  it("falls back to env when nothing is stored — an app configured the old way", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "from-env";
    expect((await loadOnboarding()).platformKey()).toBe("from-env");
  });

  it("sees a write another module instance made — the server loads this file per layer", async () => {
    // Next compiles this module once per layer ([app-route] and [app-rsc]) and
    // once per function instance on the hosting, so the copy the root layout
    // renders from never hears about the route handler's write. Two imports
    // across a resetModules() are those two copies.
    const rsc = await import("../lib/onboarding");
    expect(rsc.platformKey()).toBe("");
    vi.resetModules();
    const route = await import("../lib/onboarding");
    route.writeSetup({ platform: "acme" }, "jane");
    expect(rsc.platformKey()).toBe("acme");
  });

  it("refuses the placeholder and ibl.ai's shared `main`, from either source", async () => {
    for (const value of ["your-platform", "main"]) {
      vi.resetModules();
      process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = value;
      expect((await loadOnboarding()).platformKey()).toBe("");

      vi.resetModules();
      delete process.env.NEXT_PUBLIC_MAIN_TENANT_KEY;
      const { writeSetup, platformKey } = await loadOnboarding();
      writeSetup({ platform: value }, "jane");
      expect(platformKey()).toBe("");
    }
  });
});

describe("makeSlug", () => {
  it("is the name, readable, with a uuid that makes it unique", async () => {
    const { makeSlug } = await loadOnboarding();
    const slug = makeSlug("Acme Support");
    expect(slug).toMatch(
      /^acme-support_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Two apps called the same thing must not share an apps.<slug> entry.
    expect(makeSlug("Acme Support")).not.toBe(slug);
  });

  it("flattens punctuation, case and spacing, and never trails a dash", async () => {
    const { makeSlug } = await loadOnboarding();
    expect(makeSlug("  Babatunde’s   Tutor!! ").split("_")[0]).toBe("babatunde-s-tutor");
  });

  it("still answers for a name that slugifies to nothing", async () => {
    const { makeSlug } = await loadOnboarding();
    expect(makeSlug("日本語").split("_")[0]).toBe("app");
  });

  it("caps the readable half so the key stays a sane length", async () => {
    const { makeSlug } = await loadOnboarding();
    expect(makeSlug("a".repeat(200)).split("_")[0]).toHaveLength(40);
  });
});

describe("storedSlug", () => {
  it("is what was minted, else the override, else the shared default", async () => {
    const { writeSetup, storedSlug } = await loadOnboarding();
    const { appSlug } = await loadPaywall();
    // Nothing minted: the env override this suite sets.
    expect(storedSlug()).toBe("");
    expect(appSlug()).toBe("demo-app");

    writeSetup({ slug: "acme-support_uuid" }, "jane");
    expect(storedSlug()).toBe("acme-support_uuid");
    expect(appSlug()).toBe("acme-support_uuid");
  });

  it("sees a mint another module instance made, or the browser keys apps.<slug> wrong", async () => {
    const rsc = await import("../lib/onboarding");
    expect(rsc.storedSlug()).toBe("");
    vi.resetModules();
    const route = await import("../lib/onboarding");
    route.writeSetup({ slug: "acme-support_uuid" }, "jane");
    expect(rsc.storedSlug()).toBe("acme-support_uuid");
  });

  it("keeps the platform when only the slug is written, and the other way round", async () => {
    const { writeSetup, storedSlug, platformKey } = await loadOnboarding();
    writeSetup({ platform: "acme" }, "jane");
    writeSetup({ slug: "acme_uuid" }, "jane");
    expect(platformKey()).toBe("acme");
    expect(storedSlug()).toBe("acme_uuid");
  });
});

describe("writeSetup", () => {
  it("records the answer and who gave it, and the next read sees it", async () => {
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup({ platform: "acme" }, "jane");
    expect(storedPlatform()).toBe("acme");
    // Nothing is memoised, so this reads the row that was just written.
    expect(platformKey()).toBe("acme");
  });

  it("replaces the row rather than adding one", async () => {
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup({ platform: "acme" }, "jane");
    writeSetup({ platform: "beta" }, "jane");
    expect(storedPlatform()).toBe("beta");
    expect(platformKey()).toBe("beta");
  });

  it("throws when it cannot write instead of pretending the answer was kept", async () => {
    const { writeSetup } = await loadOnboarding();
    // A file where the directory has to go: the same refusal a deployed app's
    // read-only filesystem gives, without depending on one.
    writeFileSync(join(dir, "data"), "not a directory");
    expect(() => writeSetup({ platform: "acme" }, "jane")).toThrow(/ENOTDIR|EEXIST|ENOENT|EACCES/);
  });
});

describe("resolveSetup", () => {
  it("prefers the platform's metadata over env for the agent and the name", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    process.env.NEXT_PUBLIC_APP_NAME = "Env Name";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => metadataResponse({ agent: "uuid-1", name: "Acme Support" })),
    );
    expect(await (await loadPaywall()).resolveSetup()).toEqual({
      platform: "acme",
      agent: "uuid-1",
      name: "Acme Support",
      slug: "demo-app",
    });
  });

  it("falls back to env per value when the metadata has none", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    process.env.NEXT_PUBLIC_APP_NAME = "Env Name";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => metadataResponse({ access: "free" })),
    );
    expect(await (await loadPaywall()).resolveSetup()).toEqual({
      platform: "acme",
      agent: "env-agent",
      name: "Env Name",
      slug: "demo-app",
    });
  });

  it("keeps a configured app working when the public read fails", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ error: "nope" }, { status: 500 })),
    );
    expect(await (await loadPaywall()).resolveSetup()).toMatchObject({
      platform: "acme",
      agent: "env-agent",
    });
  });

  it("re-reads the metadata rather than serving the answer from before the wizard saved", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    let saved = false;
    const fetchMock = vi.fn<typeof fetch>(async () =>
      metadataResponse(saved ? { agent: "uuid-1", name: "Acme Support" } : {}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { resolveSetup } = await loadPaywall();

    expect((await resolveSetup()).agent).toBe("");
    saved = true;
    // The wizard writes and reloads the page within the read cache's lifetime.
    expect((await resolveSetup()).agent).toBe("uuid-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers nothing at all with no platform: the wizard, not a half-configured app", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    expect(await (await loadPaywall()).resolveSetup()).toEqual({
      platform: "",
      agent: "",
      name: "",
      slug: "",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("writeAppConfig", () => {
  it("PUTs only its own keys, so the paywall choice survives the platform's deep merge", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { writeAppConfig } = await loadPaywall();

    await writeAppConfig("tok-1", { agent: "uuid-1", name: "Acme Support" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.example.edu/dm/api/core/orgs/acme/metadata/");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token tok-1");
    expect(JSON.parse(init.body as string)).toEqual({
      metadata: { apps: { "demo-app": { agent: "uuid-1", name: "Acme Support" } } },
    });
  });
});
