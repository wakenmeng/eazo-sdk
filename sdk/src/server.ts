import { EazoAuthServer } from "./internal/auth-primitive";
import type { SessionToken, UserInfo } from "./internal/auth-primitive";

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

export type { User } from "./types";
