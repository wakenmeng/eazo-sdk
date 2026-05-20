import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EazoProvider } from "../react";
import { __resetSDK } from "../testing";

/**
 * Regression coverage for the `.eazo-app-area` wrapper behaviour
 * introduced alongside the `eazo-host-web` gating class. The wrapper
 * element must ALWAYS render (so SSR/CSR markup matches), but the
 * styling that changes host scroll/positioning semantics (the
 * `position: fixed` rule scoped to `html.eazo-host-web`) must only
 * activate in plain-web hosts. Banner-ui owns the class lifecycle
 * (add on mount, remove on unmount).
 */

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

describe("EazoProvider .eazo-app-area wrapper", () => {
  beforeEach(() => {
    __resetSDK();
    // Make sure no leftover state from a previous test leaks the class
    // onto <html>.
    document.documentElement.classList.remove("eazo-host-web");
    document.documentElement.style.cssText = "";
  });

  afterEach(() => {
    __resetSDK();
    removeRN();
    document.documentElement.classList.remove("eazo-host-web");
    document.documentElement.style.cssText = "";
  });

  it("renders the wrapper element around children regardless of host", () => {
    installRN();
    const { container, unmount } = render(
      <EazoProvider appId="test">
        <div data-testid="host-child">hello</div>
      </EazoProvider>,
    );
    // Wrapper exists even in the eazoMobile host — only its styles are
    // gated; the markup is always emitted so SSR/CSR hydration matches.
    const wrapper = container.querySelector(".eazo-app-area");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("[data-testid='host-child']")).not.toBeNull();
    unmount();
  });

  it("does NOT set eazo-host-web on <html> in the mobile WebView host", async () => {
    installRN();
    const { unmount } = render(
      <EazoProvider appId="test">
        <span />
      </EazoProvider>,
    );
    // Let the banner-ui mount effect (and any setTimeout/microtasks it
    // queues) flush so we're not racing the assertion.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.documentElement.classList.contains("eazo-host-web")).toBe(
      false,
    );
    // And no padding / CSS vars leak onto <html> either.
    expect(document.documentElement.style.paddingTop).toBe("");
    expect(document.documentElement.style.paddingBottom).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--eazo-handoff-top"),
    ).toBe("");
    unmount();
  });

  it("sets eazo-host-web + handoff CSS vars on <html> in plain-web host, and clears them on unmount", async () => {
    // No RN bridge installed → getHost() === "web".
    removeRN();
    const { unmount } = render(
      <EazoProvider appId="test">
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const html = document.documentElement;
    expect(html.classList.contains("eazo-host-web")).toBe(true);
    expect(html.style.paddingTop).not.toBe("");
    expect(html.style.paddingBottom).not.toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).not.toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).not.toBe("");

    unmount();
    expect(html.classList.contains("eazo-host-web")).toBe(false);
    expect(html.style.paddingTop).toBe("");
    expect(html.style.paddingBottom).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("");
  });

  it("restores prior <html> CSS-var values on unmount instead of leaking the SDK's", async () => {
    removeRN();
    const html = document.documentElement;
    html.style.setProperty("--eazo-handoff-top", "999px");
    html.style.setProperty("--eazo-handoff-bottom", "888px");

    const { unmount } = render(
      <EazoProvider appId="test">
        <span />
      </EazoProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // While mounted, SDK overwrites to its own height.
    expect(html.style.getPropertyValue("--eazo-handoff-top")).not.toBe("999px");

    unmount();
    // After unmount, the previous host value is restored, not removed.
    expect(html.style.getPropertyValue("--eazo-handoff-top")).toBe("999px");
    expect(html.style.getPropertyValue("--eazo-handoff-bottom")).toBe("888px");
  });
});
