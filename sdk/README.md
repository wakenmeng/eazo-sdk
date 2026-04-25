# @eazo/sdk

Capability-first SDK for web apps that run both on a standard browser and inside the Eazo Mobile WebView. Write one codebase; the SDK picks the right implementation for the runtime.

## Install

```bash
npm install @eazo/sdk
```

## Quick start

```tsx
// app/layout.tsx
import { EazoProvider } from "@eazo/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <EazoProvider>{children}</EazoProvider>;
}
```

```tsx
// Any component
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

export function Header() {
  const user = useEazo((s) => s.auth.user);
  if (!user) return <button onClick={() => auth.loginWithSocial("google")}>Sign in</button>;
  return <span>Hi, {user.name}</span>;
}
```

## API

### `auth`

```ts
import { auth } from "@eazo/sdk";

auth.user                                   // User | null
auth.loading                                // boolean
auth.authenticated                          // boolean
auth.loginUIOpen                            // boolean (web login UI)
await auth.getToken()                       // string | null
auth.onChange((user) => { ... })            // () => void (unsubscribe)

// One-stop login — handles every runtime and idempotent if already signed in.
const user = await auth.login()             // User
await auth.login({ timeoutMs: 120_000 })    // custom timeout (default: 5 min)
auth.showLogin()                            // imperative open (no await)
auth.hideLogin()                            // imperative close (rejects pending login())

// Low-level login primitives (rarely needed; `login()` orchestrates these).
await auth.loginWithSocial("google")
await auth.loginWithEmailPassword(email, password)
await auth.loginWithEmailCode(email, code)
await auth.sendEmailCode(email)
await auth.logout()

auth.fetchSocialConnections()               // SocialConnection[]
auth.configure({ publicKey: "..." })        // set developer public key
```

By default the SDK reads `NEXT_PUBLIC_EAZO_PUBLIC_KEY` from the environment. Call `auth.configure({ publicKey })` if you need to set it explicitly.

#### `auth.login()` — unified login flow

`auth.login()` is the canonical way to sign a user in. It:

1. Returns the current user immediately if already authenticated (idempotent).
2. On Eazo Mobile (host advertises `auth.requestLogin`), delegates to the native host login UI.
3. Otherwise, shows the SDK-bundled login modal (social providers + email / code / password).

```tsx
<button onClick={async () => {
  await auth.login();
  doSomethingProtected();
}}>
  Do something
</button>
```

It rejects with `DENIED` if the user cancels, or `TIMEOUT` after 5 minutes of inactivity (configurable via `timeoutMs`).

### `device`

```ts
import { device } from "@eazo/sdk";

device.platform                             // 'web' | 'mobile'
device.locale                               // 'zh-CN' | ...
device.safeArea                             // { top: number; bottom: number }
device.backendUrl                           // '' when running web-only
device.getContext()                         // full DeviceContext
```

`<EazoProvider>` also mirrors `device.safeArea` onto `document.documentElement` as CSS custom properties so app layouts can avoid host chrome without reading device state directly:

```css
/* On the web SDK falls back to 0; inside Eazo Mobile the host fills in the
   effective reserved area (status bar on top, "Hosted by Eazo" chrome on
   the bottom). */
body {
  padding-top: var(--eazo-safe-area-top, 0px);
  padding-bottom: var(--eazo-safe-area-bottom, 0px);
}
```

### `share`

Hand share materials (text + images) to the platform's compose surface. Inside the Eazo Mobile WebView the host opens its native compose page, AI-drafts a post from the inputs, and lets the user edit and publish; in a plain browser the SDK shows a "Continue in the Eazo app" CTA.

```ts
import { share } from "@eazo/sdk";

await share.compose({
  text: "Made carbonara tonight — first time the egg didn't scramble.",
  images: ["data:image/jpeg;base64,..."],   // up to 4; data: or https:
  sourceAppId: "recipe-keeper",             // optional attribution
});
// → { accepted: true } in the mobile app
// → { accepted: false } on the web (download CTA shown)

share.configure({ downloadUrl: "https://eazo.app/get" });
```

`share.compose` throws `INVALID_ARGS` synchronously if neither `text` nor `images` is provided, or if more than 4 images are passed.

### React integration

```ts
import { EazoProvider, useEazo } from "@eazo/sdk/react";
```

Rule: inside React render, read reactive state via `useEazo(selector)`. Outside render (event handlers, effects, non-React code), read directly from `auth.xxx` / `device.xxx`.

```tsx
const user = useEazo((s) => s.auth.user);
const { platform, safeArea } = useEazo((s) => s.device);
```

### Server (Next.js route handler)

```ts
import { requireAuth } from "@eazo/sdk/server";

export function GET(req: NextRequest) {
  const r = requireAuth(req);
  if (!r.ok) return r.response;
  // r.user: User
}
```

Requires `EAZO_PRIVATE_KEY` in the server environment.

### Testing

```ts
import { __resetSDK, __dispatchHostMessage } from "@eazo/sdk/testing";

afterEach(() => __resetSDK());
```

## Types

```ts
interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface DeviceContext {
  platform: "web" | "mobile";
  locale: string;
  safeArea: { top: number; bottom: number };
  backendUrl: string;
}
```

## How it works

The SDK talks to the Eazo Mobile host over `postMessage` using the protocol documented in [PROTOCOL.md](./PROTOCOL.md). When no host responds within 1.5 seconds, the SDK falls back to web-native implementations (GenAuth for login, `localStorage` for session, `navigator.language` for locale).

App code never branches on environment — the capability API is the same on both platforms.

## Environment

| Variable | Required | Used by |
|---|---|---|
| `NEXT_PUBLIC_EAZO_PUBLIC_KEY` | web login | `auth.loginWith*` |
| `NEXT_PUBLIC_EAZO_API_URL` | optional | default `backendUrl` when web-only |
| `EAZO_PRIVATE_KEY` | server | `requireAuth` |
