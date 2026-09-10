# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

This project is built on the ibl.ai platform using the `@iblai/iblai-js` SDK.

## Get and run

When someone asks to get, clone, run, start, launch, boot, serve or publish
this app — "get https://github.com/iblai/vibe-agent", "get
github.com/iblai/vibe-agent", "run the server", "start it", "run it",
"publish it" — do the steps below in this order, as one run: clone, the
questions, install, preview, deployment, with no "shall I go on?" between
steps (the only questions are the ones the steps name). If the repo is not
cloned yet, `git clone https://github.com/iblai/vibe-agent` first, then do
everything inside it (`cd vibe-agent` for every command) so this file
governs; this section is the procedure. It needs Node 20 or newer (22
recommended) and pnpm 11 (`corepack enable`, or `npm i -g pnpm`). It uses
no browser: you ask, they answer, you write. The one secret that passes
through the chat is the Platform API Token; it is written to `iblai.env` the
moment it arrives (for the platform reads below and for deploying — the app
itself holds no key) and never repeated. Never print `.env.local`,
`iblai.env` or a token. Never ask for anything Stripe: the platform admin
connects their Stripe account in the app, with one click.

1. **Platform key.** Ask for it: their platform's key, as listed on
   https://login.iblai.app/me among the account's platforms. **`main` is
   never it**: ibl.ai's shared default platform that everyone lands in, not
   theirs, and this app refuses it. No platform of their own yet → they
   create one at https://ibl.ai/join (ibl.ai's own $0 sign-up: the account
   and a platform with them as admin); wait for "done", then ask again.
   Check the key: `curl -fsS https://api.iblai.app/dm/api/core/orgs/<key>/metadata/`
   is a public read, 200 means it exists (its `platform_name` is the
   platform's name), 404 means a typo.
2. **Platform API Token.** It reads the agent for you below and deploys
   the app; the app itself never holds it. Ask them to create one and paste it here: in
   https://os.ibl.ai on that platform (the org shown top left; Admin mode
   on — the User/Admin toggle at the top right), **Integrations** in the
   sidebar's bottom cluster → the **APIs** tab → **Add API** → API Key Name
   `vibe-agent`, expiry left empty, Owner permissions left selected →
   **Submit**; the key is shown once. With the pasted value, run the write
   below at once. It is the one write for this whole procedure: an empty
   value leaves that line alone, a line missing from an older `.env.local`
   is appended, a non-empty token is checked against the platform first,
   and nothing is printed but a masked confirmation.

   ```bash
   KEY=<key>; AGENT=; TOKEN=<pasted token>; NAME=
   [ -f .env.local ] || cp .env.example .env.local; [ -f iblai.env ] || cp iblai.env.example iblai.env
   [ -z "$TOKEN" ] || curl -fsS -o /dev/null -H "Authorization: Api-Token $TOKEN" https://api.iblai.app/dm/api/core/token/verify/ || { echo "token refused by the platform: ask them to paste it again"; exit 1; }
   python3 - "$KEY" "$AGENT" "$TOKEN" "$NAME" <<'PY'
   import pathlib, re, sys
   key, agent, tok, name = sys.argv[1:5]
   for f, pairs in ((".env.local", [("NEXT_PUBLIC_MAIN_TENANT_KEY", key), ("NEXT_PUBLIC_DEFAULT_AGENT_ID", agent), ("NEXT_PUBLIC_APP_NAME", name)]),
                    ("iblai.env", [("PLATFORM", key), ("TOKEN", tok)])):
       p = pathlib.Path(f); s = p.read_text()
       for k, v in pairs:
           if not v: continue
           s, n = re.subn(rf"^{k}=.*$", lambda m: f"{k}={v}", s, flags=re.M)
           if not n: s = s.rstrip("\n") + f"\n{k}={v}\n"
       p.write_text(s)
   PY
   echo "written: platform ${KEY:-unchanged}, agent ${AGENT:-unchanged}, token ${TOKEN:+${TOKEN:0:3}…${TOKEN: -2}}${TOKEN:-unchanged}, name ${NAME:-unchanged}"
   ```

   Never say the token back, not even to confirm it.
   `NEXT_PUBLIC_PAYWALL_APP_SLUG` stays `vibe-agent`; change nothing else in
   either file.

3. **Agent.** Ask for the agent this app fronts, as the URL the OS shows
   when the agent is open — `https://os.ibl.ai/platform/<key>/<agent-uuid>`
   — or the uuid itself; the uuid is the last path segment. Write it: the
   write above with `AGENT=<uuid>` and the rest empty. No agent yet → ask
   for a name and one line on what it does, and create it with the token:
   `POST https://api.iblai.app/dm/api/ai-mentor/orgs/<key>/users/<username>/mentor-with-settings/`
   with `Authorization: Api-Token $TOKEN` (the value read from
   `iblai.env` in the shell, never echoed; `<username>` is `username` in
   `GET https://api.iblai.app/dm/api/core/token/verify/` with the same
   header) and
   `{"template_name": "ai-mentor", "new_mentor_name": "<name>", "display_name": "<name>", "system_prompt": "<line>"}`;
   write the answer's `unique_id` the same way.
4. **The app's name — suggest one.** Read the agent with the token:
   `GET https://api.iblai.app/dm/api/ai-mentor/orgs/<key>/users/<username>/mentors/<agent-uuid>/`
   answers with its `name` and `description`; the platform's name is
   `platform_name` in step 1's metadata read. From those make a name people
   would ship: two or three plain words in Title Case, with spaces, saying
   what the agent does and for whom, reading well after "Join" and as a
   browser tab. Keep the agent's name when it already is one (`Caveman
