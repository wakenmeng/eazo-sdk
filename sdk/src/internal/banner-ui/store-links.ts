// TODO(banner): replace placeholders once the iOS App Store ID and Android
// package name are confirmed by the mobile team. Until then, all platforms
// fall back to the marketing site so users never hit a 404.
export const APP_STORE_URL = "https://eazo.ai/";
export const PLAY_STORE_URL = "https://eazo.ai/";
export const MARKETING_URL = "https://eazo.ai/";

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
