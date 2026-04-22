import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { auth } from "../internal/capabilities/auth";
import {
  AUTH_CHANGED_EVENT,
  AUTH_LOGIN_CANCELLED_EVENT,
  AUTH_REQUEST_LOGIN,
  CHANNEL,
  VERSION,
} from "../internal/bridge/protocol";
import { __dispatchHostMessage, __resetSDK } from "../testing";

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(onSend: (payload: string) => void): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = { postMessage: onSend };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

function dispatchHello(capabilities: string[], authenticated = false): void {
  __dispatchHostMessage({
    ch: CHANNEL,
    v: VERSION,
    t: "hello",
    session: {
      authenticated,
      user: authenticated
        ? { id: "u1", email: null, name: "Pre-Authed", avatarUrl: null }
        : null,
      token: authenticated ? "tok" : null,
    },
    device: {
      platform: "mobile",
      locale: "en-US",
      safeArea: { top: 0, bottom: 0 },
      backendUrl: "",
    },
    capabilities,
  });
}

describe("auth.login — mobile host path", () => {
  let sent: string[];

  beforeEach(() => {
    __resetSDK();
    sent = [];
    installRN((payload) => sent.push(payload));
    auth.configure({ publicKey: "test-key" });
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("routes to auth.requestLogin RPC and resolves when auth.changed fires", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["auth.*"]);
    await new Promise((r) => setTimeout(r, 20));

    const promise = auth.login();
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent.map((s) => JSON.parse(s) as Record<string, unknown>).find(
      (env) => env.t === "req" && env.fn === AUTH_REQUEST_LOGIN,
    );
    expect(reqEnvelope).toBeDefined();
    expect(reqEnvelope?.fn).toBe(AUTH_REQUEST_LOGIN);

    // Host acks the RPC (returns immediately)
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { started: true },
    });

    // User finishes native login → host fires auth.changed
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "evt",
      name: AUTH_CHANGED_EVENT,
      data: {
        authenticated: true,
        user: { id: "u2", email: "a@b.c", name: "Mobile User", avatarUrl: null },
        token: "tok2",
      },
    });

    const user = await promise;
    expect(user.id).toBe("u2");
    expect(auth.loginUIOpen).toBe(false);
  });

  it("rejects with DENIED when host emits auth.loginCancelled", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["auth.*"]);
    await new Promise((r) => setTimeout(r, 20));

    const promise = auth.login();
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent.map((s) => JSON.parse(s) as Record<string, unknown>).find(
      (env) => env.t === "req" && env.fn === AUTH_REQUEST_LOGIN,
    );
    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { started: true },
    });

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "evt",
      name: AUTH_LOGIN_CANCELLED_EVENT,
      data: {},
    });

    await expect(promise).rejects.toMatchObject({ code: "DENIED" });
  });

  it("falls back to web login UI when host returns NOT_SUPPORTED", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([]); // host doesn't advertise auth.*
    await new Promise((r) => setTimeout(r, 20));

    const promise = auth.login();
    await new Promise((r) => setTimeout(r, 20));

    expect(auth.loginUIOpen).toBe(true);

    // Cancel via hideLogin so the promise doesn't hang the test
    auth.hideLogin();
    await expect(promise).rejects.toThrow();
  });
});

describe("auth.login — already authenticated", () => {
  beforeEach(() => {
    __resetSDK();
    installRN(() => undefined);
    auth.configure({ publicKey: "test-key" });
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("returns the current user without opening UI", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["auth.*"], true);
    await new Promise((r) => setTimeout(r, 20));

    const user = await auth.login();
    expect(user.id).toBe("u1");
    expect(auth.loginUIOpen).toBe(false);
  });
});

describe("auth.login — web path", () => {
  beforeEach(() => {
    __resetSDK();
    removeRN();
    auth.configure({ publicKey: "test-key" });
  });

  afterEach(() => {
    __resetSDK();
  });

  it("opens the SDK login UI and rejects on hideLogin()", async () => {
    void auth.user;
    await new Promise((r) => setTimeout(r, 1600)); // wait for hello timeout

    const promise = auth.login();
    await new Promise((r) => setTimeout(r, 10));
    expect(auth.loginUIOpen).toBe(true);

    auth.hideLogin();
    await expect(promise).rejects.toThrow();
    expect(auth.loginUIOpen).toBe(false);
  });
});
