/**
 * Public semantic types. These are the shapes app developers import.
 * Protocol / envelope / transport details stay in internal/.
 */

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface DeviceContext {
  platform: "web" | "mobile";
  locale: string;
  safeArea: { top: number; bottom: number };
  backendUrl: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
}

/**
 * The full reactive state tree selected by `useEazo(selector)`.
 * Each capability contributes one namespace; adding a capability adds a field here.
 */
export interface EazoState {
  auth: AuthState;
  device: DeviceContext;
}
