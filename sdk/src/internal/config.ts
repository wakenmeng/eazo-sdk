/**
 * Shared runtime configuration — kept dependency-free so both bootstrap
 * and capability modules can read/write without circular imports.
 */

let publicKey: string | null = null;
const DEFAULT_API_BASE = "https://eazo.ai";

export function setPublicKey(key: string | null): void {
  publicKey = key;
}

/**
 * Returns the configured developer ECC public key. Falls back to
 * NEXT_PUBLIC_EAZO_PUBLIC_KEY when no explicit override has been set via
 * `auth.configure({ publicKey })`.
 */
export function getPublicKey(): string | null {
  if (publicKey) return publicKey;
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_EAZO_PUBLIC_KEY) {
    return process.env.NEXT_PUBLIC_EAZO_PUBLIC_KEY;
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
  publicKey = null;
}
