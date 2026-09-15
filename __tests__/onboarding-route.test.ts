import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * /api/onboarding is what the setup wizard writes through. Its contracts are
 * load-bearing: sign-in first; the platform's own refusal is the only admin
 * check there is, so it must run BEFORE anything is written; the platform is
 * answered once — a second one is refused before the platform is even asked;
 * the save mints the deploy token into iblai.env and only ever says how that
 * went, never what the key is; the agent and the name go to the platform's
 * metadata under the slug minted with the platform, or the project id on a
 * hosting that was never set up; and a place that cannot be written says so
 * instead of pretending the answer was kept.
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

const DM = "https://api.example.edu/dm";
const CONFIG_URL = `${DM}/api/core/users/platforms/config/`;
const TOKENS_URL = `${DM}/api/core/platform/api-tokens/`;

let configWrites: { headers: Record<string, string>; body: any }[] = [];
let metaWrites: { url: string; headers: Record<string, string>; body: any }[] = [];
let tokenMints: { url: string; headers: Record<string, string>; body: any }[] = [];

const load = async () => await import("../app/api/onboarding/route");

const stubFetch = ({
  member = true,
  selfJoin = () => Response.json({ platform_key: "acme" }),
  mint = () => Response.json({ key: "tok-secret" }),
  apps = {} as Record<string, unknown>,
  slug = "vibe-agent",
}: {
  member?: boolean;
  selfJoin?: () => Response;
  mint?: () => Response;
  apps?: Record<string, unknown>;
  slug?: string;
} = {}) => {
  configWrites = [];
  metaWrites = [];
  tokenMints = [];
  // The platform deep-merges a write and serves it back on the next read; the
  // route re-reads to answer, so the stub has to do the same. Keyed by whatever
  // slug the app uses — the point of these tests is that it mints its own.
  const stored: Record<string, Record<string, unknown> | null> = { [slug]: { ...apps } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (url.includes("/api/core/token/verify/"))
        return member
          ? Response.json({ user_id: 7, username: "jane", email: "jane@x.io" })
          : new Response("invalid token", { status: 401 });
      if (url === CONFIG_URL) {
        configWrites.push({ headers, body: JSON.parse(init?.body as string) });
        return selfJoin();
      }
      if (url.startsWith(TOKENS_URL)) {
        tokenMints.push({ url, headers, body: JSON.parse(init?.body as string) });
        return mint();
      }
      if (url.endsWith("/metadata/")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(init.body as string);
          metaWrites.push({ url, headers, body });
          for (const [key, patch] of Object.entries(
            body.metadata.apps as Record<string, object | null>,
          ))
            stored[key] = patch === null ? null : { ...stored[key], ...patch };
          return Response.json({ metadata: {} });
        }
        return Response.json({ platform_name: "Acme", metadata: { apps: stored } });
      }
      throw new Error(`unexpected call ${url}`);
    }),
  );
};

const file = () => join(dir, "data", "onboarding.json");

/** Read the stored answers back directly, not through the code under test. */
const storedRow = (): { platform: string; slug: string } | null =>
  existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : null;

