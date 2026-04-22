# Eazo SDK

Official SDK for building apps on the Eazo platform.

English | [中文](./README.zh-CN.md)

## Package

**`@eazo/sdk`** — [`sdk/`](./sdk/) — Capability-first SDK for Eazo apps. One codebase runs seamlessly in the browser and inside the Eazo Mobile WebView.

- `auth` — unified login flow (web UI in browsers; delegates to native host on Eazo Mobile), session management, user profile, token retrieval
- `device` — runtime context (platform, locale, safe area, backend URL)
- `useEazo(selector)` — React integration via `useSyncExternalStore`
- `requireAuth` — server-side decrypt + guard for Next.js API routes
- ECC secp256k1 + AES-256-GCM hybrid encryption for session tokens (built in)

**Install:**

```bash
npm install @eazo/sdk
```

**Quick example:**

```tsx
// app/layout.tsx
import { EazoProvider } from "@eazo/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <EazoProvider>{children}</EazoProvider>;
}
```

```tsx
// Anywhere in the app
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

function Header() {
  const user = useEazo((s) => s.auth.user);
  if (!user) return <button onClick={() => auth.login()}>Sign in</button>;
  return <span>Hi, {user.name}</span>;
}
```

See [`sdk/README.md`](./sdk/README.md) for the full API and [`sdk/PROTOCOL.md`](./sdk/PROTOCOL.md) for the host-app wire protocol.

## Security

The SDK implements a hybrid encryption scheme for session tokens:

- **ECC secp256k1** — key encapsulation
- **AES-256-GCM** — data encryption
- **ECDH** — shared secret
- **SHA-256** — key derivation

## Publishing

Releases are triggered by git tags. See [PUBLISHING.md](./PUBLISHING.md).

## License

MIT
