export type Host = "eazoMobile" | "embeddedIframe" | "web";

/**
 * Detects the runtime host. Used to decide whether to open the bridge transport.
 *
 *  - RN WebView:     window.ReactNativeWebView is injected by the native shell
 *  - iframe embed:   window.parent is a different window (same-origin or cross-origin)
 *  - plain browser:  neither of the above
 *
 * The return value is informational only. Capabilities never branch on it directly;
 * they branch on whether the bridge completed handshake.
 */
export function getHost(): Host {
  if (typeof window === "undefined") return "web";
  if ((window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView) {
    return "eazoMobile";
  }
  if (window.parent && window.parent !== window) return "embeddedIframe";
  return "web";
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}
