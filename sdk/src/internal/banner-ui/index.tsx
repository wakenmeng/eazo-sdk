"use client";

import * as React from "react";

import { getHost } from "../env";
import { CloseIcon, EazoLogo } from "./icons";
import { resolveStoreUrl } from "./store-links";
import {
  BANNER_HEIGHT_DESKTOP,
  BANNER_HEIGHT_MOBILE,
  ensureBannerStylesInjected,
} from "./styles";

const DISMISS_KEY = "eazo:banner:dismissed";
const MOBILE_BREAKPOINT_PX = 480;

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Private mode / disabled storage — treat as not dismissed; the close
    // button will still hide it for the lifetime of the page.
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Ignore: dismissal still works in-memory via React state.
  }
}

function currentBannerHeight(): number {
  if (typeof window === "undefined") return BANNER_HEIGHT_DESKTOP;
  return window.innerWidth <= MOBILE_BREAKPOINT_PX
    ? BANNER_HEIGHT_MOBILE
    : BANNER_HEIGHT_DESKTOP;
}

/**
 * Top-of-page promo banner that points users to the Eazo mobile app.
 * Mounted by `<EazoProvider>` and rendered only in pure-web environments
 * (not the eazoMobile WebView, not embedded iframes). Dismissal is per-tab.
 */
export function EazoBrandBanner(): React.ReactElement | null {
  const [visible, setVisible] = React.useState(false);
  const [storeUrl, setStoreUrl] = React.useState<string>("");

  React.useEffect(() => {
    if (getHost() !== "web") return;
    if (readDismissed()) return;

    ensureBannerStylesInjected();
    setStoreUrl(resolveStoreUrl());
    setVisible(true);
  }, []);

  React.useEffect(() => {
    if (!visible) return;

    const html = document.documentElement;
    const previousPaddingTop = html.style.paddingTop;
    const apply = (): void => {
      html.style.paddingTop = `${currentBannerHeight()}px`;
    };
    apply();

    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      html.style.paddingTop = previousPaddingTop;
    };
  }, [visible]);

  if (!visible) return null;

  const dismiss = (): void => {
    writeDismissed();
    setVisible(false);
  };

  return (
    <div className="eazo-banner-root" role="region" aria-label="Eazo app promotion">
      <span className="eazo-banner-brand">
        <EazoLogo width={72} height={20} />
      </span>
      <span className="eazo-banner-copy">
        Get the full Eazo experience in our mobile app.
      </span>
      <a
        className="eazo-banner-cta"
        href={storeUrl}
        target="_blank"
        rel="noreferrer noopener"
      >
        Get the app
      </a>
      <button
        type="button"
        className="eazo-banner-close"
        aria-label="Dismiss banner"
        onClick={dismiss}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
