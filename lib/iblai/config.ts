/**
 * ibl.ai runtime configuration.
 *
 * Hosted-iblai.app defaults live in code: with no env vars at all, every
 * service routes through https://api.iblai.app. `.env.local` (copied from
 * `.env.example`) is optional: self-hosted overrides, and the old way of
 * pinning the platform, the agent and the app's name — the setup wizard's own
 * answers (data/onboarding.json, the platform's metadata) win over it. Nothing
 * in it is a secret: the app holds no platform key of its own.
 *
 * Supports two modes:
 *   1. Consolidated API (default on hosted iblai.app): NEXT_PUBLIC_API_BASE_URL
 *      is a single origin; LMS, DM, and AXD endpoints are derived as /lms,
 *      /dm, /axd path prefixes.
 *   2. Distributed (self-hosted only): set NEXT_PUBLIC_PLATFORM_BASE_DOMAIN
 *      to your own domain and leave NEXT_PUBLIC_API_BASE_URL unset — each
 *      service resolves to its own subdomain (learn.{domain},
 *      base.manager.{domain}). Not available on hosted iblai.app: its
 *      per-service hosts reject the session tokens the Auth SPA issues
 *      (iblai/vibe#155).
 *
 * Priority: runtime window.__ENV__ → build-time process.env → fallback.
 */

// Static env declarations — Next.js inlines NEXT_PUBLIC_* values at build
// time only when they appear as literal process.env.NEXT_PUBLIC_* references.
const env = {
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
  NEXT_PUBLIC_BASE_WS_URL: process.env.NEXT_PUBLIC_BASE_WS_URL,
  NEXT_PUBLIC_LEGACY_LMS_URL: process.env.NEXT_PUBLIC_LEGACY_LMS_URL,
  NEXT_PUBLIC_MFE_URL: process.env.NEXT_PUBLIC_MFE_URL,
  NEXT_PUBLIC_PLATFORM_BASE_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_BASE_DOMAIN,
  NEXT_PUBLIC_MAIN_TENANT_KEY: process.env.NEXT_PUBLIC_MAIN_TENANT_KEY,
  NEXT_PUBLIC_TAURI_CUSTOM_SCHEME: process.env.NEXT_PUBLIC_TAURI_CUSTOM_SCHEME,
  NEXT_PUBLIC_DEFAULT_AGENT_ID: process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_SHOW_ABOUT: process.env.NEXT_PUBLIC_SHOW_ABOUT,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_PAYWALL_APP_SLUG: process.env.NEXT_PUBLIC_PAYWALL_APP_SLUG,
};

declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

const runtimeEnv = () => (typeof window !== "undefined" ? window.__ENV__ || {} : {});

const getEnv = (key: keyof typeof env, fallback = ""): string =>
  runtimeEnv()[key] ?? env[key] ?? fallback;

const domain = () => getEnv("NEXT_PUBLIC_PLATFORM_BASE_DOMAIN", "iblai.app");

// With no explicit NEXT_PUBLIC_API_BASE_URL, hosted iblai.app always routes
// through the consolidated API — its per-service subdomains reject the
// session tokens the Auth SPA issues (iblai/vibe#155). A non-iblai.app
// domain with no API base opts into distributed mode.
const apiBase = () => {
  const explicit = getEnv("NEXT_PUBLIC_API_BASE_URL");
  if (explicit) return explicit;
  return domain() === "iblai.app" ? "https://api.iblai.app" : "";
};

const config = {
  authUrl: () => getEnv("NEXT_PUBLIC_AUTH_URL", `https://login.${domain()}`),

  lmsUrl: () => {
    const base = apiBase();
    if (base) return `${base}/lms`;
    return `https://learn.${domain()}`;
  },

  dmUrl: () => {
    const base = apiBase();
    if (base) return `${base}/dm`;
    return `https://base.manager.${domain()}`;
  },

  axdUrl: () => {
    const base = apiBase();
    if (base) return `${base}/axd`;
    return `https://base.manager.${domain()}`;
  },

  // Dedicated edX LMS host (learn.*): edX page routes (xblock iframes,
  // bookmarks, instructor) and the data layer's legacy-LMS endpoints live
  // here, NOT under the consolidated API base.
  legacyLmsUrl: () => getEnv("NEXT_PUBLIC_LEGACY_LMS_URL", `https://learn.${domain()}`),

  // Learner micro-frontend (progress, dates, discussions pages).
  mfeUrl: () => getEnv("NEXT_PUBLIC_MFE_URL", `https://apps.learn.${domain()}`),

  baseWsUrl: () => getEnv("NEXT_PUBLIC_BASE_WS_URL", `wss://asgi.data.${domain()}`),

  wsUrl: () => getEnv("NEXT_PUBLIC_BASE_WS_URL", `wss://asgi.data.${domain()}`),

  mainTenantKey: () => getEnv("NEXT_PUBLIC_MAIN_TENANT_KEY", ""),
  // Defaulted in code: .env.example used to ship this value, and nothing
  // writes an env file. Mobile Tauri returns from SSO on this scheme; desktop
  // and web ignore it.
  tauriCustomScheme: () => getEnv("NEXT_PUBLIC_TAURI_CUSTOM_SCHEME", "vibe-agent"),

  // The one agent this app fronts: the last path segment of an
  // os.ibl.ai/platform/<platform-key>/<agent-uuid> URL.
  defaultAgentId: () => getEnv("NEXT_PUBLIC_DEFAULT_AGENT_ID", ""),
  supportEmail: () => getEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "support@ibl.ai"),
  // The About tab is off unless this is exactly "true".
  showAbout: () => getEnv("NEXT_PUBLIC_SHOW_ABOUT", "") === "true",
  // What the join page ("Join <name>") and the browser tab call this app; the
  // platform's own name is never used for it.
  appName: () => getEnv("NEXT_PUBLIC_APP_NAME", ""),
  platformBaseDomain: () => domain(),
  // An explicit slug for this app on the platform, or "": the first rung of
  // `appSlug()` in lib/paywall.ts, which then tries the identity file the setup
  // wizard wrote, the Vercel project id, and last the shared default every
  // install used before slugs were minted. The browser reads the resolved
  // value through window.__ENV__.
  paywallAppSlug: () => getEnv("NEXT_PUBLIC_PAYWALL_APP_SLUG", ""),
};

export default config;
export { getEnv };
