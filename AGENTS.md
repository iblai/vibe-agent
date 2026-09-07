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
"publish it" — do the steps below in this order, as one run: clone,
onboarding, preview, deployment, with no "shall I go on?" between steps (the
only questions are the ones the steps name). If the repo is not cloned yet,
`git clone https://github.com/iblai/vibe-agent` first, then do everything
inside it (`cd vibe-agent` for every command) so this file governs; this
section is the procedure. It is written for a Claude that controls a
browser; where it cannot, each browser step says what the person does
instead. Never type the person's password or card for them; the Platform
API Token is yours to mint and to write into env. Never print `.env.local`,
`iblai.env` or a token, and never ask for a key or token in chat.

1. **Sign the creator in.** Open https://login.iblai.app/me. A sign-in
   screen means they are not signed in: ask exactly one question with two
   choices, nothing else — **"Do you have an ibl.ai account?"** — **Yes, I'll
   sign in** (leave the tab on the sign-in screen and wait for them) or
   **No, create one for me** (navigate to https://ibl.ai/join, ibl.ai's own
   $0 sign-up: it creates the account and a platform with them as admin and
   leaves them signed in; wait there). While they are on the sign-in page
   or on ibl.ai/join, take no screenshot and read nothing from that tab —
   it is their email and card; wait for them to say they are done. Then
   re-navigate to `/me` (the platform redirects elsewhere after a login).
   Without a browser: the same two choices with the links, and wait for
   them to say they are in.
2. **Read the platform off `/me`.** The page lists the account's username
   and every platform with its key. **`main` is never a choice**: it is
   ibl.ai's shared default platform that everyone lands in, not the
   person's own, and this app refuses it. Leave it out; one other platform
   → take it; several → ask which; none besides `main` → they have no
   platform of their own yet: go back to step 1's "No, create one for me"
   (ibl.ai/join). Check the key:
   `curl -fsS https://api.iblai.app/dm/api/core/orgs/<key>/metadata/` is a
   public read, 200 means it exists, 404 means a typo. Without a browser:
   ask for the key as listed on `/me`, `main` excluded.
3. **Mint the Platform API Token, at once, and put it in env yourself.**
   From the `login.iblai.app` tab read `localStorage.getItem("dm_token")`
   and `localStorage.getItem("current_tenant")` (the extension's
   `javascript_tool`; the second says which platform that session is scoped
   to). Then run this one command with `<key>`, `<username>` and
   `<dm_token>` filled in: it mints the token and writes both env files from
   their templates in one go, and prints a masked confirmation only — the
   token itself appears nowhere. You do this. Do not show the token, do not
   say it back, do not ask them to copy it anywhere.

   ```bash
   KEY=<key>; USERNAME=<username>; DM_TOKEN=<dm_token>; NAME=vibe-agent
   RESP=$(curl -sS -X POST https://api.iblai.app/dm/api/core/platform/api-tokens/ \
     -H "Authorization: Token $DM_TOKEN" -H 'Content-Type: application/json' \
     -d "{\"username\":\"$USERNAME\",\"name\":\"$NAME\",\"key\":\"\",\"platform_key\":\"$KEY\",\"created\":\"$(date -u +%FT%TZ)\",\"expires\":\"\"}")
   TOKEN=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("key",""))' 2>/dev/null)
   [ -n "$TOKEN" ] || { echo "mint failed: $(printf '%s' "$RESP" | head -c 300)"; exit 1; }
   [ -f .env.local ] || cp .env.example .env.local; [ -f iblai.env ] || cp iblai.env.example iblai.env
   python3 - "$KEY" "$TOKEN" <<'PY'
   import pathlib, re, sys
   key, tok = sys.argv[1], sys.argv[2]
   for f, pairs in ((".env.local", [("NEXT_PUBLIC_MAIN_TENANT_KEY", key), ("IBLAI_API_KEY", tok)]),
                    ("iblai.env", [("PLATFORM", key), ("TOKEN", tok)])):
       p = pathlib.Path(f); s = p.read_text()
       for k, v in pairs:
           s = re.sub(rf"^{k}=.*$", f"{k}={v}", s, flags=re.M)
       p.write_text(s)
   PY
   echo "written: platform $KEY, token ${TOKEN:0:3}…${TOKEN: -2} in .env.local and iblai.env"
   ```

   "mint failed … must make a unique set" → run it again with
   `NAME=vibe-agent-2`. **Never mint a token for `main`**: `KEY` is the
   person's own platform from step 2, and if `current_tenant` is `main` (a
   fresh account often is) or the mint answers 401/403, have them switch to
   their platform in os.ibl.ai (org dropdown, top right), then read
   `dm_token` again. `PAYWALL_APP_SLUG` stays `vibe-agent`; change nothing
   else in either file. Steps 1–3 are one motion for a new creator:
   register, and the key and token are in env. Without a browser: they
   create a token themselves (os.ibl.ai → any agent → Edit → API → Create
   API key) and put it in both files with an editor; wait for them to say it
   is done.

