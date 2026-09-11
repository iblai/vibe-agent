import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * /api/onboarding is what the setup wizard writes through. Its contracts are
 * load-bearing: sign-in first; the platform's own refusal is the only admin
 * check there is, so it must run BEFORE anything is written; an app already
 * set up for one platform never silently moves to another; and a filesystem
 * that cannot be written says so instead of pretending the answer was kept.
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

const DM = "https://api.example.edu/dm";
const CONFIG_URL = `${DM}/api/core/users/platforms/config/`;

let configWrites: { headers: Record<string, string>; body: any }[] = [];
let metaWrites: { url: string; headers: Record<string, string>; body: any }[] = [];

const load = async () => await import("../app/api/onboarding/route");

const stubFetch = ({
  member = true,
  selfJoin = () => Response.json({ platform_key: "acme" }),
  apps = {} as Record<string, unknown>,
  branding = undefined as Record<string, unknown> | undefined,
}: {
  member?: boolean;
  selfJoin?: () => Response;
  apps?: Record<string, unknown>;
  branding?: Record<string, unknown>;
} = {}) => {
  configWrites = [];
  metaWrites = [];
  // The platform deep-merges a write and serves it back on the next read; the
  // route re-reads to answer, so the stub has to do the same. Keyed by whatever
  // slug the app uses — the point of these tests is that it mints its own.
  const stored: Record<string, Record<string, unknown> | null> = { "demo-app": { ...apps } };
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
      if (url.endsWith("/metadata/")) {
        if (init?.method === "PUT") {
          const body = JSON.parse(init.body as string);
          metaWrites.push({ url, headers, body });
          for (const [slug, patch] of Object.entries(
            body.metadata.apps as Record<string, object | null>,
          ))
            // null is how the platform deletes: it replaces rather than merges.
            stored[slug] = patch === null ? null : { ...stored[slug], ...patch };
          return Response.json({ metadata: {} });
        }
        return Response.json({
          platform_name: "Acme",
          metadata: { apps: stored, ...(branding && { auth_web_mentorai: branding }) },
        });
      }
      throw new Error(`unexpected call ${url}`);
    }),
  );
};

/** Read the stored answers back directly, not through the code under test. */
const storedRow = (): { platform: string; slug: string } | null => {
  if (!existsSync(join(dir, "data", "onboarding.db"))) return null;
  const db = new DatabaseSync(join(dir, "data", "onboarding.db"), { readOnly: true });
  try {
    const row = db.prepare("select platform, slug from setup where id = 1").get() as
      | { platform: string; slug: string }
      | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
};

const storedPlatform = () => storedRow()?.platform ?? null;
const storedSlug = () => storedRow()?.slug ?? null;

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
  process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG = "demo-app";
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

describe("POST /api/onboarding", () => {
  it("401s without a sign-in, before touching the platform or the disk", async () => {
    stubFetch({ member: false });
    const { POST } = await load();
    expect((await POST(post({ platform: "acme" }, { Authorization: "" }))).status).toBe(401);
    expect((await POST(post({ platform: "acme" }))).status).toBe(401);
    expect(configWrites).toEqual([]);
  });

  it("writes the platform only after the platform itself agrees the caller may", async () => {
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
    expect(storedPlatform()).toBe("acme");
  });

  it("writes nothing when the platform refuses the caller", async () => {
    stubFetch({ selfJoin: () => Response.json({ error: "Permission denied" }, { status: 403 }) });
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Permission denied" });
    expect(existsSync(join(dir, "data", "onboarding.db"))).toBe(false);
  });

  it("moves an app to another platform, keeping the slug that names its data", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(200);
    expect(storedPlatform()).toBe("acme");
    // The new platform's admin check still runs before the write.
    expect(configWrites[0].body).toEqual({ platform_key: "acme", allow_self_linking: true });
    // The slug is what names the entry being released on the platform it left.
    expect(storedSlug()).toBe("");
    // The old platform is cleared by the browser, on that platform's own token:
    // this call cannot do it, and must not try.
    expect(metaWrites).toEqual([]);
  });

  it("refuses ibl.ai's shared `main`", async () => {
    stubFetch();
    const { POST } = await load();
    expect((await POST(post({ platform: "main" }))).status).toBe(400);
    expect(configWrites).toEqual([]);
  });

  it("mints the app's own slug from its name and records the agent under it", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ agent: "uuid-1", name: "Acme Support" }));

    expect(res.status).toBe(200);
    const slug = storedSlug()!;
    expect(slug).toMatch(/^acme-support_[0-9a-f-]{36}$/);
    // Not the shared default: two apps on one platform must not collide.
    expect(slug).not.toBe("demo-app");
    expect(metaWrites[0].body).toEqual({
      metadata: { apps: { [slug]: { agent: "uuid-1", name: "Acme Support" } } },
    });
    expect(await res.json()).toMatchObject({ platform: "testorg", agent: "uuid-1", slug });
  });

  it("keeps the slug through a rename — regenerating would orphan the paywall choice", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
    stubFetch();
    const { POST } = await load();

    await POST(post({ agent: "uuid-1", name: "Acme Support" }));
    const minted = storedSlug()!;
    await POST(post({ name: "Acme Help" }));

    expect(storedSlug()).toBe(minted);
    expect(metaWrites[1].body).toEqual({ metadata: { apps: { [minted]: { name: "Acme Help" } } } });
  });

  it("never mints one for an app that was set up before slugs existed", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "testorg";
    // Its agent is already recorded under the shared default, and so are its
    // paywall choice and its Stripe product tag. Moving it is a migration.
    stubFetch({ apps: { agent: "old-uuid", name: "Old Name" } });
    const { POST } = await load();

    await POST(post({ name: "Renamed" }));

    expect(storedSlug()).toBeNull();
    expect(metaWrites[0].body).toEqual({ metadata: { apps: { "demo-app": { name: "Renamed" } } } });
  });

  it("says so when the deployment cannot be written to, rather than faking success", async () => {
    stubFetch();
    const { POST } = await load();
    // A file where the database directory has to go: the same refusal a
    // deployed app's read-only filesystem gives.
    writeFileSync(join(dir, "data"), "not a directory");

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("publish again");
  });

  it("saves on a fresh clone, with no env file and so no NEXT_PUBLIC_PAYWALL_APP_SLUG", async () => {
    // The path the wizard actually runs on, and the one that shipped broken:
    // nothing has written an env file yet, so the slug can only come from a
    // code default. Without it every admin route 500s before doing anything.
    delete process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG;
    stubFetch();
    const { POST } = await load();

    const res = await POST(post({ platform: "acme" }));

    expect(res.status).toBe(200);
    expect(storedPlatform()).toBe("acme");
  });
});

