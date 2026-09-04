# vibe-agent

One creator, one AI agent, one paywall. A single-tenant app on the ibl.ai
platform: users sign in with ibl.ai SSO and chat with the agent, and access to
the chat is sold on the tenant's own Stripe account. Built from
[iblai/vibe](https://github.com/iblai/vibe)'s `vibe-starter` template on the
`@iblai/iblai-js` SDK.

## What is where

| Route                  | What                                                                                                                                             | Who                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `/`                    | Chat with the agent (SDK `Chat`)                                                                                                                 | paying users, tenant admins    |
| `/analytics`           | Usage overview for this one agent (SDK `AnalyticsOverview`)                                                                                      | tenant admins, in Admin mode   |
| `/setup`               | One question — free access, one-time fee or monthly fee (USD); the Stripe product and price are created for you. Opens itself until answered     | tenant admins                  |
| `/about`               | Off by default; `NEXT_PUBLIC_SHOW_ABOUT=true` enables it. The agent's public profile plus your copy (`ABOUT_COPY` in `app/(app)/about/page.tsx`) | any signed-in user             |
| `/profile`, `/account` | SDK `Profile` / `Account`, reached from the profile dropdown                                                                                     | any signed-in user / admins    |
| `/notifications`       | SDK notification centre, reached from the bell                                                                                                   | any signed-in user             |
| `/paywall`             | Pricing page, Stripe Checkout, restore access                                                                                                    | signed-in users without access |

Tenant admins get a User / Admin switch in the navbar (in the profile menu on
narrow screens). User mode shows the app as a user sees it; Analytics exists
only in Admin mode. The switch starts on Admin and resets on reload.

The navbar logo is the org logo set in the tenant's platform org settings,
falling back to the ibl.ai mark when the platform has none.

The paywall boundary is the route group: everything under `app/(app)/(paid)/`
renders inside `PaywallGate`. `/paywall` must stay outside that group or the
gate loops. Tenant admins bypass the gate.

## Setup

1. Platform credentials go in `iblai.env` (gitignored):

   ```bash
   cp iblai.env.example iblai.env
   ```

   `PLATFORM` is your org key (listed on https://login.iblai.app/me); `TOKEN`
   is a Platform API Token. Sign up at https://ibl.ai/join if you have neither.

2. App env goes in `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

   Fill `NEXT_PUBLIC_MAIN_TENANT_KEY` (= `PLATFORM`), `IBLAI_API_KEY`
   (= `TOKEN`) and `NEXT_PUBLIC_DEFAULT_AGENT_ID`: the last path segment of the
   agent's URL on os.ibl.ai, `https://os.ibl.ai/platform/<tenant>/<agent-uuid>`.
   Create the agent there first if you have none. The API, auth and websocket
   URLs default to hosted iblai.app in `lib/iblai/config.ts`.
   The tenant comes from that env var only: a missing or placeholder key shows
   an alert instead of an app, and a tenant left in localStorage by another
   vibe app on the same origin is ignored.

3. Install and run:

   ```bash
   pnpm install --ignore-scripts
   pnpm dev
   ```

   Open http://localhost:3000 and sign in. Every origin the app runs on
   (localhost and the deployed one) must be in the tenant's allowed redirect
   origins, or sign-in never comes back.

## Paywall

The platform (DM) owns entitlement: it mints Stripe Checkout sessions on the
tenant's own Stripe key, records payments, and checks subscriptions live. No
Stripe Connect, no commission, no webhooks. The app has the server routes under
`app/api/paywall/`, one client gate (`components/paywall-gate.tsx`), the pricing
page (`app/paywall/`) and the setup screen (`app/setup`,
`components/setup/setup-screen.tsx`). The buyer-side routes are the
`/iblai-vibe-monetization-app-paywall` skill from `iblai/vibe`; the setup screen
and the setup route are this app's.

Setup is one question, asked of a tenant admin the first time they open the
app (and reachable later from the quiet "Payments setup" link on `/account`):

- **Free access** — anyone signed in can use the agent. No Stripe needed.
- **One-time fee** or **Monthly fee** — enter the price (USD). The first time, a
  second screen asks for a **restricted** Stripe key (Stripe → Developers → API keys → Create
  restricted key: write on Products, Prices, Checkout Sessions, Customers; read
  on Subscriptions). It is saved as the tenant's `stripe` integration credential
  on the platform, browser to platform; this app's server never sees it.

Save creates the Stripe product (named after the platform, tagged
`metadata.app = PAYWALL_APP_SLUG`, which is what the platform checks at
checkout) and the price, retires the previous price if the answer changed, and
records the choice in the tenant's platform metadata under
`apps.<PAYWALL_APP_SLUG>`:

```json
{
  "apps": {
    "vibe-agent": {
      "access": "monthly",
      "amount": 2900,
      "currency": "usd",
      "stripe": { "product_id": "prod_…", "price_id": "price_…" },
      "updated_at": "…"
    }
  }
}
```

That metadata is a **public read** on the platform (ids and amounts only, never
a key), so the deployed app needs no extra credential to know what it sells.
Runtime rule (`lib/paywall.ts`): `PAYWALL_PRICE_IDS`, if set, is what the app
sells; otherwise the recorded choice; free or unanswered means everyone gets
in. Test with card `4242 4242 4242 4242`. Cancellations bite within the DM cache
(about 75 s) plus up to 60 s of client grant cache.

Headless alternative, with `DOMAIN`, `PLATFORM`, `TOKEN` and `IBLAI_USERNAME`
from `iblai.env`:

```bash
PAY="https://api.$DOMAIN/dm/api/ai-mentor/orgs/$PLATFORM/users/$IBLAI_USERNAME/providers/stripe/payments"
AUTH="Authorization: Api-Token $TOKEN"

curl -s -H "$AUTH" "$PAY/products/?limit=1"
# 200 connected · 400 no `stripe` credential · 502 Stripe rejected the key · 404 backend too old

curl -s -H "$AUTH" -H 'Content-Type: application/json' -X POST "$PAY/products/" \
  -d '{"name":"vibe-agent access","metadata":{"app":"vibe-agent"}}'

curl -s -H "$AUTH" -H 'Content-Type: application/json' -X POST "$PAY/prices/" \
  -d '{"product":"prod_…","unit_amount":2900,"currency":"usd","recurring":{"interval":"month"}}'
# drop "recurring" for a one-time price

curl -s -H "$AUTH" "$PAY/paywall/payments/?app=vibe-agent"   # who paid so far
```

Then `PAYWALL_PRICE_IDS=price_xxx,price_yyy` in `.env.local`: the pricing page
describes env-listed prices from Stripe itself.

## Deploy

`/iblai-vibe-ops-deploy` (from `iblai/vibe`) zips the source, uploads it to
ibl.ai hosting with the platform token, polls until ready and returns the live
URL. It regenerates `.env.production` from `.env.local`; confirm it carries
`IBLAI_API_KEY` and `PAYWALL_APP_SLUG` (plus `PAYWALL_PRICE_IDS` if you use the
override), or the paywall routes 500 in production. Server mode is required:
never set `output: 'export'`. Afterwards:

- add the deployed origin to the tenant's allowed redirect origins;
- put it in `src-tauri/tauri.conf.json` → `build.frontendDist` (see below).

## Native apps (Tauri v2)

`src-tauri/` is a thin WebView shell: `tauri dev` loads `http://localhost:3000`
and release builds load `build.frontendDist`, the deployed origin. Nothing is
bundled, so there is no static export and the paywall's server routes keep
working. Until `frontendDist` holds a real URL it points at a `.invalid` host on
purpose, so a forgotten value fails loudly instead of shipping a blank app.

Prerequisites: [rustup](https://rustup.rs), `pnpm install --ignore-scripts`,
and nothing else on port 3000. Linux also needs
`libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`;
Windows needs the Visual Studio Build Tools C++ workload and WebView2; macOS
needs `xcode-select --install`.

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

Mobile SSO cannot return from an `https://` page into a native app, so it comes
back through the custom scheme: `TAURI_CUSTOM_SCHEME=vibe-agent` in `iblai.env`,
mapped to `NEXT_PUBLIC_TAURI_CUSTOM_SCHEME` in the deployed env.

Signed desktop releases: copy `desktop-signing.env.example` to
`desktop-signing.env`, then `make -f desktop-release.mk macos-dmg` (signed and
notarized universal DMG) or `make -f desktop-release.mk windows-nsis`.
`.github/workflows/tauri-build-desktop.yml` builds unsigned macOS, Windows and
Linux artifacts on demand (Actions → Run workflow). The signed release workflows
that trigger on `app-v*` tags are in `/iblai-vibe-ops-build`'s
`assets/tauri/workflows/`.

Stores: `/iblai-vibe-ops-release` generates a Makefile and Fastlane config
(`make ios-release`, `make android-release`); `/iblai-vibe-windows-msix`
packages an MSIX for the Microsoft Store. A binary locked to one tenant:
`IBL_TENANT=<key> pnpm exec tauri build`.

## Commands

| Command                                | Does                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`, `pnpm build`, `pnpm start` | Next.js with Turbopack. `next build` type-checks with the project-local TypeScript 7 `tsc`    |
| `pnpm typecheck`                       | `oxlint --type-check` (tsgo diagnostics)                                                      |
| `pnpm lint`, `pnpm check`              | `oxlint --type-aware`; lint plus typecheck                                                    |
| `pnpm fmt`, `pnpm fmt:check`           | oxfmt                                                                                         |
| `pnpm test`                            | vitest (config, source paths, tenant, paywall helpers, tenant-metadata store, route handlers) |
| `pnpm test:e2e`                        | Playwright against real SSO (credentials in `e2e/.env.development`)                           |

TypeScript is installed twice on purpose: `typescript` is aliased to the TS 6
package (the JavaScript compiler API Next.js loads) and `@typescript/native` to
TS 7, so `tsc` is the Go compiler and `tsc6` the old one. That is the setup from
[vercel/next.js#95633](https://github.com/vercel/next.js/discussions/95633); Next
16.3 runs the local `tsc` during `next build` by default
(`experimental.useTypeScriptCli`, see `node_modules/next/dist/docs`).
