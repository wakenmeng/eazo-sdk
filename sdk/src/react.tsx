"use client";

import * as React from "react";

import { getBridge } from "./internal/bootstrap";
import { _bootstrapAuth } from "./internal/capabilities/auth";
import { _bootstrapDevice } from "./internal/capabilities/device";
import { LoginUI } from "./internal/login-ui";
import { store, INITIAL_STATE } from "./internal/store";
import type { DeviceContext, EazoState } from "./types";

const MountedContext = React.createContext(false);

/**
 * Mounts the SDK runtime. Place once at the root of your React tree.
 *
 *   <EazoProvider>
 *     <App />
 *   </EazoProvider>
 *
 * Renders the shared login UI so `auth.login()` works anywhere in the app
 * without the consumer mounting anything else.
 */
export function EazoProvider(props: { children: React.ReactNode }): React.ReactElement {
  React.useEffect(() => {
    // Starting the bridge is idempotent; capability access may have already done so.
    getBridge();
    void _bootstrapAuth();
    void _bootstrapDevice();
  }, []);

  useSafeAreaCssVars();

  return (
    <MountedContext.Provider value={true}>
      {props.children}
      <LoginUI />
    </MountedContext.Provider>
  );
}

/**
 * Mirrors the reported device safe area onto `document.documentElement` as
 * `--eazo-safe-area-top` / `--eazo-safe-area-bottom`. Apps reference these
 * from CSS (`padding-top: var(--eazo-safe-area-top, 0)`) to avoid the host
 * chrome (status bar, "Hosted by Eazo" pill, etc.) without needing to read
 * device state themselves.
 */
function useSafeAreaCssVars(): void {
  const safeArea = React.useSyncExternalStore<DeviceContext["safeArea"]>(
    store.subscribe,
    () => store.getSnapshot().device.safeArea,
    () => INITIAL_STATE.device.safeArea,
  );

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--eazo-safe-area-top", `${safeArea.top}px`);
    root.style.setProperty("--eazo-safe-area-bottom", `${safeArea.bottom}px`);
  }, [safeArea.top, safeArea.bottom]);
}

/**
 * Subscribe to a slice of the Eazo state. The selector runs on every update;
 * the hook only re-renders when the selector's return value changes (Object.is).
 *
 *   const user = useEazo(s => s.auth.user);
 *   const { platform, safeArea } = useEazo(s => s.device);
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
