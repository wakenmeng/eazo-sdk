import { getPlatformApiBase, getAppId } from "../config";
import { waitForBootstrap, getBridge } from "../bootstrap";
import { BridgeErrorObject, SHARE_COMPOSE } from "../bridge/protocol";
import { setShareUI } from "../store";

const MAX_IMAGES = 4;
export function getShareDownloadUrl(): string {
  return `${getPlatformApiBase()}/`;
}

export interface ShareImageAttachment {
  type: "image";
  /**
   * Either an `https://...` URL or a
   * `data:image/(png|jpeg|webp|gif);base64,...` data URL. The host uploads
   * any data URLs server-side before drafting.
   */
  url: string;
  /** Short app-provided meaning for the image, e.g. "profile avatar". */
  caption?: string;
}

export type ShareAttachment = ShareImageAttachment;

export interface ShareComposeInput {
  /** Free-form text the app wants to seed the post with. */
  text?: string;
  /**
   * Flexible share materials. First version supports image attachments only.
   * Use captions to tell the host what each image represents.
   */
  attachments?: ShareAttachment[];
  /**
   * Legacy image list. Prefer `attachments` for new code so images can carry
   * a small caption/meaning.
   */
  images?: string[];
  /**
   * Optional attribution override — the id of the app that originated the
   * share. Defaults to the running app's id (`getAppId()`); pass an explicit
   * value only when forwarding a share that originated in a different app.
   * The host uses this to attach an "app mention" pill to the post.
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
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  const hasImages = Array.isArray(input.images) && input.images.length > 0;
  if (!hasText && !hasAttachments && !hasImages) {
    throw new BridgeErrorObject(
      "INVALID_ARGS",
      "share.compose requires at least one of `text`, `attachments`, or `images`",
    );
  }
  if (input.attachments !== undefined) {
    if (!Array.isArray(input.attachments)) {
      throw new BridgeErrorObject("INVALID_ARGS", "share.compose `attachments` must be an array");
    }
    for (const attachment of input.attachments) {
      if (!attachment || typeof attachment !== "object") {
        throw new BridgeErrorObject(
          "INVALID_ARGS",
          "share.compose attachments must be objects",
        );
      }
      if ((attachment as { type?: unknown }).type !== "image") {
        throw new BridgeErrorObject(
          "INVALID_ARGS",
          "share.compose attachments currently support only type \"image\"",
        );
      }
      if (typeof attachment.url !== "string" || attachment.url.trim().length === 0) {
        throw new BridgeErrorObject(
          "INVALID_ARGS",
          "share.compose image attachment URLs must be non-empty strings",
        );
      }
      if (attachment.caption !== undefined && typeof attachment.caption !== "string") {
        throw new BridgeErrorObject(
          "INVALID_ARGS",
          "share.compose image attachment captions must be strings",
        );
      }
    }
  }
  if (Array.isArray(input.images)) {
    for (const url of input.images) {
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new BridgeErrorObject("INVALID_ARGS", "share.compose images must be non-empty strings");
      }
    }
  }
  const imageUrls = new Set<string>();
  if (Array.isArray(input.attachments)) {
    for (const attachment of input.attachments) {
      imageUrls.add(attachment.url.trim());
    }
  }
  if (Array.isArray(input.images)) {
    for (const image of input.images) {
      imageUrls.add(image.trim());
    }
  }
  if (imageUrls.size > MAX_IMAGES) {
    throw new BridgeErrorObject(
      "INVALID_ARGS",
      `share.compose accepts at most ${MAX_IMAGES} image attachments`,
    );
  }
}

function normalize(input: ShareComposeInput): ShareComposeInput {
  const out: ShareComposeInput = {};
  if (typeof input.text === "string") {
    const trimmed = input.text.trim();
    if (trimmed.length > 0) out.text = trimmed;
  }
  if (Array.isArray(input.attachments) && input.attachments.length > 0) {
    out.attachments = input.attachments.map((attachment) => {
      const caption = attachment.caption?.trim();
      return {
        type: "image",
        url: attachment.url.trim(),
        ...(caption ? { caption } : {}),
      };
    });
  }
  if (Array.isArray(input.images) && input.images.length > 0) {
    out.images = input.images.map((url) => url.trim());
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
   * Throws `BridgeError('INVALID_ARGS')` synchronously when none of `text`,
   * `attachments`, or `images` are provided, or when more than 4 total image
   * materials are passed.
   */
  async compose(input: ShareComposeInput): Promise<ShareComposeResult> {
    validate(input);
    const payload = normalize(input);

    // Auto-stamp the running app's id when the caller didn't supply an
    // explicit override. Mirrors the same default applied in `memory`.
    if (!payload.sourceAppId) {
      const appId = getAppId();
      if (appId) payload.sourceAppId = appId;
    }

    const hello = await waitForBootstrap();
    const bridge = getBridge();

    if (hello && bridge?.getStatus().ready) {
      try {
        const result = await bridge.request<ShareComposeResult>(SHARE_COMPOSE, payload);
        // Hosts that don't echo `accepted` are treated as having taken the
        // payload (the request resolved successfully).
        return { accepted: result?.accepted ?? true };
      } catch (err) {
        const fallbackable =
          err instanceof BridgeErrorObject &&
          (err.code === "NOT_SUPPORTED" || err.code === "TIMEOUT");
        if (!fallbackable) throw err;
        // fall through to web fallback
      }
    }

    // Side-effectful but observable: apps detect this branch via `accepted: false`.
    if (typeof document !== "undefined") {
      setShareUI({ open: true });
    }
    return { accepted: false };
  },
};
