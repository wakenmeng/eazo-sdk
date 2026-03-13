# Eazo SDK

Official SDKs for Eazo platform encryption/decryption functionality.

English | [中文](./README.zh-CN.md)

## Available SDKs

### Node.js / TypeScript

**Package:** `@eazo/node-sdk`  
**Location:** [`nodejs/`](./nodejs/)  
**Documentation:** [README](./nodejs/README.md) | [中文文档](./nodejs/README.zh-CN.md)

Decrypt data encrypted with ECC secp256k1 + AES-256-GCM hybrid encryption.

**Installation:**
```bash
npm install @eazo/node-sdk
```

**Quick Example:**
```typescript
import { decrypt } from '@eazo/node-sdk';

const result = decrypt({
  encryptedData: "...",
  encryptedKey: "...",
  iv: "...",
  authTag: "...",
  privateKey: process.env.EAZO_PRIVATE_KEY
});

console.log(result.data);
```

## Supported Languages

- ✅ **Node.js / TypeScript** - Ready
- 🚧 **Python** - Coming soon
- 🚧 **Go** - Coming soon
- 🚧 **Java** - Coming soon
- 🚧 **PHP** - Coming soon

## Documentation

For detailed information about the encryption scheme and API usage, please refer to:
- [Node.js SDK Documentation](./nodejs/README.md)
- [Node.js SDK 中文文档](./nodejs/README.zh-CN.md)

## Security

All SDKs implement the same secure hybrid encryption scheme:
- **ECC secp256k1** for key encryption
- **AES-256-GCM** for data encryption
- **ECDH** for shared secret computation
- **SHA-256** for key derivation

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## Publishing

To publish a new version:

```bash
# Create and push a tag (supports 0.0.1, v0.0.1, or V0.0.1)
git tag v1.0.0
git push origin v1.0.0
```

The CI will automatically:
- Run tests
- Build the package
- Publish to NPM
- Create a GitHub Release

See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions.

## License

MIT

---

**Last Updated:** 2024-03-13
