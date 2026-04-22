# Eazo SDK Protocol (v1)

This document specifies the `postMessage` protocol between an Eazo app (web) and its host (Eazo Mobile WebView, or an iframe embed). `@eazo/sdk` is the reference implementation on the app side; host implementations (mobile, backend-driven embed) must conform to this spec.

## Transport

- Channel: `eazo-sdk`
- Version: `1`
- Encoding: JSON string
- App → host: `window.ReactNativeWebView.postMessage(payload)` (RN WebView) or `window.parent.postMessage(payload, "*")` (iframe)
- Host → app: environment-specific `postMessage` dispatch

Every envelope carries `ch: "eazo-sdk"` and `v: 1`. Messages that don't match are silently ignored — the SDK and host must co-exist with other libraries that also use `postMessage`.

## Envelope types

```ts
type Envelope =
  | Ready           // app → host
  | Hello           // host → app  (in response to Ready)
  | Request         // app → host
  | Response        // host → app  (in response to Request)
  | Event;          // host → app  (unsolicited)

interface Ready      { ch: "eazo-sdk"; v: 1; t: "ready"; }

interface Hello {
  ch: "eazo-sdk"; v: 1; t: "hello";
  session:       { authenticated: boolean; user: User | null; token: string | null };
  device:        DeviceContext;
  capabilities:  string[];   // e.g. ["auth.*", "device.getContext", "storage.get"]
}

interface Request    { ch: "eazo-sdk"; v: 1; t: "req"; id: string; fn: string; args?: unknown; }

interface ResponseOk { ch: "eazo-sdk"; v: 1; t: "res"; id: string; ok: true;  data?: unknown; }
interface ResponseErr{ ch: "eazo-sdk"; v: 1; t: "res"; id: string; ok: false; err: BridgeError; }

interface Event      { ch: "eazo-sdk"; v: 1; t: "evt"; name: string; data?: unknown; }

interface BridgeError {
  code: "NOT_SUPPORTED" | "TIMEOUT" | "DENIED" | "INVALID_ARGS" | "INTERNAL";
  message: string;
}
```

## Handshake

1. App mounts → sends `{ t: "ready" }`
2. Host responds with `{ t: "hello", session, device, capabilities }`
3. App caches the hello payload as initial state; subsequent RPCs and events apply to this cache
4. If the app does not receive `hello` within **1.5 s**, it enters pure-web mode (no further requests are sent)

## RPC

- `id` is app-generated, unique per session (UUID or counter)
- Response MUST echo the same `id`
- Timeout: **10 s** — if no response arrives, the app throws `TIMEOUT`

## Method and event naming

- Method names (`fn`): `<capability>.<action>`; action is camelCase
  - Examples: `auth.getToken`, `auth.getSession`, `device.getContext`, `storage.get`
- Event names (`name`): `<capability>.<event>`; past tense or state descriptor
  - Examples: `auth.changed`, `device.safeArea.changed`

## Capability advertisement

Host declares which functions it supports in `hello.capabilities`. Format:

- `auth.*` — all `auth.<anything>` supported
- `auth.getToken` — only this specific method

The app checks this list before sending a request; unsupported methods fail immediately with `NOT_SUPPORTED` (app then falls back to web-native behavior).

## Error semantics

| Code | Meaning | App behavior |
|---|---|---|
| `NOT_SUPPORTED` | Method not advertised in `capabilities` | Fall back to web-native |
| `TIMEOUT` | No response in 10 s | Fall back to web-native |
| `DENIED` | Host / user refused (permission, policy) | Surface to business code |
| `INVALID_ARGS` | Request args failed validation | Surface to business code |
| `INTERNAL` | Host error | Log + surface |

## First-version method and event catalog

### Methods

| `fn` | `args` | `data` | Notes |
|---|---|---|---|
| `auth.getToken` | — | `{ token: string \| null }` | Current session token |
| `auth.getSession` | — | `{ session: SessionToken \| null }` | Raw encrypted session (`x-eazo-session` payload) |
| `auth.requestLogin` | `{ preferredProvider?: string }` (optional) | `{ started: boolean }` | Host should display its native login UI and return promptly (don't block on user). The SDK then waits for `auth.changed` (success) or `auth.loginCancelled` (dismiss). If the host can't show native UI, respond `NOT_SUPPORTED` — SDK falls back to the web login UI inside the WebView. |
| `device.getContext` | — | `DeviceContext` | Usually unused — hello already contains this |

### Events

| `name` | `data` | Trigger |
|---|---|---|
| `auth.changed` | `{ authenticated, user, token }` | Login, logout, account switch |
| `auth.loginCancelled` | — (optional `{ reason?: string }`) | User dismissed the native login UI without authenticating. Causes the app's in-flight `auth.login()` to reject with `DENIED`. |
| `device.safeArea.changed` | `{ top?, bottom? }` | Keyboard / orientation |

## Version evolution

- **Breaking change** → bump `v`; host replies `NOT_SUPPORTED` if mismatched
- **New capability** → append to `capabilities` only; v stays
- **Method arg change** → new fields optional (backward-compatible); incompatible changes use a new method name

## Minimal host implementation

```ts
window.addEventListener("message", (e) => {
  const msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
  if (msg?.ch !== "eazo-sdk" || msg.v !== 1) return;

  if (msg.t === "ready") {
    send({
      ch: "eazo-sdk", v: 1, t: "hello",
      session: { authenticated: true, user, token },
      device: { platform: "mobile", locale: "zh-CN",
                safeArea: { top: 44, bottom: 34 }, backendUrl: "https://api.eazo.ai" },
      capabilities: ["auth.*"],
    });
  }

  if (msg.t === "req" && msg.fn === "auth.getToken") {
    send({ ch: "eazo-sdk", v: 1, t: "res", id: msg.id, ok: true, data: { token } });
  }
});
```

Hosts that don't implement an advertised method must respond with `ok: false, err: { code: "NOT_SUPPORTED", ... }`.
