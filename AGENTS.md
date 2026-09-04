# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

This project is built on the ibl.ai platform using the `@iblai/iblai-js` SDK.

## Component Priority

When adding UI features, follow this priority order:

1. **ibl.ai components** (`@iblai/iblai-js`) -- always use these first
2. **shadcn/ui** (`npx shadcn@latest add`) -- for everything else
3. **Custom/third-party** -- only when no ibl.ai or shadcn component exists

### When the user asks to add...

| Feature                                     | Use this                                                                                                                                                                     | NOT this                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Profile page / dropdown                     | `/iblai-vibe-profile` skill + `Profile`, `UserProfileDropdown` from SDK                                                                                                      | Custom profile form                                                    |
| Account / org settings                      | `/iblai-vibe-account` skill + `Account` from SDK                                                                                                                             | Custom settings page                                                   |
| Analytics dashboard                         | `/iblai-vibe-analytics` skill + `AnalyticsOverview`, `AnalyticsLayout` from SDK                                                                                              | Chart library from scratch                                             |
| Notifications                               | `/iblai-vibe-notification` skill + `NotificationDropdown` from SDK                                                                                                           | Custom notification system                                             |
| Chat / AI assistant                         | `/iblai-vibe-agent-chat` skill + `Chat` from SDK                                                                                                                             | Custom chat UI                                                         |
| Auth / login                                | `/iblai-vibe-auth` skill + `AuthProvider`, `SsoLogin` from SDK                                                                                                               | Custom auth flow                                                       |
| Invite users                                | `/iblai-vibe-invite` skill + `InviteUserDialog` from SDK                                                                                                                     | Custom invite form                                                     |
| Workflow builder                            | `/iblai-vibe-workflow` skill + workflow components from SDK                                                                                                                  | Custom node editor                                                     |
| Course content                              | `/iblai-vibe-course-access` skill + `CourseContentLayout`, `CourseContentTabPage` from SDK                                                                                   | Custom course player                                                   |
| Create / publish courses                    | `/iblai-vibe-course-create` skill (Course Creation API)                                                                                                                      | Manually authoring OLX in edX Studio                                   |
| Onboarding flow                             | `/iblai-vibe-onboard` skill                                                                                                                                                  | Custom onboarding from scratch                                         |
| Charge for the app / paywall / monetization | `/iblai-vibe-monetization-app-paywall` skill — installs the ready-made paywall components (ops-init `assets/stripe-components/`) and wires env + the `(app)/layout.tsx` gate | Custom Stripe integration, raw Stripe keys, or Stripe.js in the client |
| Buttons, forms, modals, tables              | shadcn/ui (`npx shadcn@latest add button dialog table`)                                                                                                                      | Raw HTML or other UI libraries                                         |
| Page sections / blocks                      | shadcn/ui blocks (`npx shadcn@latest add @shadcn-space/hero-01`)                                                                                                             | Custom layout from scratch                                             |

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
it needs `NEXT_PUBLIC_MAIN_TENANT_KEY` (= `PLATFORM`) and, for server-side
platform API calls via `config.apiKey()`, the secret `IBLAI_API_KEY`
(= `TOKEN`). The API/auth/websocket URLs default to hosted iblai.app in
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

- **Platform admins** (the creator and their staff) bypass the paywall, see
  Analytics in Admin mode, and answer the one setup question at `/setup`. Admin
  means `isTenantAdmin()` in `lib/iblai/tenant.ts` (the `is_admin` flag on the
  pinned platform in `localStorage.tenants`), never the SDK `useIsAdmin()`.
- **Members** sign in with SSO; they pay on `/paywall` only when the admin chose
  a fee, and chat on `/`.

### Map

