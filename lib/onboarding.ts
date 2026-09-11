// lib/onboarding.ts — what the setup wizard cannot keep in the platform's
// metadata, in a small SQLite database at `data/onboarding.db`: the platform
// key, because reading that metadata needs it, and this app's own slug, because
// the slug is the key it would be read under.
//
// No env file is written or required. The database rides the deploy zip (the
// deploy skill excludes by an explicit list, not .gitignore, and
// `outputFileTracingIncludes` in next.config.ts puts it in the function
// bundle), so a published app comes up configured and reads it read-only —
// which is also why a published app's platform is fixed at publish. To move
// one, set it up locally again and publish.
//
// The agent and the app's name have no such problem and live in the platform's
// metadata beside the paywall choice (`resolveSetup` in lib/paywall.ts).
//
// Server only: this touches the filesystem. Never import it from a client
// component, and never from proxy.ts, which runs on every request.
// Relative imports (not @/): __tests__ load this module under vitest, which
// resolves no path alias.
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import config from "./iblai/config";
import { isRealPlatform } from "./iblai/tenant";

// Literal path segments, not a helper taking a name: Turbopack traces what a
// server bundle may read, and a computed path makes it warn on every build.
const dbDir = () => join(process.cwd(), "data");
const dbFile = () => join(process.cwd(), "data", "onboarding.db");

// ponytail: one row, last write wins, no concurrency story. One admin answers
// this once; a deployed app cannot write it at all.
const TABLE = `create table if not exists setup (
  id integer primary key check (id = 1),
  platform text not null default '',
  slug text not null default '',
  updated_at text not null default '',
  updated_by text not null default ''
)`;

/** What the wizard has answered so far. Both values are "" until it has. */
type Setup = { platform: string; slug: string };

/**
 * The stored row, or empties when there is no database, no table and no row.
 *
 * Read every time, never memoised. A Next server module is instantiated once per
 * layer — `next dev` compiles this file as both `[app-route]` and `[app-rsc]` —
 * and once per function instance on the hosting, so a memo the route handler
 * drops after a write is still stale in the copy the root layout renders from,
 * and the wizard never sees its own answer.
 *
 * ponytail: 55 µs a read (10k reads of the real database = 555 ms), against
 * requests that spend tens of milliseconds on DM calls. Key a memo on the file's
 * mtimeMs if that ever stops being true — that one is correct across layers and
 * processes.
 */
function readRow(): Setup {
  const none = { platform: "", slug: "" };
  if (!existsSync(dbFile())) return none;
  let db: DatabaseSync | undefined;
  try {
    // Read-only: a deployed app's filesystem is read-only, and opening for
    // writing there would fail on the journal rather than on the read.
    db = new DatabaseSync(dbFile(), { readOnly: true });
    const row = db.prepare("select platform, slug from setup where id = 1").get() as
      | { platform?: string; slug?: string }
      | undefined;
    return { platform: row?.platform ?? "", slug: row?.slug ?? "" };
  } catch {
    // A database without the table yet, or one we cannot open: env is the answer.
    return none;
  } finally {
    db?.close();
  }
}

/**
 * The app's platform. The database first — that is the setup wizard's answer —
 * then `NEXT_PUBLIC_MAIN_TENANT_KEY`, so an app configured the old way, or by a
 * self-hoster, keeps working. "" means nobody has answered yet: the wizard.
 */
export function platformKey(): string {
  const stored = readRow().platform;
  const key = isRealPlatform(stored) ? stored : config.mainTenantKey();
  return isRealPlatform(key) ? key : "";
}

/**
 * What this app is called on the platform: it keys apps.<slug> in the platform's
 * public metadata and tags the Stripe product. Minted from the app's name on the
 * first setup and never again — see makeSlug. Anything set up before this app
 * minted its own has none stored and keeps the shared default, which is exactly
 * where its metadata and its Stripe product already are.
 */
export const storedSlug = (): string => readRow().slug;

/**
 * A slug of the app's name with a uuid on the end, unique per install so two
 * apps on one platform never share an apps.<slug> entry or a Stripe product tag.
 * The readable half is only so a person reading the platform's metadata can tell
 * them apart; the uuid is what makes it unique.
 */
export function makeSlug(name: string): string {
  const readable =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)
      .replace(/^-+|-+$/g, "") || "app";
  return `${readable}_${crypto.randomUUID()}`;
}

/**
 * Record an answer, creating `data/` and the database on first use. Throws on a
 * read-only filesystem (a deployed app) — the route says so rather than
 * pretending the answer was kept.
 */
export function writeSetup(patch: { platform?: string; slug?: string }, by: string): void {
  mkdirSync(dbDir(), { recursive: true });
  const db = new DatabaseSync(dbFile());
  try {
    // DELETE is SQLite's default, and this keeps it that way on purpose: WAL
    // would leave -wal and -shm files beside the database, which would ride the
    // deploy zip and then be unwritable on the hosting filesystem.
    db.exec("pragma journal_mode = delete");
    db.exec(TABLE);
    // A database written before the slug existed. Adding a column that is
    // already there is the only way this throws.
    try {
      db.exec("alter table setup add column slug text not null default ''");
    } catch {
      /* already has it */
    }
    db.prepare(
      `insert into setup (id, platform, slug, updated_at, updated_by) values (1, ?, ?, ?, ?)
       on conflict(id) do update set
         platform = coalesce(nullif(excluded.platform, ''), setup.platform),
         slug = coalesce(nullif(excluded.slug, ''), setup.slug),
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).run(patch.platform ?? "", patch.slug ?? "", new Date().toISOString(), by);
  } finally {
    db.close();
  }
}
