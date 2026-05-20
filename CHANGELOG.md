# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (breaking — plain-web hosts only)

- **`<EazoProvider>` now wraps host children in a `.eazo-app-area`
  scroll container on plain-web hosts** so the SDK's `position: fixed`
  bottom banner can't overlap a host's own bottom-fixed UI (sticky
  toolbar, glass CTA, mobile tab bar). Host code that does
  `position: fixed; bottom: 0` now anchors to the wrapper's edge —
  ABOVE our banner — automatically. **No host changes required for
  the layout fix itself**, but several `window`-level APIs change
  behaviour. Activation is scoped to plain-web hosts (gated by the
  `eazo-host-web` class on `<html>`, set by banner-ui on mount); in
  the mobile WebView and in embedded iframes the wrapper is rendered
  as an inert `<div>` and host semantics are unchanged.

  **Why**: pre-existing `<html>` padding compensation only affected
  flow-layout content. `position: fixed` resolves to the viewport, not
  the padded `<html>` box, so host's fixed-bottom UI still overlapped
  our 72-78px bottom banner. The wrapper has `transform: translateZ(0)`
  which establishes a containing block, so host's `position: fixed`
  descendants now resolve to the wrapper instead.

  **Affected web APIs on plain-web hosts** (no impact in mobile WebView
  or iframes):

  | API                                                 | Before                  | After (in `.eazo-app-area`)       |
  | --------------------------------------------------- | ----------------------- | --------------------------------- |
  | `window.scrollY` / `window.pageYOffset`             | host content scroll     | always `0`                        |
  | `window.scrollTo()` / `window.scrollBy()`           | scrolls host content    | no-op                             |
  | `window.addEventListener('scroll', …)`              | fires on host scroll    | never fires                       |
  | `document.body.style.overflow = 'hidden'`           | locks scroll            | no effect (body isn't scrolling)  |
  | Host `position: fixed` (incl. modals at `inset: 0`) | relative to viewport    | contained to wrapper edges        |

  **Migration**:

  - Read the wrapper element when you need the host scroll position:
    ```js
    const scroller = document.querySelector(".eazo-app-area");
    scroller?.addEventListener("scroll", onScroll);
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
    ```
  - Body-scroll-lock: target the wrapper instead of `<body>`. Most
    modern modal libraries (Radix, Headless UI, etc.) portal to
    `document.body` and don't need changes; legacy custom modals that
    set `body.overflow = 'hidden'` do.
  - `IntersectionObserver`, scroll-container refs, and framework
    scroll APIs are unaffected.

### Added

- `--eazo-handoff-top` / `--eazo-handoff-bottom` CSS custom properties
  on `<html>`, set whenever the handoff banners are mounted. Available
  for host coordination (e.g. anchoring a tooltip just above the bottom
  banner: `bottom: calc(var(--eazo-handoff-bottom, 0px) + 12px);`).
- `eazo-host-web` class on `<html>`, set whenever banner-ui mounts in
  plain-web mode. Internal — the gate for `.eazo-app-area` styles. Host
  code should not depend on this class.

## [0.13.0] - 2026-05-08

Bundles the changes intended for 0.12.0 (never published) with the 0.13 work.

### Added
- `HelloEnvelope.apiBase` (top-level, optional). Hosts inject the Eazo platform URL they target; the SDK routes its own platform calls through it. Internal — not exposed via `DeviceContext`.
- `setHostApiBase` private slot in `internal/config.ts`. `getPlatformApiBase()` priority: explicit override → host-injected → env-name list → default.
- `<EazoProvider appId={...}>` prop. Recommended path on Next.js / Remix: read `process.env.EAZO_APP_ID` from a Server Component, pass via prop. No `NEXT_PUBLIC_*` alias needed.
- `auth.requestLogout` RPC. Mobile delegates `auth.logout()` to the host instead of clearing local session unilaterally.

### Changed (breaking)
- **`DeviceContext.backendUrl` removed.** Apps that read `device.backendUrl` (via `useEazo` or `device.getContext()`) get a TypeScript error. The platform URL is now an SDK-internal concern, surfaced only through `getPlatformApiBase()`.
- **`appId` is configured via `<EazoProvider appId>` or `setAppId()`** rather than `auth.configure({ appId })`. Env-name fallback (`EAZO_APP_ID` plus `NEXT_PUBLIC_EAZO_APP_ID` / `EXPO_PUBLIC_EAZO_APP_ID` / `VITE_EAZO_APP_ID` / `PUBLIC_EAZO_APP_ID` / `REACT_APP_EAZO_APP_ID`) kept as a safety net.
- `getApiBase` → `getPlatformApiBase`. `DEFAULT_API_BASE` → `DEFAULT_PLATFORM_API_BASE`. Renamed across all capabilities (`auth`, `share`, `storage`, `memory`, `ai`) and `auth-primitive`.

### Removed
- The duplicated `getApiBase()` helper that lived in `server.ts`; `notifications.publish` now uses the shared `getPlatformApiBase()`.

## [0.11.0] - 2026-04-30

### Added
- `memory.reportAction` is forwarded to the mobile host as a fire-and-forget side-channel (in addition to the existing `/api/open/gum/action` HTTP POST). Mobile uses this to react to user actions inside an embedded app without polling Gum.
- `notifications` capability — frontend RPCs (`subscribe`, `unsubscribe`, `isSubscribed`) routed through the host bridge; web fallback resolves `{ subscribed: false }`.
- `notifications.publish` server helper exported from `@eazo/sdk/server`. Signs an ES256K JWT with `EAZO_PRIVATE_KEY` and POSTs `/api/open/notifications/publish`. Throws `EazoNotificationPublishError` on platform errors.

## [0.10.0] - 2026-04-29

### Removed (breaking)
- `DeviceContext.safeArea` and the `device.safeArea.changed` event. Apps reach for `env(safe-area-inset-*)` / `100dvh` for native edge-to-edge layout.
- `useSafeAreaCssVars` hook in `<EazoProvider>`. The `--eazo-safe-area-top` / `--eazo-safe-area-bottom` CSS custom properties are no longer published.

## [0.9.0] - 2026-04-28

### Changed (breaking)
- **`ready` envelope: `publicKey` → `appId`.** Apps no longer ship the developer ECC public key over the bridge; the host receives the Eazo `appId` and resolves the keypair backend-side. `EazoAuthClientConfig` accepts `appId` instead of `publicKey`.

## [0.8.1] - 2026-04-27

### Removed
- `share.configure({ downloadUrl })`. The web download CTA's URL is now hard-coded to the platform default; configuration was unused.

## [0.8.0] - 2026-04-26

### Added
- `memory` capability — Gum memory service client (sessions, messages, contextual memory, user action events). Shared between mobile and web paths.

## [0.7.0] - 2026-04-25

### Added
- `ai` capability — OpenAI-compatible signature routing through the Eazo platform AI gateway.

## [0.6.0] - 2026-04-24

### Added
- `storage` capability — presigned S3 upload / download (`storage.upload`, `storage.getCredentials`).

## [0.5.0] - 2026-04-22

### Added
- `auth.login(options?)` / `showLogin()` / `hideLogin()` / `loginUIOpen` — unified login entry point. On Eazo Mobile hosts that advertise `auth.requestLogin`, delegates to the native host flow; otherwise renders the SDK-bundled `<LoginUI />` inside the Web context. Idempotent (resolves immediately when already signed in), default 5-minute timeout, cancel surfaces as `DENIED`.
- Bundled `<LoginUI />` mounted automatically by `<EazoProvider>`. Adds `@radix-ui/react-dialog` as a runtime dependency; keeps zero Tailwind / shadcn / lucide coupling (styles injected at runtime, inline SVG icons).
- Protocol v1 additive: `ready` envelope now carries an optional `publicKey` field so hosts can exchange a session token against the app's own developer key without a backend `appId → creator → DeveloperKey` lookup.
- Shared internal config module (`src/internal/config.ts`) backing the publicKey resolver for both the bridge and the auth capability.

### Changed
- Merged `@eazo/auth` primitives into `@eazo/sdk`. `EazoAuthClient` / `EazoAuthServer` / `decrypt` / `decryptUserInfo` are now internal implementation details of the SDK (`src/internal/auth-primitive/`). App code goes through `auth.*` and `requireAuth`.
- Added `authing-js-sdk` and `elliptic` as direct dependencies of `@eazo/sdk` (previously transitive via `@eazo/auth`).
- `fetchWebUserProfile` now extracts `{ user }` from the `/api/user/profile` response envelope and always hits a same-origin path (no longer concatenates `NEXT_PUBLIC_EAZO_API_URL`).

### Removed
- `@eazo/auth` package (source + directory). Repository now ships a single SDK package.
- `EazoAuthClient.loginByEazoMobile()` and `EazoAuthClient.isEazoMobile()` — superseded by the SDK's own host bridge (`auth.login()` routes automatically).

## [0.1.0] - 2026-03-13

### Added
- Initial release of @eazo/node-sdk
- `decrypt()` function for decrypting encrypted data
- `decryptUserInfo()` convenience function for user information
- Support for ECC secp256k1 + AES-256-GCM hybrid encryption
- TypeScript type definitions
- Comprehensive documentation (English and Chinese)
- Unit tests

### Security
- Secure hybrid encryption implementation
- Input validation and error handling
- Private key format validation
