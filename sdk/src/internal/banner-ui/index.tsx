"use client";

import * as React from "react";

import { getHost } from "../env";
import { EazoLogo } from "./icons";
import { resolveBannerCta, type BannerCta } from "./store-links";
import {
  BANNER_HEIGHT_DESKTOP,
  BANNER_HEIGHT_MOBILE,
  ensureBannerStylesInjected,
} from "./styles";

const MOBILE_BREAKPOINT_PX = 480;
// How long to wait after firing the deeplink before assuming "not installed"
// and redirecting to the store. iOS Safari has no native fallback; if the
// app opens, the page is backgrounded long before this fires.
const IOS_FALLBACK_TIMEOUT_MS = 1500;

function currentBannerHeight(): number {
  if (typeof window === "undefined") return BANNER_HEIGHT_DESKTOP;
  return window.innerWidth <= MOBILE_BREAKPOINT_PX
    ? BANNER_HEIGHT_MOBILE
    : BANNER_HEIGHT_DESKTOP;
}

/**
 * Top-of-page promo banner that points users to the Eazo mobile app.
 * Mounted by `<EazoProvider>` and rendered only in pure-web environments
 * (not the eazoMobile WebView, not embedded iframes). Persistent — the
 * banner has no dismiss control; users move on by installing the app.
 */
export function EazoBrandBanner(): React.ReactElement | null {
  const [visible, setVisible] = React.useState(false);
  const [cta, setCta] = React.useState<BannerCta | null>(null);

  React.useEffect(() => {
    if (getHost() !== "web") return;

    ensureBannerStylesInjected();
    setCta(resolveBannerCta());
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

  if (!visible || !cta) return null;

  const handleCtaClick = (): void => {
    if (!cta.needsTimeoutFallback) return;
    // iOS path: the <a> kicks off the `eazo://` navigation. If the app is
    // installed, the page is backgrounded before the timeout fires. If
    // not, Safari shows a brief "Cannot Open" toast and we land back here
    // visible — at which point we redirect to the App Store ourselves.
    const start = Date.now();
    let appOpened = false;
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") appOpened = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (
        !appOpened &&
        document.visibilityState === "visible" &&
        Date.now() - start < IOS_FALLBACK_TIMEOUT_MS + 500
      ) {
        window.location.href = cta.storeUrl;
      }
    }, IOS_FALLBACK_TIMEOUT_MS);
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
        href={cta.href}
        rel="noreferrer noopener"
        onClick={handleCtaClick}
      >
        Open in app
      </a>
    </div>
  );
}
