import * as crypto from "crypto";
import { ec as EC } from "elliptic";

import { EazoAuthServer } from "./internal/auth-primitive";
import type { SessionToken, UserInfo } from "./internal/auth-primitive";
import { DEFAULT_PLATFORM_API_BASE } from "./internal/config";

import type { User } from "./types";

let authServer: EazoAuthServer | null = null;

function getAuthServer(): EazoAuthServer {
  if (authServer) return authServer;
  const privateKey = process.env.EAZO_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "@eazo/sdk/server: EAZO_PRIVATE_KEY is required for requireAuth().",
    );
  }
  authServer = new EazoAuthServer({ privateKey });
  return authServer;
}

function normalize(info: UserInfo): User {
  return {
    id: String(info.userId),
    email: info.email ?? null,
    name: info.nickname ?? null,
    avatarUrl: info.avatarUrl ?? null,
  };
}

/** Minimal Request-like shape — avoids importing next/server types. */
interface HeaderRequest {
  headers: { get(name: string): string | null };
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; response: Response };

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Server-side auth guard. Reads the `x-eazo-session` header, decrypts the
 * encrypted session with EAZO_PRIVATE_KEY, and returns the user.
 */
export function requireAuth(request: HeaderRequest): AuthResult {
  const raw = request.headers.get("x-eazo-session");
  if (!raw) return { ok: false, response: unauthorized("Missing session") };

  let parsed: SessionToken;
  try {
    parsed = JSON.parse(raw) as SessionToken;
  } catch {
    return { ok: false, response: unauthorized("Malformed session") };
  }

  try {
    const info = getAuthServer().verifySession(parsed);
    return { ok: true, user: normalize(info) };
  } catch {
    return { ok: false, response: unauthorized("Invalid session") };
  }
}

// ---------------------------------------------------------------------------
// notifications.publish — server-to-server push to subscribers of an Eazo app
// ---------------------------------------------------------------------------

const NOTIFICATIONS_PUBLISH_AUDIENCE = "eazo.notifications.publish";
const NOTIFICATIONS_PUBLISH_TTL_SECONDS = 60;

const ec = new EC("secp256k1");

export class EazoNotificationPublishError extends Error {
  readonly code: number;
  readonly publishId?: string;
  constructor(message: string, code: number, publishId?: string) {
    super(message);
    this.name = "EazoNotificationPublishError";
    this.code = code;
    this.publishId = publishId;
  }
}

function getApiBase(): string {
  // Prefer an explicit server-side env var; fall back to the same NEXT_PUBLIC
  // variable the frontend reads, then to the production default.
  const fromEnv =
    (typeof process !== "undefined" &&
      (process.env.EAZO_API_BASE || process.env.NEXT_PUBLIC_EAZO_API_URL)) ||
    "";
  return (fromEnv || DEFAULT_PLATFORM_API_BASE).replace(/\/$/, "");
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Sign an ES256K JWT in pure JS (we already have `elliptic` for session
 * decryption; pulling in `jose` just for this would double the dep surface).
 * The JWS signature is the raw `r || s` 64-byte concatenation, base64url-
 * encoded — exactly what the platform's `AppDeveloperKeyGuard` expects.
 */
function signES256K(privateKeyHex: string, payload: object): string {
  const header = { alg: "ES256K", typ: "JWT" };
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const digest = crypto.createHash("sha256").update(signingInput).digest();

  const keyPair = ec.keyFromPrivate(privateKeyHex, "hex");
  const sig = keyPair.sign(digest, { canonical: true });
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const sigBytes = Buffer.from(r + s, "hex");
  return `${signingInput}.${base64urlEncode(sigBytes)}`;
}

function getDeveloperPrivateKey(): string {
  const privateKey = process.env.EAZO_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "@eazo/sdk/server: EAZO_PRIVATE_KEY is required for notifications.publish().",
    );
  }
  return privateKey;
}

function derivePublicKey(privateKeyHex: string): string {
  return ec.keyFromPrivate(privateKeyHex, "hex").getPublic(true, "hex");
}

export interface NotificationPublishInput {
  /** Eazo app ID — must belong to the user whose private key signs the JWT. */
  appId: string;
  /** Title shown in the system push tray. Up to 120 chars. */
  title: string;
  /** Body of the notification. Up to 500 chars. */
  body: string;
  /** Optional structured payload merged into the device-side `data`. */
  data?: Record<string, unknown>;
  /** v1 only supports `subscribers`; future values may include explicit user lists. */
  audience?: "subscribers";
}

export interface NotificationPublishResult {
  delivered: number;
  publishId: string;
}

/**
 * Server-to-server publishing for app backends. Signs an ES256K JWT with the
 * developer's `EAZO_PRIVATE_KEY` and POSTs to `/api/open/notifications/publish`
 * on the Eazo platform. Subscribers (users with the per-app subscribe bit
 * set) receive an Expo system push.
 *
 * Call this from your serverless route handler at the moment of the event
 * (e.g. inside a Vercel Cron job, or a webhook receiver). The function does
 * not need a long-running backend — a fresh invocation per publish is fine.
 *
 * Throws `EazoNotificationPublishError` on non-zero response codes; the
 * error's `code` is the platform's business code (e.g. 403 for "not your
 * app", 413 for "too many subscribers", 401 for JWT problems).
 */
export const notifications = {
  async publish(input: NotificationPublishInput): Promise<NotificationPublishResult> {
    if (!input || typeof input !== "object") {
      throw new Error("notifications.publish requires an input object");
    }
    if (!input.appId) throw new Error("notifications.publish: `appId` is required");
    if (!input.title) throw new Error("notifications.publish: `title` is required");
    if (!input.body) throw new Error("notifications.publish: `body` is required");

    const privateKeyHex = getDeveloperPrivateKey();
    const publicKeyHex = derivePublicKey(privateKeyHex);
    const now = Math.floor(Date.now() / 1000);
    const jwt = signES256K(privateKeyHex, {
      iss: publicKeyHex,
      aud: NOTIFICATIONS_PUBLISH_AUDIENCE,
      iat: now,
      exp: now + NOTIFICATIONS_PUBLISH_TTL_SECONDS,
      jti: crypto.randomUUID(),
    });

    const url = `${getApiBase()}/api/open/notifications/publish`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        appId: input.appId,
        title: input.title,
        body: input.body,
        data: input.data,
        audience: input.audience ?? "subscribers",
      }),
    });

    // The platform wraps responses in { code, message, data } even on 4xx.
    type ResponseEnvelope = {
      code?: number;
      message?: string;
      data?: NotificationPublishResult | null;
    };
    let json: ResponseEnvelope | null = null;
    try {
      json = (await res.json()) as ResponseEnvelope;
    } catch {
      // Fall through to an HTTP-status-based error.
    }
    if (!json || typeof json.code !== "number") {
      throw new EazoNotificationPublishError(
        `Unexpected response from notifications.publish (HTTP ${res.status})`,
        res.status,
      );
    }
    if (json.code !== 0) {
      throw new EazoNotificationPublishError(
        json.message ?? "publish failed",
        json.code,
        json.data?.publishId,
      );
    }
    if (!json.data) {
      throw new EazoNotificationPublishError(
        "publish succeeded but response is missing data",
        500,
      );
    }
    return json.data;
  },
};

export type { User } from "./types";
