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
 * Fetches the public profile for the configured app. Returns `null` on
 * any error (network, 404, malformed response, missing appId) so the
 * caller can render a fallback rather than blowing up — the handoff
 * overlay is a promo surface and should degrade gracefully when the
 * platform is unreachable.
 *
 * Hits `GET <apiBase>/api/apps-open/:appId`. apiBase resolves via the
 * SDK's standard chain (`getPlatformApiBase()`).
 */
export async function fetchPublicAppInfo(
  appId: string,
  signal?: AbortSignal,
): Promise<PublicAppInfo | null> {
  if (!appId) return null;
  // const url = `${getPlatformApiBase()}/api/apps-open/${encodeURIComponent(appId)}`;
  const url = `${getPlatformApiBase()}/api/apps-open/i0BN493ulDJrDPgR`;
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
