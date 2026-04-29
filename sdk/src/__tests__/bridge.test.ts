import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BridgeClient } from "../internal/bridge/client";
import {
  CHANNEL,
  VERSION,
  type HelloEnvelope,
} from "../internal/bridge/protocol";
import { Transport } from "../internal/bridge/transport";

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(spy: (payload: string) => void): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = {
    postMessage: spy,
  };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

function dispatch(data: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data }));
}

describe("BridgeClient", () => {
  let bridge: BridgeClient;
  let sent: string[] = [];

  beforeEach(() => {
    sent = [];
    installRN((payload) => sent.push(payload));
    bridge = new BridgeClient(new Transport());
  });

  afterEach(() => {
    bridge.stop();
    removeRN();
    vi.useRealTimers();
  });

  it("sends ready envelope on start", () => {
    bridge.start();
    expect(sent).toHaveLength(1);
    const parsed = JSON.parse(sent[0]) as Record<string, unknown>;
    expect(parsed).toEqual({ ch: CHANNEL, v: VERSION, t: "ready" });
  });

  it("resolves hello listeners and marks status ready", async () => {
    bridge.start();
    const hello: HelloEnvelope = {
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: { authenticated: true, user: null, token: null },
      device: {
        platform: "mobile",
        locale: "zh-CN",
        backendUrl: "https://api.test",
      },
      capabilities: ["auth.*", "device.getContext"],
    };

    const seen = vi.fn();
    bridge.onHello(seen);
    dispatch(hello);

    expect(seen).toHaveBeenCalledWith(hello);
    expect(bridge.getStatus()).toEqual({
      ready: true,
      capabilities: ["auth.*", "device.getContext"],
    });
  });

  it("rejects request with NOT_SUPPORTED before hello", async () => {
    bridge.start();
    await expect(bridge.request("auth.getToken")).rejects.toMatchObject({
      code: "NOT_SUPPORTED",
    });
  });

  it("resolves RPC response matching by id", async () => {
    bridge.start();
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: { authenticated: false, user: null, token: null },
      device: {
        platform: "mobile",
        locale: "en-US",
        backendUrl: "",
      },
      capabilities: ["auth.*"],
    } satisfies HelloEnvelope);

    const promise = bridge.request<{ token: string }>("auth.getToken");
    // Grab the req id the bridge sent.
    const lastSent = JSON.parse(sent[sent.length - 1]) as Record<string, string>;
    expect(lastSent.t).toBe("req");
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: lastSent.id,
      ok: true,
      data: { token: "abc123" },
    });
    await expect(promise).resolves.toEqual({ token: "abc123" });
  });

  it("propagates error response as BridgeErrorObject", async () => {
    bridge.start();
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: { authenticated: false, user: null, token: null },
      device: {
        platform: "mobile",
        locale: "en-US",
        backendUrl: "",
      },
      capabilities: ["auth.*"],
    } satisfies HelloEnvelope);

    const promise = bridge.request("auth.getToken");
    const req = JSON.parse(sent[sent.length - 1]) as Record<string, string>;
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: req.id,
      ok: false,
      err: { code: "DENIED", message: "policy" },
    });
    await expect(promise).rejects.toMatchObject({ code: "DENIED" });
  });

  it("delivers events by name", () => {
    bridge.start();
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "hello",
      session: { authenticated: false, user: null, token: null },
      device: {
        platform: "mobile",
        locale: "en-US",
        backendUrl: "",
      },
      capabilities: [],
    } satisfies HelloEnvelope);

    const listener = vi.fn();
    const unsub = bridge.on("auth.changed", listener);
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "evt",
      name: "auth.changed",
      data: { authenticated: true },
    });
    expect(listener).toHaveBeenCalledWith({ authenticated: true });

    unsub();
    dispatch({
      ch: CHANNEL,
      v: VERSION,
      t: "evt",
      name: "auth.changed",
      data: { authenticated: false },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores foreign envelopes", () => {
    bridge.start();
    const listener = vi.fn();
    bridge.onHello(listener);
    dispatch({ channel: "other-lib", type: "hello" });
    expect(listener).not.toHaveBeenCalled();
  });
});
