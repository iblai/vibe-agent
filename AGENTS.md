# AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

This project is built on the ibl.ai platform using the `@iblai/iblai-js` SDK.

## Run the server

When someone asks to run, start, launch, boot or serve this app — "run the
server", "start it", "get it running locally", or "clone
https://github.com/iblai/vibe-agent and start the server" — do the steps
below in this order, and ask before touching anything. If the repo is not
cloned yet, `git clone https://github.com/iblai/vibe-agent` first and work
inside it; this section is the procedure.

1. **Ask whether they are a platform admin on ibl.ai.** The app fronts one
   ibl.ai platform, and its admin is the one who configures it (the agent,
   the paywall). If they are not, or are not sure: signing up at
   https://ibl.ai/join creates an account and a platform with them as its
   admin — whoever created a platform is its admin. Wait for that before
   asking anything else. Their platforms are listed on
   https://login.iblai.app/me.
2. **Ask for the platform key and the agent uuid, in one message.** The
   platform key is the platform's name as listed on
   https://login.iblai.app/me. The agent uuid is the last path segment of
   the agent's URL on os.ibl.ai,
   `https://os.ibl.ai/platform/<platform-key>/<agent-uuid>`; pasting that
   URL answers both. Never invent either: the app refuses placeholders
   (`main`, `your-platform`…) on purpose. Never ask for the Platform API
   Token or any other secret. This is the one place this repo asks for the
   platform key directly; the vibe skills route it through `iblai.env`
   instead.
