import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { share } from "../internal/capabilities/share";
import { CHANNEL, SHARE_COMPOSE, VERSION } from "../internal/bridge/protocol";
import { store } from "../internal/store";
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

function dispatchHello(capabilities: string[]): void {
  __dispatchHostMessage({
    ch: CHANNEL,
    v: VERSION,
    t: "hello",
    session: { authenticated: true, user: { id: "u1", email: null, name: "U", avatarUrl: null }, token: "tok" },
    device: {
      platform: "mobile",
      locale: "en-US",
    },
    capabilities,
  });
}

describe("share.compose — input validation", () => {
  beforeEach(() => {
    __resetSDK();
    removeRN();
  });

  afterEach(() => {
    __resetSDK();
  });

  it("rejects when no text, attachments, or images are provided", async () => {
    await expect(share.compose({})).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });

  it("rejects when more than 4 total image materials are provided", async () => {
    await expect(
      share.compose({ images: ["a", "b", "c", "d", "e"] }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
    await expect(
      share.compose({
        attachments: [
          { type: "image", url: "https://x.test/a.png" },
          { type: "image", url: "https://x.test/b.png" },
        ],
        images: ["c", "d", "e"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });

  it("does not double-count the same image URL across attachments and legacy images", async () => {
    const promise = share.compose({
      attachments: [
        { type: "image", url: "https://x.test/a.png" },
        { type: "image", url: "https://x.test/b.png" },
      ],
      images: [
        "https://x.test/a.png",
        "https://x.test/c.png",
        "https://x.test/d.png",
      ],
    });
    await new Promise((r) => setTimeout(r, 1700));
    await expect(promise).resolves.toEqual({ accepted: false });
  });

  it("rejects when an image entry is empty/non-string", async () => {
    await expect(
      share.compose({ images: ["   ", "https://x.test/img.png"] }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });

  it("rejects malformed attachments", async () => {
    await expect(
      share.compose({ attachments: [{ type: "image", url: "   " }] }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
    await expect(
      share.compose({
        attachments: [{ type: "file" as "image", url: "https://x.test/a.png" }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
    await expect(
      share.compose({
        attachments: [{ type: "image", url: "https://x.test/a.png", caption: 123 as never }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
  });
});

describe("share.compose — mobile bridge path", () => {
  let sent: string[];

  beforeEach(() => {
    __resetSDK();
    sent = [];
    installRN((payload) => sent.push(payload));
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
  });

  it("forwards args to the host as a share.compose RPC and resolves accepted=true", async () => {
    // Trigger bootstrap (waitForBootstrap inside compose() will await hello)
    const promise = share.compose({
      text: " hi there ",
      attachments: [
        { type: "image", url: "https://x.test/a.png", caption: " hero image " },
      ],
      sourceAppId: "todo-reminder",
    });

    // Give the bridge a tick to attach
    await new Promise((r) => setTimeout(r, 10));
    dispatchHello(["share.compose"]);
    await new Promise((r) => setTimeout(r, 20));

    const reqEnvelope = sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .find((env) => env.t === "req" && env.fn === SHARE_COMPOSE);
    expect(reqEnvelope).toBeDefined();
    // text trimmed by normalize()
    expect((reqEnvelope?.args as { text: string }).text).toBe("hi there");
    expect(
      (reqEnvelope?.args as { attachments: Array<{ type: string; url: string; caption?: string }> })
        .attachments,
    ).toEqual([
      { type: "image", url: "https://x.test/a.png", caption: "hero image" },
    ]);
    expect((reqEnvelope?.args as { sourceAppId: string }).sourceAppId).toBe(
      "todo-reminder",
    );

    __dispatchHostMessage({
      ch: CHANNEL,
      v: VERSION,
      t: "res",
      id: reqEnvelope?.id,
      ok: true,
      data: { accepted: true },
    });

    const result = await promise;
    expect(result).toEqual({ accepted: true });
    // Web modal must NOT have opened on the bridge-success path.
    expect(store.getSnapshot().shareUI.open).toBe(false);
  });

  it("falls back to download modal when host responds NOT_SUPPORTED", async () => {
    const promise = share.compose({ text: "hi" });

    await new Promise((r) => setTimeout(r, 10));
    dispatchHello([]); // host doesn't advertise share.*
    await new Promise((r) => setTimeout(r, 20));

    const result = await promise;
    expect(result).toEqual({ accepted: false });
    expect(store.getSnapshot().shareUI.open).toBe(true);
  });
});

describe("share.compose — pure web path", () => {
  beforeEach(() => {
    __resetSDK();
    removeRN();
  });

  afterEach(() => {
    __resetSDK();
  });

  it("opens the download modal when no host responds within hello timeout", async () => {
    const promise = share.compose({ text: "hi" });
    // Wait past HELLO_TIMEOUT_MS (1500ms) so waitForBootstrap resolves null.
    await new Promise((r) => setTimeout(r, 1700));
    const result = await promise;
    expect(result).toEqual({ accepted: false });
    expect(store.getSnapshot().shareUI.open).toBe(true);
  });
});
