import type { PublicAppInfo } from "./app-info";

/**
 * Optional prefetched `PublicAppInfo` handed in by the host app's server
 * (Next.js layout, Remix loader, etc.) via `<EazoProvider initialAppInfo>`.
 * When present, the handoff banner skips its client-side fetch and renders
 * real content on first paint — no skeleton flash.
 *
 * Module-level state mirrors the `setAppId` / `getAppId` pattern in
 * `internal/config.ts`. Safe because `EazoProvider` is `"use client"`:
 * the setter only runs in the browser, never in a shared server process.
 */
let initialAppInfo: PublicAppInfo | null = null;

export function setInitialAppInfo(info: PublicAppInfo | null): void {
  initialAppInfo = info;
}

export function getInitialAppInfo(): PublicAppInfo | null {
  return initialAppInfo;
}
