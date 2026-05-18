// React Server Component variant of `<EazoProvider>`.
//
// Resolved by the bundler ONLY in the React Server Component context —
// see the `"react-server"` export condition in `package.json`. In any
// client context (`"use client"` files, plain SSR without RSC, pure
// SPA bundles, etc.) the consumer transparently gets the client
// `EazoProvider` from `./react`.
//
// The async server variant exists to do one thing: prefetch the host
// app's public profile during SSR so the handoff overlay paints with
// real content on the first frame — no skeleton flash. Host apps don't
// need to touch this file or `fetchPublicAppInfo` themselves;
// `<EazoProvider appId={…}>` in a Next.js Server Component (or any RSC
// renderer) auto-resolves to this version.

import * as React from "react";

import { EazoProvider as EazoClientProvider } from "./react";
import { fetchPublicAppInfo } from "./internal/banner-ui/app-info";

// Hooks must remain client-only; re-exporting them through the server
// entry keeps `import { useEazo } from "@eazo/sdk/react"` working for
// app code regardless of which entry the bundler picks.
export { useEazo } from "./react";

/**
 * UA fragments that mark the request as coming from an Eazo Mobile
 * WebView. When the SDK detects any of these on the SSR request, it
 * skips the public-app-info prefetch — the handoff overlay never
 * renders inside the host shell (`getHost() === "eazoMobile"`), so the
 * fetch would be pure waste plus added TTFB.
 *
 *  - `EazoMobile/` — explicit marker injected by `AppViewerFallback.tsx`
 *    via `applicationNameForUserAgent` on iOS.
 *  - `wv` — Android RN WebView default UA token (`Mozilla/5.0 (...; wv) ...`).
 *    Generic enough to catch the immersive iOS WebView too in some
 *    builds, and broad enough to cover any embedded RN WebView. False
 *    positives (a non-Eazo Android WebView hitting the template) just
 *    fall back to the existing client fetch — same as before SSR.
 */
const MOBILE_WEBVIEW_UA_MARKERS = ["EazoMobile/", " wv)", "(wv;"] as const;

function isMobileWebViewUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  for (const marker of MOBILE_WEBVIEW_UA_MARKERS) {
    if (ua.indexOf(marker) !== -1) return true;
  }
  return false;
}

/**
 * Reads the request's `User-Agent` via Next.js `headers()`. Dynamically
 * imported so non-Next.js RSC bundlers don't blow up at load time —
 * returns `null` on any failure (header not available, runtime doesn't
 * ship `next/headers`, etc.), which means the prefetch path runs
 * unchanged outside Next.
 */
async function getRequestUserAgent(): Promise<string | null> {
  try {
    // `next/headers` is intentionally NOT a dependency of `@eazo/sdk` —
    // it's resolved at runtime only when the SDK ships inside a Next.js
    // RSC bundle. The `@ts-expect-error` keeps tsc quiet about the
    // unresolvable module path; the try/catch handles every other
    // runtime where the import throws.
    // @ts-expect-error - Optional peer; resolved only in Next.js runtimes.
    const headersModule = (await import("next/headers")) as {
      headers: () => Promise<{ get: (name: string) => string | null }>;
    };
    const requestHeaders = await headersModule.headers();
    return requestHeaders.get("user-agent");
  } catch {
    return null;
  }
}

export async function EazoProvider(props: {
  children: React.ReactNode;
  /** Eazo app ID. Required. */
  appId: string;
  /**
   * Optional platform API base URL. Read here on the server to issue
   * the prefetch against the right host (staging vs prod), and
   * forwarded to the client `EazoProvider` so the rest of the SDK
   * targets the same host post-hydration.
   */
  apiBase?: string | null;
  /**
   * Escape hatch — pre-resolved `PublicAppInfo`. When the caller
   * already has the data (e.g. fetched alongside other server-side
   * queries) supplying it here skips the in-Provider fetch. When
   * omitted, the server Provider does the fetch itself.
   */
  initialAppInfo?: import("./internal/banner-ui/app-info").PublicAppInfo | null;
}): Promise<React.ReactElement> {
  if (!props.appId) {
    throw new Error(
      "@eazo/sdk: <EazoProvider appId> is required. Pass your Eazo app id explicitly.",
    );
  }
  // Skip the prefetch entirely when the request comes from inside an
  // Eazo Mobile WebView — the handoff overlay is `getHost()`-gated and
  // never renders there, so the fetch would just add TTFB for no
  // user-visible benefit. Detection is best-effort (UA-based); on a
  // false-negative the fetch still runs and the bounded 2s timeout
  // caps the worst-case impact.
  let initialAppInfo: import("./internal/banner-ui/app-info").PublicAppInfo | null = null;
  if (props.initialAppInfo !== undefined) {
    initialAppInfo = props.initialAppInfo;
  } else {
    const ua = await getRequestUserAgent();
    if (!isMobileWebViewUserAgent(ua)) {
      initialAppInfo = await fetchPublicAppInfo(props.appId, {
        apiBase: props.apiBase,
      });
    }
  }

  return (
    <EazoClientProvider
      appId={props.appId}
      apiBase={props.apiBase}
      initialAppInfo={initialAppInfo}
    >
      {props.children}
    </EazoClientProvider>
  );
}
