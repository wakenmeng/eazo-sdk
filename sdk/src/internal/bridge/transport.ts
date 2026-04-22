import type { AppToHostEnvelope, HostToAppEnvelope } from "./protocol";
import { isEazoEnvelope } from "./protocol";

type RawHandler = (msg: HostToAppEnvelope) => void;

interface RNWebViewGlobal {
  ReactNativeWebView?: { postMessage(payload: string): void };
}

/**
 * Thin wrapper around postMessage. Supports both RN WebView and iframe embeds.
 * Only emits envelopes that pass `isEazoEnvelope`.
 */
export class Transport {
  private readonly handlers = new Set<RawHandler>();
  private readonly messageListener = (e: MessageEvent) => this.handleRaw(e.data);
  private attached = false;

  attach(): void {
    if (this.attached || typeof window === "undefined") return;
    window.addEventListener("message", this.messageListener);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached || typeof window === "undefined") return;
    window.removeEventListener("message", this.messageListener);
    this.attached = false;
    this.handlers.clear();
  }

  send(msg: AppToHostEnvelope): void {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify(msg);
    const rn = (window as unknown as RNWebViewGlobal).ReactNativeWebView;
    if (rn) {
      rn.postMessage(payload);
      return;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, "*");
    }
  }

  onMessage(handler: RawHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private handleRaw(raw: unknown): void {
    const parsed = this.parse(raw);
    if (!parsed) return;
    for (const h of this.handlers) h(parsed);
  }

  private parse(raw: unknown): HostToAppEnvelope | null {
    let value: unknown = raw;
    if (typeof raw === "string") {
      try {
        value = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    return isEazoEnvelope(value) ? value : null;
  }
}
