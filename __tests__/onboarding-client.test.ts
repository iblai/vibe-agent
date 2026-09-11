import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The browser half of the setup wizard. These tests pin: the runtime env the
 * providers hand the browser never blanks a value that was set at build time;
 * the agent calls go to the platform on the admin's own path with their own
 * token, with no platform key anywhere; and ibl.ai's sign-up returns through
 * the login SPA with this app's URL nested inside its redirect — the one thing
 * here nobody can eyeball.
 */

const ENV: Record<string, string> = {
  NEXT_PUBLIC_API_BASE_URL: "https://api.example.edu",
  NEXT_PUBLIC_AUTH_URL: "https://login.example.edu",
  NEXT_PUBLIC_MAIN_TENANT_KEY: "testorg",
  NEXT_PUBLIC_PAYWALL_APP_SLUG: "demo-app",
};
const savedEnv: Record<string, string | undefined> = {};

const DM = "https://api.example.edu/dm";

let calls: { url: string; init?: RequestInit }[] = [];

const stubFetch = (answer: unknown) => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: input instanceof Request ? input.url : String(input), init });
      return Response.json(answer);
    }),
  );
};

const load = async () => import("../lib/onboarding-client");

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
  const store = new Map<string, string>([
    ["dm_token", "dm-abc"],
    ["userData", JSON.stringify({ user_nicename: "jane" })],
  ]);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(ENV)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("applySetupToEnv", () => {
  it("never writes an empty value: config coalesces with ??, so it would shadow the build-time one", async () => {
    const { applySetupToEnv } = await load();
    applySetupToEnv({ platform: "acme", agent: "", name: "", slug: "" });
    expect(window.__ENV__).toEqual({ NEXT_PUBLIC_MAIN_TENANT_KEY: "acme" });
  });

  it("writes what it has, over anything already there", async () => {
    window.__ENV__ = { NEXT_PUBLIC_APP_NAME: "Old", NEXT_PUBLIC_SHOW_ABOUT: "true" };
    const { applySetupToEnv } = await load();
    applySetupToEnv({ platform: "acme", agent: "uuid-1", name: "New", slug: "new_uuid" });
    expect(window.__ENV__).toEqual({
      NEXT_PUBLIC_SHOW_ABOUT: "true",
      NEXT_PUBLIC_MAIN_TENANT_KEY: "acme",
      NEXT_PUBLIC_DEFAULT_AGENT_ID: "uuid-1",
      NEXT_PUBLIC_APP_NAME: "New",
      // The buyer rail keys on the minted slug, so it has to reach the browser.
      NEXT_PUBLIC_PAYWALL_APP_SLUG: "new_uuid",
    });
  });
});

describe("agents", () => {
  it("lists on the admin's own path with their own token, tolerating either answer shape", async () => {
    stubFetch({
      results: [{ unique_id: "a1", name: "Coach", description: "Helps" }, {}],
      count: 37,
    });
    const { listAgents } = await load();

    expect(await listAgents("acme")).toEqual({
      options: [{ id: "a1", name: "Coach", description: "Helps" }],
      count: 37,
    });
    expect(calls[0].url).toBe(`${DM}/api/search/orgs/acme/users/jane/mentors/`);
    expect((calls[0].init?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      "Token dm-abc",
    );
  });

  it("searches and pages on the platform, because the endpoint pages at 12 by default", async () => {
    stubFetch({ results: [], count: 0 });
    const { listAgents, AGENTS_SHOWN } = await load();

    await listAgents("acme", { query: "sales coach", limit: AGENTS_SHOWN });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe(`${DM}/api/search/orgs/acme/users/jane/mentors/`);
    expect(url.searchParams.get("query")).toBe("sales coach");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("asks for one agent by id, which is how the configured one stays in view", async () => {
    stubFetch({ results: [{ unique_id: "a9", name: "Current" }] });
    const { listAgents } = await load();

    const { options, count } = await listAgents("acme", { uniqueId: "a9" });
    expect(options).toEqual([{ id: "a9", name: "Current", description: "" }]);
    // No count in the answer: what came back is what there is.
    expect(count).toBe(1);
    expect(new URL(calls[0].url).searchParams.get("unique_id")).toBe("a9");
  });

  it("creates from the stock template, the one line serving as description and prompt", async () => {
    stubFetch({ unique_id: "a2", name: "Acme Support" });
    const { createAgent } = await load();

    expect(await createAgent("acme", "Acme Support", "Answers order questions")).toEqual({
      id: "a2",
      name: "Acme Support",
      description: "Answers order questions",
    });
    expect(calls[0].url).toBe(`${DM}/api/ai-mentor/orgs/acme/users/jane/mentor-with-settings/`);
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      template_name: "ai-mentor",
      new_mentor_name: "Acme Support",
      display_name: "Acme Support",
      description: "Answers order questions",
      system_prompt: "Answers order questions",
    });
  });
});

describe("createPlatformUrl", () => {
  it("comes back through the login SPA, with this app nested inside its redirect", async () => {
    const { createPlatformUrl } = await load();
    const url = new URL(createPlatformUrl("https://app.test"));
    expect(url.origin + url.pathname).toBe(
      `${DM}/api/service/stripe/checkout/redirect/credits-free-plan/`,
    );

    // Never straight back to a page of this app: the account the sign-up just
    // made has no session here, so the SPA signs it in first.
    const back = new URL(url.searchParams.get("redirect_url")!);
    expect(back.origin + back.pathname).toBe("https://login.example.edu/login");
    // One round trip through URL proves the nesting survives the encoding —
    // the DM merges its own parameters into this query string.
    expect(back.searchParams.get("redirect-to")).toBe("https://app.test/setup");

    // Cancelled on Stripe: still signed out, so back to the screen they left.
    expect(url.searchParams.get("cancel_url")).toBe("https://app.test/setup/start");
  });
});
