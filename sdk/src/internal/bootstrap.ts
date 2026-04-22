import { BridgeClient } from "./bridge/client";
import { HELLO_TIMEOUT_MS, type HelloEnvelope } from "./bridge/protocol";
import { Transport } from "./bridge/transport";
import { getPublicKey } from "./config";
import { isBrowser } from "./env";

let bridge: BridgeClient | null = null;
let helloResolved: HelloEnvelope | null = null;
let helloPromise: Promise<HelloEnvelope | null> | null = null;

function ensureBridge(): BridgeClient | null {
  if (!isBrowser()) return null;
  if (bridge) return bridge;
  bridge = new BridgeClient(new Transport());
  bridge.start({ publicKey: getPublicKey() });
  bridge.onHello((hello) => {
    helloResolved = hello;
  });
  return bridge;
}

/**
 * Returns the bridge client, starting it on first call. Returns null in non-browser contexts.
 */
export function getBridge(): BridgeClient | null {
  return ensureBridge();
}

/**
 * Resolves to the HelloEnvelope when the host responds within HELLO_TIMEOUT_MS,
 * or null if we're in a pure-web environment (no host, or host didn't respond).
 */
export function waitForBootstrap(): Promise<HelloEnvelope | null> {
  if (helloPromise) return helloPromise;
  const b = ensureBridge();
  if (!b) {
    helloPromise = Promise.resolve(null);
    return helloPromise;
  }

  helloPromise = new Promise<HelloEnvelope | null>((resolve) => {
    if (helloResolved) {
      resolve(helloResolved);
      return;
    }
    const status = b.getStatus();
    if (status.ready) {
      // ready but hello payload wasn't retained — treat as no bootstrap data
      resolve(null);
      return;
    }
    let settled = false;
    const unsub = b.onHello((hello) => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(hello);
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      resolve(null);
    }, HELLO_TIMEOUT_MS + 50);
  });
  return helloPromise;
}

/**
 * Test-only: reset the singleton bridge + cached bootstrap state.
 */
export function __resetBootstrap(): void {
  bridge?.stop();
  bridge = null;
  helloResolved = null;
  helloPromise = null;
}
