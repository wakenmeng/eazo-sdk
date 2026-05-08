/**
 * Shared runtime configuration — kept dependency-free so both bootstrap
 * and capability modules can read/write without circular imports.
 */

let appId: string | null = null;

/** Default Eazo platform API base. */
export const DEFAULT_PLATFORM_API_BASE = "https://eazo.ai";

function readEnvByNames(names: readonly string[]): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

const APP_ID_ENV_NAMES = [
  "EAZO_APP_ID",
  "NEXT_PUBLIC_EAZO_APP_ID",
  "EXPO_PUBLIC_EAZO_APP_ID",
  "VITE_EAZO_APP_ID",
  "PUBLIC_EAZO_APP_ID",
  "REACT_APP_EAZO_APP_ID",
] as const;

const API_BASE_ENV_NAMES = [
  "EAZO_API_BASE",
  "EAZO_API_URL",
  "NEXT_PUBLIC_EAZO_API_URL",
  "EXPO_PUBLIC_EAZO_API_URL",
  "VITE_EAZO_API_URL",
  "PUBLIC_EAZO_API_URL",
  "REACT_APP_EAZO_API_URL",
] as const;

/**
 * Override the app id imperatively. Required for Vite — Vite only
 * substitutes `import.meta.env.VITE_*`, not `process.env.VITE_*`, so the
 * env-name fallback list below cannot reach Vite values without a shim.
 */
export function setAppId(id: string | null): void {
  appId = id;
}

/** Returns the configured Eazo app ID, or null if unset. */
export function getAppId(): string | null {
  if (appId) return appId;
  return readEnvByNames(APP_ID_ENV_NAMES);
}

/** Returns the configured API base URL. */
export function getApiBase(override?: string): string {
  if (override) return override.replace(/\/$/, "");
  const fromEnv = readEnvByNames(API_BASE_ENV_NAMES);
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_PLATFORM_API_BASE;
}

export function readAppIdFromEnv(): string | null {
  return readEnvByNames(APP_ID_ENV_NAMES);
}

export function __resetConfig(): void {
  appId = null;
}
