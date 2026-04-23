export { auth } from "./internal/capabilities/auth";
export { device } from "./internal/capabilities/device";
export { storage } from "./internal/capabilities/storage";
export { ai } from "./internal/capabilities/ai";

export type { LoginOptions } from "./internal/capabilities/auth";
export type { StorageCredentials, UploadResult } from "./internal/capabilities/storage";
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "./internal/capabilities/ai";
export type { User, DeviceContext, AuthState, EazoState } from "./types";
