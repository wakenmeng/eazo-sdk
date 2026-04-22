// ---------------------------------------------------------------------------
// Shared types for @eazo/auth
// ---------------------------------------------------------------------------

export interface UserInfo {
  userId: string;
  email?: string;
  nickname?: string;
  avatarUrl?: string;
  lang?: string;
  region?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface DecryptOptions {
  /** Base64-encoded encrypted data */
  encryptedData: string;
  /** Base64-encoded encrypted AES key (ephemeral pubkey + IV + ciphertext) */
  encryptedKey: string;
  /** Base64-encoded AES-GCM IV */
  iv: string;
  /** Base64-encoded AES-GCM auth tag */
  authTag: string;
  /** Developer private key — 64 hex characters (secp256k1) */
  privateKey: string;
}

export interface DecryptResult<T = unknown> {
  data: T;
  raw: string;
}

export interface SocialConnection {
  id: string;
  provider: string;
  identifier: string;
  name: string;
  name_en: string;
  tooltip: { "zh-CN": string; "en-US": string };
  tagsStatus: boolean;
}

export interface EazoAuthClientConfig {
  /** Developer ECC public key — used to exchange a GenAuth JWT for an encrypted session token. */
  publicKey: string;
  /** GenAuth Application ID. Defaults to the Eazo platform app. */
  authAppId?: string;
  /** GenAuth tenant domain. Defaults to https://eazo.genauth.ai */
  authAppDomain?: string;
  /** Eazo API base URL. Defaults to https://eazo.ai */
  apiBase?: string;
}

export interface EazoAuthServerConfig {
  /** EAZO_PRIVATE_KEY — required for session decryption */
  privateKey: string;
}
