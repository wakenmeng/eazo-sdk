export { auth } from "./internal/capabilities/auth";
export { device } from "./internal/capabilities/device";
export { storage } from "./internal/capabilities/storage";

export type { LoginOptions } from "./internal/capabilities/auth";
export type { StorageCredentials, UploadResult } from "./internal/capabilities/storage";
export type { User, DeviceContext, AuthState, EazoState } from "./types";
