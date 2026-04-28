import { getApiBase, getAppId } from "../config";
import { getHost } from "../env";
import { auth } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryActionParams {
  /** Readable description of the user action, e.g. "User clicked the publish button on the app editor page" */
  content: string;
  /** ISO 8601 timestamp. Defaults to now when omitted. */
  timestamp?: string;
  /** Associate this action with a Gum session ID */
  session_id?: string;
  /** Action category, e.g. "click", "search", "page_view" */
  event_type?: string;
  /** Page identifier where the action occurred, e.g. "app_editor" */
  page?: string;
  /**
   * Structured event data. Must include `appid` (auto-injected from NEXT_PUBLIC_EAZO_APP_ID
   * when omitted) plus any event-specific fields.
   */
  metadata?: Record<string, unknown>;
  /** Device identifier */
  device_id?: string;
  /** App identifier */
  app?: string;
  /**
   * Platform. Auto-detected when omitted:
   *   "ios"     — React Native WebView on iOS
   *   "android" — React Native WebView on Android
   *   "web"     — plain browser
   */
  platform?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect platform from the runtime environment.
 * Returns "ios" or "android" when running inside the Eazo Mobile WebView,
 * "web" otherwise.
 */
function detectPlatform(): string {
  if (typeof window === "undefined") return "web";
  if (getHost() === "eazoMobile") {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "android";
    return "ios";
  }
  return "web";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const memory = {
  /**
   * Report a user action event to Gum memory service.
   *
   * Requires the user to be authenticated — the current session is forwarded
   * automatically via `x-eazo-session`. The app ID is read from
   * `NEXT_PUBLIC_EAZO_APP_ID` or set via `auth.configure({ appId })`.
   *
   * `metadata.appid` is automatically set to the app ID when not supplied.
   * `platform` is auto-detected ("ios" / "android" / "web") when not supplied.
   *
   * @example
   * ```ts
   * await memory.reportAction({
   *   content: "User clicked the publish button on the app editor page",
   *   event_type: "click",
   *   page: "app_editor",
   *   metadata: { type: "click" },
   * });
   * ```
   */
  async reportAction(params: MemoryActionParams): Promise<void> {
    const appId = getAppId();
    if (!appId) {
      throw new Error(
        "@eazo/sdk: missing app id. Set NEXT_PUBLIC_EAZO_APP_ID or call auth.configure({ appId }).",
      );
    }

    const session = await auth.getSessionHeader();
    if (!session) {
      throw new Error(
        "@eazo/sdk: user is not authenticated. Call auth.login() before reporting memory actions.",
      );
    }

    // Ensure metadata.appid is always present.
    const metadata: Record<string, unknown> = { appid: appId, ...params.metadata };

    // Auto-detect platform when not provided by the caller.
    const platform = params.platform ?? detectPlatform();

    const payload: MemoryActionParams = { ...params, metadata, platform };

    const res = await fetch(`${getApiBase()}/api/open/gum/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eazo-appid": appId,
        "x-eazo-session": session,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = `Failed to report memory action: ${res.status}`;
      try {
        const body = await res.json() as { message?: string };
        if (body?.message) message = body.message;
      } catch { /* ignore */ }
      throw new Error(message);
    }
  },
};
