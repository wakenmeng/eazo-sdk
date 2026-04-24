import { getApiBase, getPublicKey } from "../config";
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
  /** Business ID anchors for retrieval, e.g. { app_id: "app_123" } */
  anchors?: Record<string, string>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Entity tags associated with this action */
  entities?: string[];
  /** Device identifier */
  device_id?: string;
  /** App identifier */
  app?: string;
  /** Platform, e.g. "web", "ios", "android" */
  platform?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const memory = {
  /**
   * Report a user action event to Gum memory service.
   *
   * Requires the user to be authenticated — the current session is forwarded
   * automatically via `x-eazo-session`. The developer public key is read from
   * `NEXT_PUBLIC_EAZO_PUBLIC_KEY` or set via `auth.configure({ publicKey })`.
   *
   * @example
   * ```ts
   * await memory.reportAction({
   *   content: "User clicked the publish button on the app editor page",
   *   event_type: "click",
   *   page: "app_editor",
   *   anchors: { app_id: "app_123" },
   * });
   * ```
   */
  async reportAction(params: MemoryActionParams): Promise<void> {
    const publicKey = getPublicKey();
    if (!publicKey) {
      throw new Error(
        "@eazo/sdk: missing public key. Set NEXT_PUBLIC_EAZO_PUBLIC_KEY or call auth.configure({ publicKey }).",
      );
    }

    const session = await auth.getSessionHeader();
    if (!session) {
      throw new Error(
        "@eazo/sdk: user is not authenticated. Call auth.login() before reporting memory actions.",
      );
    }

    const res = await fetch(`${getApiBase()}/api/open/gum/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eazo-publickey": publicKey,
        "x-eazo-session": session,
      },
      body: JSON.stringify(params),
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