/** iblai.env's lines, or null when nothing wrote it. */
const iblaiEnv = (): string[] | null =>
  existsSync(join(dir, "iblai.env"))
    ? readFileSync(join(dir, "iblai.env"), "utf8").split("\n")
    : null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const authed = { Authorization: "Token dm-abc" };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/onboarding", {
    method: "POST",
    headers: { ...authed, ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.edu";
  dir = mkdtempSync(join(tmpdir(), "vibe-onboarding-route-"));
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

describe("POST /api/onboarding — the platform", () => {
  it("401s without a sign-in, before touching the platform or the disk", async () => {
    stubFetch({ member: false });
    const { POST } = await load();
    expect((await POST(post({ platform: "acme" }, { Authorization: "" }))).status).toBe(401);
    expect((await POST(post({ platform: "acme" }))).status).toBe(401);
    expect(configWrites).toEqual([]);
    expect(storedRow()).toBeNull();
  });

  it("writes the identity only after the platform itself agrees the caller may", async () => {
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(200);
    // The proof: self-join on the platform being answered for, the caller's
    // own token, and it happened before the file was written.
    expect(configWrites).toEqual([
      {
        headers: expect.objectContaining({ Authorization: "Token dm-abc" }),
        body: { platform_key: "acme", allow_self_linking: true },
      },
    ]);
    expect(storedRow()?.platform).toBe("acme");
    expect(storedRow()?.slug).toMatch(UUID);
    expect(await res.json()).toMatchObject({ platform: "acme", slug: storedRow()?.slug });
  });

  it("mints the deploy token as the admin and writes iblai.env, never answering the key", async () => {
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));
    const answer = await res.json();

    const slug = storedRow()!.slug;
    expect(tokenMints).toEqual([
      {
        url: `${TOKENS_URL}?platform_key=acme`,
        headers: expect.objectContaining({ Authorization: "Token dm-abc" }),
        body: { name: `vibe-agent-${slug.slice(0, 8)}`, platform_key: "acme" },
      },
    ]);
    expect(iblaiEnv()).toEqual(
      expect.arrayContaining(["PLATFORM=acme", "TOKEN=tok-secret", "IBLAI_USERNAME=jane"]),
    );
    expect(answer.deployToken).toBe("minted");
    expect(JSON.stringify(answer)).not.toContain("tok-secret");
  });

  it("saves the platform and says so when the platform will not mint a token", async () => {
    stubFetch({ mint: () => Response.json({ detail: "no" }, { status: 403 }) });
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(200);
    expect((await res.json()).deployToken).toBe("missing");
    expect(storedRow()?.platform).toBe("acme");
    // The rest of what publishing needs is there; only the token is not.
    expect(iblaiEnv()).toEqual(expect.arrayContaining(["PLATFORM=acme", "IBLAI_USERNAME=jane"]));
    expect(iblaiEnv()?.some((line) => line.startsWith("TOKEN="))).toBe(false);
  });

  it("keeps a token already in iblai.env and does not ask for another", async () => {
    writeFileSync(join(dir, "iblai.env"), "DOMAIN=iblai.app\nTOKEN=existing\n");
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect((await res.json()).deployToken).toBe("kept");
    expect(tokenMints).toEqual([]);
    expect(iblaiEnv()).toEqual(
      expect.arrayContaining(["DOMAIN=iblai.app", "TOKEN=existing", "PLATFORM=acme"]),
    );
  });

  it("writes nothing when the platform refuses the caller", async () => {
    stubFetch({ selfJoin: () => Response.json({ error: "Permission denied" }, { status: 403 }) });
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Permission denied" });
    expect(storedRow()).toBeNull();
    expect(iblaiEnv()).toBeNull();
    expect(tokenMints).toEqual([]);
  });

  it("refuses a second platform with 409, before the platform is asked anything", async () => {
    stubFetch();
    const { POST } = await load();
    await POST(post({ platform: "acme" }));
    const before = storedRow();

    const res = await POST(post({ platform: "beta" }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("cannot be changed");
    expect(configWrites).toHaveLength(1);
    expect(tokenMints).toHaveLength(1);
    expect(storedRow()).toEqual(before);
  });

  it("takes the stored platform again as a no-op: nothing rewritten, nothing re-minted", async () => {
    stubFetch();
    const { POST } = await load();
    await POST(post({ platform: "acme" }));
    const before = storedRow();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(200);
    expect((await res.json()).deployToken).toBeUndefined();
    expect(tokenMints).toHaveLength(1);
    expect(storedRow()).toEqual(before);
  });

  it("refuses ibl.ai's shared `main`", async () => {
    stubFetch();
    const { POST } = await load();
    expect((await POST(post({ platform: "main" }))).status).toBe(400);
    expect(configWrites).toEqual([]);
  });

  it("says so when the identity cannot be written, rather than faking success", async () => {
    stubFetch();
    const { POST } = await load();
    // A file where the data directory has to go: the same refusal a read-only
    // filesystem gives.
    writeFileSync(join(dir, "data"), "not a directory");

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("Could not save the platform");
    expect(tokenMints).toEqual([]);
  });

  it("names publishing, not a raw errno, when the filesystem is read-only", async () => {
    stubFetch();
    const { POST } = await load();
    // VERCEL_ENV deliberately unset: Vercel exposes it only where the project
    // enables system environment variables, so hosted() cannot be the only
    // signal. A directory that refuses writes is the same situation.
    mkdirSync(join(dir, "data"), { recursive: true });
    chmodSync(join(dir, "data"), 0o555);

    const res = await POST(post({ platform: "acme" }));
    chmodSync(join(dir, "data"), 0o755);

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("publish it through ibl.ai hosting");
    expect(tokenMints).toEqual([]);
  });

  it("says so on a hosting that has no platform: publishing through ibl.ai is the way", async () => {
    process.env.VERCEL_ENV = "production";
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("publish it through ibl.ai hosting");
    expect(storedRow()).toBeNull();
    expect(iblaiEnv()).toBeNull();
  });
});

describe("POST /api/onboarding — the agent and the name", () => {
  it("records them under the slug minted with the platform", async () => {
    stubFetch();
    const { POST } = await load();
    await POST(post({ platform: "acme" }));
    const slug = storedRow()!.slug;

    const res = await POST(post({ agent: "uuid-1", name: "Acme Support" }));

    expect(res.status).toBe(200);
    expect(metaWrites[0].body.metadata.apps).toEqual({
      [slug]: { agent: "uuid-1", name: "Acme Support" },
    });
    expect(await res.json()).toMatchObject({ platform: "acme", agent: "uuid-1", slug });
  });

  it("heads the platform's sign-in page with the name, in the same write", async () => {
    stubFetch();
    const { POST } = await load();
    await POST(post({ platform: "acme" }));

    await POST(post({ agent: "uuid-1", name: "Caveman Coach" }));

    // The heading only — no price is decided at this step, and an omitted key
    // keeps whatever the platform has stored.
    expect(metaWrites[0].body.metadata.auth_web_mentorai).toEqual({
      title: "Caveman Coach",
      display_title_info: "Caveman Coach",
    });
  });

  it("keeps the slug through a rename: the name step writes nothing locally", async () => {
    stubFetch();
    const { POST } = await load();
    await POST(post({ platform: "acme" }));
    const before = storedRow();

    await POST(post({ agent: "uuid-1", name: "Acme Support" }));
    await POST(post({ name: "Acme Help" }));

    expect(storedRow()).toEqual(before);
    expect(metaWrites[1].body.metadata.apps).toEqual({ [before!.slug]: { name: "Acme Help" } });
  });

  it("keeps the shared default for an app set up before slugs existed, minting nothing", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
    // Its agent is already recorded under the shared default, and so are its
    // paywall choice and its Stripe product tag. Moving it is a migration.
    stubFetch({ apps: { agent: "old-uuid", name: "Old Name" } });
    const { POST } = await load();

    await POST(post({ name: "Renamed" }));

    expect(storedRow()).toBeNull();
    expect(metaWrites[0].body.metadata.apps).toEqual({ "vibe-agent": { name: "Renamed" } });
  });

  it("keys by the Vercel project id on a hosting that was never set up locally", async () => {
    // What instrumentation.ts leaves behind on a deploy-first hosting.
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_ID = "prj_x";
    process.env.IBLAI_PLATFORM_KEY = "acme";
    stubFetch({ slug: "prj_x" });
    const { POST } = await load();

    const res = await POST(post({ agent: "uuid-1", name: "Acme Support" }));

    expect(res.status).toBe(200);
    expect(metaWrites[0].body.metadata.apps).toEqual({
      prj_x: { agent: "uuid-1", name: "Acme Support" },
    });
    expect(await res.json()).toMatchObject({ platform: "acme", slug: "prj_x" });
    expect(storedRow()).toBeNull();
    // Its platform is the DM's mapping: fixed, like any other.
    expect((await POST(post({ platform: "beta" }))).status).toBe(409);
    expect((await POST(post({ platform: "acme" }))).status).toBe(200);
  });

  it("needs a platform first", async () => {
    stubFetch();
    const { POST } = await load();
    expect((await POST(post({ agent: "uuid-1" }))).status).toBe(400);
    expect(configWrites).toEqual([]);
  });
});