Coach` stays; `caveman-coach` becomes it). Never a slug, camelCase, a
   uuid, the platform key, `vibe-agent`, the template's `AI Mentor` /
   `agentAI`, nor filler like "AI", "Agent", "Bot" or "App". A generic or
   template name means the description and the platform's name decide:
   `agentAI`, "Upbeat, encouraging tutor helping students…", platform
   "Babatunde" → **Babatunde Tutor**; `ai-mentor`, "answers customer
   questions about orders", platform "Acme" → **Acme Support**. Ask one
   question with the suggestion in it — **"Call the app Babatunde Tutor?"**
   — yes, or the name they give (theirs as typed, not reworded). Write it
   with the write above (`NAME=<name>`, the rest empty). It is what the login
   screens, the browser tab and the Stripe product call the app.
5. **Install, start and preview.** `pnpm install --ignore-scripts`,
   `pnpm husky` (the commit hook), and, with port 3000 free
   (`ss -ltnp 'sport = :3000'`), `pnpm dev` in the background. Wait for
   "Ready", then tell them to open http://localhost:3000 and sign in with
   their ibl.ai account. As the platform's admin they land on `/setup`, the
   one question: free access, one-time fee or monthly fee, and the USD
   price for a paid one; a paid answer's second screen ("Monetize Your
   Agent") is one button, Connect with Stripe: they sign in on Stripe,
   consent, and are back on `/setup`; no key is typed anywhere, and you
   never touch Stripe. Reconnect, beside Disconnect under Save, switches
   Stripe accounts the same way.
   Say that this is where payments are set and that the quiet "Payments
   setup" link on `/account` reopens it; wait for them to say it is saved,
   then check the agent answers on `/`. A later ask about money — "change
   the price", "make it free" — is `/setup` again, not you.
6. **Publish** on our hosting — part of the run, not an offer. Ask only the
   name they want (`<name>.vercel.app`: lowercase letters, digits, hyphens),
   set `package.json` `name` to it (the deploy skill's slug source), run
   `/iblai-vibe-ops-deploy`, and report the URL it returns (Vercel may alter
   a long or taken name). Say once what is left: the deployed origin among
   the platform's allowed redirect origins; `tauri.conf.json` is updated by
   the skill.

## Component Priority

When adding UI features, follow this priority order:

1. **ibl.ai components** (`@iblai/iblai-js`) -- always use these first
2. **shadcn/ui** (`npx shadcn@latest add`) -- for everything else
3. **Custom/third-party** -- only when no ibl.ai or shadcn component exists

### When the user asks to add...

| Feature                                     | Use this                                                                                                                                                                                                                                                       | NOT this                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Profile page / dropdown                     | `/iblai-vibe-profile` skill + `Profile`, `UserProfileDropdown` from SDK                                                                                                                                                                                        | Custom profile form                                                                                       |
| Account / org settings                      | `/iblai-vibe-account` skill + `Account` from SDK                                                                                                                                                                                                               | Custom settings page                                                                                      |
| Analytics dashboard                         | `/iblai-vibe-analytics` skill + `AnalyticsOverview`, `AnalyticsLayout` from SDK                                                                                                                                                                                | Chart library from scratch                                                                                |
| Notifications                               | `/iblai-vibe-notification` skill + `NotificationDropdown` from SDK                                                                                                                                                                                             | Custom notification system                                                                                |
| Chat / AI assistant                         | `/iblai-vibe-agent-chat` skill + `Chat` from SDK                                                                                                                                                                                                               | Custom chat UI                                                                                            |
| Auth / login                                | `/iblai-vibe-auth` skill + `AuthProvider`, `SsoLogin` from SDK                                                                                                                                                                                                 | Custom auth flow                                                                                          |
| Invite users                                | `/iblai-vibe-invite` skill + `InviteUserDialog` from SDK                                                                                                                                                                                                       | Custom invite form                                                                                        |
| Workflow builder                            | `/iblai-vibe-workflow` skill + workflow components from SDK                                                                                                                                                                                                    | Custom node editor                                                                                        |
| Course content                              | `/iblai-vibe-course-access` skill + `CourseContentLayout`, `CourseContentTabPage` from SDK                                                                                                                                                                     | Custom course player                                                                                      |
| Create / publish courses                    | `/iblai-vibe-course-create` skill (Course Creation API)                                                                                                                                                                                                        | Manually authoring OLX in edX Studio                                                                      |
| Onboarding flow                             | `/iblai-vibe-onboard` skill                                                                                                                                                                                                                                    | Custom onboarding from scratch                                                                            |
| Charge for the app / paywall / monetization | `/iblai-vibe-monetization-app-paywall` skill — installs the ready-made paywall components (ops-init `assets/stripe-components/`) and wires env + the `(app)/layout.tsx` gate — already wired in this app: the setup question at `/setup` (Get and run, step 5) | Custom Stripe integration or raw Stripe keys (Stripe.js here only renders the session the platform mints) |
| Buttons, forms, modals, tables              | shadcn/ui (`npx shadcn@latest add button dialog table`)                                                                                                                                                                                                        | Raw HTML or other UI libraries                                                                            |
| Page sections / blocks                      | shadcn/ui blocks (`npx shadcn@latest add @shadcn-space/hero-01`)                                                                                                                                                                                               | Custom layout from scratch                                                                                |

### Key rule

Do NOT build custom components when an ibl.ai SDK component exists.
Do NOT use raw HTML or third-party UI libraries when shadcn/ui has an equivalent.
ibl.ai and shadcn share the same Tailwind theme -- they render in brand colors automatically.

## SDK Imports

```typescript
// Data layer
import { initializeDataLayer, mentorReducer } from "@iblai/iblai-js/data-layer";

// Auth & utilities
import { AuthProvider, TenantProvider, useChatV2 } from "@iblai/iblai-js/web-utils";

// Framework-agnostic components
import { Profile, AnalyticsLayout, NotificationDropdown } from "@iblai/iblai-js/web-containers";

