// instrumentation.ts — Next's once-per-server-instance hook, awaited before
// any request is served. On the hosting it is how the app learns which
// platform it fronts: it asks the DM which platform deployed this Vercel
// project and leaves the answer in process.env, which every layer of a Next
// server shares (a module variable would not — each layer gets its own copy).
//
// Nothing here touches the filesystem, and nothing it imports may either: Next
// compiles this file for the edge runtime as well as for node, so a node:fs
// anywhere in its import graph fails the build (node-module-in-edge-runtime),
// and deferring that import to a lazy chunk only moves the problem into dev.
// The identity file is compared against this answer where it is already read,
// in platformKey() — see lib/onboarding.ts.
//
// Loud on purpose: an unreachable DM throws, and this instance serves nothing
// until a healthy cold start. No retry loop — the next cold start is the retry.
import config from "./lib/iblai/config";

export async function register(): Promise<void> {
  // Only the Node runtime needs a platform; the edge proxy sets CSP and 404s.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Not on Vercel: data/onboarding.json is the store, nothing to ask.
  const id = process.env.VERCEL_PROJECT_ID;
  if (!id) return;
  const res = await fetch(
    `${config.dmUrl()}/api/ai-mentor/providers/vercel/hosting/projects/${encodeURIComponent(id)}/`,
  );
  // On Vercel, but not through ibl.ai hosting — or a DM too old to answer it:
  // the carried identity file, then env, is the way.
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`platform lookup for ${id} answered ${res.status}`);
  const { platform_key: platform } = (await res.json()) as { platform_key: string };
  process.env.IBLAI_PLATFORM_KEY = platform;
}
