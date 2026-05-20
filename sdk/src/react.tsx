"use client";

import * as React from "react";

import { EazoBrandBanner } from "./internal/banner-ui";
import type { PublicAppInfo } from "./internal/banner-ui/app-info";
import { setInitialAppInfo } from "./internal/banner-ui/initial-info";
import { ensureBannerStylesInjected } from "./internal/banner-ui/styles";
import { getBridge } from "./internal/bootstrap";
import { _bootstrapAuth } from "./internal/capabilities/auth";
import { _bootstrapDevice } from "./internal/capabilities/device";
import { setAppId, setHostApiBase } from "./internal/config";
import { LoginUI } from "./internal/login-ui";
import { ShareDownloadModal } from "./internal/share-ui";
import { store, INITIAL_STATE } from "./internal/store";
import type { EazoState } from "./types";

const MountedContext = React.createContext(false);

/**
 * Mounts the SDK runtime. Place once at the root of your React tree.
 *
 *   <EazoProvider
 *     appId={process.env.EAZO_APP_ID}
 *     apiBase={process.env.EAZO_API_BASE}
 *   >
 *     <App />
 *   </EazoProvider>
 *
 * `<EazoProvider>` is how an app's appId reaches every SDK capability
 * (`auth`, `device`, `share`, `storage`, `memory`); every project must
 * pass one. Also mounts the shared login and share UIs so `auth.login()`
 * and `share.compose()` work anywhere in the tree.
 *
 * **`apiBase` is optional.** When omitted the SDK calls the production
 * Eazo platform (`https://eazo.ai`). Pass it explicitly to point the
 * SDK at staging / a local platform server during development — this is
 * how a server-only env like `EAZO_API_BASE` (which Next.js does NOT
 * inline into the client bundle) reaches the browser side of the SDK.
 */
export function EazoProvider(props: {
  children: React.ReactNode;
  /** Eazo app ID. Required. */
  appId: string;
  /**
   * Optional platform API base URL. Pass it from a Server Component when
   * the value comes from a server-only env var (e.g. `process.env.EAZO_API_BASE`
   * in a Next.js layout) so it reaches the client without needing a
   * `NEXT_PUBLIC_*` alias. Falls back to `https://eazo.ai`.
   */
  apiBase?: string | null;
  /**
   * Pre-fetched `PublicAppInfo` for the host app. When supplied (typically
   * from a Server Component / SSR loader using
   * `fetchPublicAppInfo` from `@eazo/sdk/server`), the handoff banner
   * renders real content on first paint and skips the client-side fetch
   * entirely. Omit it to fall back to the SDK's own client fetch + skeleton.
   */
  initialAppInfo?: PublicAppInfo | null;
}): React.ReactElement {
  if (!props.appId) {
    throw new Error(
      "@eazo/sdk: <EazoProvider appId> is required. Pass your Eazo app id explicitly.",
    );
  }
  setAppId(props.appId);
  // Setter ignores null/empty — calling unconditionally keeps the
  // "clear on Provider unmount with apiBase removed" semantics simple.
  setHostApiBase(props.apiBase ?? null);
  setInitialAppInfo(props.initialAppInfo ?? null);

  // Inject the banner-ui stylesheet eagerly (before EazoBrandBanner mounts)
  // so the `.eazo-app-area` wrapper around children has its CSS available
  // on first paint. The banner UI itself injects the same sheet on its
  // own mount; ensureBannerStylesInjected is idempotent via STYLE_ID.
  if (typeof document !== "undefined") {
    ensureBannerStylesInjected();
  }

  React.useEffect(() => {
    // Starting the bridge is idempotent; capability access may have already done so.
    getBridge();
    void _bootstrapAuth();
    void _bootstrapDevice();
  }, []);

  return (
    <MountedContext.Provider value={true}>
      {/*
       * Wrap host children in `.eazo-app-area`. The wrapper element is
       * ALWAYS rendered so SSR and CSR markup match exactly — but the
       * styles that change scroll/positioning semantics only activate
       * when banner-ui adds the `eazo-host-web` class on `<html>`
       * (post-mount, only in plain-web hosts; never in a mobile WebView
       * or iframe). See `internal/banner-ui/styles.ts` for the full
       * rule.
       *
       * What the wrapper does on web (active path):
       *   - `transform: translateZ(0)` establishes a containing block,
       *     so host's `position: fixed; bottom: 0` resolves to the
       *     wrapper edge (between the banners) instead of the viewport
       *     bottom (under our bottom banner). Automatic safe-area.
       *   - `inset` reads `--eazo-handoff-top|bottom` so the wrapper
       *     spans exactly the inter-banner gap.
       *   - The wrapper is the scroll container for host content.
       *
       * BREAKING semantics on web that hosts must know about (also in
       * CHANGELOG):
       *   - `window.scrollY` / `window` scroll events no longer reflect
       *     host content scrolling — read from the wrapper element.
       *   - `document.body { overflow: hidden }` no longer locks scroll.
       *     Body-scroll-lock libraries must target the wrapper.
       *   - Host modals at `position: fixed; inset: 0` are contained
       *     to the wrapper rather than covering the full viewport.
       *
       * On mobile WebView / iframe the wrapper is an inert `<div>` with
       * no special styles — fully transparent to the host.
       */}
      <div className="eazo-app-area">{props.children}</div>
      <EazoBrandBanner />
      <LoginUI />
      <ShareDownloadModal />
    </MountedContext.Provider>
  );
}

/**
 * Subscribe to a slice of state. Re-renders only when the selector's
 * return value changes (Object.is).
 *
 *   const user = useEazo(s => s.auth.user);
 *   const { platform, locale } = useEazo(s => s.device);
 */
export function useEazo<T>(selector: (state: EazoState) => T): T {
  const mounted = React.useContext(MountedContext);
  if (process.env.NODE_ENV !== "production" && !mounted) {
    console.warn(
      "[@eazo/sdk] useEazo() called without <EazoProvider>. Mount it at the root of your app.",
    );
  }

  const getSnapshot = React.useCallback(
    () => selector(store.getSnapshot()),
    [selector],
  );
  const getServerSnapshot = React.useCallback(
    () => selector(INITIAL_STATE),
    [selector],
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}
