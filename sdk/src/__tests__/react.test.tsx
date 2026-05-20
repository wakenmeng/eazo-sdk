import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CHANNEL, VERSION } from "../internal/bridge/protocol";
import { EazoProvider, useEazo } from "../react";
import { __dispatchHostMessage, __resetSDK } from "../testing";

interface RNGlobal {
  ReactNativeWebView?: { postMessage: (payload: string) => void };
}

function installRN(): void {
  (globalThis.window as unknown as RNGlobal).ReactNativeWebView = {
    postMessage: () => undefined,
  };
}

function removeRN(): void {
  delete (globalThis.window as unknown as RNGlobal).ReactNativeWebView;
}

function UserName(): React.ReactElement {
  const name = useEazo((s) => s.auth.user?.name ?? "guest");
  return <span data-testid="name">{name}</span>;
}

describe("useEazo", () => {
  beforeEach(() => {
    __resetSDK();
    installRN();
    process.env.EAZO_APP_ID = "test-key";
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
    delete process.env.EAZO_APP_ID;
  });

  it("re-renders when selected slice changes", async () => {
    render(
      <EazoProvider>
        <UserName />
      </EazoProvider>,
    );
    expect(screen.getByTestId("name").textContent).toBe("guest");

    await act(async () => {
      __dispatchHostMessage({
        ch: CHANNEL,
        v: VERSION,
        t: "hello",
        session: {
          authenticated: true,
          user: { id: "u1", email: null, name: "Alice", avatarUrl: null },
          token: null,
        },
        device: {
          platform: "mobile",
          locale: "en",
        },
        capabilities: ["auth.*"],
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(screen.getByTestId("name").textContent).toBe("Alice");
  });
});
