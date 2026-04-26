import { waitForBootstrap, getBridge } from "../bootstrap";
import { BridgeErrorObject, SHARE_COMPOSE } from "../bridge/protocol";
import { setShareUI } from "../store";

const MAX_IMAGES = 4;
export const SHARE_DOWNLOAD_URL = "https://eazo.ai/";

export interface ShareComposeInput {
  /** Free-form text the app wants to seed the post with. */
  text?: string;
  /**
   * Up to 4 images. Each item is either an `https://...` URL or a
   * `data:image/(png|jpeg|webp|gif);base64,...` data URL. The host
   * uploads any data URLs server-side before drafting.
   */
  images?: string[];
  /**
   * Optional attribution — the id of the app that originated the share.
   * The host may use this to attach an "app mention" pill to the post.
   */
  sourceAppId?: string;
}

export interface ShareComposeResult {
  /**
   * `true` when the host accepted the payload (mobile bridge path).
   * `false` when the SDK fell back to the web download CTA modal — apps
   * can use this to keep the source UI in a sane state.
   */
  accepted: boolean;
}

export function __resetShareCapability(): void {
  setShareUI({ open: false });
}

function validate(input: ShareComposeInput): void {
  if (!input || typeof input !== "object") {
    throw new BridgeErrorObject("INVALID_ARGS", "share.compose requires an input object");
  }
  const hasText = typeof input.text === "string" && input.text.trim().length > 0;
  const hasImages = Array.isArray(input.images) && input.images.length > 0;
  if (!hasText && !hasImages) {
    throw new BridgeErrorObject(
      "INVALID_ARGS",
      "share.compose requires at least one of `text` or `images`",
    );
  }
  if (Array.isArray(input.images)) {
    if (input.images.length > MAX_IMAGES) {
      throw new BridgeErrorObject(
        "INVALID_ARGS",
        `share.compose accepts at most ${MAX_IMAGES} images`,
      );
    }
    for (const url of input.images) {
      if (typeof url !== "string" || url.length === 0) {
        throw new BridgeErrorObject("INVALID_ARGS", "share.compose images must be non-empty strings");
      }
    }
  }
}

function normalize(input: ShareComposeInput): ShareComposeInput {
  const out: ShareComposeInput = {};
  if (typeof input.text === "string") {
    const trimmed = input.text.trim();
    if (trimmed.length > 0) out.text = trimmed;
  }
  if (Array.isArray(input.images) && input.images.length > 0) {
    out.images = input.images.slice();
  }
  if (typeof input.sourceAppId === "string" && input.sourceAppId.trim().length > 0) {
    out.sourceAppId = input.sourceAppId.trim();
  }
  return out;
}

export const share = {
  /**
   * Hand share materials to the host's compose surface.
   *
   * - **Inside the Eazo mobile WebView** the host opens its native compose
   *   page, AI-drafts a post from the inputs, and lets the user edit and
   *   publish. Resolves `{ accepted: true }`.
   * - **In a plain browser** the SDK shows a "Continue in the Eazo app"
   *   modal pointing to https://eazo.ai/. Resolves `{ accepted: false }`.
   *
   * Throws `BridgeError('INVALID_ARGS')` synchronously when neither `text`
   * nor `images` are provided, or when more than 4 images are passed.
   */
  async compose(input: ShareComposeInput): Promise<ShareComposeResult> {
    validate(input);
    const payload = normalize(input);

    const hello = await waitForBootstrap();
    const bridge = getBridge();

    if (hello && bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<ShareComposeResult>(SHARE_COMPOSE, payload);
        // Hosts that don't echo `accepted` are treated as having taken the
        // payload (the request resolved successfully).
        return { accepted: result?.accepted ?? true };
      } catch (err) {
        if (
          err instanceof BridgeErrorObject &&
          (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT")
        ) {
          // Fall through to the web fallback (download CTA).
        } else {
          throw err;
        }
      }
    }

    // Web fallback: open the download modal. Keep this behavior side-
    // effectful but predictable — apps can detect it via `accepted: false`.
    if (typeof document !== "undefined") {
      setShareUI({ open: true });
    }
    return { accepted: false };
  },
};
