// lib/deploy-token.ts — the Platform API Token the deploy skill publishes
// with, minted once at the local platform save with the admin's own DM token,
// so nobody has to make one by hand in the OS.
//
// It lives in iblai.env, the vibe CLI's file: the deploy skill reads PLATFORM,
// TOKEN and IBLAI_USERNAME from it, and both the skill and the DM strip it from
// every deploy zip, so a published app never has one. This module writes the
// file and never reads the token back; the key goes nowhere else — not into
// the route's answer, not into a log. A failed mint is reported, not hidden:
// the platform is saved either way, and publishing then asks for a token.
//
// Server only. Relative imports (not @/): __tests__ load this under vitest.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import config from "./iblai/config";
import { hosted } from "./onboarding";

const envFile = () => join(process.cwd(), "iblai.env");
const exampleFile = () => join(process.cwd(), "iblai.env.example");

/** What iblai.env.example ships as TOKEN: not a token. */
const PLACEHOLDER = "your-platform-api-key";

/** How the platform save went for the token: minted now, one was already there, or none. */
export type DeployToken = "minted" | "kept" | "missing";

const valueOf = (lines: string[], key: string): string =>
  lines
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim() ?? "";

/** The file's lines — the example's when it does not exist yet, so its comments survive. */
function readLines(): string[] {
  const path = existsSync(envFile()) ? envFile() : exampleFile();
  return existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
}

/** Set or add `KEY=value` lines; every other line is kept. Never on the hosting. */
export function writeIblaiEnv(values: Record<string, string>): void {
  if (hosted()) throw new Error("no local store on the hosting");
  const lines = readLines();
  for (const [key, value] of Object.entries(values)) {
    const at = lines.findIndex((line) => line.startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  const tmp = `${envFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, lines.join("\n").replace(/\n*$/, "\n"));
  renameSync(tmp, envFile());
}

/** Whether iblai.env already carries a token: set, and not the example's placeholder. */
export function hasRealToken(): boolean {
  if (!existsSync(envFile())) return false;
  const token = valueOf(readFileSync(envFile(), "utf8").split("\n"), "TOKEN");
  return !!token && token !== PLACEHOLDER;
}

/**
 * Write what the deploy skill needs to iblai.env: the platform and the admin's
 * username always, and a token — minted on the platform as the admin, named
 * after the app's slug so it never clashes, owner mode (the DM's default) with
 * no expiry, like the one the README used to ask for — unless a real one is
 * already there.
 *
 * `platform_key` goes in the query string as well as the body: the DM's admin
 * check reads request parameters, its serializer reads the body.
 */
export async function mintDeployToken(
  dmToken: string,
  platform: string,
  slug: string,
  username: string,
): Promise<DeployToken> {
  writeIblaiEnv({ PLATFORM: platform, IBLAI_USERNAME: username });
  if (hasRealToken()) return "kept";
  let key = "";
  try {
    const res = await fetch(
      `${config.dmUrl()}/api/core/platform/api-tokens/?platform_key=${encodeURIComponent(platform)}`,
      {
        method: "POST",
        headers: { Authorization: `Token ${dmToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `vibe-agent-${slug.slice(0, 8)}`, platform_key: platform }),
      },
    );
    if (!res.ok) return "missing";
    const answer = (await res.json()) as { key?: unknown };
    key = typeof answer.key === "string" ? answer.key : "";
  } catch {
    return "missing";
  }
  if (!key) return "missing";
  writeIblaiEnv({ TOKEN: key });
  return "minted";
}
