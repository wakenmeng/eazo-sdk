# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
