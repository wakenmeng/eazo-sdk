import type { DeviceContext } from "../../types";
import { getBridge, waitForBootstrap } from "../bootstrap";
import { setDevice, store } from "../store";

function webDefaults(): DeviceContext {
  const locale =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  const backendUrl =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EAZO_API_URL : "") ?? "";
  return {
    platform: "web",
    locale,
    safeArea: { top: 0, bottom: 0 },
    backendUrl,
  };
}

let bootstrapPromise: Promise<void> | null = null;

export function __resetDeviceCapability(): void {
  bootstrapPromise = null;
}

export function _bootstrapDevice(): Promise<void> {
  return ensureBootstrap();
}

function ensureBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    setDevice(webDefaults());
    const hello = await waitForBootstrap();
    if (!hello) return;
    setDevice(hello.device);
    const bridge = getBridge();
    bridge?.on("device.safeArea.changed", (payload) => {
      const patch = payload as Partial<DeviceContext["safeArea"]>;
      const current = store.getSnapshot().device.safeArea;
      setDevice({ safeArea: { ...current, ...patch } });
    });
  })();
  return bootstrapPromise;
}

export const device = {
  get platform(): DeviceContext["platform"] {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.platform;
  },

  get locale(): string {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.locale;
  },

  get safeArea(): DeviceContext["safeArea"] {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.safeArea;
  },

  get backendUrl(): string {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.backendUrl;
  },

  getContext(): DeviceContext {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device;
  },
};
