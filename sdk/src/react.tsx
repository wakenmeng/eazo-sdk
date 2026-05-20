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
import { getHost, type Host } from "./internal/env";
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
  // so the `.eazo-app-area` wrapper has its `display: contents`/active
  // styles ready on first paint. Banner-ui re-injects the same sheet on
  // its own mount; ensureBannerStylesInjected is idempotent via STYLE_ID.
  // The function self-gates on `getHost() === "web"` internally, so in
  // mobile WebView / iframe hosts this is a no-op — no banner CSS ever
  // lands in `document.head`.
  if (typeof document !== "undefined") {
    ensureBannerStylesInjected();
  }

  // Detect the runtime host so banner-related React components don't
  // even mount in mobile WebView / iframe. `null` until the post-mount
  // effect resolves it; treat null as "render the banner UI" so SSR
  // and the first client render emit the same JSX (no hydration mismatch).
  // After the effect resolves on the client:
  //   - web:  `host === "web"`         → banner UI stays mounted
  //   - other: `host === "eazoMobile" | "embeddedIframe"` → unmounts.
  //
  // Banner UI components are SIBLINGS of the .eazo-app-area wrapper, so
  // unmounting them does NOT affect host children — children stay at the
  // same JSX position throughout, no remount.
  const [host, setHost] = React.useState<Host | null>(null);
  React.useEffect(() => {
    // Starting the bridge is idempotent; capability access may have already done so.
    getBridge();
    void _bootstrapAuth();
    void _bootstrapDevice();
    setHost(getHost());
  }, []);
  const showBannerUI = host === null || host === "web";

  return (
    <MountedContext.Provider value={true}>
      {/*
       * Wrap host children in a TWO-LAYER container:
       *
       *   .eazo-app-area              ← outer: containing block (transform)
       *     .eazo-app-area-scroller   ← inner: scroll container (overflow:auto)
       *       {host children}
       *
       * On plain web (where the banners actually render), `<html>` gets
       * the `eazo-host-web` class and both layers receive their active
       * styles:
       *   - outer: `position: fixed` + `transform: translateZ(0)` — the
       *     containing block for host's `position: fixed` descendants,
       *     positioned inside the inter-banner gap.
       *   - inner: `position: absolute; inset: 0; overflow: auto` — the
       *     actual scroll container. No `transform`, so it does NOT
       *     reparent fixed descendants; those resolve up to the outer
       *     and stay visually pinned during scroll.
       *
       * Why TWO layers, not one: a single element that combines
       * `transform: translateZ(0)` AND `overflow: auto` makes browsers
       * translate fixed descendants by the wrapper's scroll offset —
       * sticky CTAs end up scrolling with content instead of staying
       * pinned. Splitting the responsibilities fixes that.
       *
       * In mobile WebView / iframe the `eazo-host-web` class is never
       * added; both layers fall back to `display: contents`, which
       * REMOVES their boxes from layout entirely. Host children
       * participate in the grandparent's layout context as if the
       * wrapper elements didn't exist — no containing block, no scroll
       * container, no `window.scrollY` redirection, no `position: fixed`
       * reparenting. The wrapper is fully transparent to mobile/iframe
       * hosts; the React tree just carries two extra elements that
       * generate no boxes.
       *
       * BREAKING semantics on PLAIN WEB (also in CHANGELOG):
       *   - `window.scrollY` / `window` scroll events no longer reflect
       *     host content scrolling — read from `.eazo-app-area-scroller`.
       *   - `document.body { overflow: hidden }` no longer locks scroll;
       *     body-scroll-lock libraries must target the scroller.
       *   - Host modals at `position: fixed; inset: 0` are contained to
       *     the outer wrapper rather than covering the full viewport.
       */}
      <div className="eazo-app-area">
        <div className="eazo-app-area-scroller">{props.children}</div>
      </div>
      {showBannerUI && (
        <>
          <EazoBrandBanner />
          <LoginUI />
          <ShareDownloadModal />
        </>
      )}
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
