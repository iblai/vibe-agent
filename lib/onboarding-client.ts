// lib/onboarding-client.ts — the browser half of the setup wizard. Every call
// goes straight to the platform on the signed-in admin's own DM token, on
// their own username path, exactly like the buyer rail in paywall-client.ts:
// this app holds no platform key, so there is nothing for a server route to
// add. The platform refuses a non-admin itself.
//
// The platforms themselves are not here: they come from the SDK's own
// `useGetUserTenantsQuery`, which the wizard calls as a hook.
// Relative import (not @/): __tests__ load this module under vitest.
import config from "./iblai/config";
import { authLoginUrl } from "./iblai/auth-utils";
import { paywallFetch, readUsername } from "./paywall-client";
import type { AppSetup } from "./paywall";

export type AgentOption = { id: string; name: string; description: string };

/**
 * The server's answers, onto window.__ENV__ — the runtime rung config.ts reads
 * before the build-time one, so what the setup wizard recorded wins over what
 * was inlined at build.
 *
 * Only non-empty values. `getEnv` coalesces with `??`, so an empty string here
 * would beat the build-time value rather than fall through to it, and an app
 * configured the old way through .env.local would go blank.
 */
export function applySetupToEnv(setup: AppSetup): void {
  if (typeof window === "undefined") return;
  const values: Record<string, string> = {
    NEXT_PUBLIC_MAIN_TENANT_KEY: setup.platform,
    NEXT_PUBLIC_DEFAULT_AGENT_ID: setup.agent,
    NEXT_PUBLIC_APP_NAME: setup.name,
    // The buyer rail keys on this too (paywall-client.ts), and it is minted
    // during setup, so it cannot come from the build.
    NEXT_PUBLIC_PAYWALL_APP_SLUG: setup.slug,
  };
  window.__ENV__ = {
    ...window.__ENV__,
    ...Object.fromEntries(Object.entries(values).filter(([, value]) => !!value)),
  };
}

type AgentRow = { unique_id: string; name?: string; description?: string };

const userBase = (platform: string, service: string) =>
  `${config.dmUrl()}/api/${service}/orgs/${encodeURIComponent(platform)}` +
  `/users/${encodeURIComponent(readUsername())}`;

/** How many agents the setup step shows at once; searching reaches the rest. */
export const AGENTS_SHOWN = 5;

/**
 * The platform's agents: a page of them, and how many there are in all.
 *
 * The endpoint paginates (12 by default, 100 at most) and searches by name and
 * description, so a platform with hundreds of agents is reached by typing, never
 * by filtering a page client-side — the way the SDK's own agent picker works.
 * {uniqueId} asks for one agent, which is how the configured one stays visible
 * when it is not in the first page.
 *
 * The API answers `{results, count}` where the docs say an array.
 */
export async function listAgents(
  platform: string,
  opts: { query?: string; limit?: number; uniqueId?: string } = {},
): Promise<{ options: AgentOption[]; count: number }> {
  const params = new URLSearchParams();
  if (opts.query) params.set("query", opts.query);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.uniqueId) params.set("unique_id", opts.uniqueId);
  const search = params.toString();
  const body = await paywallFetch<{ results?: AgentRow[]; count?: number } | AgentRow[]>(
    `${userBase(platform, "search")}/mentors/${search ? `?${search}` : ""}`,
  );
  const rows = Array.isArray(body) ? body : (body?.results ?? []);
  const options = rows
    .filter((row) => !!row?.unique_id)
    .map((row) => ({
      id: row.unique_id,
      name: row.name ?? row.unique_id,
      description: row.description ?? "",
    }));
  const count = Array.isArray(body) ? options.length : (body?.count ?? options.length);
  return { options, count };
}

/** Create an agent from the stock template; the one line becomes both its description and its prompt. */
export async function createAgent(
  platform: string,
  name: string,
  purpose: string,
): Promise<AgentOption> {
  const agent = await paywallFetch<AgentRow>(
    `${userBase(platform, "ai-mentor")}/mentor-with-settings/`,
    {
      method: "POST",
      json: {
        template_name: "ai-mentor",
        new_mentor_name: name,
        display_name: name,
        description: purpose,
        system_prompt: purpose,
      },
    },
  );
  return { id: agent.unique_id, name: agent.name ?? name, description: purpose };
}

/** Record an answer. The route proves the caller is the platform's admin. */
export const saveSetup = (patch: { platform?: string; agent?: string; name?: string }) =>
  paywallFetch<AppSetup>("/api/onboarding", { method: "POST", json: patch });

/**
 * Take this app's data off the platform it has just left. {token} is that
 * platform's own `dm_token`, kept before the new one was minted: a token is
 * minted for one platform and the DM refuses it anywhere else, so the current
 * one cannot do this. Run after the move, never before — a failure then leaves
 * the app correctly moved, with the old platform's copy still there to say so.
 */
export const releaseApp = (platform: string, token: string) =>
  paywallFetch<{ released: string }>(`/api/onboarding?platform=${encodeURIComponent(platform)}`, {
    method: "DELETE",
    headers: { Authorization: `Token ${token}` },
  });

/**
 * ibl.ai's own $0 sign-up: a public redirect that creates the account and a
 * platform with the visitor as its admin.
 *
 * It comes back through the login SPA, never straight here. The account it just
 * made has no session in this browser, so a return landing on a page of this app
 * would be an unauthenticated visitor and the providers would send them away
 * before anything could finish the sign-in. So `redirect_url` is the SPA's own
 * sign-in page with this app's URL nested inside it (`authLoginUrl`), and the
 * browser arrives here already signed in, through /sso-login-complete.
 *
 * The DM appends `platform_key`, `email`, `exists`, `stripe_checkout_id` and —
 * when edX mints one — `edx_jwt_token` to whatever `redirect_url` is, merging
 * into its query string rather than replacing it, so the nested `redirect-to`
 * survives and the SPA receives all of them: the JWT signs the account in
 * without a password, `platform_key` names the platform that was just created,
 * and the SPA hands back to /setup.
 *
 * `cancel_url` is /setup/start: someone who cancelled on Stripe is not signed in
 * either, and that is the screen they left. The DM allows localhost on any port
 * and its own subdomains (login.<domain> among them), by origin, not path; a
 * deployed origin has to be allowed on the platform first.
 */
export const createPlatformUrl = (origin: string) =>
  `${config.dmUrl()}/api/service/stripe/checkout/redirect/credits-free-plan/` +
  `?redirect_url=${encodeURIComponent(authLoginUrl(`${origin}/setup`))}` +
  `&cancel_url=${encodeURIComponent(`${origin}/setup/start`)}`;
