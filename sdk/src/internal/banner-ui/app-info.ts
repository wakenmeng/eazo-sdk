import { getPlatformApiBase } from "../config";

/**
 * Per-caller flags returned alongside `PublicAppInfo`. Always present
 * (`isOwner: false` for anonymous callers). Extend with more
 * viewer-specific bits as needed; mirrors `PublicAppViewerDto` on the
 * backend.
 */
export interface PublicAppViewer {
  /**
   * True when the request carried a valid JWT and the authenticated
   * user owns this app.
   */
  isOwner: boolean;
}

/**
 * App entity fields safe to expose publicly. Mirrors `PublicAppDataDto`
 * on the backend.
 */
export interface PublicAppData {
  id: string;
  name: string;
  shortTitle?: string;
  /** One-line tagline next to the app name. Sourced from CreatorApp.tagline. */
  tagline?: string;
  /** Long-form description. Sourced from App.description. */
  description?: string;
  /**
   * App logo — emoji glyph or image URL. Sourced from CreatorApp.icon.
   * Distinct from `coverUrl` (the large banner image).
   */
  icon?: string;
  /** Large cover / banner image URL. Sourced from App.coverUrl. */
  coverUrl?: string;
  category: string[];
  slug: string;
  region?: string;
  showType: string;
  url?: string;
  likeNum: number;
  uv: number;
  commentsCount: number;
}

/**
 * Top-level response from `GET /api/apps-open/:appId`. Mirrors
 * `PublicAppInfoDto` on the backend. The entity (`app`) is separated
 * from request-level metadata (`viewer`) so the entity surface stays
 * clean as new per-caller flags get added (favorites, permissions, etc.).
 * The endpoint is anonymous-accessible; `viewer.isOwner` is `false` for
 * unauthenticated callers.
 */
export interface PublicAppInfo {
  app: PublicAppData;
  viewer: PublicAppViewer;
}

/**
 * Maximum time to wait on the platform before treating the fetch as
 * "no data" and returning null. Bounds the worst-case impact on
 * SSR TTFB when portal-agent-server is slow/unreachable — without this,
 * the server `EazoProvider` would block the response indefinitely.
 */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Fetches the public profile for the configured app. Returns `null` on
 * any error (network, 404, timeout, malformed response, missing appId)
 * so the caller can render a fallback rather than blowing up — the
 * handoff overlay is a promo surface and should degrade gracefully when
 * the platform is unreachable.
 *
 * Hits `GET <apiBase>/api/apps-open/:appId`. `apiBase` resolves from the
 * caller-supplied `options.apiBase` first (useful when the host already
 * has the value resolved from a server-only env var on the SSR side),
 * then falls back to the SDK's standard chain via `getPlatformApiBase()`.
 *
 * Wraps the request in a 2-second timeout by default. Callers that need
 * a different bound (or want to drive cancellation from their own
 * AbortController) can pass `options.signal`; it composes with the
 * default timeout via `AbortSignal.any`.
 *
 * The endpoint is anonymous — no identity is forwarded. `viewer.isOwner`
 * always returns `false`.
 */
export async function fetchPublicAppInfo(
  appId: string,
  options: { signal?: AbortSignal; apiBase?: string | null } = {},
): Promise<PublicAppInfo | null> {
  if (!appId) return null;
  const base = options.apiBase
    ? options.apiBase.replace(/\/$/, "")
    : getPlatformApiBase();
  const url = `${base}/api/apps-open/${encodeURIComponent(appId)}`;
  // Compose the caller signal with the timeout so either can abort:
  // - `AbortSignal.timeout` aborts the fetch after DEFAULT_TIMEOUT_MS
  // - the caller's own signal still works for explicit cancellation
  // `AbortSignal.any` is available in Node 20+, modern browsers, and
  // every runtime targeted by `@eazo/sdk` server / client.
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    // Backend envelope: { code, message, data }. `code === 0` means ok.
    const json = (await res.json()) as {
      code?: number;
      data?: PublicAppInfo | null;
    };
    if (typeof json.code === "number" && json.code !== 0) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}
