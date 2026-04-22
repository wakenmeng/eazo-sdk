import type { SessionToken, SocialConnection } from "@eazo/auth";
import { EazoAuthClient } from "@eazo/auth";

import type { User } from "../../types";
import { BridgeErrorObject } from "../bridge/protocol";
import { getBridge, waitForBootstrap } from "../bootstrap";
import { setAuth, store } from "../store";

const SESSION_STORAGE_KEY = "eazo.session";

type AuthListener = (user: User | null) => void;

interface AuthConfig {
  publicKey?: string;
}

let authClient: EazoAuthClient | null = null;
let authConfig: AuthConfig = {};
const listeners = new Set<AuthListener>();

function getAuthClient(): EazoAuthClient {
  if (authClient) return authClient;
  const publicKey =
    authConfig.publicKey ??
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EAZO_PUBLIC_KEY : undefined);
  if (!publicKey) {
    throw new Error(
      "@eazo/sdk: missing public key. Set NEXT_PUBLIC_EAZO_PUBLIC_KEY or call auth.configure({ publicKey }).",
    );
  }
  authClient = new EazoAuthClient({ publicKey });
  return authClient;
}

function readLocalSession(): SessionToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionToken) : null;
  } catch {
    return null;
  }
}

function writeLocalSession(session: SessionToken | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

function notifyListeners(user: User | null): void {
  for (const l of listeners) l(user);
}

async function fetchWebUserProfile(session: SessionToken): Promise<User> {
  const apiBase =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EAZO_API_URL : "") ?? "";
  const url = apiBase ? `${apiBase.replace(/\/$/, "")}/api/user/profile` : "/api/user/profile";
  const res = await fetch(url, {
    headers: { "x-eazo-session": JSON.stringify(session) },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`);
  }
  const payload = (await res.json()) as Record<string, unknown>;
  return normalizeUser(payload);
}

function normalizeUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.userId ?? raw.id ?? ""),
    email: (raw.email as string) ?? null,
    name: (raw.nickname as string) ?? (raw.name as string) ?? null,
    avatarUrl: (raw.avatarUrl as string) ?? null,
  };
}

let webSessionCache: SessionToken | null = null;

function storeCurrentWebSession(): SessionToken | null {
  if (webSessionCache) return webSessionCache;
  webSessionCache = readLocalSession();
  return webSessionCache;
}

async function bootstrapWeb(): Promise<void> {
  const session = storeCurrentWebSession();
  if (!session) {
    setAuth({ user: null, loading: false, authenticated: false });
    notifyListeners(null);
    return;
  }
  try {
    const user = await fetchWebUserProfile(session);
    setAuth({ user, loading: false, authenticated: true });
    notifyListeners(user);
  } catch {
    webSessionCache = null;
    writeLocalSession(null);
    setAuth({ user: null, loading: false, authenticated: false });
    notifyListeners(null);
  }
}

async function bootstrapFromHost(): Promise<boolean> {
  const hello = await waitForBootstrap();
  if (!hello) return false;
  setAuth({
    user: hello.session.user,
    loading: false,
    authenticated: hello.session.authenticated,
  });
  notifyListeners(hello.session.user);

  const bridge = getBridge();
  bridge?.on("auth.changed", (payload) => {
    const data = payload as {
      authenticated: boolean;
      user: User | null;
      token?: string | null;
    };
    setAuth({
      user: data.user,
      authenticated: data.authenticated,
      loading: false,
    });
    notifyListeners(data.user);
  });
  return true;
}

let bootstrapPromise: Promise<void> | null = null;

function ensureBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const fromHost = await bootstrapFromHost();
    if (!fromHost) await bootstrapWeb();
  })();
  return bootstrapPromise;
}

/** Internal: trigger the auth bootstrap without reading a getter. */
export function _bootstrapAuth(): Promise<void> {
  return ensureBootstrap();
}

export function __resetAuthCapability(): void {
  bootstrapPromise = null;
  webSessionCache = null;
  listeners.clear();
  authClient = null;
  authConfig = {};
}

export const auth = {
  /** Set configuration (public key, overriding the NEXT_PUBLIC_EAZO_PUBLIC_KEY default). */
  configure(config: AuthConfig): void {
    authConfig = { ...authConfig, ...config };
    authClient = null;
  },

  get user(): User | null {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().auth.user;
  },

  get loading(): boolean {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().auth.loading;
  },

  get authenticated(): boolean {
    return store.getSnapshot().auth.authenticated;
  },

  onChange(listener: AuthListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async getToken(): Promise<string | null> {
    await ensureBootstrap();
    const bridge = getBridge();
    if (bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<{ token: string | null }>("auth.getToken");
        return result.token;
      } catch (err) {
        if (err instanceof BridgeErrorObject && (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")) {
          /* fall through to web fallback */
        } else {
          throw err;
        }
      }
    }
    const session = storeCurrentWebSession();
    return session ? JSON.stringify(session) : null;
  },

  /** Web-only helper for request.ts: returns the raw session JSON for x-eazo-session. */
  async getSessionHeader(): Promise<string | null> {
    const bridge = getBridge();
    if (bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<{ session: SessionToken | null }>(
          "auth.getSession",
        );
        return result.session ? JSON.stringify(result.session) : null;
      } catch (err) {
        if (!(err instanceof BridgeErrorObject)) throw err;
        if (err.code !== "NOT_SUPPORTED" && err.code !== "TIMEOUT") throw err;
      }
    }
    const session = storeCurrentWebSession();
    return session ? JSON.stringify(session) : null;
  },

  async loginWithSocial(provider: string): Promise<void> {
    const session = await getAuthClient().loginWithSocial(provider);
    await completeWebLogin(session);
  },

  async loginWithEmailPassword(email: string, password: string): Promise<void> {
    const session = await getAuthClient().loginWithEmailPassword(email, password);
    await completeWebLogin(session);
  },

  async loginWithEmailCode(email: string, code: string): Promise<void> {
    const session = await getAuthClient().loginWithEmailCode(email, code);
    await completeWebLogin(session);
  },

  sendEmailCode(email: string): Promise<void> {
    return getAuthClient().sendEmailCode(email);
  },

  fetchSocialConnections(): Promise<SocialConnection[]> {
    return getAuthClient().fetchSocialConnections();
  },

  async logout(): Promise<void> {
    webSessionCache = null;
    writeLocalSession(null);
    setAuth({ user: null, loading: false, authenticated: false });
    notifyListeners(null);
  },
};

async function completeWebLogin(session: SessionToken): Promise<void> {
  webSessionCache = session;
  writeLocalSession(session);
  const user = await fetchWebUserProfile(session);
  setAuth({ user, loading: false, authenticated: true });
  notifyListeners(user);
}
