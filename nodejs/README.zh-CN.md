# @eazo/node-sdk

Eazo Node.js SDK - 使用 ECC secp256k1 + AES-256-GCM 混合加密解密数据。

[![npm version](https://badge.fury.io/js/%40eazo%2Fnode-sdk.svg)](https://www.npmjs.com/package/@eazo/node-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 概述

本 SDK 提供了一种简单、安全的方式来解密由 Eazo 平台加密的数据。它实现了**混合加密方案**（也称为"数字信封"），结合了：

- **非对称加密（ECC secp256k1）**：用于加密对称密钥
- **对称加密（AES-256-GCM）**：用于加密实际数据

这种方案结合了 ECC 的安全性和 AES 的高效性，确保数据在传输过程中的安全。

## 安装

```bash
npm install @eazo/node-sdk
```

或使用 yarn:

```bash
yarn add @eazo/node-sdk
```

或使用 pnpm:

```bash
pnpm add @eazo/node-sdk
```

## 快速开始

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

console.log(result.data); // 解析后的 JSON 对象或原始字符串
console.log(result.raw);  // 原始解密字符串
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

## 工作原理

### 加密原理

Eazo 平台使用两阶段混合加密过程：

```
┌─────────────┐                    ┌─────────────┐
│  平台服务器  │                    │   开发者     │
└─────────────┘                    └─────────────┘
       │                                  │
       │  1. 生成随机 AES 密钥             │
       │     (256 位)                     │
       │                                  │
       │  2. 用 AES-GCM 加密数据           │
       │     → encryptedData              │
       │                                  │
       │  3. 用开发者公钥（ECC）加密 AES 密钥│
       │     → encryptedKey               │
       │                                  │
       │  4. 发送加密数据包                │
       │─────────────────────────────────>│
       │                                  │
       │                                  │  5. 用私钥解密 encryptedKey
       │                                  │     → 得到 AES 密钥
       │                                  │
       │                                  │  6. 用 AES 密钥解密 encryptedData
       │                                  │     → 得到原始数据
```

### 解密过程

1. **提取临时公钥**：从加密密钥包中提取临时公钥
2. **计算共享密钥**：使用 ECDH（椭圆曲线 Diffie-Hellman）算法
3. **派生解密密钥**：通过 SHA-256 从共享密钥派生
4. **解密 AES 密钥**：使用 AES-256-CBC 解密
5. **解密实际数据**：使用解密得到的 AES 密钥和 AES-256-GCM 算法

## API 参考

### `decrypt(options)`

解密使用 ECC secp256k1 + AES-256-GCM 混合加密的数据。

#### 参数

```typescript
interface DecryptOptions {
  encryptedData: string;  // Base64 编码的加密数据
  encryptedKey: string;   // Base64 编码的加密密钥
  iv: string;             // Base64 编码的初始化向量
  authTag: string;        // Base64 编码的认证标签
  privateKey: string;     // 十六进制格式的私钥（64 字符）
}
```

#### 返回值

```typescript
interface DecryptResult<T = any> {
  data: T;      // 解析后的 JSON 对象或原始字符串
  raw: string;  // 原始解密字符串
}
```

#### 异常

- `Error` - 如果解密失败（无效密钥、数据损坏或缺少参数）

### `decryptUserInfo(options)`

用于解密 Eazo 平台用户信息的便捷函数。

#### 返回值

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

## 使用示例

### 示例 1：解密用户信息

```typescript
import { decryptUserInfo } from '@eazo/node-sdk';

// 从 Eazo 平台 API 获取加密数据
const response = await fetch('https://api.eazo.com/api/open/app-session-token', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer USER_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ appId: 'your_app_id' })
});

const { data } = await response.json();

// 解密用户信息
const userInfo = decryptUserInfo({
  encryptedData: data.encryptedData,
  encryptedKey: data.encryptedKey,
  iv: data.iv,
  authTag: data.authTag,
  privateKey: process.env.EAZO_PRIVATE_KEY! // 存储在环境变量中
});

console.log('用户 ID:', userInfo.userId);
console.log('邮箱:', userInfo.email);
console.log('昵称:', userInfo.nickname);
```

### 示例 2：解密通用数据

```typescript
import { decrypt } from '@eazo/node-sdk';

// 解密任何加密数据（不仅限于用户信息）
const result = decrypt({
  encryptedData: "...",
  encryptedKey: "...",
  iv: "...",
  authTag: "...",
  privateKey: process.env.EAZO_PRIVATE_KEY!
});

// 访问解密后的数据
if (typeof result.data === 'object') {
  console.log('JSON 数据:', result.data);
} else {
  console.log('纯文本:', result.data);
}

// 访问原始字符串
console.log('原始数据:', result.raw);
```

### 示例 3：错误处理

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
  
  console.log('解密成功:', result.data);
} catch (error) {
  if (error instanceof Error) {
    console.error('解密失败:', error.message);
    
    // 处理特定错误
    if (error.message.includes('Invalid private key format')) {
      console.error('请检查您的私钥格式');
    } else if (error.message.includes('Missing required parameters')) {
      console.error('缺少必需参数');
    }
  }
}
```

### 示例 4：Express.js 集成

```typescript
import express from 'express';
import { decryptUserInfo } from '@eazo/node-sdk';

const app = express();
app.use(express.json());

app.post('/api/user/verify', async (req, res) => {
  try {
    const { encryptedData, encryptedKey, iv, authTag } = req.body;
    
    // 解密用户信息
    const userInfo = decryptUserInfo({
      encryptedData,
      encryptedKey,
      iv,
      authTag,
      privateKey: process.env.EAZO_PRIVATE_KEY!
    });
    
    // 验证并处理用户信息
    res.json({
      success: true,
      userId: userInfo.userId,
      email: userInfo.email
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: '解密失败'
    });
  }
});

app.listen(3000);
```

## 安全最佳实践

### 1. 私钥管理

✅ **推荐做法：**
- 将私钥存储在环境变量中（如 `EAZO_PRIVATE_KEY`）
- 使用密钥管理服务（AWS Secrets Manager、HashiCorp Vault）
- 使用加密的配置文件，并限制文件权限

❌ **避免做法：**
- 在源代码中硬编码私钥
- 将私钥提交到 Git 仓库
- 在前端或客户端使用私钥

### 2. 网络安全

- 始终使用 HTTPS 传输数据
- 验证 SSL 证书有效性
- 实施 API 速率限制

### 3. 数据处理

- 在内存中处理解密后的数据，避免记录敏感信息
- 实施最小权限原则
- 使用后清除内存中的敏感数据

### 4. 错误处理

- 不要在错误消息中暴露私钥或解密细节
- 记录解密失败事件用于审计
- 实施重试机制应对网络问题

## 密钥格式

本 SDK 使用**十六进制格式**的私钥，比 RSA/PEM 格式更简洁：

| 特性 | ECC secp256k1 (十六进制) | RSA 2048 (PEM) |
|------|-------------------------|----------------|
| 私钥长度 | 64 字符 | ~1700 字符 |
| 公钥长度 | 66 字符（压缩） | ~400 字符 |
| 安全级别 | 128 位 | 112 位 |
| 速度 | 快 | 慢 |
| 存储空间 | 小 | 大 |

示例私钥格式：
```
c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7
```

## 系统要求

- Node.js >= 14.0.0
- TypeScript >= 5.0.0（用于 TypeScript 项目）

## 依赖

- `elliptic`：用于 secp256k1 的 ECC 加密库
- 内置 `crypto` 模块：用于 AES 加密/解密

## 故障排除

### 解密失败："Invalid private key format"

**解决方案：** 确保您的私钥是十六进制格式（64 字符），没有任何前缀或后缀。

```typescript
// ✅ 正确
const privateKey = "c90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b14e5c7";

// ❌ 错误
const privateKey = "0xc90fdaa..."; // 不要 0x 前缀
const privateKey = "c90f...==";    // 不是 base64
```

### 解密失败："Unsupported state or unable to authenticate data"

**解决方案：** 这通常意味着：
- 加密数据已被篡改
- 使用了错误的私钥
- 传输过程中数据损坏

验证您使用的是正确的私钥，且数据未被修改。

### 模块导入错误

**解决方案：** 检查您的模块系统：

```javascript
// CommonJS
const { decrypt } = require('@eazo/node-sdk');

// ES Modules
import { decrypt } from '@eazo/node-sdk';
```

## 许可证

MIT

## 技术支持

- GitHub Issues: [https://github.com/your-org/eazo-sdk/issues](https://github.com/your-org/eazo-sdk/issues)
- 文档: [https://docs.eazo.com](https://docs.eazo.com)
- 邮箱: developer-support@eazo.com

## 贡献

欢迎贡献！提交 Pull Request 前请阅读我们的贡献指南。

---

**最后更新**: 2024-03-13  
**SDK 版本**: 1.0.0
