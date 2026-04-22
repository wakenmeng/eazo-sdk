import type { AuthState, DeviceContext, EazoState } from "../types";

type Listener = () => void;

const INITIAL_AUTH: AuthState = {
  user: null,
  loading: true,
  authenticated: false,
};

const INITIAL_DEVICE: DeviceContext = {
  platform: "web",
  locale: "en-US",
  safeArea: { top: 0, bottom: 0 },
  backendUrl: "",
};

export const INITIAL_STATE: EazoState = {
  auth: INITIAL_AUTH,
  device: INITIAL_DEVICE,
};

let snapshot: EazoState = INITIAL_STATE;
const listeners = new Set<Listener>();

/**
 * Minimal pub-sub over an immutable snapshot. Capability modules mutate via
 * `setAuth` / `setDevice`; each setter replaces only its namespace reference
 * so that `Object.is` selector comparison works for unaffected slices.
 */
export const store = {
  getSnapshot(): EazoState {
    return snapshot;
  },
  getServerSnapshot(): EazoState {
    return INITIAL_STATE;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    snapshot = INITIAL_STATE;
    for (const l of listeners) l();
  },
};

function publish(next: EazoState): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function setAuth(patch: Partial<AuthState>): void {
  const current = snapshot.auth;
  const nextAuth = { ...current, ...patch };
  if (
    nextAuth.user === current.user &&
    nextAuth.loading === current.loading &&
    nextAuth.authenticated === current.authenticated
  ) {
    return;
  }
  publish({ ...snapshot, auth: nextAuth });
}

export function setDevice(patch: Partial<DeviceContext>): void {
  const current = snapshot.device;
  const nextDevice = { ...current, ...patch };
  const changed = (Object.keys(nextDevice) as Array<keyof DeviceContext>).some(
    (key) => nextDevice[key] !== current[key],
  );
  if (!changed) return;
  publish({ ...snapshot, device: nextDevice });
}
