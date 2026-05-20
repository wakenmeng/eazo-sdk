// RSC variant of `<EazoProvider>`, picked by bundlers via the
// `"react-server"` export condition. In any non-RSC context the
// consumer transparently gets the client provider from `./react`.
//
// Two server-side responsibilities, hidden from host apps:
//   1. Read `EAZO_PLATFORM_API_BASE` and forward it as a prop, since
//      Next.js doesn't inline non-`NEXT_PUBLIC_*` envs into the client.
//   2. Prefetch `PublicAppInfo` so the handoff overlay paints real
//      content on first frame.

import * as React from "react";

import { EazoProvider as EazoClientProvider } from "./react";
import { fetchPublicAppInfo } from "./internal/banner-ui/app-info";
import { readApiBaseFromEnv } from "./internal/config";

export { useEazo } from "./react";

// `EazoMobile/` is injected by `AppViewerFallback.tsx`; `wv` covers
// generic RN WebViews on Android and some iOS builds. False positives
// just fall back to the client-side fetch, same as pre-SSR behavior.
const MOBILE_WEBVIEW_UA_MARKERS = ["EazoMobile/", " wv)", "(wv;"] as const;

function isMobileWebViewUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  for (const marker of MOBILE_WEBVIEW_UA_MARKERS) {
    if (ua.indexOf(marker) !== -1) return true;
  }
  return false;
}

// `next/headers` is dynamically imported so non-Next RSC runtimes don't
// blow up at load time. Any failure → `null` → prefetch path runs as
// if no UA filter applied.
async function getRequestUserAgent(): Promise<string | null> {
  try {
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
  /** Optional override. Defaults to `EAZO_PLATFORM_API_BASE` from env. */
  apiBase?: string | null;
  /** Pre-resolved `PublicAppInfo`. When set, skips the in-Provider fetch. */
  initialAppInfo?: import("./internal/banner-ui/app-info").PublicAppInfo | null;
}): Promise<React.ReactElement> {
  if (!props.appId) {
    throw new Error(
      "@eazo/sdk: <EazoProvider appId> is required. Pass your Eazo app id explicitly.",
    );
  }
  const apiBase = props.apiBase ?? readApiBaseFromEnv();

  // Skip the prefetch inside Eazo Mobile WebView — the handoff overlay
  // is `getHost()`-gated and never renders there.
  let initialAppInfo: import("./internal/banner-ui/app-info").PublicAppInfo | null = null;
  if (props.initialAppInfo !== undefined) {
    initialAppInfo = props.initialAppInfo;
  } else {
    const ua = await getRequestUserAgent();
    if (!isMobileWebViewUserAgent(ua)) {
      initialAppInfo = await fetchPublicAppInfo(props.appId, { apiBase });
    }
  }

  return (
    <EazoClientProvider
      appId={props.appId}
      apiBase={apiBase}
      initialAppInfo={initialAppInfo}
    >
      {props.children}
    </EazoClientProvider>
  );
}