// Next.js-specific components
import { SsoLogin, UserProfileDropdown, Account } from "@iblai/iblai-js/web-containers/next";
```

## Adding Features

Use skills to add features. Each skill creates the files and guides you
through the wiring:

```
/iblai-vibe-auth          # SSO authentication (run first)
/iblai-vibe-agent-chat    # In-process agent chat surface
/iblai-vibe-profile       # Profile dropdown + settings page
/iblai-vibe-account       # Account/org settings page
/iblai-vibe-analytics     # Analytics dashboard
/iblai-vibe-course-access # Course content pages (edX learner UI)
/iblai-vibe-course-create # Generate and publish courses via Course Creation API
/iblai-vibe-notification  # Notification bell
/iblai-vibe-invite        # User invitation dialogs
/iblai-vibe-workflow      # Workflow builder
/iblai-vibe-onboard       # Onboarding questionnaire flow
/iblai-vibe-ops-build     # Desktop/mobile builds (Tauri v2)
/iblai-vibe-ops-test      # Test before showing work
/iblai-vibe-ops-upgrade   # Upgrade SDK and skills to latest
/iblai-vibe-component     # Browse all available components
```

All features require auth first (`/iblai-vibe-auth`).

## Environment

Platform configuration lives in `iblai.env` (`DOMAIN`, `PLATFORM`, `TOKEN`,
and optionally `IBLAI_USERNAME` for deploys — the `IBLAI_USERNAME`
environment variable wins when the host exports it; copy from
`iblai.env.example`). Treat it as the source of truth: derive the runtime
vars from it (via the skills) rather than hand-editing them. The one
real Next env file is the gitignored `.env.local` (copy from `.env.example`):
it needs `NEXT_PUBLIC_MAIN_TENANT_KEY` (= `PLATFORM`); `TOKEN` never goes
into it — the app holds no platform key. The API/auth/websocket URLs default to hosted iblai.app in
`lib/iblai/config.ts` — override them in `.env.local` when self-hosting or
when `DOMAIN` isn't `iblai.app` (map `NEXT_PUBLIC_PLATFORM_BASE_DOMAIN` ←
`DOMAIN`, `NEXT_PUBLIC_API_BASE_URL` ← `https://api.<DOMAIN>`, and the
sign-in URL when known — the auth host is not derivable from the domain;
distributed per-service hosts are unavailable on hosted iblai.app, see
`lib/iblai/config.ts`).

`/iblai-vibe-ops-deploy` deploys through the ibl.ai platform's hosting API
(Vercel-backed) using `TOKEN` from `iblai.env` — no Vercel account, token,
or CLI. It zips the app, uploads it, polls until the build is READY, and
updates `devUrl` in `tauri.conf.json`.

## Brand

- **Primary**: `#0058cc`, **Gradient**: `linear-gradient(135deg, #00b0ef, #0058cc)`
- **Style**: shadcn/ui new-york variant, system sans-serif, Lucide icons
- SDK components ship with their own styles -- do NOT override them

## Layout Patterns

- **Page background**: `var(--sidebar-bg, #fafbfc)`
- **SDK wrappers**: Wrap SDK components in `bg-white rounded-lg border border-[var(--border-color)] overflow-hidden`
- **Responsive width**: `w-full px-4` mobile, `md:w-[75vw] md:px-0` desktop
- **Mobile safe area**: `globals.css` must have `padding-top: env(safe-area-inset-top)` (and bottom/left/right) on body, and `app/layout.tsx` metadata must include `viewport: "width=device-width, initial-scale=1, viewport-fit=cover"` -- prevents content from overlapping the iOS notch / Android status bar
- **Package manager**: Use `pnpm` (fall back to `npm`)
- **Project names**: Lowercase only — npm rejects capital letters in package names. Convert any name the user gives (e.g. `MyApp` → `my-app`) before passing to `create-next-app` or `--app-name`.

## Commands

```bash
pnpm dev             # Dev server
pnpm build           # Production build
```

## Working in this app

This section is the guidance for agents (and people) changing vibe-agent;
`CLAUDE.md` is a symlink to this file. Everything above is the vibe-starter
contract the app was built from. Everything below is specific to this app and
was learned building it.

### What it is

One platform, one agent, one paywall. A creator (the platform admin on the ibl.ai
platform) fronts a single agent with a chat app; if they choose to charge,
members of the platform pay through the creator's own Stripe account. Two kinds
of users:

- **Platform admins** (the creator and their staff) see Analytics in Admin
  mode, answer the one setup question at `/setup`, and never pay. Admin
  means `isTenantAdmin()` in `lib/iblai/tenant.ts` (the `is_admin` flag on the
  pinned platform in `localStorage.tenants`), never the SDK `useIsAdmin()`.
