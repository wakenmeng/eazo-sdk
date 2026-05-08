import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "../internal/capabilities/auth";
import { device } from "../internal/capabilities/device";
import { setAppId } from "../internal/config";
import { CHANNEL, VERSION } from "../internal/bridge/protocol";
import { __resetSDK, __dispatchHostMessage } from "../testing";

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(onSend: (payload: string) => void): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = { postMessage: onSend };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

describe("auth capability — web fallback", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    __resetSDK();
    removeRN();
    setAppId("test-key");
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    __resetSDK();
    globalThis.fetch = originalFetch;
  });

  it("extracts user from { ok, user: {...} } envelope returned by the app", async () => {
    window.localStorage.setItem(
      "eazo.session",
      JSON.stringify({ encryptedData: "e", encryptedKey: "k", iv: "i", authTag: "a" }),
    );

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "u-xyz",
            email: "e@example.com",
            name: "Alice",
            avatarUrl: "https://example.com/a.png",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    void auth.user;
    await new Promise((r) => setTimeout(r, 1650));
    expect(auth.user).toEqual({
      id: "u-xyz",
      email: "e@example.com",
      name: "Alice",
      avatarUrl: "https://example.com/a.png",
    });
  });

  it("returns null user when no session in localStorage", async () => {
    await new Promise((r) => setTimeout(r, 0));
    // Access triggers bootstrap
    expect(auth.user).toBeNull();
    // allow hello timeout + web fallback to resolve
    await new Promise((r) => setTimeout(r, 1600));
    expect(auth.user).toBeNull();
    expect(auth.loading).toBe(false);
  });
});

describe("auth capability — mobile host", () => {
  beforeEach(() => {
    __resetSDK();
    installRN(() => undefined);
    setAppId("test-key");
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("populates user from hello.session", async () => {
    // Trigger bootstrap via getter
    void auth.user;
    // Give the bridge a tick to attach
    await new Promise((r) => setTimeout(r, 10));
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: {
        authenticated: true,
        user: { id: "u1", email: "a@b.c", name: "Alice", avatarUrl: null },
        token: "token-abc",
      },
      device: {
        platform: "mobile",
        locale: "zh-CN",
        backendUrl: "https://api.test",
      },
      capabilities: ["auth.*", "device.getContext"],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(auth.user).toEqual({
      id: "u1",
      email: "a@b.c",
      name: "Alice",
      avatarUrl: null,
    });
    expect(auth.loading).toBe(false);
    expect(auth.authenticated).toBe(true);
  });

  it("updates on auth.changed event", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 10));
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: {
        authenticated: true,
        user: { id: "u1", email: null, name: "Alice", avatarUrl: null },
        token: "t1",
      },
      device: {
        platform: "mobile",
        locale: "en-US",
        backendUrl: "",
      },
      capabilities: ["auth.*"],
    });
    await new Promise((r) => setTimeout(r, 20));

    const seen = vi.fn();
    auth.onChange(seen);

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "evt",
      name: "auth.changed",
      data: { authenticated: false, user: null, token: null },
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(auth.user).toBeNull();
    expect(auth.authenticated).toBe(false);
    expect(seen).toHaveBeenCalledWith(null);
  });
});

describe("device capability", () => {
  beforeEach(() => {
    __resetSDK();
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("returns web defaults without a host", async () => {
    removeRN();
    void device.platform;
    await new Promise((r) => setTimeout(r, 1600));
    expect(device.platform).toBe("web");
    expect(typeof device.locale).toBe("string");
  });

  it("picks up device info from hello", async () => {
    installRN(() => undefined);
    void device.platform;
    await new Promise((r) => setTimeout(r, 10));
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: { authenticated: false, user: null, token: null },
      device: {
        platform: "mobile",
        locale: "ja-JP",
        backendUrl: "https://backend.example",
      },
      capabilities: [],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(device.platform).toBe("mobile");
    expect(device.locale).toBe("ja-JP");
    expect(device.backendUrl).toBe("https://backend.example");
  });
});