| Where                                                                                                   | What                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/`                                                                                            | Signed-in shell: the SDK sidebar (`components/sidebar/`), navbar, `AdminModeProvider`. `/about` (card), `/profile`, `/account`, `/notifications` (full-height SDK panels) live here.                                                                                                                                  |
| `app/(app)/(paid)/`                                                                                     | Behind `PaywallGate`: `/` (SDK `Chat`) and `/analytics/*` — the SDK `AnalyticsLayout` tab strip over eight pages (Overview, Users, Topics, Transcripts, Memory, Costs, Audit, Data Reports), Admin mode only.                                                                                                         |
| `app/paywall/`                                                                                          | Pricing page, Stripe Checkout hand-off, return page. Outside `(app)` on purpose: inside it the gate would loop.                                                                                                                                                                                                       |
| `app/setup/`                                                                                            | The setup question, outside `(app)` so it has no navbar (the SDK `OnboardingShell` is the page). Sign-in gated by the providers like everything else.                                                                                                                                                                 |
| `app/sso-login-complete/`                                                                               | SSO landing, outside the auth gate.                                                                                                                                                                                                                                                                                   |
| `app/api/paywall/{access,checkout,prices}/`                                                             | Buyer rail: the server calls the platform with `IBLAI_API_KEY`, as the buyer.                                                                                                                                                                                                                                         |
| `app/api/paywall/admin/setup/`                                                                          | Admin rail: one route that, for a paid answer, retires the old price, ensures the tagged product and creates the price, then records the choice — forwarding the admin's own DM token. Free records the choice only: zero Stripe calls, so it never needs a key.                                                      |
| `lib/paywall.ts`, `lib/paywall-admin.ts`                                                                | Server-only paywall code, including the platform-metadata read/write. Relative imports: vitest resolves no `@/` alias.                                                                                                                                                                                                |
| `lib/paywall-client.ts`, `components/paywall-gate.tsx`, `components/setup/`, `components/plan-card.tsx` | Browser side: the token header, the gate, the setup screen, the plan card.                                                                                                                                                                                                                                            |
| `components/sidebar/`, `lib/chat-rows.ts`                                                               | The sidebar: `app-sidebar.tsx` hands the SDK `PlatformSidebar` its sections and footer config and hosts the account sheet and invite dialog; `recent-chats.tsx` is the Recents section (pinned, recent, pin / unpin / delete, infinite scroll); `flat-nav-row.tsx` is the LMS's flat row; `chat-rows.ts` labels rows. |
| `components/loading-screen.tsx`                                                                         | The one loading / busy screen (the OS look: white, centred brand-blue arc). Full page by default; `overlay` covers the viewport while something saves or redirects.                                                                                                                                                   |
| `lib/iblai/`                                                                                            | `config.ts` (env accessors; `apiKey()` is server-only), `tenant.ts`, `admin-mode.tsx`, `auth-utils.ts`.                                                                                                                                                                                                               |
| `providers/iblai-providers.tsx`, `store/iblai-store.ts`                                                 | SDK providers and the Redux store. The slice keys are hard-coded in the SDK; keep them.                                                                                                                                                                                                                               |
| `proxy.ts`                                                                                              | CSP (`applyCsp`) and the 404 for `/about` when the flag is off.                                                                                                                                                                                                                                                       |

### Invariants, and why

- The platform comes from `NEXT_PUBLIC_MAIN_TENANT_KEY` only (`resolveAppTenant()`).
  No localStorage fallback: every vibe app on localhost writes `app_tenant`, and it
  silently overrode env. A missing or placeholder key renders an alert.
- The agent is `NEXT_PUBLIC_DEFAULT_AGENT_ID`. Never invent one; ask for the
  `os.ibl.ai/platform/<platform-key>/<uuid>` URL.
- The SDK `<Chat>` must never remount except through its `key` (any other remount
  wedges voice input), and `reactStrictMode` stays `false` for the same SDK bug.
- No static export, ever: the paywall needs the server routes. Native apps are a
  Tauri thin WebView over the deployed origin (`src-tauri/tauri.conf.json`,
  `build.frontendDist`).
- `/about` is refused in `proxy.ts` with a real 404, because `notFound()` from a
  page under the streaming root layout answers 200.
- `IBLAI_API_KEY` and `PAYWALL_*` are server-only. Never prefix them with
  `NEXT_PUBLIC_`; never read them outside route handlers.
- Platform admins bypass the gate on the client only. The platform stays the
  entitlement authority for everyone else.
- Nothing in the navbar for the setup: the way back is the quiet "Payments
  setup" link on `/account`.
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

Two auth rails, one boundary (`lib/paywall.ts`):

| Call                                                           | Who calls the platform         | Credential                               | Path user                             |
| -------------------------------------------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------- |
| access check, checkout, plan display                           | this server                    | `Api-Token IBLAI_API_KEY`                | the buyer, verified by `token/verify` |
| read the platform's choice                                     | this server                    | none: platform metadata is a public read | none                                  |
| retire/create product and price (paid only), record the choice | this server, from `/setup`     | the admin's own DM `Token`, forwarded    | the admin                             |
| save the Stripe key                                            | the browser, through SDK hooks | the admin's own DM `Token`               | none                                  |

The platform's Stripe proxy (`…/providers/stripe/payments/*`) is admin-only for
every verb and answers 403 otherwise, and so is the platform-metadata write; so the
setup route carries no admin check of its own — a 2xx from the platform is the
proof. The platform allows checkout only for a price on an active product whose
`metadata.app` equals `PAYWALL_APP_SLUG`; the setup route tags the product it
creates.

The choice lives in the platform's metadata under `apps.<slug>`
(`AppPaymentInfo` in `lib/paywall.ts`: `access` free / one_time / monthly,
`amount` in cents, `currency` always `usd`, `stripe.product_id`,
`stripe.price_id`, `updated_at`, `updated_by`). Facts about that store, verified
in DM source (`dm/v2`, `core/views/platform.py`): **GET is public and needs no
auth**, PUT/PATCH need a platform admin, writes **deep-merge** (dict values
merge, others replace, keys can never be deleted — write every key, nulls
included). So only ids and amounts go there, never a key or a secret. The server
caches the read 60 s and the setup route invalidates it.

What the app sells is `resolveCatalogue()`: `PAYWALL_PRICE_IDS` if set (display
data from one Stripe retrieve each), else the recorded choice; free or unanswered
means **no paywall**: `/api/paywall/access` answers `has_access: true` without
asking the DM, checkout 400s, and `/paywall` says the app is free.

`PaywallGate` sends an admin to `/setup` once per session while the question is
unanswered (`sessionStorage` key `paywall_setup_ok_at`). The screen (`components/setup/setup-screen.tsx`) pre-selects the current answer
and shows the price only for a paid choice. When the platform has no Stripe key,
or the admin chooses Replace under the Save button (where the on-file key shows
as first 3 + last 2 characters, all the DM reveals), a second screen asks for
the restricted key before saving. It posts `{access, amount}` with an
`Idempotency-Key` the route suffixes per Stripe call.

Where to change what: how a plan looks, `components/plan-card.tsx` and
`lib/paywall-client.ts`; what is sellable, `lib/paywall.ts`; the setup order,
`app/api/paywall/admin/setup/route.ts`; the question's copy, `components/setup/`.

### Environment

`.env.local` (gitignored; copy from `.env.example`):

| Key                                                            | Server-only | When missing                                  |
| -------------------------------------------------------------- | ----------- | --------------------------------------------- |
| `NEXT_PUBLIC_MAIN_TENANT_KEY`                                  | no          | an alert instead of the app                   |
| `NEXT_PUBLIC_DEFAULT_AGENT_ID`                                 | no          | alerts on `/`, `/analytics`, `/about`         |
| `IBLAI_API_KEY`                                                | yes         | the buyer rail gets 401/502 from the platform |
| `PAYWALL_APP_SLUG`                                             | yes         | every paywall route 500s, loudly, by design   |
| `PAYWALL_PRICE_IDS`                                            | yes         | optional override of the recorded choice      |
| `NEXT_PUBLIC_SHOW_ABOUT`                                       | no          | About hidden (the default)                    |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` | no          | code defaults                                 |

`iblai.env` (`DOMAIN`, `PLATFORM`, `TOKEN`) feeds the skills, not the app. Never
echo `TOKEN` or `IBLAI_API_KEY`; fill secrets with an editor, not a shell.

### Commands, and what green means

| Command                       | Expect                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                  | `oxlint --type-aware` then `oxlint --type-check`, exit 0. The warnings are inherited from the starter and shadcn; add none in files you touch. |
| `pnpm test`                   | vitest, all green: config, source paths, platform resolution, paywall helpers, platform-metadata store, route handlers, chat-row labels        |
| `pnpm fmt:check`              | oxfmt clean. Run `pnpm fmt` on the files you changed, only those.                                                                              |
| `pnpm build`                  | Turbopack production build; TypeScript 7's `tsc` runs the type check                                                                           |
| `cargo check` in `src-tauri/` | two template dead-code warnings, no errors                                                                                                     |

Manual smoke with placeholder credentials: `/` and `/setup` render their
alerts; every `/api/paywall/*` route answers 401 without a token; `/about` 404s
with the flag off.

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
  no SDK hooks for it, only the fetches in `lib/paywall.ts`.
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

### Conventions

- Never `git commit --no-verify`.
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
