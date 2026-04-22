import * as crypto from "crypto";
import { ec as EC } from "elliptic";
import type { DecryptOptions, DecryptResult, UserInfo } from "./types";

const ec = new EC("secp256k1");

/**
 * Decrypt data encrypted with ECC secp256k1 + AES-256-GCM hybrid encryption.
 *
 * Two-stage process:
 *   1. ECDH shared secret + SHA-256 → AES-256-CBC to unwrap the AES key
 *   2. AES-256-GCM with the unwrapped key to decrypt the payload
 */
export function decrypt<T = unknown>(options: DecryptOptions): DecryptResult<T> {
  const { encryptedData, encryptedKey, iv, authTag, privateKey } = options;

  if (!encryptedData || !encryptedKey || !iv || !authTag || !privateKey) {
    throw new Error("Missing required decryption parameters");
  }
  if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
    throw new Error("Invalid private key — expected 64 hex characters");
  }

  const keyPair = ec.keyFromPrivate(privateKey, "hex");
  const encKeyBuf = Buffer.from(encryptedKey, "base64");

  const EPHEMERAL_PUBKEY_LEN = 33; // secp256k1 compressed
  const ephemeralPubKeyHex = encKeyBuf.slice(0, EPHEMERAL_PUBKEY_LEN).toString("hex");
  const cipherIv = encKeyBuf.slice(EPHEMERAL_PUBKEY_LEN, EPHEMERAL_PUBKEY_LEN + 16);
  const cipherText = encKeyBuf.slice(EPHEMERAL_PUBKEY_LEN + 16);

  const ephemeralPubKey = ec.keyFromPublic(ephemeralPubKeyHex, "hex");
  const sharedSecret = keyPair.derive(ephemeralPubKey.getPublic());
  const sharedSecretBuf = Buffer.from(sharedSecret.toString(16).padStart(64, "0"), "hex");
  const decryptionKey = crypto.createHash("sha256").update(sharedSecretBuf).digest();

  const decipher1 = crypto.createDecipheriv("aes-256-cbc", decryptionKey, cipherIv);
  const aesKey = Buffer.concat([decipher1.update(cipherText), decipher1.final()]);

  const ivBuf = Buffer.from(iv, "base64");
  const authTagBuf = Buffer.from(authTag, "base64");
  const encDataBuf = Buffer.from(encryptedData, "base64");

  const decipher2 = crypto.createDecipheriv("aes-256-gcm", aesKey, ivBuf);
  decipher2.setAuthTag(authTagBuf);

  let raw = decipher2.update(encDataBuf, undefined, "utf8");
  raw += decipher2.final("utf8");

  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    data = raw as unknown as T;
  }

  return { data, raw };
}

/** Convenience wrapper — decrypts and returns a typed UserInfo object. */
export function decryptUserInfo(options: DecryptOptions): UserInfo {
  const result = decrypt<UserInfo>(options);
  return result.data;
}