4. **The agent and the app's name.** With the token, list the platform's
   agents: `GET https://api.iblai.app/dm/api/search/orgs/<key>/users/<username>/mentors/`
   (`Authorization: Api-Token $IBLAI_API_KEY`, the value read from
   `.env.local` in the shell, never echoed). One → use it; several → ask
   which; none → ask for a name and one line on what it does, and create it:
   `POST https://api.iblai.app/dm/api/ai-mentor/orgs/<key>/users/<username>/mentor-with-settings/`
   with `{"template_name": "ai-mentor", "new_mentor_name": "<name>", "display_name": "<name>", "system_prompt": "<line>"}`;
   the answer's `unique_id` is the agent. Ask what they call the app; the
   agent's name is the default.
5. **Save the app's configuration on the platform.** It lives in the
   platform's public metadata, not in env:
   `PUT https://api.iblai.app/dm/api/core/orgs/<key>/metadata/` with the
   `Api-Token` header and
   `{"metadata": {"apps": {"vibe-agent": {"agent_id": "<unique_id>", "app_name": "<name>"}}}}`
   (the platform deep-merges; the paywall choice under the same object is
   untouched). Confirm with the public GET: `metadata.apps["vibe-agent"].agent_id`.
6. **Install and start.** Node 20 or newer (22 recommended) and pnpm 11
   (`corepack enable`, or `npm i -g pnpm`); `pnpm install --ignore-scripts`,
   `pnpm husky` (the commit hook), and, with port 3000 free
   (`ss -ltnp 'sport = :3000'`), `pnpm dev` in the background. Wait for
   "Ready", then open http://localhost:3000 in the browser: they sign in
   with the session they already have and land on `/setup`, the one setup
   question. Without a browser: tell them the URL.
