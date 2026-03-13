# Eazo SDK

Eazo 平台加密/解密功能的官方 SDK。

[English](./README.md) | 中文

## 可用的 SDK

### Node.js / TypeScript

**包名:** `@eazo/node-sdk`  
**位置:** [`nodejs/`](./nodejs/)  
**文档:** [README](./nodejs/README.md) | [中文文档](./nodejs/README.zh-CN.md)

使用 ECC secp256k1 + AES-256-GCM 混合加密解密数据。

**安装:**
```bash
npm install @eazo/node-sdk
```

**快速示例:**
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

## 支持的语言

- ✅ **Node.js / TypeScript** - 已完成
- 🚧 **Python** - 即将推出
- 🚧 **Go** - 即将推出
- 🚧 **Java** - 即将推出
- 🚧 **PHP** - 即将推出

## 文档

有关加密方案和 API 使用的详细信息，请参考：
- [Node.js SDK 文档（英文）](./nodejs/README.md)
- [Node.js SDK 中文文档](./nodejs/README.zh-CN.md)

## 安全性

所有 SDK 都实现了相同的安全混合加密方案：
- **ECC secp256k1** 用于密钥加密
- **AES-256-GCM** 用于数据加密
- **ECDH** 用于共享密钥计算
- **SHA-256** 用于密钥派生

## 贡献

欢迎贡献！提交 Pull Request 前请阅读我们的贡献指南。

## 发布

发布新版本：

```bash
# 创建并推送 tag（支持 0.0.1, v0.0.1 或 V0.0.1）
git tag v1.0.0
git push origin v1.0.0
```

CI 会自动：
- 运行测试
- 构建包
- 发布到 NPM
- 创建 GitHub Release

详细说明请查看 [PUBLISHING.md](./PUBLISHING.md)。

## 许可证

MIT

---

**最后更新:** 2024-03-13
