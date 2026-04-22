// Barrel for the auth primitive layer. Internal only — consumed by SDK
// capabilities and server-side helpers; not re-exported from any public entry.
export { EazoAuthClient } from "./EazoAuthClient";
export { EazoAuthServer } from "./EazoAuthServer";
export { decrypt, decryptUserInfo } from "./decrypt";
export type {
  DecryptOptions,
  DecryptResult,
  EazoAuthClientConfig,
  EazoAuthServerConfig,
  SessionToken,
  SocialConnection,
  UserInfo,
} from "./types";
