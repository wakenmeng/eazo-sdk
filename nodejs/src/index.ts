import * as crypto from 'crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('secp256k1');

export interface DecryptOptions {
  /**
   * Base64 encoded encrypted data
   */
  encryptedData: string;
  
  /**
   * Base64 encoded encrypted key (contains ephemeral public key + IV + encrypted AES key)
   */
  encryptedKey: string;
  
  /**
   * Base64 encoded initialization vector for AES-GCM
   */
  iv: string;
  
  /**
   * Base64 encoded authentication tag for AES-GCM
   */
  authTag: string;
  
  /**
   * Developer's private key in hexadecimal format (64 characters)
   */
  privateKey: string;
}

export interface DecryptResult<T = any> {
  /**
   * Decrypted data (parsed as JSON if possible, otherwise raw string)
   */
  data: T;
  
  /**
   * Original decrypted string
   */
  raw: string;
}

/**
 * Decrypt data encrypted with ECC secp256k1 + AES-256-GCM hybrid encryption
 * 
 * This function implements a two-stage decryption process:
 * 1. Use ECC private key to decrypt the encrypted AES key
 * 2. Use the decrypted AES key to decrypt the actual data
 * 
 * @param options - Decryption parameters
 * @returns Decrypted data (auto-parsed as JSON if valid JSON string)
 * 
 * @example
 * ```typescript
 * import { decrypt } from '@eazo/auth';
 * 
 * const result = decrypt({
 *   encryptedData: "U2FsdGVkX1+ZqGx7J8kZ...",
 *   encryptedKey: "BHRlc3RrZXkxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcA==",
 *   iv: "dGVzdGl2MTIzNDU2",
 *   authTag: "dGVzdGF1dGh0YWc=",
 *   privateKey: "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7"
 * });
 * 
 * console.log(result.data); // Parsed JSON object
 * console.log(result.raw);  // Raw decrypted string
 * ```
 * 
 * @throws {Error} If decryption fails (invalid key, corrupted data, etc.)
 */
export function decrypt<T = any>(options: DecryptOptions): DecryptResult<T> {
  const { encryptedData, encryptedKey, iv, authTag, privateKey } = options;

  try {
    // Validate inputs
    if (!encryptedData || !encryptedKey || !iv || !authTag || !privateKey) {
      throw new Error('Missing required parameters');
    }

    if (!/^[0-9a-f]{64}$/i.test(privateKey)) {
      throw new Error('Invalid private key format. Expected 64 hexadecimal characters');
    }

    // Step 1: Create key pair from private key
    const keyPair = ec.keyFromPrivate(privateKey, 'hex');

    // Step 2: Decrypt the encrypted AES key using ECC
    const encryptedKeyBuffer = Buffer.from(encryptedKey, 'base64');
    
    // Extract ephemeral public key, IV, and ciphertext
    const ephemeralPublicKeyLength = 33; // secp256k1 compressed public key
    const ephemeralPublicKeyHex = encryptedKeyBuffer
      .slice(0, ephemeralPublicKeyLength)
      .toString('hex');
    const cipherIv = encryptedKeyBuffer
      .slice(ephemeralPublicKeyLength, ephemeralPublicKeyLength + 16);
    const cipherText = encryptedKeyBuffer
      .slice(ephemeralPublicKeyLength + 16);

    // Recover ephemeral public key
    const ephemeralPublicKey = ec.keyFromPublic(ephemeralPublicKeyHex, 'hex');
    
    // Compute shared secret using ECDH
    const sharedSecret = keyPair.derive(ephemeralPublicKey.getPublic());
    const sharedSecretBuffer = Buffer.from(
      sharedSecret.toString(16).padStart(64, '0'),
      'hex'
    );
    
    // Derive decryption key using SHA-256
    const decryptionKey = crypto
      .createHash('sha256')
      .update(sharedSecretBuffer)
      .digest();
    
    // Decrypt to get AES key
    const decipher = crypto.createDecipheriv('aes-256-cbc', decryptionKey, cipherIv);
    const aesKey = Buffer.concat([decipher.update(cipherText), decipher.final()]);

    // Step 3: Use AES key to decrypt the actual data
    const ivBuffer = Buffer.from(iv, 'base64');
    const authTagBuffer = Buffer.from(authTag, 'base64');
    const encryptedDataBuffer = Buffer.from(encryptedData, 'base64');

    const decipher2 = crypto.createDecipheriv('aes-256-gcm', aesKey, ivBuffer);
    decipher2.setAuthTag(authTagBuffer);

    let decrypted = decipher2.update(encryptedDataBuffer, undefined, 'utf8');
    decrypted += decipher2.final('utf8');

    // Step 4: Try to parse as JSON, otherwise return raw string
    let parsedData: T;
    try {
      parsedData = JSON.parse(decrypted) as T;
    } catch {
      // If not valid JSON, return as string
      parsedData = decrypted as T;
    }

    return {
      data: parsedData,
      raw: decrypted
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed with unknown error');
  }
}

/**
 * Decrypt user information from Eazo platform
 * 
 * This is a convenience wrapper around decrypt() specifically for user info
 * 
 * @param options - Decryption parameters
 * @returns Decrypted user information object
 * 
 * @example
 * ```typescript
 * import { decryptUserInfo } from '@eazo/auth';
 * 
 * const userInfo = decryptUserInfo({
 *   encryptedData: "...",
 *   encryptedKey: "...",
 *   iv: "...",
 *   authTag: "...",
 *   privateKey: "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7"
 * });
 * 
 * console.log(userInfo.userId);
 * console.log(userInfo.email);
 * ```
 */
export interface UserInfo {
  userId: string;
  email?: string;
  lang?: string;
  region?: string;
  nickname?: string;
  avatarUrl?: string;
  createdAt?: string;
  [key: string]: any;
}

export function decryptUserInfo(options: DecryptOptions): UserInfo {
  const result = decrypt<UserInfo>(options);
  return result.data;
}
