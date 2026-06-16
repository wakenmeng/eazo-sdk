import { getAppId, getPlatformApiBase } from "../config";

const ANONYMOUS_ID_STORAGE_KEY = "eazo.sdk.analytics.anonymous_id";
const SESSION_ID_STORAGE_KEY = "eazo.sdk.analytics.session_id";
const PAGE_OPEN_SENT_PREFIX = "eazo.sdk.share_attribution.sent";

const SHARE_QUERY_KEYS = [
  "entry_source",
  "entry_source_id",
  "share_channel",
  "inviter_user_id",
  "ptnr",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "product_name",
  "app_id",
] as const;

type ShareQueryKey = (typeof SHARE_QUERY_KEYS)[number];
export type ShareAttributionAction =
  | "page_open"
  | "open_app_click"
  | "remix_click";

export interface ShareAttributionContext {
  entry_source: "share_link";
  entry_source_id?: string;
  share_channel: string;
  inviter_user_id?: string;
  ptnr?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  product_name: "creator_web" | "eazo_mobile";
  app_id?: string;
}

interface TrackShareAttributionOptions {
  appName?: string | null;
  targetUrl?: string;
  dedupePageOpen?: boolean;
}

function normalizeString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return undefined;
  return trimmed;
}

function normalizeProductName(
  value: string | null | undefined,
): ShareAttributionContext["product_name"] {
  return value === "creator_web" || value === "eazo_mobile"
    ? value
    : "eazo_mobile";
}

function normalizeShareChannel(value: string | null | undefined): string {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "copy" || normalized === "copylink" || normalized === "copy-link") {
    return "copy_link";
  }
  if (normalized === "twitter") return "x";
  if (
    normalized === "xiaohongshu" ||
    normalized === "little_red_book" ||
    normalized === "red_note"
  ) {
    return "rednote";
  }
  if (
    normalized === "more" ||
    normalized === "share_sheet" ||
    normalized === "system_share"
  ) {
    return "system";
  }
  return normalized;
}

function getCurrentUrl(): URL | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

export function getCurrentShareAttribution(): ShareAttributionContext | null {
  const url = getCurrentUrl();
  if (!url) return null;

  const entrySource = normalizeString(url.searchParams.get("entry_source"));
  const entrySourceId = normalizeString(url.searchParams.get("entry_source_id"));
  const shareChannel = normalizeString(url.searchParams.get("share_channel"));
  const isShareLink =
    entrySource === "share_link" || Boolean(entrySourceId || shareChannel);
  if (!isShareLink) return null;

  const appId =
    normalizeString(url.searchParams.get("app_id")) ??
    normalizeString(getAppId());

  return {
    entry_source: "share_link",
    entry_source_id: entrySourceId,
    share_channel: normalizeShareChannel(shareChannel),
    inviter_user_id: normalizeString(url.searchParams.get("inviter_user_id")),
    ptnr: normalizeString(url.searchParams.get("ptnr")),
    utm_source: normalizeString(url.searchParams.get("utm_source")),
    utm_medium: normalizeString(url.searchParams.get("utm_medium")),
    utm_campaign: normalizeString(url.searchParams.get("utm_campaign")),
    product_name: normalizeProductName(url.searchParams.get("product_name")),
    app_id: appId,
  };
}

export function appendCurrentShareAttribution(url: string): string {
  const attribution = getCurrentShareAttribution();
  if (!attribution) return url;

  try {
    const parsed = new URL(url);
    for (const key of SHARE_QUERY_KEYS) {
      const value = attribution[key];
      if (value) parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return appendQueryToOpaqueUrl(url, attribution);
  }
}

export function buildShareAttributionQuery(): string {
  const attribution = getCurrentShareAttribution();
  if (!attribution) return "";
  const params = new URLSearchParams();
  for (const key of SHARE_QUERY_KEYS) {
    const value = attribution[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function trackShareAttribution(
  action: ShareAttributionAction,
  options: TrackShareAttributionOptions = {},
): void {
  const attribution = getCurrentShareAttribution();
  if (!attribution) return;
  if (options.dedupePageOpen && wasPageOpenSent(attribution)) return;

  const header = buildClientContextHeader(attribution);
  if (!header || typeof fetch !== "function") return;

  if (options.dedupePageOpen) markPageOpenSent(attribution);

  const body = {
    action,
    ...attribution,
    app_name: normalizeString(options.appName),
    page_url: typeof window !== "undefined" ? window.location.href : undefined,
    target_url: options.targetUrl,
  };

  void fetch(`${getPlatformApiBase()}/api/analytics/share-attribution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Eazo-Client-Context": header,
    },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

function appendQueryToOpaqueUrl(
  url: string,
  attribution: ShareAttributionContext,
): string {
  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const separator = beforeHash.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  for (const key of SHARE_QUERY_KEYS) {
    const value = attribution[key];
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${beforeHash}${separator}${query}${hash}` : url;
}

function getOrCreateStoredId(storage: Storage | undefined, key: string, prefix: string): string {
  const existing = storage ? normalizeString(storage.getItem(key)) : undefined;
  if (existing) return existing;

  const id = `${prefix}_${randomId()}`;
  try {
    storage?.setItem(key, id);
  } catch {
    // Storage can be blocked in private browsing; keep analytics best-effort.
  }
  return id;
}

function getAnonymousId(): string {
  return getOrCreateStoredId(
    safeLocalStorage(),
    ANONYMOUS_ID_STORAGE_KEY,
    "anon_sdk",
  );
}

function getSessionId(): string {
  return getOrCreateStoredId(
    safeSessionStorage(),
    SESSION_ID_STORAGE_KEY,
    "sess_sdk",
  );
}

function wasPageOpenSent(attribution: ShareAttributionContext): boolean {
  const storage = safeSessionStorage();
  if (!storage) return false;
  const key = pageOpenDedupeKey(attribution);
  return storage.getItem(key) === "1";
}

function markPageOpenSent(attribution: ShareAttributionContext): void {
  try {
    safeSessionStorage()?.setItem(pageOpenDedupeKey(attribution), "1");
  } catch {
    // Best effort only.
  }
}

function pageOpenDedupeKey(attribution: ShareAttributionContext): string {
  return `${PAGE_OPEN_SENT_PREFIX}:${attribution.entry_source_id ?? location.href}`;
}

function buildClientContextHeader(
  attribution: ShareAttributionContext,
): string | null {
  if (typeof window === "undefined") return null;
  const context = {
    session_id: getSessionId(),
    anonymous_id: getAnonymousId(),
    product_name: attribution.product_name,
    source_platform: "eazo_sdk_web",
    client_type: "web",
    device_type: detectDeviceType(),
    platform: navigator.userAgent,
    event_time: Date.now(),
    page_url: window.location.href,
    page_referrer: document.referrer || null,
    screen_width: window.screen?.width,
    screen_height: window.screen?.height,
  };
  return encodeBase64Url(JSON.stringify(context));
}

function encodeBase64Url(value: string): string | null {
  if (typeof btoa !== "function" || typeof TextEncoder === "undefined") {
    return null;
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function detectDeviceType(): string {
  if (typeof navigator === "undefined") return "desktop";
  if (/iPhone|Android.+Mobile/i.test(navigator.userAgent)) return "phone";
  if (/iPad|Android/i.test(navigator.userAgent)) return "tablet";
  return "desktop";
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}
