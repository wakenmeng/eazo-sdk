/**
 * Shared runtime configuration — kept dependency-free so both bootstrap
 * and capability modules can read/write without circular imports.
 */

let publicKey: string | null = null;

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

export function __resetConfig(): void {
  publicKey = null;
}
