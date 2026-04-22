# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Merged `@eazo/auth` primitives into `@eazo/sdk`. `EazoAuthClient` / `EazoAuthServer` / `decrypt` / `decryptUserInfo` are now internal implementation details of the SDK (`src/internal/auth-primitive/`). App code goes through `auth.*` and `requireAuth`.
- Added `authing-js-sdk` and `elliptic` as direct dependencies of `@eazo/sdk` (previously transitive via `@eazo/auth`).

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
