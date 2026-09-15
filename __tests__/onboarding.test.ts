import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where the app's identity lives. These tests pin: the platform comes from the
 * hosting's answer first, the identity file second and env last, so a hosted
 * app, a local one and a self-hoster all keep working; the slug is minted with
 * the platform, once, and an explicit env slug beats it while a Vercel project
 * id is only the fallback; placeholders and ibl.ai's shared `main` never count;
 * a write is visible to the very next read, from any module instance; a
 * filesystem that cannot be written says so; nothing is ever written on the
 * hosting, where a carried file is read and a broken one throws; and the agent
 * and the name come off the platform's metadata over env, with a failed public
 * read falling back to env instead of blanking a working app. The metadata
 * write names only its own two keys, so the paywall choice beside it survives
 * the deep merge.
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
  "IBLAI_PLATFORM_KEY",
  "VERCEL_PROJECT_ID",
  "VERCEL_ENV",
] as const;

const saved: Record<string, string | undefined> = {};
let dir = "";

// Both modules keep caches at module scope: arrange env, then import fresh.
const loadOnboarding = async () => await import("../lib/onboarding");
const loadPaywall = async () => await import("../lib/paywall");

const metadataResponse = (app: Record<string, unknown>) =>
  Response.json({ platform_name: "Acme", metadata: { apps: { "demo-app": app } } });

const file = () => join(dir, "data", "onboarding.json");

/** Read the file back the way anything else would, not through the module under test. */
const storedRow = (): Record<string, string> | null =>
  existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  it("is empty with no file at all — a fresh clone, which is the wizard", async () => {
    expect((await loadOnboarding()).platformKey()).toBe("");
  });

  it("takes the stored answer over env", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "from-env";
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup("acme", "jane");
    expect(platformKey()).toBe("acme");
  });

  it("falls back to env when nothing is stored — an app configured the old way", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "from-env";
    expect((await loadOnboarding()).platformKey()).toBe("from-env");
  });

  it("takes the hosting's answer over env — the DM's mapping is the truth there", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "from-env";
    process.env.IBLAI_PLATFORM_KEY = "hosted";
    expect((await loadOnboarding()).platformKey()).toBe("hosted");
  });

  it("accepts a carried identity that agrees with the hosting", async () => {
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup("acme", "jane");
    process.env.IBLAI_PLATFORM_KEY = "acme";
    expect(platformKey()).toBe("acme");
  });

  it("refuses to answer when the carried identity and the hosting disagree", async () => {
    // Set up for one platform, published under another: serving the wrong
    // platform's data quietly is worse than 500ing every request.
    const { writeSetup, platformKey } = await loadOnboarding();
    writeSetup("acme", "jane");
    process.env.IBLAI_PLATFORM_KEY = "beta";
    expect(() => platformKey()).toThrow(/set up for platform "acme" but hosted under "beta"/);
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
    route.writeSetup("acme", "jane");
    expect(rsc.platformKey()).toBe("acme");
  });

  it("refuses the placeholder and ibl.ai's shared `main`, from any source", async () => {
    for (const value of ["your-platform", "main"]) {
      vi.resetModules();
      process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = value;
      expect((await loadOnboarding()).platformKey()).toBe("");

      vi.resetModules();
      delete process.env.NEXT_PUBLIC_MAIN_TENANT_KEY;
      process.env.IBLAI_PLATFORM_KEY = value;
      expect((await loadOnboarding()).platformKey()).toBe("");

      vi.resetModules();
      delete process.env.IBLAI_PLATFORM_KEY;
      mkdirSync(join(dir, "data"), { recursive: true });
      writeFileSync(file(), JSON.stringify({ platform: value, slug: "s" }));
      expect((await loadOnboarding()).platformKey()).toBe("");
    }
  });
});