3. **Check the key before writing anything.**
   `curl -fsS https://api.iblai.app/dm/api/core/orgs/<platform-key>/metadata/`
   is a public read: 200 means the platform exists, 404 ("Platform not
   found") means a typo or a platform they do not have — ask again.
4. **Write the env files from their templates**, changing nothing else in
   them: `cp iblai.env.example iblai.env` and set `PLATFORM=<platform-key>`
   (leave `TOKEN` as it is); `cp .env.example .env.local` and set
   `NEXT_PUBLIC_MAIN_TENANT_KEY=<platform-key>`,
   `NEXT_PUBLIC_DEFAULT_AGENT_ID=<agent-uuid>` and `IBLAI_API_KEY=` (empty,
   not the `your-token` placeholder); `NEXT_PUBLIC_APP_NAME=<what they call
the app>` if they said, else leave it empty (the join page then says
   "Join this app"). `IBLAI_APP_BASE_URL` stays empty (the app uses the
   origin it is reached on) and `PAYWALL_APP_SLUG` stays `vibe-agent`. Both
   files are gitignored; never print them back.
5. **Ask them to paste the Platform API Token** into `.env.local` as
   `IBLAI_API_KEY`, with an editor, never through the chat (it is minted by
   `/iblai-api-login` from the `iblai/api` skills, or is an org secret). The
   app checks the key against the platform and renders nothing but an alert
   until a valid one for this platform is there. Wait for them to say it is
   done.
6. **Install and start.** Node 20 or newer (22 recommended) and pnpm 11
   (`corepack enable`, or `npm i -g pnpm`); then `pnpm install --ignore-scripts`,
   `pnpm husky` (the commit hook), and, with port 3000 free
   (`ss -ltnp 'sport = :3000'`), `pnpm dev` in the background. Wait for
   "Ready", then tell them the URL, http://localhost:3000, and that they sign
   in there with their ibl.ai account; as the platform admin they land on
   the one setup question first (free access needs no Stripe key). Do not
   open a browser for them.
7. **Say once what is left.** http://localhost:3000 must be among the
   platform's allowed redirect origins, or sign-in never comes back.

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

- **Platform admins** (the creator and their staff) are members already, see
  Analytics in Admin mode, and answer the one setup question at `/setup`. Admin
  means `isTenantAdmin()` in `lib/iblai/tenant.ts` (the `is_admin` flag on the
  pinned platform in `localStorage.tenants`), never the SDK `useIsAdmin()`.
- **Members** chat on `/`. Membership is the entitlement: a signed-in user the
  platform does not know pays on `/paywall` (when the admin chose a fee) and is
  linked as a member; a visitor without an account is sent to
  https://ibl.ai/join first. Nobody who is a member ever sees a payment page.

### Map

| Where                                                                    | What                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/`                                                             | Signed-in shell: the SDK sidebar (`components/sidebar/`), navbar, `AdminModeProvider`. `/about` (card), `/profile`, `/account`, `/notifications` (full-height SDK panels) live here.                                                                                                                                  |
| `app/(app)/(paid)/`                                                      | No gate (whoever is signed in here is a member): `/` (SDK `Chat`) and `/analytics/*` — the SDK `AnalyticsLayout` tab strip over eight pages (Overview, Users, Topics, Transcripts, Memory, Costs, Audit, Data Reports), Admin mode only.                                                                              |
| `app/paywall/`                                                           | The join page (public), Stripe Checkout hand-off, return page. Outside `(app)` on purpose: it must render for people the platform does not know yet.                                                                                                                                                                  |
| `app/setup/`                                                             | The setup question, outside `(app)` so it has no navbar (the SDK `OnboardingShell` is the page). Sign-in gated by the providers like everything else.                                                                                                                                                                 |
| `app/sso-login-complete/`                                                | SSO landing, outside the auth gate.                                                                                                                                                                                                                                                                                   |
| `app/api/paywall/{access,checkout,prices}/`                              | Buyer rail: the server calls the platform with `IBLAI_API_KEY` — as the platform (the key owner's path) to mint the checkout, verify the session and link the buyer; as the buyer for the ledger. `prices` is public and also carries the sign-up URL (`signUpUrl`).                                                  |
| `app/api/paywall/admin/setup/`                                           | Admin rail: one route that, for a paid answer, retires the old price, ensures the tagged product and creates the price, then records the choice — forwarding the admin's own DM token. Free records the choice only: zero Stripe calls, so it never needs a key.                                                      |
| `lib/paywall.ts`, `lib/paywall-admin.ts`                                 | Server-only paywall code, including the platform-metadata read/write. Relative imports: vitest resolves no `@/` alias.                                                                                                                                                                                                |
| `lib/paywall-client.ts`, `components/setup/`, `components/plan-card.tsx` | Browser side: the token header, the setup and standing checks, the setup screen, the plan card.                                                                                                                                                                                                                       |
| `components/sidebar/`, `lib/chat-rows.ts`                                | The sidebar: `app-sidebar.tsx` hands the SDK `PlatformSidebar` its sections and footer config and hosts the account sheet and invite dialog; `recent-chats.tsx` is the Recents section (pinned, recent, pin / unpin / delete, infinite scroll); `flat-nav-row.tsx` is the LMS's flat row; `chat-rows.ts` labels rows. |
| `components/loading-screen.tsx`                                          | The one loading / busy screen (the OS look: white, centred brand-blue arc). Full page by default; `overlay` covers the viewport while something saves or redirects.                                                                                                                                                   |
| `lib/iblai/`                                                             | `config.ts` (env accessors; `apiKey()` is server-only), `tenant.ts`, `admin-mode.tsx`, `auth-utils.ts`.                                                                                                                                                                                                               |
| `providers/iblai-providers.tsx`, `store/iblai-store.ts`                  | SDK providers and the Redux store. The slice keys are hard-coded in the SDK; keep them.                                                                                                                                                                                                                               |
| `.github/workflows/`                                                     | `release.yml`: release-it on every push to `main` (version, `CHANGELOG.md`, tag, GitHub Release; the first release is 1.0.0). `tauri-build-desktop.yml`: unsigned desktop bundles on demand.                                                                                                                          |
| `proxy.ts`                                                               | CSP (`applyCsp`) and the 404 for `/about` when the flag is off.                                                                                                                                                                                                                                                       |

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
- Membership is the entitlement. The app never gates a member: it sends a user
  the platform does not know to `/paywall` when joining costs money, links a
  verified payer with the platform's admin link API, and ends a membership only
  when the platform says a recorded payment lapsed. The platform stays the
  authority for who paid.
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

Membership is the entitlement. Three rails, one boundary (`lib/paywall.ts`):

| Call                                                                             | Who calls the platform         | Credential                               | Path user                                                  |
| -------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| customer + checkout session, session retrieve, ledger list, link / unlink        | this server                    | `Api-Token IBLAI_API_KEY`                | the key's owner (a member); the buyer is named in metadata |
| ledger record, live standing                                                     | this server                    | `Api-Token IBLAI_API_KEY`                | the buyer, verified by `token/verify`, a member by then    |
| read the platform's choice, plan display                                         | this server                    | none: platform metadata is a public read | none                                                       |
| retire/create product and price (paid only), self-join switch, record the choice | this server, from `/setup`     | the admin's own DM `Token`, forwarded    | the admin                                                  |
| save the Stripe key                                                              | the browser, through SDK hooks | the admin's own DM `Token`               | none                                                       |

Why the app mints the checkout itself: the platform's own paywall checkout
(`…/paywall/checkout/`) refuses a path user who is not a member, and a buyer
is by definition not one yet. So `createCheckout` does what that endpoint
does, through the generic Stripe proxy: a Customer with
`metadata.ibl_username`, a session with `metadata: {ibl_username, app}` —
the shape the platform's access check and ledger recognise afterwards.
`verifyAndJoin` retrieves the session (`expand[]=subscription`), refuses one
whose `ibl_username` is not the signed-in buyer (a leaked return URL joins
nobody), requires `status: complete` and `payment_status: paid` (or a live
subscription), links the buyer with `POST /api/core/users/platforms/`
`{user_id, platform_key, active}` (the key is an admin credential), then
calls `paywall/access/?session_id=` as the buyer so the platform records the
payment. Nothing is a webhook: the platform's paywall is verified polling by
design (BYO keys). A lapse is caught on the payer's next visit — the shell
asks `/api/paywall/access` once per minute per session: `paywall/payments/?username=`
says whether they ever paid (invited members and admins never did, so they
are never checked), `paywall/access/` says whether it still grants, and a
deny ends the membership (`active: false`) and sends them to `/paywall`.

Who reaches `/paywall`: the providers hand the SDK an `authRedirect` that
sends a user whose `localStorage.tenants` lacks the pinned key to `/paywall`
when the platform is paid (one public read of `/api/paywall/prices`, cached
for the page) and to the login SPA otherwise (`paywallEntry` in
`lib/iblai/tenant.ts`). `/paywall` and `/paywall/return` are in
`PUBLIC_ROUTES` and skip the `TenantProvider`. Sign-in returns them to
`/paywall` (`redirectTo` in localStorage).

A visitor without an account takes the platform's own $0 sign-up from the
page's Create Account button (`signUpUrl()` in `lib/paywall.ts`, delivered by
the public `prices` route): the DM's
`…/api/service/stripe/checkout/redirect/credits-free-plan/` 302s to a Stripe
Checkout that asks for an email only, creates the account and a platform of
their own, and returns to its `redirect_url` with an `edx_jwt_token` appended.
That `redirect_url` is the Auth SPA login URL the Sign in button already uses
(`authLoginUrl()` in `lib/iblai/auth-utils.ts`), because only the SPA turns
that token into a session (its `/login` page; nothing in the SDK reads it off
a URL); the SPA comes back to `/sso-login-complete`, which goes to the
`redirectTo` the page saved on click, `/paywall`, now signed in with the Buy
button showing. Cancel goes to that same login URL: the DM allows only
localhost, `*.iblai.app` and a platform's mirrored custom domains as redirect
hosts, never ibl.ai hosting's `*.vercel.app`, so `/paywall` itself cannot be
the cancel URL. The origin in those URLs, and in a purchase's Stripe return
URLs, is `appBaseUrl()`: `IBLAI_APP_BASE_URL` when set, else the origin the
request arrived on. The OS and the LMS do not use this flow: they send
strangers to the SPA's `/join`, which self-joins them — closed on a paid
platform.

The platform's Stripe proxy (`…/providers/stripe/payments/*`) is admin-only
for every verb and answers 403 otherwise, and so are the platform-metadata
write and the self-join switch; so the setup route carries no admin check of
its own — a 2xx from the platform is the proof. `allowedPriceIds()` keeps
unknown ids off the wire; the setup route tags the product it creates with
`metadata.app = PAYWALL_APP_SLUG`, which is what the platform's own paywall
checkout enforces.

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
data from one Stripe retrieve each, on the key owner's path), else the recorded
choice; free or unanswered means **no paywall**: setup opens self-join
(`allow_self_linking: true`, so the SDK joins anyone who signs in),
`/api/paywall/access` answers `has_access: true` without asking the DM,
checkout 400s, and `/paywall` says the app is free. A paid answer closes
self-join: payment is the only way in.

The shell (`app/(app)/layout.tsx`) sends an admin to `/setup` once per session
while the question is unanswered (`sessionStorage` key `paywall_setup_ok_at`).
The screen (`components/setup/setup-screen.tsx`) pre-selects the current answer
and shows the price only for a paid choice. When the platform has no Stripe key,
or the admin chooses Replace under the Save button (where the on-file key shows
as first 3 + last 2 characters, all the DM reveals), a second screen asks for
the restricted key before saving. It posts `{access, amount}` with an
`Idempotency-Key` the route suffixes per Stripe call.

Where to change what: how a plan looks, `components/plan-card.tsx` and
`lib/paywall-client.ts`; what is sellable and how a purchase becomes a
membership, `lib/paywall.ts`; who is sent where, `paywallEntry` in
`lib/iblai/tenant.ts` and the arrival effects in `app/(app)/layout.tsx`; the
setup order, `app/api/paywall/admin/setup/route.ts`; the question's copy,
`components/setup/`.

### Environment

`.env.local` (gitignored; copy from `.env.example`):

| Key                                                            | Server-only | When missing                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_MAIN_TENANT_KEY`                                  | no          | an alert instead of the app                                                                                                                                                                                              |
| `NEXT_PUBLIC_DEFAULT_AGENT_ID`                                 | no          | alerts on `/`, `/analytics`, `/about`                                                                                                                                                                                    |
| `IBLAI_API_KEY`                                                | yes         | an alert instead of the app: the root layout refuses to render while the key is empty, a placeholder, rejected by the platform or another platform's (one config read, cached 5 min); the buyer routes 500 naming it too |
| `PAYWALL_APP_SLUG`                                             | yes         | every paywall route 500s, loudly, by design                                                                                                                                                                              |
| `PAYWALL_PRICE_IDS`                                            | yes         | optional override of the recorded choice                                                                                                                                                                                 |
| `NEXT_PUBLIC_APP_NAME`                                         | no          | "this app" on the join page, "vibe-agent" as the tab title                                                                                                                                                               |
| `IBLAI_APP_BASE_URL`                                           | yes         | the origin each request arrives on (right on localhost and on ibl.ai hosting); a set but malformed value 500s the paywall routes naming it                                                                               |
| `NEXT_PUBLIC_SHOW_ABOUT`                                       | no          | About hidden (the default)                                                                                                                                                                                               |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` | no          | code defaults                                                                                                                                                                                                            |

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
| `pnpm release`                | CI only: `release.yml` runs it on every push to `main`. Locally only `--dry-run --git.pushRepo=<remote>` (clones here have no `origin`).       |

Manual smoke with placeholder credentials: every page renders only the
`IBLAI_API_KEY` alert (the root layout refuses); with a valid key and a
placeholder platform key, `/` and `/setup` render their alerts; every
`/api/paywall/*` route answers 401 without a sign-in (500 naming the key while
it is a placeholder); `/about` 404s with the flag off.

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
  drops everything else: that is why the app's name is `NEXT_PUBLIC_APP_NAME`,
  and why `IBLAI_APP_BASE_URL` is optional (a deployed app uses its own origin).
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
