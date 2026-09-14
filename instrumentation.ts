// instrumentation.ts — Next's once-per-server-instance hook, awaited before
// any request is served. On the hosting it is how the app learns which
// platform it fronts: it asks the DM which platform deployed this Vercel
// project and leaves the answer in process.env, which every layer of a Next
// server shares (a module variable would not — each layer gets its own copy).
//
// Loud on purpose: an unreachable DM, or a carried identity file that names a
// different platform than the DM does, throws, and this instance serves
// nothing until a healthy cold start. No retry loop — the next cold start is
// the retry.
import config from "./lib/iblai/config";
import { readRow } from "./lib/onboarding";

export async function register(): Promise<void> {
  // Only the Node runtime needs a platform; the edge proxy sets CSP and 404s.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Not on Vercel: data/onboarding.json is the store, nothing to ask.
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) return;
  const res = await fetch(
    `${config.dmUrl()}/api/ai-mentor/providers/vercel/hosting/projects/${encodeURIComponent(id)}/`,
  );
  // On Vercel, but not through ibl.ai hosting: the env fallback is the way.
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`platform lookup for ${id} answered ${res.status}`);
  const { platform_key: platform } = (await res.json()) as { platform_key: string };
  const carried = readRow().platform;
  if (carried && carried !== platform)
    throw new Error(
      `set up for platform "${carried}" but hosted under "${platform}": ` +
        `publish again with a token made on ${carried}, or set up again for ${platform}`,
    );
  process.env.IBLAI_PLATFORM_KEY = platform;
}
