import { waitForBootstrap, getBridge } from "../bootstrap";
import {
  BridgeErrorObject,
  NOTIFICATIONS_IS_SUBSCRIBED,
  NOTIFICATIONS_SUBSCRIBE,
  NOTIFICATIONS_UNSUBSCRIBE,
} from "../bridge/protocol";

export interface NotificationsSubscriptionResult {
  /**
   * Whether the current user is subscribed to push notifications from this
   * app *after* the call resolves. On the mobile path this reflects the
   * `apps_user.flags & APP_FLAG_SUBSCRIBED_PUSH` bit. On the plain-web path
   * (no host) the SDK returns `{ subscribed: false }` and does not throw,
   * so apps can call `isSubscribed()` from a `useEffect` without crashing
   * during local web development.
   */
  subscribed: boolean;
}

/**
 * Per-app push-notification subscription, mediated by the host. The mobile
 * shell (or any host that advertises the `notifications.*` capability) maps
 * these calls onto its `apps-user/toggle-flag` + `apps-user/action/:id`
 * endpoints; the SDK never talks to the platform directly here. That keeps
 * the trust model identical to the existing favorite/like/comment toggles —
 * the host knows which app the user is currently inside and which user is
 * signed in, neither needs to be re-asserted by the embedded app.
 *
 * **Backend publishing** (the path that actually delivers a notification to
 * users) is a different surface — see `@eazo/sdk/server`'s
 * `notifications.publish(...)`. That helper is the one the app's serverless
 * handler calls (signed with `EAZO_PRIVATE_KEY`) when something interesting
 * happens; subscribed users then receive an Expo system push.
 */
export const notifications = {
  /** Returns the current subscription state without changing it. */
  async isSubscribed(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_IS_SUBSCRIBED);
  },

  /**
   * Opt the current user into push notifications from this app. Idempotent
   * (re-subscribing returns `{ subscribed: true }` either way). The user
   * still has to have granted system push permission at the OS level for
   * any actual push to arrive — this method does not prompt for it; the
   * mobile host handles permission once at login.
   */
  async subscribe(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_SUBSCRIBE);
  },

  /** Opt the current user out. Idempotent. */
  async unsubscribe(): Promise<NotificationsSubscriptionResult> {
    return invoke(NOTIFICATIONS_UNSUBSCRIBE);
  },
};

async function invoke(fn: string): Promise<NotificationsSubscriptionResult> {
  const hello = await waitForBootstrap();
  const bridge = getBridge();
  if (hello && bridge?.getStatus().ready) {
    try {
      const result = await bridge.request<NotificationsSubscriptionResult>(fn);
      return { subscribed: !!result?.subscribed };
    } catch (err) {
      if (
        err instanceof BridgeErrorObject &&
        (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")
      ) {
        // Web fallback: no host means no push channel. Return a falsey state
        // so apps can render the right UI without special-casing.
        return { subscribed: false };
      }
      throw err;
    }
  }
  return { subscribed: false };
}
