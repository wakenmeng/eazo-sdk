import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memory } from "../internal/capabilities/memory";
import { setAppId } from "../internal/config";
import { __resetSDK } from "../testing";

const APP_ID = "app-under-test";

/** Seed a web session so `auth.getSessionHeader()` resolves a header. */
function seedWebSession(): void {
  window.localStorage.setItem(
    "eazo.session",
    JSON.stringify({ encryptedData: "e", encryptedKey: "k", iv: "i", authTag: "a" }),
  );
}

/** Envelope returned by `GET /api/apps-open/:appId`. */
function appsOpenResponse(sendAnonymousData: boolean | undefined): Response {
  return new Response(
    JSON.stringify({
      code: 0,
      data: {
        app: {
          id: APP_ID,
          name: "Test App",
          category: [],
          slug: "test-app",
          showType: "Page",
          likeNum: 0,
          uv: 0,
          commentsCount: 0,
          sendAnonymousData,
        },
        viewer: { isOwner: false },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function gumOkResponse(): Response {
  return new Response(JSON.stringify({ code: 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface FetchCalls {
  appsOpen: number;
  gumAction: number;
}

/**
 * Installs a fetch mock that routes apps-open vs gum/action and counts hits.
 * `appInfoNull: true` makes apps-open fail (simulating an unreachable
 * platform) to exercise the fail-open path.
 */
function installFetch(opts: {
  sendAnonymousData?: boolean;
  appInfoNull?: boolean;
}): FetchCalls {
  const calls: FetchCalls = { appsOpen: 0, gumAction: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/apps-open/")) {
      calls.appsOpen += 1;
      if (opts.appInfoNull) return new Response("nope", { status: 500 });
      return appsOpenResponse(opts.sendAnonymousData);
    }
    if (url.includes("/api/open/gum/action")) {
      calls.gumAction += 1;
      return gumOkResponse();
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return calls;
}

const baseParams = {
  content: "User did a thing",
  event_type: "click",
  page: "home",
} as const;

describe("memory.reportAction — sendAnonymousData consent gate", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    __resetSDK();
    setAppId(APP_ID);
    seedWebSession();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    __resetSDK();
    globalThis.fetch = originalFetch;
  });

  it("reports to Gum when sendAnonymousData is enabled", async () => {
    const calls = installFetch({ sendAnonymousData: true });
    await memory.reportAction({ ...baseParams });
    expect(calls.appsOpen).toBe(1);
    expect(calls.gumAction).toBe(1);
  });

  it("does not report when sendAnonymousData is disabled", async () => {
    const calls = installFetch({ sendAnonymousData: false });
    await memory.reportAction({ ...baseParams });
    expect(calls.appsOpen).toBe(1);
    expect(calls.gumAction).toBe(0);
  });

  it("caches the consent flag for repeated calls (single apps-open fetch)", async () => {
    const calls = installFetch({ sendAnonymousData: true });
    await memory.reportAction({ ...baseParams });
    await memory.reportAction({ ...baseParams });
    expect(calls.appsOpen).toBe(1);
    expect(calls.gumAction).toBe(2);
  });

  it("fails open and reports when apps-open is unreachable", async () => {
    const calls = installFetch({ appInfoNull: true });
    await memory.reportAction({ ...baseParams });
    expect(calls.appsOpen).toBe(1);
    expect(calls.gumAction).toBe(1);
  });
});
