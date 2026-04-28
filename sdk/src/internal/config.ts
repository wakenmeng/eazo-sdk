/**
 * Shared runtime configuration — kept dependency-free so both bootstrap
 * and capability modules can read/write without circular imports.
 */

let appId: string | null = null;
const DEFAULT_API_BASE = "https://eazo.ai";

export function setAppId(id: string | null): void {
  appId = id;
}

/**
 * Returns the configured Eazo app ID. Falls back to
 * NEXT_PUBLIC_EAZO_APP_ID when no explicit override has been set via
 * `auth.configure({ appId })`.
 */
export function getAppId(): string | null {
  if (appId) return appId;
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_EAZO_APP_ID) {
    return process.env.NEXT_PUBLIC_EAZO_APP_ID;
  }
  return null;
}

/**
 * Returns the configured API base URL.
 * Priority: explicit override -> NEXT_PUBLIC_EAZO_API_URL -> default.
 */
export function getApiBase(override?: string): string {
  if (override) return override.replace(/\/$/, "");
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_EAZO_API_URL) {
    return process.env.NEXT_PUBLIC_EAZO_API_URL.replace(/\/$/, "");
  }
  return DEFAULT_API_BASE;
}

export function __resetConfig(): void {
  appId = null;
}
