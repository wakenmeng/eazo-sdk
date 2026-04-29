import type { DeviceContext } from "../../types";
import { waitForBootstrap } from "../bootstrap";
import { setDevice, store } from "../store";

function webDefaults(): DeviceContext {
  const locale =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
  const backendUrl =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_EAZO_API_URL : "") ?? "";
  return {
    platform: "web",
    locale,
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

  get backendUrl(): string {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device.backendUrl;
  },

  getContext(): DeviceContext {
    ensureBootstrap().catch(() => undefined);
    return store.getSnapshot().device;
  },
};
