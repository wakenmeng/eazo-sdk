"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";

import { SHARE_DOWNLOAD_URL } from "../capabilities/share";
import { setShareUI, store } from "../store";
import { CloseIcon, ShareToPhoneIcon } from "./icons";
import { ensureShareStylesInjected } from "./styles";

function useShareUI(): { open: boolean } {
  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().shareUI,
    () => store.getSnapshot().shareUI,
  );
}

/**
 * "Continue in the Eazo app" modal, mounted by `<EazoProvider>`. Opens
 * automatically when `share.compose()` is called outside the mobile
 * WebView (or when the host doesn't advertise `share.compose`).
 */
export function ShareDownloadModal(): React.ReactElement | null {
  const ui = useShareUI();

  React.useEffect(() => {
    ensureShareStylesInjected();
  }, []);

  if (typeof document === "undefined") return null;

  const close = (): void => setShareUI({ open: false });

  return (
    <Dialog.Root open={ui.open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="eazo-share-overlay" />
        <Dialog.Content className="eazo-share-content" aria-describedby={undefined}>
          <Dialog.Close className="eazo-share-close" aria-label="Close">
            <CloseIcon size={16} />
          </Dialog.Close>

          <div className="eazo-share-icon-frame" aria-hidden="true">
            <ShareToPhoneIcon size={28} />
          </div>

          <Dialog.Title className="eazo-share-title">
            Continue in the Eazo app
          </Dialog.Title>
          <Dialog.Description className="eazo-share-subtitle">
            Sharing to the Eazo Community is available in the mobile app.
            Open Eazo to draft and publish this post.
          </Dialog.Description>

          <a
            className="eazo-share-cta"
            href={SHARE_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={close}
          >
            Get the Eazo app
          </a>
          <button type="button" className="eazo-share-secondary" onClick={close}>
            Not now
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