describe("writeSetup", () => {
  it("records the platform and, minted with it, a uuid slug, and the next read sees both", async () => {
    const { writeSetup, platformKey, storedSlug } = await loadOnboarding();
    const row = writeSetup("acme", "jane");
    expect(row.platform).toBe("acme");
    expect(row.slug).toMatch(UUID);
    expect(storedRow()).toMatchObject({ platform: "acme", slug: row.slug, updated_by: "jane" });
    expect(storedRow()?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Nothing is memoised, so these read the file that was just written.
    expect(platformKey()).toBe("acme");
    expect(storedSlug()).toBe(row.slug);
  });

  it("is once: a second platform throws and changes nothing", async () => {
    const { writeSetup } = await loadOnboarding();
    const { slug } = writeSetup("acme", "jane");
    expect(() => writeSetup("beta", "jane")).toThrow(/already set/);
    expect(storedRow()).toMatchObject({ platform: "acme", slug });
  });

  it("throws when it cannot write instead of pretending the answer was kept", async () => {
    const { writeSetup } = await loadOnboarding();
    // A file where the directory has to go: the same refusal a read-only
    // filesystem gives, without depending on one.
    writeFileSync(join(dir, "data"), "not a directory");
    expect(() => writeSetup("acme", "jane")).toThrow(/ENOTDIR|EEXIST|ENOENT|EACCES/);
  });

  it("never writes on the hosting, where the identity file is only carried", async () => {
    const { writeSetup } = await loadOnboarding();
    for (const env of ["production", "preview"]) {
      process.env.VERCEL_ENV = env;
      expect(() => writeSetup("acme", "jane")).toThrow(/hosting/);
      expect(storedRow()).toBeNull();
    }
    // `vercel dev` on a laptop is not the hosting.
    process.env.VERCEL_ENV = "development";
    writeSetup("acme", "jane");
    expect(storedRow()?.platform).toBe("acme");
  });
});

describe("readRow", () => {
  it("reads a carried file on the hosting", async () => {
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(file(), JSON.stringify({ platform: "acme", slug: "carried" }));
    process.env.VERCEL_ENV = "production";
    expect((await loadOnboarding()).readRow()).toEqual({ platform: "acme", slug: "carried" });
  });

  it("throws on a broken file rather than reading it as unanswered", async () => {
    mkdirSync(join(dir, "data"), { recursive: true });
    writeFileSync(file(), "{");
    const { readRow } = await loadOnboarding();
    expect(() => readRow()).toThrow(/JSON/);
  });
});

describe("appSlug", () => {
  it("is the explicit env slug, else the minted one, else the Vercel project id, else the shared default", async () => {
    const { writeSetup } = await loadOnboarding();
    const { appSlug } = await loadPaywall();
    const { slug } = writeSetup("acme", "jane");
    // Explicit wins, even over a minted one.
    expect(appSlug()).toBe("demo-app");

    delete process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG;
    vi.resetModules();
    expect((await loadPaywall()).appSlug()).toBe(slug);

    // An app published before it was set up: no file, only its project id.
    dir = mkdtempSync(join(tmpdir(), "vibe-onboarding-hosted-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    process.env.VERCEL_PROJECT_ID = "prj_x";
    expect((await loadPaywall()).appSlug()).toBe("prj_x");

    delete process.env.VERCEL_PROJECT_ID;
    expect((await loadPaywall()).appSlug()).toBe("vibe-agent");
  });

  it("sees a mint another module instance made, or the browser keys apps.<slug> wrong", async () => {
    const rsc = await import("../lib/onboarding");
    expect(rsc.storedSlug()).toBe("");
    vi.resetModules();
    const route = await import("../lib/onboarding");
    const { slug } = route.writeSetup("acme", "jane");
    expect(rsc.storedSlug()).toBe(slug);
  });
});

describe("resolveSetup", () => {
  it("prefers the platform's metadata over env for the agent and the name", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    process.env.NEXT_PUBLIC_APP_NAME = "Env Name";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        metadataResponse({ agent: "uuid-1", name: "Acme Support", access: "free", stripe: {} }),
      ),
    );
    expect(await (await loadPaywall()).resolveSetup()).toEqual({
      platform: "acme",
      agent: "uuid-1",
      name: "Acme Support",
      slug: "demo-app",
      ready: true,
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
      ready: true,
    });
  });

  it("is not ready while the price question is unanswered: the wizard is still running", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    vi.stubGlobal(
      "fetch",
      // The agent step has written, the access step has not: no `access`, so
      // `info` is null.
      vi.fn<typeof fetch>(async () => metadataResponse({ agent: "uuid-1", name: "Acme Support" })),
    );
    expect((await (await loadPaywall()).resolveSetup()).ready).toBe(false);
  });

  it("stays ready when the public read fails, so a DM hiccup never hides a live app", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json({ error: "nope" }, { status: 500 })),
    );
    expect((await (await loadPaywall()).resolveSetup()).ready).toBe(true);
  });

  it("stays ready for an app configured the old way: nothing of ours stored, an agent in env", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID = "env-agent";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => metadataResponse({})),
    );
    expect((await (await loadPaywall()).resolveSetup()).ready).toBe(true);
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
      ready: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("writeAppConfig", () => {
  /** The read it makes first, then the PUT. */
  const readThenWrite = () =>
    vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT" ? Response.json({ ok: true }) : metadataResponse({}),
    );

  const putBody = (mock: ReturnType<typeof readThenWrite>) => {
    const [, init] = mock.mock.calls.find(([, i]) => i?.method === "PUT") as [string, RequestInit];
    return JSON.parse(init.body as string);
  };

  it("PUTs only its own keys, so the paywall choice survives the platform's deep merge", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    const fetchMock = readThenWrite();
    vi.stubGlobal("fetch", fetchMock);
    const { writeAppConfig } = await loadPaywall();

    await writeAppConfig("tok-1", { agent: "uuid-1", name: "Acme Support" });

    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT") as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe("https://api.example.edu/dm/api/core/orgs/acme/metadata/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Token tok-1");
    expect(putBody(fetchMock).metadata.apps).toEqual({
      "demo-app": { agent: "uuid-1", name: "Acme Support" },
    });
  });

  it("heads the platform's sign-in page with the app's name, so a rename reaches it at once", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    const fetchMock = readThenWrite();
    vi.stubGlobal("fetch", fetchMock);
    const { writeAppConfig } = await loadPaywall();

    await writeAppConfig("tok-1", { agent: "uuid-1", name: "Caveman Coach" });

    // The heading, and no price: none has been decided at the agent step, and an
    // omitted key keeps whatever the platform has stored.
    expect(putBody(fetchMock).metadata.auth_web_mentorai).toEqual({
      title: "Caveman Coach",
      display_title_info: "Caveman Coach",
    });
  });

  it("leaves a heading the platform already has, even on a rename", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "acme";
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? Response.json({ ok: true })
        : Response.json({
            platform_name: "Acme",
            metadata: {
              apps: { "demo-app": {} },
              auth_web_mentorai: { title: "Search Craft", display_title_info: "Search Craft" },
            },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { writeAppConfig } = await loadPaywall();

    await writeAppConfig("tok-1", { name: "Caveman Coach" });

    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string).metadata.auth_web_mentorai).toEqual({});
  });
});
