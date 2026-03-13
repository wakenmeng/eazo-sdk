# @eazo/node-sdk

Eazo Node.js SDK - Decrypt encrypted data using ECC secp256k1 + AES-256-GCM hybrid encryption.

[![npm version](https://badge.fury.io/js/%40eazo%2Fnode-sdk.svg)](https://www.npmjs.com/package/@eazo/node-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

This SDK provides a simple and secure way to decrypt data encrypted by the Eazo platform. It implements a **hybrid encryption scheme** (also known as "digital envelope") that combines:

- **Asymmetric encryption (ECC secp256k1)**: Used to encrypt the symmetric key
- **Symmetric encryption (AES-256-GCM)**: Used to encrypt the actual data

This approach combines the security of ECC with the efficiency of AES, ensuring data security during transmission.

## Installation

```bash
npm install @eazo/node-sdk
```

or with yarn:

```bash
yarn add @eazo/node-sdk
```

or with pnpm:

```bash
pnpm add @eazo/node-sdk
```

## Quick Start

### TypeScript / ES Modules

```typescript
import { decrypt } from '@eazo/node-sdk';

const result = decrypt({
  encryptedData: "U2FsdGVkX1+ZqGx7J8kZ...",
  encryptedKey: "BHRlc3RrZXkxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcA==",
  iv: "dGVzdGl2MTIzNDU2",
  authTag: "dGVzdGF1dGh0YWc=",
  privateKey: "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7"
});

console.log(result.data); // Parsed JSON object or raw string
console.log(result.raw);  // Raw decrypted string
```

### CommonJS

```javascript
const { decrypt } = require('@eazo/node-sdk');

const result = decrypt({
  encryptedData: "...",
  encryptedKey: "...",
  iv: "...",
  authTag: "...",
  privateKey: "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7"
});

console.log(result.data);
```

## How It Works

### Encryption Principle

The Eazo platform uses a two-stage hybrid encryption process:

```
┌─────────────┐                    ┌─────────────┐
│  Platform   │                    │  Developer  │
└─────────────┘                    └─────────────┘
       │                                  │
       │  1. Generate random AES key      │
       │     (256-bit)                    │
       │                                  │
       │  2. Encrypt data with AES-GCM    │
       │     → encryptedData              │
       │                                  │
       │  3. Encrypt AES key with ECC     │
       │     using developer's public key │
       │     → encryptedKey               │
       │                                  │
       │  4. Send encrypted package       │
       │─────────────────────────────────>│
       │                                  │
       │                                  │  5. Decrypt encryptedKey
       │                                  │     with private key
       │                                  │     → AES key
       │                                  │
       │                                  │  6. Decrypt encryptedData
       │                                  │     with AES key
       │                                  │     → Original data
```

### Decryption Process

1. **Extract ephemeral public key** from the encrypted key package
2. **Compute shared secret** using ECDH (Elliptic Curve Diffie-Hellman)
3. **Derive decryption key** from shared secret using SHA-256
4. **Decrypt AES key** using AES-256-CBC
5. **Decrypt actual data** using AES-256-GCM with the decrypted AES key

## API Reference

### `decrypt(options)`

Decrypt data encrypted with ECC secp256k1 + AES-256-GCM hybrid encryption.

#### Parameters

```typescript
interface DecryptOptions {
  encryptedData: string;  // Base64 encoded encrypted data
  encryptedKey: string;   // Base64 encoded encrypted key
  iv: string;             // Base64 encoded initialization vector
  authTag: string;        // Base64 encoded authentication tag
  privateKey: string;     // Private key in hexadecimal format (64 chars)
}
```

#### Returns

```typescript
interface DecryptResult<T = any> {
  data: T;      // Parsed JSON object or raw string
  raw: string;  // Original decrypted string
}
```

#### Throws

- `Error` - If decryption fails due to invalid key, corrupted data, or missing parameters

### `decryptUserInfo(options)`

Convenience wrapper for decrypting user information from the Eazo platform.

#### Returns

```typescript
interface UserInfo {
  userId: string;
  email?: string;
  lang?: string;
  region?: string;
  nickname?: string;
  avatarUrl?: string;
  createdAt?: string;
  [key: string]: any;
}
```

## Usage Examples

### Example 1: Decrypt User Information

```typescript
import { decryptUserInfo } from '@eazo/node-sdk';

// Get encrypted data from Eazo platform API
const response = await fetch('https://api.eazo.com/api/open/app-session-token', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer USER_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ appId: 'your_app_id' })
});

const { data } = await response.json();

// Decrypt user info
const userInfo = decryptUserInfo({
  encryptedData: data.encryptedData,
  encryptedKey: data.encryptedKey,
  iv: data.iv,
  authTag: data.authTag,
  privateKey: process.env.EAZO_PRIVATE_KEY! // Store in environment variable
});

console.log('User ID:', userInfo.userId);
console.log('Email:', userInfo.email);
console.log('Nickname:', userInfo.nickname);
```

### Example 2: Decrypt Generic Data

```typescript
import { decrypt } from '@eazo/node-sdk';

// Decrypt any encrypted data (not just user info)
const result = decrypt({
  encryptedData: "...",
  encryptedKey: "...",
  iv: "...",
  authTag: "...",
  privateKey: process.env.EAZO_PRIVATE_KEY!
});

// Access decrypted data
if (typeof result.data === 'object') {
  console.log('JSON data:', result.data);
} else {
  console.log('Plain text:', result.data);
}

// Access raw string
console.log('Raw:', result.raw);
```

### Example 3: Error Handling

```typescript
import { decrypt } from '@eazo/node-sdk';

try {
  const result = decrypt({
    encryptedData: data.encryptedData,
    encryptedKey: data.encryptedKey,
    iv: data.iv,
    authTag: data.authTag,
    privateKey: process.env.EAZO_PRIVATE_KEY!
  });
  
  console.log('Decryption successful:', result.data);
} catch (error) {
  if (error instanceof Error) {
    console.error('Decryption failed:', error.message);
    
    // Handle specific errors
    if (error.message.includes('Invalid private key format')) {
      console.error('Please check your private key format');
    } else if (error.message.includes('Missing required parameters')) {
      console.error('Some parameters are missing');
    }
  }
}
```

### Example 4: Express.js Integration

```typescript
import express from 'express';
import { decryptUserInfo } from '@eazo/node-sdk';

const app = express();
app.use(express.json());

app.post('/api/user/verify', async (req, res) => {
  try {
    const { encryptedData, encryptedKey, iv, authTag } = req.body;
    
    // Decrypt user info
    const userInfo = decryptUserInfo({
      encryptedData,
      encryptedKey,
      iv,
      authTag,
      privateKey: process.env.EAZO_PRIVATE_KEY!
    });
    
    // Verify and process user info
    res.json({
      success: true,
      userId: userInfo.userId,
      email: userInfo.email
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Decryption failed'
    });
  }
});

app.listen(3000);
```

## Security Best Practices

### 1. Private Key Management

✅ **Recommended:**
- Store private key in environment variables (e.g., `EAZO_PRIVATE_KEY`)
- Use secret management services (AWS Secrets Manager, HashiCorp Vault)
- Use encrypted configuration files with restricted permissions

❌ **Avoid:**
- Hard-coding private keys in source code
- Committing private keys to Git repositories
- Using private keys in frontend or client-side code

### 2. Network Security

- Always use HTTPS for data transmission
- Verify SSL certificate validity
- Implement API rate limiting

### 3. Data Processing

- Process decrypted data in memory, avoid logging sensitive information
- Implement least privilege principle
- Clear sensitive data from memory after use

### 4. Error Handling

- Don't expose private keys or decryption details in error messages
- Log decryption failures for auditing
- Implement retry mechanisms for network issues

## Key Format

This SDK uses **hexadecimal format** for private keys, which is more concise than RSA/PEM format:

| Feature | ECC secp256k1 (hex) | RSA 2048 (PEM) |
|---------|---------------------|----------------|
| Private key length | 64 characters | ~1700 characters |
| Public key length | 66 characters (compressed) | ~400 characters |
| Security level | 128-bit | 112-bit |
| Speed | Fast | Slow |
| Storage size | Small | Large |

Example private key format:
```
c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7
```

## Requirements

- Node.js >= 14.0.0
- TypeScript >= 5.0.0 (for TypeScript projects)

## Dependencies

- `elliptic`: ECC cryptography library for secp256k1 operations
- Built-in `crypto` module: For AES encryption/decryption

## Troubleshooting

### Decryption fails with "Invalid private key format"

**Solution:** Ensure your private key is in hexadecimal format (64 characters) without any prefixes or suffixes.

```typescript
// ✅ Correct
const privateKey = "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7";

// ❌ Wrong
const privateKey = "0xc90fdaa..."; // No 0x prefix
const privateKey = "c90f...==";    // Not base64
```

### Decryption fails with "Unsupported state or unable to authenticate data"

**Solution:** This usually means:
- The encrypted data has been tampered with
- Using wrong private key
- Data corruption during transmission

Verify that you're using the correct private key and the data hasn't been modified.

### Module import errors

**Solution:** Check your module system:

```javascript
// CommonJS
const { decrypt } = require('@eazo/node-sdk');

// ES Modules
import { decrypt } from '@eazo/node-sdk';
```

## License

MIT

## Support

- GitHub Issues: [https://github.com/your-org/eazo-sdk/issues](https://github.com/your-org/eazo-sdk/issues)
- Documentation: [https://docs.eazo.com](https://docs.eazo.com)
- Email: developer-support@eazo.com

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

---

**Last Updated**: 2024-03-13  
**SDK Version**: 1.0.0
