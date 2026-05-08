"use client";

import * as React from "react";

import { EazoBrandBanner } from "./internal/banner-ui";
import { getBridge } from "./internal/bootstrap";
import { _bootstrapAuth } from "./internal/capabilities/auth";
import { _bootstrapDevice } from "./internal/capabilities/device";
import { setAppId } from "./internal/config";
import { LoginUI } from "./internal/login-ui";
import { ShareDownloadModal } from "./internal/share-ui";
import { store, INITIAL_STATE } from "./internal/store";
import type { EazoState } from "./types";

const MountedContext = React.createContext(false);

/**
 * Mounts the SDK runtime. Place once at the root of your React tree.
 *
 *   <EazoProvider appId={process.env.EAZO_APP_ID}>
 *     <App />
 *   </EazoProvider>
 *
 * `<EazoProvider>` is how an app's appId reaches every SDK capability
 * (`auth`, `device`, `share`, `storage`, `memory`); every project must
 * pass one. Also mounts the shared login and share UIs so `auth.login()`
 * and `share.compose()` work anywhere in the tree.
 */
export function EazoProvider(props: {
  children: React.ReactNode;
  /** Eazo app ID. Required. */
  appId: string;
}): React.ReactElement {
  if (!props.appId) {
    throw new Error(
      "@eazo/sdk: <EazoProvider appId> is required. Pass your Eazo app id explicitly.",
    );
  }
  setAppId(props.appId);

  React.useEffect(() => {
    // Starting the bridge is idempotent; capability access may have already done so.
    getBridge();
    void _bootstrapAuth();
    void _bootstrapDevice();
  }, []);

  return (
    <MountedContext.Provider value={true}>
      {props.children}
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