7. **Payments.** `GET https://api.iblai.app/dm/api/ai-account/orgs/<key>/masked-integration-credential/`
   with the `Api-Token` header says whether the platform has a `stripe`
   credential. Without one, and if they want to charge: on `/setup` pick a
   paid answer so the Monetize screen shows, and ask them to type their
   restricted Stripe key there themselves (the browser saves it to the
   platform; you never see it — no screenshot and no reading of that tab
   while they type; wait for them to say it is saved). Then ask, in chat,
   free, one-time or
   monthly, and the USD price, and set it:
   `POST http://localhost:3000/api/paywall/admin/setup` with
   `{"access": "free"|"one_time"|"monthly", "amount": <cents or null>}`,
   `Authorization: Token <dm_token>` (the app's own session on the
   localhost tab, or the login tab's) and an `Idempotency-Key`; confirm
   with `GET http://localhost:3000/api/paywall/prices`. Free needs no
   Stripe key at all.
8. **Preview.** Reload http://localhost:3000/ and check the agent answers.
9. **Publish** on our hosting — part of the run, not an offer. Ask only the
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
  linked as a member; a visitor without an account types their email on
  `/paywall`, an account is made for it, and they pay on the same page — one
  Stripe page, no sign-up. Nobody who is a member ever sees a payment page.

### Map

| Where                                                                    | What                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(app)/`                                                             | Signed-in shell: the SDK sidebar (`components/sidebar/`), navbar, `AdminModeProvider`. `/about` (card), `/profile`, `/account`, `/notifications` (full-height SDK panels) live here.                                                                                                                                  |
| `app/(app)/(paid)/`                                                      | No gate (whoever is signed in here is a member): `/` (SDK `Chat`) and `/analytics/*` — the SDK `AnalyticsLayout` tab strip over eight pages (Overview, Users, Topics, Transcripts, Memory, Costs, Audit, Data Reports), Admin mode only.                                                                              |
| `app/paywall/`                                                           | The join page (public; an email field for strangers), Stripe Checkout hand-off, return page (links the buyer and finishes their sign-in). Outside `(app)` on purpose: it must render for people the platform does not know yet.                                                                                       |
| `app/setup/`                                                             | The setup question, outside `(app)` so it has no navbar (the SDK `OnboardingShell` is the page). Sign-in gated by the providers like everything else.                                                                                                                                                                 |
| `app/sso-login-complete/`                                                | SSO landing, outside the auth gate.                                                                                                                                                                                                                                                                                   |
| `app/api/paywall/{access,checkout,prices}/`                              | Buyer rail: the server calls the platform with `IBLAI_API_KEY` — as the platform (the key owner's path) to mint the checkout, verify the session and link the buyer; as the buyer for the ledger. `prices` is public and carries the app's name from the platform's metadata.                                         |
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
- The agent and the app's name are not env. They are `apps.<slug>.agent_id`
  and `apps.<slug>.app_name` in the platform's public metadata, written by the
  Get and run procedure (or any admin), read by the root layout once per
  request and handed to the browser as `window.__ENV__` — the runtime layer
  `config.defaultAgentId()` / `config.appName()` already read first. Never
  invent an agent: list the platform's, or ask for the
  `os.ibl.ai/platform/<platform-key>/<uuid>` URL.
- Accounts for strangers are made by the buyer rail through the platform's
  SCIM endpoint, before Stripe, because the ledger recognises a payment only
  by the username stamped on the session at mint; membership comes with the
  payment, never before. A stranger's sign-in afterwards is the platform's:
  tokens minted for the key (`consolidated-token/provision`, only where
  ibl.ai enabled it) or an email code from the login SPA.
- The Platform API Token is minted only from the creator's own browser
  session by the procedure (or by the creator in the OS) and lives in env as
  `IBLAI_API_KEY`; the app never creates, stores or shows one.
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
The session also carries `ibl_user_id`, so the return path needs no sign-in:
`retrieveSession` (`expand[]=subscription`) and `joinFromSession` read the
buyer off the session's own metadata, require `status: complete` and
`payment_status: paid` (or a live subscription), link them with
`POST /api/core/users/platforms/` `{user_id, platform_key, active}` (the key
is an admin credential), then call `paywall/access/?session_id=` as the buyer
so the platform records the payment. A signed-in buyer's session must still
be theirs (`verifyAndJoin`; a leaked return URL joins nobody new). Nothing is a webhook: the platform's paywall is verified polling by
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
`PUBLIC_ROUTES` and skip the `TenantProvider`. The page's Sign in returns to
`/` (`redirectTo` in localStorage); a non-member lands on `/paywall` again
through the providers.

A visitor without an account types their email on the join page and pays on
the same Stripe page. `POST /api/paywall/checkout` without a sign-in takes
`{price_id, email}`: `ensureUser()` creates the ibl.ai account through the
platform's SCIM endpoint (`POST /api/orgs/<key>/scim/v2/Users`, the app's key;
a derived username `<local part>_<6 hex>`, the email, no password, no
`platformOrgs` — so no membership yet), then mints the checkout for that
username as for anyone else. An email the platform already knows makes SCIM
answer 400 ("username mismatch"), which the route turns into 409 "sign in
first"; a non-member's existing email cannot be looked up with the key. Back
on `/paywall/return`, the page sends the email it kept in `sessionStorage`
(`paywall_email`) along with the session id; the server links the buyer from
the session's metadata and, when that email is the one that paid
(`customer_details.email`), asks the platform to mint the buyer's tokens
(`provisionTokens`). Where ibl.ai has enabled provisioning for the platform
the answer is the login SPA's `data=` shape and the page finishes the sign-in
through the app's own `/sso-login-complete`; where it is off (404) the page
sends them to the SPA's `/login?email=…`, which mails a sign-in code, and the
SPA lands them on `/` (`redirectTo`). Either way they land in the app, never
on `/paywall`: the SPA's return carries no platform list, so only a page
under the `TenantProvider` can see the new membership. The OS and the LMS do
not use any of this: they send strangers to the SPA's `/join`, which
self-joins them — closed on a paid platform.

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
| `IBLAI_API_KEY`                                                | yes         | an alert instead of the app: the root layout refuses to render while the key is empty, a placeholder, rejected by the platform or another platform's (one config read, cached 5 min); the buyer routes 500 naming it too |
| `PAYWALL_APP_SLUG`                                             | yes         | every paywall route 500s, loudly, by design                                                                                                                                                                              |
| `PAYWALL_PRICE_IDS`                                            | yes         | optional override of the recorded choice                                                                                                                                                                                 |
| `IBLAI_APP_BASE_URL`                                           | yes         | the origin each request arrives on (right on localhost and on ibl.ai hosting); a set but malformed value 500s the paywall routes naming it                                                                               |
| `NEXT_PUBLIC_SHOW_ABOUT`                                       | no          | About hidden (the default)                                                                                                                                                                                               |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` | no          | code defaults                                                                                                                                                                                                            |

The agent (`agent_id`) and the app's name (`app_name`) live in the platform's
public metadata under `apps.<PAYWALL_APP_SLUG>`, next to the paywall choice —
not in env (see Get and run, step 5).

`iblai.env` (`DOMAIN`, `PLATFORM`, `TOKEN`) feeds the skills, not the app. Never
echo `TOKEN` or `IBLAI_API_KEY`.

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
  drops everything else: the two keys a deploy needs pass, and
  `IBLAI_APP_BASE_URL` is optional (a deployed app uses its own origin).
- SCIM (`/api/orgs/<key>/scim/v2/Users`, the app's key) creates a user with no
  platform link when `platformOrgs` is omitted, answers 200 with the existing
  user for a known `userName`, and 400 "Username mismatch" for a fresh
  `userName` on a known email; its list filters only the platform's own
  members, so a stranger's existing email cannot be looked up.
- The login SPA completes a code, password or token login without the
  `tenant` it was asked for, lands on the user's first platform, and its
  `data=` carries no `tenants`: send sign-ins to `/` (the `TenantProvider`
  re-reads memberships there), never to `/paywall`; a user with zero
  platforms ends on the SPA's 409 page, so link before sign-in.
- `window.__ENV__` is written by the root layout from the platform's public
  metadata (`apps.<slug>`), keys with values only, with the CSP nonce from
  the `x-nonce` request header; `lib/iblai/config.ts` reads it before
  `process.env`.
- `consolidated-token/provision` (tokens for a user of the platform, minted
  for the key) answers 404 until ibl.ai sets
  `ENABLE_PLATFORM_CONSOLIDATED_PROXY_PROVISIONING` for the platform; the app
  treats that as "sign in by email code", not as an error.
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