/**
 * Releasing the platform the app has just left. The caller's token has to be
 * that platform's own — a token is minted for one platform and refused on any
 * other path — so the browser keeps it before minting the new one, and the
 * platform's own refusal is again the only admin check there is.
 */
describe("DELETE /api/onboarding", () => {
  const del = (query: string, headers: Record<string, string> = {}) =>
    new NextRequest(`http://localhost:3000/api/onboarding${query}`, {
      method: "DELETE",
      headers: { ...authed, ...headers },
    });

  it("empties the app's entry on the platform named, not the one now stored", async () => {
    process.env.NEXT_PUBLIC_MAIN_TENANT_KEY = "newplatform";
    stubFetch({ apps: { agent: "uuid-1", name: "Acme Support", access: "monthly" } });
    const { DELETE } = await load();

    const res = await DELETE(del("?platform=oldplatform"));

    expect(res.status).toBe(200);
    const write = metaWrites[0];
    expect(write.url).toBe(`${DM}/api/core/orgs/oldplatform/metadata/`);
    expect(write.headers.Authorization).toBe("Token dm-abc");
    // null, not {}: the platform's write merges dicts and replaces anything
    // else, and it cannot delete a key at all.
    expect(write.body.metadata.apps).toEqual({ "demo-app": null });
  });

  it("takes back the price it appended to the sign-in copy, keeping the platform's own words", async () => {
    stubFetch({
      branding: {
        title: "Acme",
        display_title_info: "Acme",
        display_description_info: "Learn faster · $29/month",
      },
    });
    const { DELETE } = await load();

    await DELETE(del("?platform=oldplatform"));

    expect(metaWrites[0].body.metadata.auth_web_mentorai).toEqual({
      display_description_info: "Learn faster",
    });
  });

  it("refuses without a platform to release, and without a sign-in", async () => {
    stubFetch();
    const { DELETE } = await load();

    expect((await DELETE(del(""))).status).toBe(400);
    expect(metaWrites).toEqual([]);

    const anonymous = new NextRequest("http://localhost:3000/api/onboarding?platform=old", {
      method: "DELETE",
    });
    expect((await DELETE(anonymous)).status).toBe(401);
  });
});
