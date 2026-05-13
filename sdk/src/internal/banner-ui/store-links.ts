// TODO(banner): replace placeholders once the iOS App Store ID and Android
// package name are confirmed by the mobile team. Until then, all platforms
// fall back to the marketing site so users never hit a 404.
export const APP_STORE_URL = "https://eazo.ai/";
export const PLAY_STORE_URL = "https://eazo.ai/";
export const MARKETING_URL = "https://eazo.ai/";

// Eazo Mobile Android package. Mirrors `android.package` in
// `eazo-mobile/app.json`. Used to build the Chrome intent URL so the
// browser tries to open the installed app first.
const ANDROID_PACKAGE = "ai.eazo.portal";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function resolveStoreUrl(): string {
  if (typeof navigator === "undefined") return MARKETING_URL;
  const platform = detectPlatform(navigator.userAgent);
  if (platform === "ios") return APP_STORE_URL;
  if (platform === "android") return PLAY_STORE_URL;
  return MARKETING_URL;
}

export interface BannerCta {
  /** URL the CTA's `<a>` navigates to. */
  href: string;
  /** Store URL to fall back to when the deeplink doesn't open the app. */
  storeUrl: string;
  /**
   * Whether the caller must run a JS timeout to detect "app not installed"
   * and navigate to `storeUrl` itself. True on iOS (Safari has no native
   * fallback for unhandled custom schemes); false on Android (Chrome's
   * `intent://` URL carries its own `browser_fallback_url`) and desktop
   * (no app-open attempt to fall back from).
   */
  needsTimeoutFallback: boolean;
}

/**
 * Per-platform plan for the banner CTA. Uses Eazo Mobile's registered
 * custom scheme `eazo://` (declared in `eazo-mobile/app.json#scheme`),
 * which doesn't require any path-specific AASA / App Links entry:
 *
 * - **iOS**: `eazo://`. If the app is installed Safari opens it and the
 *   page is backgrounded; otherwise Safari shows a "Cannot open" toast
 *   and the page stays visible — the caller's JS timeout then navigates
 *   to the App Store.
 * - **Android**: Chrome `intent://` URL that wraps the same scheme and
 *   embeds `browser_fallback_url`. Chrome opens the app when installed
 *   and navigates to the fallback URL natively when not. No JS timeout
 *   needed.
 * - **Desktop**: just the marketing site; no app-open attempt.
 *
 * The previous design tried `https://eazo.ai/` as a Universal Link, but
 * eazo.ai's AASA / App Links autoVerify only registers `/p/*`, so the
 * root URL was treated as a regular web page on both platforms.
 */
export function resolveBannerCta(): BannerCta {
  if (typeof navigator === "undefined") {
    return { href: MARKETING_URL, storeUrl: MARKETING_URL, needsTimeoutFallback: false };
  }
  const platform = detectPlatform(navigator.userAgent);
  if (platform === "ios") {
    return { href: "eazo://", storeUrl: APP_STORE_URL, needsTimeoutFallback: true };
  }
  if (platform === "android") {
    const fallback = encodeURIComponent(PLAY_STORE_URL);
    return {
      href: `intent://#Intent;scheme=eazo;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
      storeUrl: PLAY_STORE_URL,
      needsTimeoutFallback: false,
    };
  }
  return { href: MARKETING_URL, storeUrl: MARKETING_URL, needsTimeoutFallback: false };
}
