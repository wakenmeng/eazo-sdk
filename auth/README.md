# @eazo/auth

Unified auth SDK for the Eazo platform. Handles both **Eazo Mobile** (encrypted session via native bridge) and **Web** (GenAuth / Authing OIDC) in a single package — both paths produce the same `SessionToken` shape, so your server always uses one code path to verify identity.

## Installation

```bash
npm install @eazo/auth
```

## Key Concepts

| Term | Description |
|---|---|
| `SessionToken` | Encrypted payload (`encryptedData`, `encryptedKey`, `iv`, `authTag`) produced by either Mobile or Web login |
| `EazoAuthClient` | **Browser-side** — logs in via social / email / Eazo Mobile and returns a `SessionToken` |
| `EazoAuthServer` | **Server-side** — decrypts a `SessionToken` and returns `UserInfo` |
| `EAZO_PRIVATE_KEY` | 64-hex secp256k1 private key — lives in your server environment, never sent to the browser |

---

## Quick Start

### 1. Browser — log in and get a session token

```typescript
import { EazoAuthClient } from '@eazo/auth';

const client = new EazoAuthClient({
  publicKey: process.env.NEXT_PUBLIC_EAZO_PUBLIC_KEY!, // paired with EAZO_PRIVATE_KEY
});

// Eazo Mobile (WebView)
if (client.isEazoMobile()) {
  const session = await client.loginByEazoMobile();
  // pass `session` to your API as x-eazo-session
}

// Email + password
const session = await client.loginWithEmailPassword('user@example.com', 'password');

// Email + verification code
await client.sendEmailCode('user@example.com');
const session = await client.loginWithEmailCode('user@example.com', '123456');

// Social (WeChat, GitHub, …)
const session = await client.loginWithSocial('wechat');
```

### 2. Server — verify the session and get user info

```typescript
import { EazoAuthServer } from '@eazo/auth';

const auth = new EazoAuthServer({
  privateKey: process.env.EAZO_PRIVATE_KEY!,
});

// session comes from the x-eazo-session request header (JSON-parsed)
const user = auth.verifySession(session);
console.log(user.userId, user.email, user.nickname);
```

---

## API Reference

### `EazoAuthClient`

```typescript
new EazoAuthClient(config: EazoAuthClientConfig)
```

| Config field | Type | Default | Description |
|---|---|---|---|
| `publicKey` | `string` | **required** | Developer ECC public key (secp256k1, paired with `EAZO_PRIVATE_KEY`) |
| `authAppId` | `string` | Eazo platform app | GenAuth Application ID |
| `authAppDomain` | `string` | `https://eazo.genauth.ai` | GenAuth tenant domain |
| `apiBase` | `string` | `https://eazo.ai` | Eazo API base URL |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `isEazoMobile()` | `boolean` | Detects if running inside the Eazo Mobile WebView |
| `loginByEazoMobile()` | `Promise<SessionToken>` | Fetches session token from the native bridge (result cached per page load) |
| `loginWithEmailPassword(email, password)` | `Promise<SessionToken>` | Email + password login |
| `loginWithEmailCode(email, code)` | `Promise<SessionToken>` | Email + verification code login |
| `sendEmailCode(email)` | `Promise<void>` | Sends a login verification code to the given email |
| `loginWithSocial(extIdpIdentifier)` | `Promise<SessionToken>` | Social login popup (WeChat, GitHub, etc.) |
| `fetchSocialConnections()` | `Promise<SocialConnection[]>` | Lists the social login providers enabled for the app |
| `getAuthingClient()` | `AuthenticationClient` | Returns the underlying GenAuth client (for advanced usage) |

---

### `EazoAuthServer`

```typescript
new EazoAuthServer(config: EazoAuthServerConfig)
```

| Config field | Type | Description |
|---|---|---|
| `privateKey` | `string` | `EAZO_PRIVATE_KEY` — 64 hex characters (secp256k1) |

#### Methods

| Method | Returns | Description |
|---|---|---|
| `verifySession(session)` | `UserInfo` | Decrypts a `SessionToken` and returns the user's identity |

---

### `decrypt` / `decryptUserInfo` (low-level)

Use these if you need to decrypt raw payloads directly, without `EazoAuthServer`.

```typescript
import { decrypt, decryptUserInfo } from '@eazo/auth';

// Generic — returns { data: T, raw: string }
const result = decrypt<MyType>({
  encryptedData: '...',
  encryptedKey: '...',
  iv: '...',
  authTag: '...',
  privateKey: process.env.EAZO_PRIVATE_KEY!,
});

// Convenience — returns UserInfo directly
const user = decryptUserInfo({ encryptedData, encryptedKey, iv, authTag, privateKey });
```

---

## Types

```typescript
interface UserInfo {
  userId: string;
  email?: string;
  nickname?: string;
  avatarUrl?: string;
  lang?: string;
  region?: string;
  createdAt?: string;
  [key: string]: unknown;
}

type SessionToken = {
  encryptedData: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  [key: string]: string;
};
```

---

## Encryption Scheme

The encrypted session uses a hybrid encryption scheme:

1. **ECDH** (secp256k1) — ephemeral keypair generates a shared secret
2. **SHA-256** — derives a 256-bit AES key from the shared secret
3. **AES-256-CBC** — unwraps the per-message AES key
4. **AES-256-GCM** — decrypts the actual payload with authentication

The server's `EAZO_PRIVATE_KEY` never leaves the server environment.

---

## Publishing

Push a semver tag to trigger the CI publish workflow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The CI will build and publish `@eazo/auth` to npm automatically.

## License

MIT