- **Everyone else** signs in on the login SPA (an account is made there) and
  lands in the chat as a member: self-join is always open, membership is
  free. Payment is the entitlement, checked when they send: while the admin
  chose a fee, a member the platform has not seen pay gets the pay modal
  instead of a send, and paying in the modal (Stripe's own form, on the
  creator's Stripe account) unlocks the agent. Nobody is ever sent to a
  payment page.

### Map

| Where                                                   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/`                                            | Signed-in shell: the SDK sidebar (`components/sidebar/`), navbar, `AdminModeProvider`. `/` (the SDK `Chat` inside the pay gate), `/analytics/*` (the SDK `AnalyticsLayout` tab strip over eight pages — Overview, Users, Topics, Transcripts, Memory, Costs, Audit, Data Reports — Admin mode only), `/about` (card), `/profile`, `/account`, `/notifications` (full-height SDK panels).                                                                                                                                                                                                                                                    |
| `app/setup/`                                            | The setup question, outside `(app)` so it has no navbar (the SDK `OnboardingShell` is the page). Sign-in gated by the providers like everything else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `app/sso-login-complete/`                               | SSO landing, outside the auth gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `app/api/paywall/admin/connect/`                        | Connect with Stripe relay: GET the platform's Stripe source (`source`: a pasted `key`, the `connected` account, or null), POST `{return_url}` for Stripe's authorize URL, DELETE to disconnect — each forwarding the admin's own DM token to the platform's connect endpoint on their own path; statuses and bodies pass through verbatim.                                                                                                                                                                                                                                                                                                  |
| `app/api/paywall/admin/setup/`                          | Admin rail: one route that, for a paid answer, asks the platform which Stripe source it runs on (none, or one without a publishable key → 400, nothing touched), retires the old price (a 404 there is nothing to retire: after a reconnect it lives on another account), ensures the tagged product and creates the price on that source, opens self-join, then records the choice — with the source's publishable key and account — and appends the price to the login branding without editing the platform's own title or description, forwarding the admin's own DM token. Free records the choice only: zero Stripe or connect calls. |
| `lib/paywall.ts`, `lib/paywall-admin.ts`                | Server-only plumbing for the admin routes: identity from the caller's own token, the proxy and connect fetches on their path, the platform-metadata read/write. Relative imports: vitest resolves no `@/` alias.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lib/paywall-client.ts`, `components/setup/`            | Browser side: the buyer rail straight to the platform with the member's own token (the catalogue from the public metadata, the embedded checkout session, the access check), the setup and access checks, and the setup screen (the question, then Connect with Stripe).                                                                                                                                                                                                                                                                                                                                                                    |
| `components/pay-gate.tsx`, `components/pay-modal.tsx`   | The send gate around the SDK `Chat` (capture listeners on its composer; see "The send gate and SDK bumps") and the modal it opens: Stripe's embedded checkout form on the platform's Stripe source, Not now.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `components/sidebar/`, `lib/chat-rows.ts`               | The sidebar: `app-sidebar.tsx` hands the SDK `PlatformSidebar` its sections and footer config and hosts the account sheet and invite dialog; `recent-chats.tsx` is the Recents section (pinned, recent, pin / unpin / delete, infinite scroll); `flat-nav-row.tsx` is the LMS's flat row; `chat-rows.ts` labels rows.                                                                                                                                                                                                                                                                                                                       |
| `components/loading-screen.tsx`                         | The one loading / busy screen (the OS look: white, centred brand-blue arc). Full page by default; `overlay` covers the viewport while something saves or redirects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/iblai/`                                            | `config.ts` (env accessors), `tenant.ts`, `admin-mode.tsx`, `auth-utils.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `providers/iblai-providers.tsx`, `store/iblai-store.ts` | SDK providers and the Redux store. The slice keys are hard-coded in the SDK; keep them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `.github/workflows/`                                    | `release.yml`: release-it on every push to `main` (version, `CHANGELOG.md`, tag, GitHub Release; the first release is 1.0.0). `tauri-build-desktop.yml`: unsigned desktop bundles on demand.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `proxy.ts`                                              | CSP (`applyCsp`) and the 404 for `/about` when the flag is off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Invariants, and why

- The platform comes from `NEXT_PUBLIC_MAIN_TENANT_KEY` only (`resolveAppTenant()`).
  No localStorage fallback: every vibe app on localhost writes `app_tenant`, and it
  silently overrode env. A missing or placeholder key renders an alert.
- The agent and the app's name are env: `NEXT_PUBLIC_DEFAULT_AGENT_ID` (the
  uuid at the end of the agent's `os.ibl.ai/platform/<platform-key>/<agent-uuid>`
  URL) and `NEXT_PUBLIC_APP_NAME`, written by the Get and run procedure, read
  through `config.defaultAgentId()` / `config.appName()`, carried to a deploy
  by the deploy skill's `NEXT_PUBLIC_*` allowlist. Never in the platform's
  metadata (that store is the paywall choice), never invented: ask for the
  OS URL.
- Accounts are the platform's: every visitor without a session goes to the
  login SPA's join page for the platform (`authJoinUrl` in
  `lib/iblai/auth-utils.ts`, every part from env), which makes the account
  or signs one in and links it to the platform (the app has no form of its
  own); the app never creates users or links them, and everyone who arrives
  is a member.
- The app holds no platform secret: no `IBLAI_API_KEY`, no Stripe key. The
  buyer rail runs in the browser on the buyer's own DM token; the admin routes
  forward the admin's own token; the Platform API Token exists only in
  `iblai.env`, for the procedure's reads and the deploy skill, and the app
  never creates, stores or shows one.
- The SDK `<Chat>` must never remount except through its `key` (any other remount
  wedges voice input), and `reactStrictMode` stays `false` for the same SDK bug.
- No static export, ever: the setup and connect routes are server routes. Native apps are a
  Tauri thin WebView over the deployed origin (`src-tauri/tauri.conf.json`,
  `build.frontendDist`).
- `/about` is refused in `proxy.ts` with a real 404, because `notFound()` from a
  page under the streaming root layout answers 200.
- Payment is the entitlement, checked at the send. Membership is free
  (self-join is opened on every setup answer; closed again in the OS, a
  newcomer sees the SDK's "no access" paragraph until the admin saves
  `/setup` — loud, never worked around) and the app never changes it;
  the gate asks the platform whether the member's payment grants, and the
  platform stays the authority for who paid. It is a UI gate — the
  platform's chat API is open to every member — so it keeps honest users
  honest, not the determined.
- Nothing in the navbar for the setup: the way back is the quiet "Payments
  setup" link on `/account`.
- The pay modal is Stripe's own checkout form (Stripe.js, embedded), for a
  session the platform mints on the creator's Stripe account — the connected
  account by default, the platform's own pasted `stripe` key when one is set,
  never ibl.ai's Stripe as the merchant — and the platform verifies the
  session; the app never sees a card or a key.
- One sidebar context: the shell is the SDK's `SidebarProvider` →
  `PlatformSidebar` + `SidebarInset` from `@iblai/iblai-js/web-containers/next`
  (the LMS's structure). Never add a local shadcn sidebar copy — it is a
  different React context and the SDK README forbids mixing them — and never
  render the navbar outside the provider: its hamburger calls `useSidebar()`.
- The sidebar changes chats only through the chat page's URL contract:
  `/?session=<id>` restores a chat, `/?new=<nonce>` starts one (both remount
  `<Chat>` through its `key`). It never dispatches into the chat slice.
- Analytics (the sidebar menu and the pages) and the footer admin cluster key
  on `isLiveAdmin` = platform admin AND Admin mode. RBAC is off
  (`enableRbac: false`), so the SDK's own footer visibility rules reduce to that
  flag: members get Notifications and Support, live admins the full cluster.
- Scrolling, three kinds of page. Ordinary pages (About) never scroll a
  column of their own: `main` in `app/(app)/layout.tsx` is the scroller and
  paints white, and their card is `md:w-3/4` of the inset, never `75vw` (a
  viewport fraction overflows once the sidebar shares the row). The SDK's
  self-scrolling panels — Notifications, Profile, Account — get a bounded,
  full-width `flex-1 min-h-0` wrapper and own their scrolling, as in the OS:
  their `h-full` needs a definite height, and a card around them leaves the
  panes inert, scrolls the rail away and unpins Profile's Save bar.
  Notifications paints its own grey; Profile and Account are transparent and
  sit on white. Analytics is the full-bleed `#f5f7fb` surface that `main`
  scrolls.

### Paywall and setup, end to end

Payment is the entitlement, checked when a member sends. Three rails, no
platform key anywhere (`lib/paywall-client.ts` in the browser, `lib/paywall.ts`
on the server):

| Call                                                                                                                                             | Who calls the platform     | Credential                               | Path user  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------- | ---------- |
| read the platform's choice (what is for sale)                                                                                                    | the browser                | none: platform metadata is a public read | none       |
| mint the embedded checkout session, verify the completed session and record it, live standing                                                    | the browser                | the member's own DM `Token`              | the member |
| ask the Stripe source, retire/create product and price (paid only), open self-join, record the choice and append the price to the login branding | this server, from `/setup` | the admin's own DM `Token`, forwarded    | the admin  |
| Connect with Stripe: status, start (the authorize URL), disconnect                                                                               | this server, from `/setup` | the admin's own DM `Token`, forwarded    | the admin  |

Why the browser mints the checkout itself: an embedded Checkout Session's
`client_secret` needs a Stripe secret, so the platform mints it — and the
platform lets a member mint their own (a Students-role verb,
`Ibl.Mentor/StripePaywallSelf/action`, on their own username path only), so
no key of the owner's has to live in the app. `startCheckout` posts
`{app, price_id, ui_mode: "embedded", payment_method_types: ["card"]}` to
`…/users/<me>/providers/stripe/payments/paywall/checkout/` and gets back the
`client_secret`, the `session_id`, the `publishable_key` and the
`stripe_account`; `pay-modal.tsx` hands the last two to Stripe.js
(`loadStripe(pk, { stripeAccount })`) and mounts `createEmbeddedCheckoutPage`
with the secret. Stripe never redirects (`redirect_on_completion: never`).
On `onComplete` the modal polls `checkAccess(session_id)` —
`…/paywall/access/?app=&session_id=` on the member's own path: the platform
reads the session from the creator's account, requires its `ibl_username` to
be that path user and its `app` to be this app, `status: complete` with
`payment_status: paid` (or a live subscription), records it and answers.
Someone else's session, or another user's path, simply does not grant (403).
Nothing is a webhook: the platform's paywall is verified polling by design. A
lapse is caught on the next send after a minute — the gate asks
`hasPaidAccess()` once per minute, which asks the platform only while
something is for sale (free or unanswered grants everyone without a call).
Nobody's membership ever changes for it.

The platform's Stripe source is one of two, resolved on every call: a
`stripe` integration credential pasted in the OS (the tenant's own
restricted key; wins when set) or the account linked with Connect with
Stripe — the platform's own OAuth flow:
`POST …/users/<admin>/providers/stripe/connect/ {return_url}` answers
Stripe's authorize URL, the admin signs in and consents on Stripe, Stripe
returns to the platform's callback, which records the account and 302s the
browser to `return_url?stripe_connect=connected` or
`…=error&reason=<code>`. On a connected account the platform calls Stripe
with its own key plus `Stripe-Account`, and the browser renders with the
platform's own publishable key plus `stripeAccount`; on a pasted key both are
the tenant's own. Either way the checkout answer carries what the modal
needs; the app never chooses. Reasons the callback can land with:
`access_denied` (cancelled on Stripe), `already_connected`,
`account_linked_elsewhere` (that Stripe account belongs to another platform),
`not_configured`, `platform_missing`, `stripe_unreachable`, or another Stripe
OAuth code — `setup-screen.tsx` puts them in plain words.

Who reaches the login SPA: anyone without a session (the SDK `AuthProvider`),
through `redirectToAuthSpa` in `lib/iblai/auth-utils.ts`, on its join page
for the platform — `/join?tenant=<platform>&redirect-to=<origin>`, the shape
of the SDK's `getAuthSpaJoinUrl` and the OS's "log in or sign up" link, every
part from env (`NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_MAIN_TENANT_KEY`, the
origin the app runs on). What the SPA shows there is the platform's own
branding: it reads `metadata.auth_web_<app>` from the platform's public
metadata — `display_title_info` as the heading, `title` as the tab,
`display_description_info` as the line under it — under its default app,
`mentorai` (the join URL names none; its normalizer maps every unknown value
there too), so `auth_web_mentorai` is the key. The setup route touches it on
every save (`loginBranding()` in `lib/paywall.ts`) without editing a word the
platform wrote: the title and the heading are sent only when it has none (the
app's name from env, else the platform's), and the price line — `$29/month`,
`$49`, `Free` — is appended to its description after a middle dot, replacing
a price appended before rather than stacking one. A description that is
nothing but a price came from this app before it learned to append, so it
counts as ours and goes. The write rides the same deep-merge PUT as the
choice, so every key it omits — the platform's title, its logo, its images —
keeps its stored value. The same key brands the platform's OS login: one
platform, one app. A rename (`NEXT_PUBLIC_APP_NAME`) reaches the login
screens on the next save, but only where the platform never set a title of
its own.

The join page does the joining: it makes the account (email, password, on
edX) or signs an existing one in, calls the platform's self-link with the
user's own token, and comes back through `/sso-login-complete` — the user
arrives a member, and the SDK `TenantProvider` only confirms it in the
platform list. Its own self-join (`joinAndActivateTenant`: one attempt, the
platform's answer discarded, then a logout and a generic "no access"
paragraph on return) is the backstop, and its logout lands on the join page
again. Self-join must be open (every setup answer opens it); closed in the
OS, the join page ends on the SPA's 403 page — loud, and the admin's next
save on `/setup` opens it again. Sign-out (`handleLogout`) is the SPA's
`/logout?redirect-to=&tenant=`, which drops the SPA's session and returns
to the app, and the app sends the signed-out visitor to the join page. A
user must have at least one platform or the SPA shows its 409 — new users
have `main`, the DM links every new user to it.

The platform's Stripe proxy (`…/providers/stripe/payments/*`) and connect
endpoint are admin-only for every verb and answer 403 otherwise — the
member's own `paywall/checkout/` and `paywall/access/` on their own path are
the one exception — and so are the platform-metadata write and the self-join
switch; so the admin routes carry no admin check of their own — a 2xx from
the platform is the proof. The setup route tags the product it creates with
`metadata.app = <slug>` and records the price under `apps.<slug>`; the
platform's checkout enforces both (any other price for the app is a 400 once
one is recorded).

The choice lives in the platform's metadata under `apps.<slug>`
(`AppPaymentInfo` in `lib/paywall.ts`: `access` free / one_time / monthly,
`amount` in cents, `currency` always `usd`, `stripe.product_id`,
`stripe.price_id`, `stripe.publishable_key`, `stripe.stripe_account`,
`updated_at`, `updated_by`). Facts about that store, verified in DM source
(`dm/v2`, `core/views/platform.py`): **GET is public and needs no auth**,
PUT/PATCH need a platform admin, writes **deep-merge** (dict values merge,
others replace, keys can never be deleted — write every key, nulls included).
Everything there is public by design — ids, amounts, a publishable key and an
account id let someone start paying you, nothing more; never a secret. The
browser caches the read 60 s (`fetchCatalogue()`) and the setup screen
invalidates it after a save; the server caches its own read for the setup
route.

What the app sells is `fetchCatalogue()` in the browser: the recorded choice;
free or unanswered means **no paywall**: `hasPaidAccess()` resolves true
without asking the platform, and the gate never opens the modal. Every answer
opens self-join (`allow_self_linking: true`, so the SDK joins anyone who signs
in): membership is free either way, and a paid answer is enforced at the send.

The shell (`app/(app)/layout.tsx`) sends an admin to `/setup` once per session
while the question is unanswered (`sessionStorage` key `paywall_setup_ok_at`).
The screen (`components/setup/setup-screen.tsx`) pre-selects the current answer
and shows the price only for a paid choice. For a paid answer while the
platform has no Stripe source (`GET /api/paywall/admin/connect` →
`source: null`), a second screen holds one button, Connect with Stripe: the
answer in progress is stashed in `sessionStorage` (`paywall_setup_pending`),
the browser leaves for Stripe's authorize URL and comes back to
`/setup?stripe_connect=…`, where the screen restores the answer, cleans the
URL and — connected — saves at once. It posts `{access, amount}` with an
`Idempotency-Key` the route suffixes per Stripe call. Under Save, the footer
says what payments run on: the connected account (with a quiet Disconnect),
the platform's own key, or that Connect is not available on this platform
yet.

Where to change what: how the modal looks, `components/pay-modal.tsx`; when
it opens, `components/pay-gate.tsx`; what the platform is asked from the
browser, `lib/paywall-client.ts`; what the login SPA shows and what of it
this app may touch, `loginBranding()` in `lib/paywall.ts`; the setup order, `app/api/paywall/admin/setup/route.ts`;
the question's and the connect screen's copy, `components/setup/`.

### The send gate and SDK bumps

The gate (`components/pay-gate.tsx`) is capture-phase listeners on the div
around the SDK `<Chat>`, keyed on the composer's own class names and id
(`CSS_CLASS_NAMES` in `@iblai/web-containers`): the form `form.chat-textarea`
and its textarea `#chat-input-textarea` (`chat-input-form.tsx`), the send
button `.chat-submit-message-button` (`chat/submit-message-button.tsx`), the
follow-up prompts `.chat-guided-suggested-prompts` (minus its `-refresh`
button, `guided-suggested-prompts.tsx`) and the welcome prompts
`.chat-welcome-button` (`welcome-chat.tsx`). Enter in the textarea calls the
SDK's handler directly — no submit event (`auto-resize-text-area.tsx`) — so
it is caught on keydown; the mic only fills the textarea. The SDK has no send
hook, no disabled prop and no composer export in web-containers 1.19.8, and
its free-trial gate (`useShowFreeTrialDialog`) is a no-op stub, which is why
the gate is DOM-level. It is a UI gate: a member can still call the
platform's chat API directly, and the LiveKit voice-call button has no stable
class or label, so a voice call is not gated — known, accepted.

After every `@iblai/*` bump, before trusting the gate:

1. Prove the bundle is where you think (`ls node_modules/@iblai/web-containers/dist/next/`),
   then count every hook in it — each must be above zero:
   `for s in chat-textarea chat-input-textarea chat-submit-message-button chat-guided-suggested-prompts chat-welcome-button; do printf "%s: " $s; grep -o "$s" node_modules/@iblai/web-containers/dist/next/index.esm.js | wc -l; done`
2. Diff `packages/web-containers/src/components/chat-input-form.tsx`,
   `auto-resize-text-area.tsx` and `chat/index.tsx` (`executeSubmit`,
   `handleSubmit`) in the SDK source against the previous tag for new send
   paths, and `Chat`'s props for a `showConversationStarters` default flip
   (the starters are `welcome-chat/conversation-starters.tsx`, ungated).
3. Smoke as a member who has not paid: type and press Enter, click the send
   button, click a follow-up prompt — each opens the modal and sends
   nothing; then as an admin, each sends.

The durable fix is upstream: an
`executeGatedAction?: (fn: () => unknown) => unknown` prop on `Chat` — the
convention its Edit-Mentor tabs and `AgentSearch` already take from the host
— wrapping the `executeWithTrialCheck` call in `executeSubmit` and the
`onPhoneCallClick` handlers in
`packages/web-containers/src/components/chat/index.tsx`. When the SDK ships
it, pass the gate's verdict through the prop and delete the listeners.

### Environment

`.env.local` (gitignored; copy from `.env.example`). Nothing in it is a secret:

| Key                                                            | When missing                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_MAIN_TENANT_KEY`                                  | an alert instead of the app                                                                                                    |
| `NEXT_PUBLIC_DEFAULT_AGENT_ID`                                 | an alert on `/`, `/analytics` and `/about`                                                                                     |
| `NEXT_PUBLIC_APP_NAME`                                         | "vibe-agent" in the tab, the platform's name on the login screens and the Stripe product                                       |
| `NEXT_PUBLIC_PAYWALL_APP_SLUG`                                 | the admin routes 500 naming it, and the browser asks the platform about an unnamed app (its checkout 400s) — loudly, by design |
| `NEXT_PUBLIC_SHOW_ABOUT`                                       | About hidden (the default)                                                                                                     |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` | code defaults                                                                                                                  |

`iblai.env` (`DOMAIN`, `PLATFORM`, `TOKEN`) feeds the skills and the Get and
run procedure, not the app. Never echo `TOKEN`.

### Commands, and what green means

| Command                       | Expect                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                  | `oxlint --type-aware` then `oxlint --type-check`, exit 0. The warnings are inherited from the starter and shadcn; add none in files you touch.                    |
| `pnpm test`                   | vitest, all green: config, source paths, platform resolution, paywall helpers, platform-metadata store, the browser paywall rail, route handlers, chat-row labels |
| `pnpm fmt:check`              | oxfmt clean. Run `pnpm fmt` on the files you changed, only those.                                                                                                 |
| `pnpm build`                  | Turbopack production build; TypeScript 7's `tsc` runs the type check                                                                                              |
| `cargo check` in `src-tauri/` | two template dead-code warnings, no errors                                                                                                                        |
| `pnpm release`                | CI only: `release.yml` runs it on every push to `main`. Locally only `--dry-run --git.pushRepo=<remote>` (clones here have no `origin`).                          |

Manual smoke with a placeholder platform key: `/` and `/setup` render their
alerts; every `/api/paywall/admin/*` route answers 401 without a sign-in (500
naming `NEXT_PUBLIC_PAYWALL_APP_SLUG` while it is unset); `/about` 404s with
the flag off.

### Gotchas learned here

- pnpm 11 reads its settings only from `pnpm-workspace.yaml`; `.npmrc` pnpm keys
  are ignored. Hoist-pattern changes need `CI=true pnpm install`.
- The local `shadcn` binary crashes under `pnpm exec`; use
  `pnpm dlx shadcn@latest add <name> -y` (the style is `base-nova`), then
  `pnpm fmt` the new files.
- vitest resolves no `@/` alias: anything a test imports uses relative paths.
- oxfmt formats Markdown too and pads tables; when editing README rows by script,
  match on the row prefix.
- Turbopack's built CSS lives in `.next/static/chunks/*.css`.
- Stop a dev server by PID (`ss -ltnp 'sport = :3000'`); `pkill -f` matches its own shell.
- The profile dropdown reads the `/next` `WebContainersI18nProvider`; its User/Admin
  labels are overridden in `providers/iblai-providers.tsx`.
- `app/iblai-styles.css` sets the brand `--primary`; the starter's `globals.css`
  re-declares the neutral palette after it, so anything meant to be blue must not
  be shadowed there.
- The SDK's `OnboardingShell` is a `min-h-dvh` canvas: use it only on pages outside
  `(app)` (no navbar), as `/setup` does; inside the layout use `StepHeader` alone.
- The SDK's platform-metadata hooks take array-of-object args
  (`useGetTenantMetadataQuery([{ org }])`); the server side just fetches the URL.
- The installed `@iblai/iblai-api` predates the platform's Stripe proxy: there are
  no SDK hooks for it, only the fetches in `lib/paywall.ts` and
  `lib/paywall-client.ts`.
- ibl.ai hosting is Vercel functions: the filesystem is read-only, so nothing may
  be persisted on disk at runtime (the earlier SQLite catalogue was dropped for this).
- `pnpm-workspace.yaml` used to pin `@iblai/web-containers` at 1.16.0 (a 1.16.1
  publish imported data-layer exports that did not exist yet). data-layer 1.13.0
  has them, so the override is gone and `@iblai/iblai-js` ^2.8.5 brings
  web-containers 1.19.8 — the first with `AnalyticsMemoryStats`. Before the next
  bump, diff the SDK source's `@iblai/data-layer` / `@iblai/web-utils` imports
  against the installed d.ts; `pnpm build` is the drift check.
- Lucide 1.x renamed icons (`LineChart` → `ChartLine`, `MoreVertical` →
  `EllipsisVertical`, `Loader2` → `LoaderCircle`). The SDK types sidebar icons
  structurally (`PlatformSidebarNavIcon`), so the app's Lucide passes straight in.
- The pinned-messages query type omits `userId` although the URL needs it: pass
  the args as a variable, not an object literal, so the field survives the
  excess-property check. The API answers `{ results }` where the SDK types an array.
- Recents refetches when a new chat's first exchange lands (two messages, the
  second the assistant's, nothing streaming) — the OS's rule; without it a new
  chat shows up only after a reload.
- The SDK `AnalyticsLayout` ships `overscroll-none` (root) and
  `overscroll-contain` (content area) for hosts where it is the scroller. Under
  our scrolling `main` its boxes have nothing to scroll, yet those rules still
  block wheel chaining to `main` (reproduced in headless Chromium: the wheel
  did nothing over the whole surface). The analytics wrapper resets both to
  `overscroll-auto` through descendant arbitrary variants.
- `pnpm install --ignore-scripts` skips `prepare`, so the husky hook is dead
  until a one-time `pnpm husky` (`git config core.hooksPath` then says
  `.husky/_`). CI sets `HUSKY=0` for release-it's own commit. `CHANGELOG.md`
  is oxfmt-ignored: it is generated in conventional-changelog's Markdown.
  `release.yml` releases with the built-in `GITHUB_TOKEN` (the releaser is
  `github-actions[bot]`), whose pushes never trigger other workflows: a
  workflow that must run on the `v*` tag needs a personal access token, as
  in the OS.
- The deploy skill builds `.env.production` from `.env.local` through a key
  allowlist (`NEXT_PUBLIC_*`, `IBLAI_API_KEY`, `PAYWALL_*`, `CSP_MODE`) and
  drops everything else: everything this app needs is `NEXT_PUBLIC_*` (the
  platform key, the agent, the name, the slug), so it all passes; there is
  no token to carry.
- The app no longer creates users. It did, through SCIM
  (`/api/orgs/<key>/scim/v2/Users`), until the DM's create turned out to mask
  every edX error as 500 "Failed to create user in edX - no response
  received" (`if not response:` on a `requests.Response`, falsy for any
  status ≥ 400) and to look a known email up only when no username is sent.
  Accounts come from the login SPA's join page.
- The login SPA's login page never joins anyone: its Sign up hands off to
  `/login/complete?token=` without the tenant, so a new account arrived as a
  non-member and everything rested on the SDK `TenantProvider`'s one
  self-join attempt (`joinAndActivateTenant`: the platform's answer is
  discarded, a `sessionStorage` guard `tenant_access_attempt_<key>` is set,
  the user is logged out, and on return the guard shows the generic "no
  access" paragraph). That is why every sign-in is the SPA's join page
  (`/join?tenant=&redirect-to=`, the SDK's `getAuthSpaJoinUrl` shape): it
  links the account before returning. The SPA's `data=` carries no
  `tenants`, so a return must land on a page under the `TenantProvider`,
  which re-reads memberships from the platform list. A user with zero
  platforms ends on the SPA's 409 page; new users have `main` (the DM links
  every new user to it, `core/utils/users.py`).
- The DM's app-paywall contract: `paywall/checkout/` requires the price to
  be the one recorded under `apps.<slug>.stripe.price_id` in the platform
  metadata (once one is recorded) and the price's product to carry
  `metadata.app = <slug>`; nothing else is configured on the DM. The OS's
  Monetization tab is Stripe Connect item paywalls (mentors, courses; the
  billing app) — a different system. The platform's Stripe source is the
  account linked with Connect with Stripe (this app's Monetize screen, the
  DM's own OAuth flow, `…/providers/stripe/connect/`) or a `stripe`
  integration credential pasted in the OS, which wins when set.
- A 403 `Permission denied` on the member's own `paywall/checkout/` or
  `paywall/access/` is the platform's access control refusing the
  self-service verb, and is never the app's to fall back from: the message
  is shown, the send is blocked and no modal opens. The cause is a gap in
  the platform's seed, not a seed that was never run — the Students role
  does carry `Ibl.Mentor/StripePaywallSelf/action`, but no policy bound to
  the Students group lists the resource it applies to
  (`/platforms/<pk>/stripe-paywall-self/`), and a policy matches its
  resources by prefix, so the verb can never fire. Admins pass only because
  their own policy is granted at the platform root. Re-running the seed
  rewrites the same list; the fix belongs in the platform's seeder. Until it
  ships, an admin grants it once per platform: a role carrying that action
  (`POST /api/core/rbac/roles/`), the platform's Students group
  (`GET /api/core/rbac/groups/?platform_key=`), and a policy for
  `/stripe-paywall-self/` attached to that group
  (`POST /api/core/rbac/policies/`, which prefixes the platform itself). It
  is an ordinary policy, so a reseed leaves it alone. A 404 on
  `…/providers/stripe/connect/` means the backend predates the Connect
  endpoints; those and the self-service verb both shipped in DM 4.378.0.
- A member's token is minted for one platform and the paywall binds it: the
  platform's Stripe surface compares the platform its credential was minted
  for against the one in the URL and answers 403 "Platform '<key>' is not
  your token's platform" — the same for the checkout, the access check and
  the admin routes. So a member who arrives on another platform's token
  (they signed in there, or the SDK self-joined them and kept the token they
  came with — its `saveUserTokens` runs only on its own platform-switch
  path) is refused everything until this platform's pair is minted. The app
  mints it when the SDK reports a join (`onAutoJoinUserToTenant` →
  `mintPlatformTokens()` in `lib/iblai/tokens.ts`): `POST
<lms>/api/ibl/manager/consolidated-token/proxy/` with `platform_key` and
  the member's edX JWT, the SDK's own `getAppTokens` call. The platform
  mints only for a platform the user is already linked to, so it belongs
  after the join and nowhere earlier; its `/api/core/consolidated-token/
proxy/` twin refuses a `dm_token` outright (platform key or a
  server-to-server credential only), so the LMS one is the browser's only
  mint.
- One enabled application form on the platform refuses every self-link with
  `application_required`, whatever the self-join switch says: the platform's
  application gate runs first, and a member has to apply and be approved
  instead. Turn it off in the sidebar footer → Management → Applications →
  the form → its Enabled switch (the SDK ships that tab, and the app hosts
  the sheet). The API lever is `PATCH …/api/catalog/applications/platform/
forms/manage/<form_id>` with `platform_key` in the query string as well as
  the body and a JSON `false` — there is no delete, no global switch, and a
  form is armed while `active` and `enabled` are both true.
- Stripe.js: `loadStripe(pk, { stripeAccount })` is how a platform's own
  publishable key renders a connected account's session; `@stripe/stripe-js`
  9 has no client-only redirect (`redirectToCheckout` is gone), which is why
  the platform mints the session and the browser only renders it.
- The platform API token (`Api-Token`) is in the DM's default auth chain, so
  the Stripe proxy, the connect endpoint, the credential endpoints, the
  self-join switch and the metadata write all take it (owner mode: the
  token's platform must be the org); only `platform/api-tokens/` is
  session-`Token`-only. The app itself never sends one — the README's
  headless curl block is for an admin's terminal.
- `consolidated-token/provision` (tokens for a user of the platform, minted
  for the key) answers 404 until ibl.ai sets
  `ENABLE_PLATFORM_CONSOLIDATED_PROXY_PROVISIONING` for the platform; the app
  no longer needs it.
- Platform API Token names are unique per platform (`platform/api-tokens/`,
  session `Token` only, secret in the creation response only).
- After deleting a route or layout file, `pnpm build` can fail its type check
  on `.next/dev/types/validator.ts`, which the last `next dev` generated and
  which still imports the deleted file. `rm -rf .next/dev/types` (or one
  `next dev` run) regenerates it; nothing in the tree is wrong.

### Conventions

- Never `git commit --no-verify`: the commit-msg hook is commitlint, and the
  subject decides the next version and the changelog (`feat:` minor, `fix:`
  patch, `!` major; an untyped subject ships as a patch but never reaches the
  changelog). `chore(release):` belongs to release-it; `CHANGELOG.md` and the
  `package.json` version are written by release-it only, never by hand.
- UI recedes: match the starter's quiet language, no new accent colours, no dialog
  where a row will do, nothing new in the navbar, nothing of ours in the sidebar
  footer (the SDK owns that cluster). Loud failure over silent fallback: an
  unconfigured route 500s naming the missing key.
- A new env key lands in `.env.example` and the README in the same change; a new
  route lands with a test in `__tests__/` using the fetch-stub pattern there.
- A busy moment the user must not interrupt (saving, redirecting, checking a
  payment) renders `LoadingScreen overlay` with a short message, and the form's
  controls stay disabled underneath; plain loading states render `LoadingScreen`
  too. No bespoke spinners or grey "Loading..." text.
