// lib/onboarding.ts — the app's identity: the platform it fronts and the slug
// it keys its data under in that platform's metadata (`apps.<slug>`), in a
// small JSON file at `data/onboarding.json`.
//
// Written once, locally, at the platform save. The platform is never changed
// (the route answers 409 to a second one), and the slug is minted with it as a
// uuid, so the file is a complete identity from its first write. Nothing else
// lives here: the agent, the name and the paywall choice are in the platform's
// metadata, and the deploy token is in iblai.env (lib/deploy-token.ts).
//
// The file rides the deploy zip read-only (`outputFileTracingIncludes` in
// next.config.ts carries it into the function bundle), so a published app keys
// the same `apps.<slug>` it was set up under and nothing is answered twice. On
// the hosting the platform is the DM's answer for the Vercel project
// (instrumentation.ts), which must agree with the carried file, and no write
// ever happens: an app published before it was set up has no file at all and
// keys its data by the project id (`appSlug` in lib/paywall.ts).
//
// Server only: this touches the filesystem. Never import it from a client
// component, and never from proxy.ts, which runs on every request.
// Relative imports (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import config from "./iblai/config";
import { isRealPlatform } from "./iblai/tenant";

// Literal path segments, not a helper taking a name: Turbopack traces what a
// server bundle may read, and a computed path makes it warn on every build.
const dbDir = () => join(process.cwd(), "data");
const dbFile = () => join(process.cwd(), "data", "onboarding.json");

/** What the wizard has answered. Both values are "" until it has. */
export type Setup = { platform: string; slug: string };

const NONE: Setup = { platform: "", slug: "" };

/**
 * A Vercel deployment, where the app has no file of its own to write: the
 * identity file it carries is read-only, and the platform is the DM's. `vercel
 * dev` on a laptop sets `development` and is not one.
 */
export const hosted = (): boolean =>
  ["production", "preview"].includes(process.env.VERCEL_ENV ?? "");

const real = (key: string): string => (isRealPlatform(key) ? key : "");

/**
 * The stored identity, or empties when there is no file.
 *
 * Read every time, never memoised. A Next server module is instantiated once per
 * layer — `next dev` compiles this file as both `[app-route]` and `[app-rsc]` —
 * and once per function instance on the hosting, so a memo the route handler
 * drops after a write is still stale in the copy the root layout renders from,
 * and the wizard never sees its own answer.
 *
 * Only a missing file means "nobody has answered". A half-written or hand-edited
 * one throws: loud, and the fix is deleting it.
 */
export function readRow(): Setup {
  let text: string;
  try {
    text = readFileSync(dbFile(), "utf8");
  } catch (e) {
    // No file, or no data/ directory at all (a file in its place counts too).
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return NONE;
    throw e;
  }
  const row = JSON.parse(text) as Partial<Record<keyof Setup, unknown>>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { platform: str(row.platform), slug: str(row.slug) };
}

/**
 * The one local write: the platform and, minted with it, the slug — a uuid,
 * unique per install, so two apps on one platform never share an `apps.<slug>`
 * entry or a Stripe product tag. Once and never again: the platform is fixed,
 * and regenerating the slug would orphan the metadata entry and the product.
 *
 * Throws on the hosting, on a second platform (the route answers 409 before it
 * gets here) and on a filesystem that cannot be written — the route says so
 * rather than pretending the answer was kept.
 */
export function writeSetup(platform: string, by: string): Setup {
  if (hosted()) throw new Error("no local store on the hosting");
  if (readRow().platform) throw new Error("platform already set");
  mkdirSync(dbDir(), { recursive: true });
  const row = {
    platform,
    slug: crypto.randomUUID(),
    updated_at: new Date().toISOString(),
    updated_by: by,
  };
  // Written whole, then renamed into place: a crash mid-write leaves no
  // half-file for the next read to choke on.
  const tmp = `${dbFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(row, null, 2)}\n`);
  renameSync(tmp, dbFile());
  return { platform: row.platform, slug: row.slug };
}

/**
 * The app's platform. On the hosting, what the DM answered for this Vercel
 * project (instrumentation.ts leaves it in process.env, which every layer of a
 * Next server shares); else the identity file; else `NEXT_PUBLIC_MAIN_TENANT_KEY`,
 * so an app configured the old way, or by a self-hoster, keeps working. Each
 * rung has to name a real platform: placeholders and ibl.ai's shared `main`
 * never count. "" means nobody has answered yet: the wizard.
 */
export function platformKey(): string {
  return (
    real(process.env.IBLAI_PLATFORM_KEY ?? "") ||
    real(readRow().platform) ||
    real(config.mainTenantKey())
  );
}

/** The slug the identity file holds, or "" — see `appSlug` in lib/paywall.ts for the ladder. */
export const storedSlug = (): string => readRow().slug;
