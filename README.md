<!-- AI agents: to get, run, set up or publish this app, read CLAUDE.md (a symlink to AGENTS.md) and follow its "Get and run" procedure now, from inside this directory. -->

<div align="center">

<a href="https://ibl.ai"><img src="https://ibl.ai/images/iblai-logo.png" alt="ibl.ai" width="300"></a>

# vibe-agent

**One creator, one AI agent, one paywall.**

A single-platform app on ibl.ai: users sign in with ibl.ai SSO and chat with one agent, and access to the chat is sold on the platform's own Stripe account. Built from [iblai/vibe](https://github.com/iblai/vibe)'s `vibe-starter` template on the [@iblai/iblai-js](https://www.npmjs.com/package/@iblai/iblai-js) SDK.

[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Claude Code](https://img.shields.io/badge/Claude_Code-CC785C?logoColor=white)](https://claude.ai)
[![Desktop & Mobile](https://img.shields.io/badge/Desktop_%26_Mobile-supported-blue)](https://github.com/iblai/vibe/blob/main/skills/iblai-vibe-ops-build/SKILL.md)

</div>

---

## What is vibe-agent

<!-- Once deployed: "vibe-agent is deployed at [<host>](https://<host>)." -->

vibe-agent fronts one agent for one platform on [ibl.ai](https://ibl.ai). A creator (the platform admin) points it at an agent built on [os.ibl.ai](https://os.ibl.ai), decides whether access is free or paid, and members sign in with SSO to chat. Two kinds of users: **platform admins** (the creator and their staff) see Analytics in Admin mode and answer the one setup question; **everyone else** signs in on login.iblai.app (an account is made there in a minute) and lands in the chat as a member. When the admin chose a fee, the first message a member sends opens a pay modal; paying on the creator's own Stripe Checkout unlocks the agent. Everything is the SDK's — the shell, the chat, the analytics, the profile and account panels — connected to [iblai.app](https://iblai.app).

## Screenshots

| Screen                         |                                                                         |
| ------------------------------ | ----------------------------------------------------------------------- |
| **Chat, with the canvas open** | ![Chat with the agent, canvas open](docs/screenshots/agent-caveman.png) |
| **Analytics · Users**          | ![Analytics — Users](docs/screenshots/user-analytics.png)               |

## Features

| Feature               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**              | `/` — the SDK `Chat` with the one agent (`NEXT_PUBLIC_DEFAULT_AGENT_ID`, the uuid at the end of its os.ibl.ai URL): streaming, sessions, files, voice. Anyone signed in can open it; when the admin chose a fee, sending needs a payment (platform admins excepted).                                                                                                                                                                                                                                                                                                            |
| **Sidebar**           | The SDK `PlatformSidebar` — the shell the ibl.ai OS and LMS use — with this app's content: **New chat**, **Recents** (pinned chats first; each row can be pinned, unpinned or deleted) and, for admins in Admin mode, the **Analytics** menu. The bottom-left cluster is the SDK's: Notifications and Support for everyone, plus Invites, Management, Integrations, Monetization (when the platform sells credits) and Advanced for admins in Admin mode; the last four open the platform's account sheet in place. Collapses to an icon rail (Cmd/Ctrl+B), a drawer on phones. |
| **Analytics**         | `/analytics/*` — the OS analytics section for this one agent: Overview, Users, Topics, Transcripts, Memory, Costs, Audit, Data Reports (SDK `AnalyticsLayout` + stats components). Platform admins, in Admin mode.                                                                                                                                                                                                                                                                                                                                                              |
| **Pay modal**         | Opens when a member who has not paid sends a message: Stripe's own checkout form, rendered in the modal (Stripe.js, embedded) for a session the platform mints on the creator's Stripe account; when Stripe reports completion the platform verifies the payment and the message sends. The platform owns payments; free access never needs Stripe.                                                                                                                                                                                                                             |
| **Setup**             | `/setup` — one question: free access, one-time fee or monthly fee (USD). A paid answer connects your Stripe account with one click (**Connect with Stripe**: sign in on Stripe, nothing to copy) and the product and price are created for you on it. Opens itself for a platform admin until answered; reachable later from the quiet "Payments setup" link on `/account`.                                                                                                                                                                                                     |
| **User / Admin mode** | Platform admins get a User / Admin switch in the navbar (in the profile menu on narrow screens). User mode shows the app as a member sees it; Analytics and the admin cluster exist only in Admin mode. Starts on Admin, resets on reload.                                                                                                                                                                                                                                                                                                                                      |
| **Profile**           | `/profile` — the SDK `Profile` panel, from the profile dropdown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Account**           | `/account` — the SDK `Account` panel (organization settings), admins.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Notifications**     | `/notifications` — the SDK notification centre, from the bell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **About**             | `/about` — off by default; `NEXT_PUBLIC_SHOW_ABOUT=true` enables it. The agent's public profile plus your copy (`ABOUT_COPY` in `app/(app)/about/page.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Branding**          | The logo in the sidebar header (and in the navbar on phones) is the org logo set in the platform's org settings, falling back to the ibl.ai mark.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **SSO**               | Login via iblai.app — no tokens to manage. Every origin the app runs on must be in the platform's allowed redirect origins.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Membership is free: anyone who signs in joins the platform. A payment is what unlocks sending, asked for in the modal, never on a page; platform admins never pay.

## AGENTS.md / CLAUDE.md

`AGENTS.md` (with `CLAUDE.md` as its symlink) is the guide for agents and people changing this app: the map, the invariants and why, the paywall and setup end to end, and the gotchas learned building it. Read it before touching the shell, the paywall or the SDK wrappers.

## Quick Start

### Prerequisites

- Node.js 20 or newer (22 is what this app is built with) and pnpm
- [Claude Code](https://claude.com/claude-code)

### Install & Run

Start Claude Code in the terminal (`claude`) and say:

```text
get https://github.com/iblai/vibe-agent
```

It clones the repo and, as soon as it reads a file in it, follows the procedure in `AGENTS.md` in one run. It asks for your platform key (listed on [login.iblai.app/me](https://login.iblai.app/me); never the shared `main` platform, that one is everyone's, not yours; no platform yet → [ibl.ai/join](https://ibl.ai/join)), for a Platform API Token you create in the OS (os.ibl.ai → Integrations → APIs → Add API; paste it in the chat and it goes into `iblai.env`, for deploying, never repeated; the app itself holds no key), and for your agent's URL from os.ibl.ai; suggests a name for the app; installs and starts the dev server and tells you to sign in — as the platform admin you land on `/setup`, the one setup question (free, one-time or monthly and the price; a paid answer's next screen is one button, Connect with Stripe: sign in on Stripe and you are back); then publishes the app on ibl.ai hosting as `<name>.vercel.app`, asking only for the name. If it only clones, say `follow AGENTS.md`; or start inside the clone — `git clone https://github.com/iblai/vibe-agent && cd vibe-agent && claude` — and say `run it`.

By hand:

1. Platform credentials go in `iblai.env` (gitignored):

   ```bash
   cp iblai.env.example iblai.env
   ```

   `PLATFORM` is your platform key (listed on https://login.iblai.app/me); `TOKEN` is a Platform API Token (os.ibl.ai → Integrations, in the sidebar's bottom cluster → APIs → Add API; the key is shown once).

2. App env goes in `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Fill `NEXT_PUBLIC_MAIN_TENANT_KEY` (= `PLATFORM`), `NEXT_PUBLIC_DEFAULT_AGENT_ID` (the agent's uuid, the last path segment of `https://os.ibl.ai/platform/<platform-key>/<agent-uuid>`) and `NEXT_PUBLIC_APP_NAME` (what the login screens, the browser tab and the Stripe product call the app: two or three plain words in Title Case, e.g. `Babatunde Tutor`, never a slug). `TOKEN` never goes into `.env.local`: the app holds no platform key. The API, auth and websocket URLs default to hosted iblai.app in `lib/iblai/config.ts`. A missing or placeholder platform key shows an alert instead of an app; a missing agent shows one on `/`.

3. Install and run:

   ```bash
   pnpm install --ignore-scripts
   pnpm dev
   ```

   Open http://localhost:3000 and sign in. As the platform admin you land on `/setup`, the one setup question (see Paywall below). Every origin the app runs on (localhost and the deployed one) must be in the platform's allowed redirect origins, or sign-in never comes back.

### Build

```bash
pnpm build
pnpm start
```

## Paywall

Membership is free: anyone who signs in on login.iblai.app joins the platform (setup opens self-join on every answer). A payment is what unlocks the agent: when the admin chose a fee, a member's first message opens the pay modal (`components/pay-gate.tsx`, `components/pay-modal.tsx`) with Stripe's own checkout form inside it (Stripe.js, embedded). The platform (DM) owns every payment: the browser asks the platform, with the member's own sign-in token, for a Checkout Session on the creator's Stripe account; Stripe renders the form in the modal; the platform verifies the session, records payments and checks subscriptions live. No commission, no webhooks, no card details in this app, and no Stripe key or platform key anywhere in it — not even on its server. The app has the setup screen (`app/setup`, `components/setup/setup-screen.tsx`), the browser rail (`lib/paywall-client.ts`) and two admin routes under `app/api/paywall/admin/` (setup, and the Connect with Stripe relay).

Who pays:

- **Platform admins** never: sending is theirs.
- **A member who has not paid** sees the modal on send while something is for sale; the message stays in the composer. Stripe's form is in the modal; when Stripe reports the payment complete the platform verifies the session on the member's own path and records it, and the send goes. Nothing leaves the page.
- **A payer whose subscription lapsed** is caught within a minute of the next send: the platform's live check says the payment no longer grants, and the modal is back. Their membership stays.
- **A visitor without an account** never sees a form of the app's own: `/` sends them to login.iblai.app, whose screens show the app's name and price and whose Sign up link makes the account; they come back a member.

The gate is the app's: the platform's chat API itself is open to every member, so the modal keeps honest users honest, not the determined.

Setup is one question, asked of a platform admin the first time they open the app (and reachable later from the quiet "Payments setup" link on `/account`):

- **Free access** — anyone who signs in joins. No Stripe needed, ever.
- **One-time fee** or **Monthly fee** — enter the price (USD). The first time, a second screen ("Monetize Your Agent") has one button, **Connect with Stripe**: you sign in on Stripe (or create an account there), consent, and are back on `/setup`; the platform's own OAuth flow links your Stripe account to the platform. Nothing to copy, no key typed anywhere; payments go straight to that account, with no application fee. A platform whose admin pasted a `stripe` key in the OS skips the screen: that key wins over a connected account, and `/setup` says so. Disconnect is a quiet link under Save.

For a paid answer, Save creates the Stripe product (named after the app, tagged `metadata.app = NEXT_PUBLIC_PAYWALL_APP_SLUG`) and the price on that account, retires the previous price if the answer changed, and records the choice in the platform's metadata under `apps.<slug>`. Free records the choice, touching Stripe not at all. Every answer also opens self-join (anyone who signs in is a member) and writes the login branding — `auth_web_mentorai`, the app's name and the price line, what login.iblai.app shows for the platform, its OS login included; a price left behind by a paid → free switch stays active on Stripe but is never sold, since the platform sells only the recorded one:

```json
{
  "apps": {
    "vibe-agent": {
      "access": "monthly",
      "amount": 2900,
      "currency": "usd",
      "stripe": {
        "product_id": "prod_…",
        "price_id": "price_…",
        "publishable_key": "pk_…",
        "stripe_account": "acct_…"
      },
      "updated_at": "…"
    }
  }
}
```

That metadata is a **public read** on the platform, and everything in it is public by design: ids, amounts, the publishable key Stripe.js renders the form with (the platform's own on a connected account, yours on a pasted key) and the connected account id. Knowing them lets someone start paying you, nothing more. The browser reads it to know what is for sale; the platform enforces it: a checkout for any price but the recorded one is refused. The modal takes the live publishable key and account from the platform's checkout answer, not from the record. Free or unanswered means every member sends, without a platform call. Test with card `4242 4242 4242 4242`. A cancellation is caught within about a minute of the payer's next send (the platform's cache, then the app's).

Headless alternative for admins, with `DOMAIN`, `PLATFORM`, `TOKEN` and `IBLAI_USERNAME` from `iblai.env` (the Platform API Token is the admin's own, for the terminal; the app never holds one). The proxy runs on whichever Stripe source the platform resolves: a pasted `stripe` credential, else the connected account:

```bash
STRIPE="https://api.$DOMAIN/dm/api/ai-mentor/orgs/$PLATFORM/users/$IBLAI_USERNAME/providers/stripe"
AUTH="Authorization: Api-Token $TOKEN"

curl -s -H "$AUTH" "$STRIPE/connect/"
# {"source": "connected" | "key" | null, …}: what payments run on right now

curl -s -H "$AUTH" "$STRIPE/payments/products/?limit=1"
# 200 working · 400 no Stripe source yet · 502 Stripe rejected the credential · 404 backend too old

curl -s -H "$AUTH" -H 'Content-Type: application/json' -X POST "$STRIPE/payments/products/" \
  -d '{"name":"vibe-agent access","metadata":{"app":"vibe-agent"}}'

curl -s -H "$AUTH" -H 'Content-Type: application/json' -X POST "$STRIPE/payments/prices/" \
  -d '{"product":"prod_…","unit_amount":2900,"currency":"usd","recurring":{"interval":"month"}}'
# drop "recurring" for a one-time price

curl -s -H "$AUTH" "$STRIPE/payments/paywall/payments/?app=vibe-agent"   # who paid so far
```

A price made this way is sold only once it is the recorded one (`apps.vibe-agent.stripe.price_id`, written with the metadata PUT) — or answer `/setup`, which does all of this.

## Deployment

`/iblai-vibe-ops-deploy` (from `iblai/vibe`) zips the source, uploads it to ibl.ai hosting with the platform token, polls until ready and returns the live URL. It regenerates `.env.production` from `.env.local`; everything the app needs is `NEXT_PUBLIC_*` and passes the skill's allowlist — confirm `NEXT_PUBLIC_PAYWALL_APP_SLUG` is among them, or the setup route 500s in production and the browser asks the platform about an unnamed app. There is no token to carry: the app holds none. Server mode is required: never set `output: 'export'`. Afterwards:

- add the deployed origin to the platform's allowed redirect origins;
- put it in `src-tauri/tauri.conf.json` → `build.frontendDist` (see below).

## Native apps (Tauri v2)

`src-tauri/` is a thin WebView shell: `tauri dev` loads `http://localhost:3000` and release builds load `build.frontendDist`, the deployed origin. Nothing is bundled, so there is no static export and the paywall's server routes keep working. Until `frontendDist` holds a real URL it points at a `.invalid` host on purpose, so a forgotten value fails loudly instead of shipping a blank app.

Prerequisites: [rustup](https://rustup.rs), `pnpm install --ignore-scripts`, and nothing else on port 3000. Linux also needs `libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`; Windows needs the Visual Studio Build Tools C++ workload and WebView2; macOS needs `xcode-select --install`.

```bash
pnpm exec tauri icon path/to/logo.png   # every icon size from one square PNG (1024 px recommended)
pnpm exec tauri dev                     # desktop, this OS
pnpm exec tauri build                   # desktop release: .dmg/.app, .exe/.msi, .deb/.AppImage
```

iOS (macOS with Xcode):

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
pnpm exec tauri ios init
pnpm exec tauri ios dev "iPhone 16 Pro Max"   # device names: xcrun simctl list devices
pnpm exec tauri ios build                     # .ipa under src-tauri/gen/apple/build/
```

Android (Android Studio with SDK and NDK):

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm exec tauri android init
pnpm exec tauri android dev "Pixel_9"         # device names: adb devices
pnpm exec tauri android build                 # APK; add --aab for the Play Store
```

Mobile SSO cannot return from an `https://` page into a native app, so it comes back through the custom scheme: `TAURI_CUSTOM_SCHEME=vibe-agent` in `iblai.env`, mapped to `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` in the deployed env.

Signed desktop releases: copy `desktop-signing.env.example` to `desktop-signing.env`, then `make -f desktop-release.mk macos-dmg` (signed and notarized universal DMG) or `make -f desktop-release.mk windows-nsis`. `.github/workflows/tauri-build-desktop.yml` builds unsigned macOS, Windows and Linux artifacts on demand (Actions → Run workflow). The signed release workflows that trigger on `app-v*` tags are in `/iblai-vibe-ops-build`'s `assets/tauri/workflows/`.

Stores: `/iblai-vibe-ops-release` generates a Makefile and Fastlane config (`make ios-release`, `make android-release`); `/iblai-vibe-windows-msix` packages an MSIX for the Microsoft Store. A binary locked to one platform: `IBL_TENANT=<key> pnpm exec tauri build`.

## Releases

Releases are automated with [release-it](https://github.com/release-it/release-it), the way the OS does it. Every push to `main` runs `.github/workflows/release.yml`: it reads the conventional commit subjects since the last tag, bumps the version in `package.json` (`feat:` minor, `fix:` patch, a `!` or a `BREAKING CHANGE` footer major, anything else patch), prepends the entries to `CHANGELOG.md`, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z` and publishes a GitHub Release with the same notes. The release commit is skipped by the workflow, so there is no loop. Only typed subjects reach the changelog, which is what the commitlint hook in `.husky/commit-msg` enforces. The first release, made while no `v*` tag exists, is 1.0.0.

Nothing to configure: the job releases with the built-in `GITHUB_TOKEN`, so the release commit, the tag and the GitHub Release show as `github-actions[bot]`. Pushes made with that token never trigger other workflows; a workflow that must run on the `v*` tag would need a personal access token instead, as the OS uses.

Never edit `CHANGELOG.md` or the `package.json` version by hand. `pnpm release` is for CI; locally use `pnpm release --dry-run --git.pushRepo=<remote>` to preview (release-it expects `origin`). The desktop shell is versioned on its own: `src-tauri/tauri.conf.json` is set by hand and built on demand, see above.

## Testing

| Command                                | Does                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Next.js with Turbopack. `next build` type-checks with the project-local TypeScript 7 `tsc`                                                              |
| `pnpm typecheck`                       | `oxlint --type-check` (tsgo diagnostics)                                                                                                                |
| `pnpm lint`, `pnpm check`              | `oxlint --type-aware`; lint plus typecheck                                                                                                              |
| `pnpm fmt`, `pnpm fmt:check`           | oxfmt                                                                                                                                                   |
| `pnpm test`                            | vitest (config, source paths, platform resolution, paywall helpers, platform-metadata store, the browser paywall rail, route handlers, chat-row labels) |
| `pnpm test:e2e`                        | Playwright against real SSO (credentials in `e2e/.env.development`)                                                                                     |

Run `pnpm check`, `pnpm test` and `pnpm build` before a pull request; `pnpm test:e2e` when you change a user journey.

TypeScript is installed twice on purpose: `typescript` is aliased to the TS 6 package (the JavaScript compiler API Next.js loads) and `@typescript/native` to TS 7, so `tsc` is the Go compiler and `tsc6` the old one. That is the setup from [vercel/next.js#95633](https://github.com/vercel/next.js/discussions/95633); Next 16.3 runs the local `tsc` during `next build` by default (`experimental.useTypeScriptCli`, see `node_modules/next/dist/docs`).

## Project Structure

```
app/
├── layout.tsx                          # Root layout — wraps everything in <IblaiProviders>
├── (app)/
│   ├── layout.tsx                      # Signed-in shell: SDK SidebarProvider + PlatformSidebar + navbar, one scroller
│   ├── page.tsx                        # Chat — SDK <Chat> inside the pay gate (?session= restores, ?new= starts fresh)
│   ├── analytics/                      # SDK <AnalyticsLayout> over eight pages
│   ├── about/  profile/  account/  notifications/[[...id]]/
├── setup/                              # The one setup question (outside the shell, no navbar)
├── sso-login-complete/                 # SSO landing
└── api/paywall/admin/
    ├── setup/                          # Admin rail — forwards the admin's own platform token
    └── connect/                        # Connect with Stripe relay — same token; GET status, POST start, DELETE
components/
├── sidebar/                            # app-sidebar.tsx (PlatformSidebar wrapper), recent-chats.tsx, chat-row.tsx, flat-nav-row.tsx
├── navbar/                             # nav-bar.tsx, logo.tsx, user-profile-button.tsx, admin-mode-switch.tsx
├── setup/setup-screen.tsx              # The question, then Connect with Stripe
├── loading-screen.tsx                  # The one loading / busy screen (OS look)
└── pay-gate.tsx  pay-modal.tsx         # The send gate around <Chat>, and the pay modal it opens (Stripe's embedded checkout)
lib/
├── paywall.ts  paywall-admin.ts        # Server-only: the admin routes' plumbing, platform-metadata store
├── paywall-client.ts                   # Browser side: the buyer rail straight to the platform (catalogue, checkout, access), setup and access checks
├── chat-rows.ts                        # Recents row labels
└── iblai/                              # config.ts (env), tenant.ts, admin-mode.tsx, auth-utils.ts, storage-service.ts
providers/iblai-providers.tsx           # initializeDataLayer + AuthProvider + TenantProvider + i18n
store/iblai-store.ts                    # Redux store (slice keys fixed by the SDK)
proxy.ts                                # CSP and the 404 for /about when the flag is off
src-tauri/                              # Thin WebView shell for desktop and mobile
.github/workflows/                      # release.yml (release-it on every push to main), tauri-build-desktop.yml (desktop bundles on demand)
.husky/commit-msg                       # commitlint
```

## Built With

- [Next.js](https://nextjs.org) — App Router, Turbopack
- [@iblai/iblai-js](https://www.npmjs.com/package/@iblai/iblai-js) — SDK for auth, the shell, chat, analytics, profile and account
- [Tailwind CSS](https://tailwindcss.com) — utility-first styling with ibl.ai design tokens
- [shadcn/ui](https://ui.shadcn.com) — accessible UI primitives (base-nova)
- [Tauri v2](https://tauri.app) — native desktop and mobile shells
- [iblai.app](https://iblai.app) — the platform: auth, agents, entitlement, analytics

## Contributing

### Setup

1. Clone the repo
2. Install dependencies: `pnpm install --ignore-scripts`
3. `pnpm husky` once: the install skips `prepare`, so the commit-msg hook (commitlint) is not there otherwise
4. Fill `iblai.env` and `.env.local` (see Quick Start), then `pnpm dev`

### Development Workflow

1. Create a branch from `main`: `git checkout -b feat/my-feature`
2. Make your changes; `pnpm fmt` the files you touched
3. Run `pnpm check`, `pnpm test` and `pnpm build`
4. Commit with a conventional subject (`feat:`, `fix:`, `docs:`, `chore:`… — commitlint checks it; it decides the next version and the changelog) and push your branch
5. Open a pull request against `main`

### Guidelines

- **Use ibl.ai SDK components first** — do not build custom components when an SDK equivalent exists; shadcn/ui (`pnpm dlx shadcn@latest add <component> -y`) for everything else
- **Host SDK panels the way the OS does** — full width, no card, the component's own background; read `AGENTS.md` before wrapping one
- **Do not override SDK styles** — SDK components ship with their own styling
- **Never set `output: 'export'`** — the paywall needs the server routes
- **The app holds no platform secret** — no `IBLAI_API_KEY`, no Stripe key; the buyer's own token and the admin's own token are the only credentials it sends, and secrets never go into platform metadata (everything under `apps.<slug>` is public by design)
- **A new env key lands in `.env.example` and this README** in the same change; a new route lands with a test in `__tests__/`
- **Use `pnpm`** as the package manager

### Adding Features

Use the [iblai/vibe](https://github.com/iblai/vibe) skills with Claude Code:

```
/iblai-vibe-auth          # SSO authentication (already wired)
/iblai-vibe-agent-chat    # Agent chat (already wired)
/iblai-vibe-profile       # Profile page (already wired)
/iblai-vibe-account       # Account/org settings (already wired)
/iblai-vibe-analytics     # Analytics dashboard (already wired)
/iblai-vibe-notification  # Notification centre (already wired)
/iblai-vibe-invite        # Invite dialogs
/iblai-vibe-ops-deploy    # Deploy to ibl.ai hosting
/iblai-vibe-ops-build     # Desktop/mobile builds
/iblai-vibe-ops-upgrade   # Upgrade SDK and skills
```

See `AGENTS.md` for the full list and the component priority rules.

## Resources

- [ibl.ai Documentation](https://ibl.ai/docs)
- [Vibe](https://github.com/iblai/vibe) — developer toolkit for building with ibl.ai
- [@iblai/mcp](https://www.npmjs.com/package/@iblai/mcp) — MCP server for AI-assisted development
- [iblai-app-cli](https://github.com/iblai/iblai-app-cli) — CLI for scaffolding ibl.ai apps
- [ibl.ai/os](https://github.com/iblai/os) — the open-source agent platform this app mirrors
- [HQ](https://github.com/iblai/hq) — sister app for org / profile / analytics management

---

<sub>Built with <a href="https://github.com/iblai/vibe">ibl.ai Vibe</a></sub>
