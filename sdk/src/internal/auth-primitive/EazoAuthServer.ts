import { decryptUserInfo } from "./decrypt";
import type { EazoAuthServerConfig, SessionToken, UserInfo } from "./types";

/**
 * Server-side auth verifier. Decrypts an encrypted session token (produced by
 * the Eazo Mobile bridge or the /api/open/app-session-token exchange) using
 * EAZO_PRIVATE_KEY. Both Mobile and Web produce the same SessionToken shape,
 * so verification is a single code path with no environment detection.
 */
export class EazoAuthServer {
  private readonly privateKey: string;

  constructor(config: EazoAuthServerConfig) {
    if (!config.privateKey) throw new Error("@eazo/sdk: privateKey is required");
    this.privateKey = config.privateKey;
  }

  /**
   * Decrypts a session token and returns the user's identity.
   * @param session - The parsed x-eazo-session payload (encryptedData, encryptedKey, iv, authTag).
   * @throws if the token is missing required fields or decryption fails.
   */
  verifySession(session: SessionToken): UserInfo {
    const { encryptedData, encryptedKey, iv, authTag } = session;
    if (!encryptedData || !encryptedKey || !iv || !authTag) {
      throw new Error("Incomplete session token");
    }
    return decryptUserInfo({
      encryptedData,
      encryptedKey,
      iv,
      authTag,
      privateKey: this.privateKey,
    });
  }
}
