"use client";

import * as React from "react";

import { getAppId } from "../config";
import { getHost } from "../env";
import {
  ArrowRightIcon,
  CAPABILITIES,
  CapIcon,
  ChatIcon,
  EazoLogo,
  HeartIcon,
  RemixIcon,
} from "./icons";
import { QrSvg } from "./qr";
import { fetchPublicAppInfo, type PublicAppInfo } from "./app-info";
import { resolveBannerCta, type BannerCta } from "./store-links";
import {
  BANNER_HEIGHT_DESKTOP,
  BANNER_HEIGHT_MOBILE,
  BOTTOM_HEIGHT_DESKTOP,
  BOTTOM_HEIGHT_MOBILE,
  ensureBannerStylesInjected,
} from "./styles";

// iOS Safari has no native fallback for an unhandled `eazo://` scheme;
// after this long we assume the app isn't installed and redirect to the
// store. Matches the value in `store-links.ts`.
const IOS_FALLBACK_TIMEOUT_MS = 1500;
const MOBILE_BREAKPOINT_PX = 480;

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT_PX;
}

function topBannerHeightPx(mobile: boolean): number {
  return mobile ? BANNER_HEIGHT_MOBILE : BANNER_HEIGHT_DESKTOP;
}

function bottomBannerHeightPx(mobile: boolean): number {
  return mobile ? BOTTOM_HEIGHT_MOBILE : BOTTOM_HEIGHT_DESKTOP;
}

function formatStat(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/**
 * True when the string is shaped like a URL pointing at an image — covers
 * the forms `creator_apps.icon` may carry: absolute http(s) URLs,
 * protocol-relative URLs, server-relative paths, and inline `data:image/...`
 * URIs. Anything else (emoji glyphs, single letters, etc.) renders as
 * text in the monolith.
 */
function isImageUrl(s: string): boolean {
  return (
    /^https?:\/\//i.test(s) ||
    s.startsWith("//") ||
    s.startsWith("/") ||
    s.startsWith("data:image/")
  );
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Web-only handoff overlay. Mounted by `<EazoProvider>` and visible only
 * in pure-web environments (not the eazoMobile WebView, not embedded
 * iframes). Three coordinated pieces:
 *
 *   1. Top banner — brand + "MOBILE REQUIRED" pill + domain + "Open in app" CTA.
 *   2. Full-screen scrim with coral spotlight + center modal (orbiting
 *      capability icons, app identity, QR + primary CTA). Non-dismissible.
 *   3. Bottom banner — capability rail + likes/comments stats + eazo.ai pill.
 *
 * App identity (name, tagline, likes, comments) is fetched once from
 * `GET /apps-open/:appId`. The CTA + QR encode the `eazo://` deep link;
 * the iOS click-handler falls back to the App Store after a short delay
 * if the app isn't installed.
 *
 * Kept exported as `EazoBrandBanner` for backwards compatibility with
 * `EazoProvider`, which mounts it by that name.
 */
export function EazoBrandBanner(): React.ReactElement | null {
  const [mounted, setMounted] = React.useState(false);
  const [cta, setCta] = React.useState<BannerCta | null>(null);
  const [info, setInfo] = React.useState<PublicAppInfo | null>(null);
  // `loading === true` until the public app-info fetch settles (success
  // or failure). Drives the skeleton in the modal + bottom stats so the
  // user doesn't see a flash of generic "This app" copy.
  const [loading, setLoading] = React.useState(true);
  const [mobile, setMobile] = React.useState(false);
  // In-memory dismiss for the strong-CTA modal — intentionally NOT
  // persisted. Every page load (navigation, refresh, new tab) re-engages
  // the modal; the X / ESC just hides it for the current session of this
  // page. The top + bottom banners stay regardless.
  const [modalDismissed, setModalDismissed] = React.useState(false);
  // Resolved on mount in the browser. Encoded by the QR so a desktop
  // scan opens the EXACT page on a phone (which then sends the user
  // through the same handoff via the mobile route).
  const [pageUrl, setPageUrl] = React.useState("");

  React.useEffect(() => {
    if (getHost() !== "web") return;
    ensureBannerStylesInjected();
    setCta(resolveBannerCta());
    setMobile(isMobile());
    setPageUrl(typeof window !== "undefined" ? window.location.href : "");
    setMounted(true);
  }, []);

  const dismissModal = React.useCallback(() => {
    setModalDismissed(true);
  }, []);

  // ESC closes the modal — same dismiss path as the X button. Only
  // armed while the modal is actually rendered.
  React.useEffect(() => {
    if (!mounted || modalDismissed) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") dismissModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, modalDismissed, dismissModal]);

  // Reserve top + bottom space on `<html>` so the host page's own layout
  // doesn't tuck under the fixed banners. Restored on unmount.
  React.useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const previousTop = html.style.paddingTop;
    const previousBottom = html.style.paddingBottom;
    const apply = (): void => {
      const m = isMobile();
      setMobile(m);
      html.style.paddingTop = `${topBannerHeightPx(m)}px`;
      html.style.paddingBottom = `${bottomBannerHeightPx(m)}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      html.style.paddingTop = previousTop;
      html.style.paddingBottom = previousBottom;
    };
  }, [mounted]);

  // Fetch public app info. The overlay still renders without it — the
  // identity falls back to initials / generic copy. `loading` clears
  // either way so the skeleton doesn't shimmer forever on fetch failure.
  React.useEffect(() => {
    if (!mounted) return;
    const appId = getAppId();
    if (!appId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchPublicAppInfo(appId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setInfo(data);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [mounted]);

  if (!mounted || !cta) return null;

  return (
    <div className="eazo-handoff-root">
      <TopBanner cta={cta} pageUrl={pageUrl} />
      {modalDismissed ? null : (
        <Overlay
          info={info}
          cta={cta}
          loading={loading}
          pageUrl={pageUrl}
          onDismiss={dismissModal}
        />
      )}
      <BottomBanner info={info} loading={loading} cta={cta} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA click handler — same scheme + iOS-timeout fallback used elsewhere
// in the SDK. Lives at module scope so both the top-bar button and the
// modal primary CTA share the exact same behaviour.
// ---------------------------------------------------------------------------

function bindCtaClick(cta: BannerCta): React.MouseEventHandler<HTMLAnchorElement> {
  return () => {
    if (!cta.needsTimeoutFallback) return;
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
}

// ---------------------------------------------------------------------------
// Top banner
// ---------------------------------------------------------------------------

interface TopBannerProps {
  cta: BannerCta;
  /**
   * Current page URL — encoded into the hover-popover QR so a desktop
   * user scanning with their phone lands on the same page on mobile.
   * Empty during the first render tick before the mount effect resolves.
   */
  pageUrl: string;
}

function TopBanner({ cta, pageUrl }: TopBannerProps): React.ReactElement {
  return (
    <div className="eazo-banner-root" role="region" aria-label="Eazo app promotion">
      <span className="eazo-banner-brand">
        <EazoLogo width={72} height={20} />
      </span>
      <span className="eazo-banner-copy">
        Get the full Eazo experience in our mobile app.
      </span>
      <TopBannerCta cta={cta} pageUrl={pageUrl} />
    </div>
  );
}

// Delay before hiding the hover popover after the cursor leaves both
// the CTA and the popover itself. Short enough to feel responsive but
// long enough that a user can move from one to the other without the
// popover snapping shut mid-travel.
const POPOVER_HIDE_DELAY_MS = 140;

/**
 * Top-banner CTA with a hover/focus-triggered QR popover. The popover
 * encodes the current page URL — a desktop visitor scanning with their
 * phone lands on the same page on mobile, where the SDK's mobile-path
 * deep-link kicks in (or the App-Store fallback if the app isn't
 * installed). Falls back to a plain link click on touch devices, where
 * `hover` never resolves and the popover stays suppressed by media query.
 */
function TopBannerCta({
  cta,
  pageUrl,
}: { cta: BannerCta; pageUrl: string }): React.ReactElement {
  const onClick = React.useMemo(() => bindCtaClick(cta), [cta]);
  const [open, setOpen] = React.useState(false);
  const hideTimerRef = React.useRef<number | null>(null);

  const show = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setOpen(true);
  }, []);

  const queueHide = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      hideTimerRef.current = null;
    }, POPOVER_HIDE_DELAY_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    },
    [],
  );

  return (
    <span
      className="eazo-banner-cta-wrap"
      onMouseEnter={show}
      onMouseLeave={queueHide}
      onFocusCapture={show}
      onBlurCapture={queueHide}
    >
      <a
        className="eazo-banner-cta"
        href={cta.href}
        rel="noreferrer noopener"
        onClick={onClick}
        aria-describedby={open ? "eazo-banner-cta-popover" : undefined}
      >
        Open in app
      </a>
      {open && pageUrl ? (
        <div
          id="eazo-banner-cta-popover"
          className="eazo-banner-cta-popover"
          role="tooltip"
        >
          <span className="eazo-banner-cta-popover-arrow" aria-hidden="true" />
          <div className="eazo-banner-cta-popover-qr">
            <QrSvg value={pageUrl} size={140} />
          </div>
          <div className="eazo-banner-cta-popover-caption">
            Scan to open in the Eazo app.
          </div>
        </div>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Center overlay (dim + spotlight + modal)
// ---------------------------------------------------------------------------

interface OverlayProps {
  cta: BannerCta;
  info: PublicAppInfo | null;
  loading: boolean;
  pageUrl: string;
  /** Hides the modal for the rest of the tab session. */
  onDismiss: () => void;
}

function Overlay({ cta, info, loading, pageUrl, onDismiss }: OverlayProps): React.ReactElement {
  const onClick = React.useMemo(() => bindCtaClick(cta), [cta]);
  // While loading we still want SOMETHING in the monolith; initials of
  // "Eazo app" reads better than a literal placeholder. Once `info`
  // resolves, the real name's initials or cover image take over.
  const initials = deriveInitials(info?.app.name ?? "Eazo app");
  // `app.icon` carries either an image URL or a short text glyph (emoji,
  // single letter, etc.). The orbit center swaps in an <img> for URL-shaped
  // values and falls back to the typographic slot for glyphs and when the
  // field is missing altogether. URL detection accepts the full set the
  // backend may emit: absolute http(s), protocol-relative, server-relative,
  // and inline data:image URLs.
  const rawIcon = info?.app.icon?.trim();
  const iconUrl = rawIcon && isImageUrl(rawIcon) ? rawIcon : undefined;
  const iconGlyph = rawIcon && !iconUrl ? rawIcon : undefined;

  return (
    <div className="eazo-handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="eazo-handoff-title">
      <div className="eazo-handoff-overlay-dim" />
      <div className="eazo-handoff-overlay-spot" />
      <div className="eazo-modal">
        <button
          type="button"
          className="eazo-modal-close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <Orbit
          initials={iconGlyph ?? initials}
          iconUrl={iconUrl}
          loading={loading}
        />

        <div className="eazo-modal-eyebrow">Now showing in Eazo</div>
        {loading ? (
          // Two-line skeleton stand-in for title + tagline. Width
          // ratios match a typical 2-word app name / one-sentence
          // tagline so the modal doesn't visibly resize when real
          // copy lands.
          <>
            <span
              className="eazo-skel eazo-skel-title"
              role="status"
              aria-label="Loading app info"
            />
            <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
              <span className="eazo-skel eazo-skel-sub-1" />
              <br />
              <span className="eazo-skel eazo-skel-sub-2" />
            </div>
          </>
        ) : (
          <>
            <h2 id="eazo-handoff-title" className="eazo-modal-title">
              {info?.app.name ?? "This app"}
            </h2>
            <p className="eazo-modal-sub">
              {info?.app.tagline ??
                info?.app.description ??
                "Open the mobile app for the full experience."}
            </p>
          </>
        )}

        <div className="eazo-cta-row">
          <div className="eazo-qr-tile">
            {/* QR encodes the page's own URL. A desktop user scanning
             * with their phone lands on the same page on mobile — the
             * SDK then routes the user into the native app via the
             * mobile path's deep link, or the App Store fallback. */}
            {pageUrl ? <QrSvg value={pageUrl} size={88} /> : null}
          </div>
          <div className="eazo-cta-body">
            <div>
              <div className="eazo-cta-headline">Scan to open</div>
              <div className="eazo-cta-fine">
                Scan to continue this page on your phone, or tap to open in Eazo.
              </div>
            </div>
            <a
              className="eazo-cta-primary"
              href={cta.href}
              rel="noreferrer noopener"
              onClick={onClick}
            >
              Open in Eazo app
              <ArrowRightIcon size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orbit + monolith — capability icons rotating around the app's cover
// ---------------------------------------------------------------------------

interface OrbitProps {
  initials: string;
  iconUrl?: string;
  /** True while the app-info fetch is in flight — drives the monolith shimmer. */
  loading?: boolean;
}

function Orbit({ initials, iconUrl, loading = false }: OrbitProps): React.ReactElement {
  // All geometry runs in a 280-unit coordinate space. The SVG uses
  // `viewBox` so its rings scale to whatever pixel size the parent is
  // (280 desktop / 220 mobile). The capability nodes are positioned via
  // percentage `left/top` on the rotating track, and centered on those
  // points by the negative-margin trick in CSS (margin trick avoids
  // colliding with the track's rotate animation, unlike a transform
  // would).
  const SIDE = 280;
  const RADIUS = 102;
  const CENTER = SIDE / 2;
  // Radius as a percentage of half the box — used to convert polar
  // coordinates to percentage `left/top` on the track.
  const RADIUS_PCT = (RADIUS / CENTER) * 50;

  return (
    <div className="eazo-orbit">
      <svg
        className="eazo-orbit-rings"
        viewBox={`0 0 ${SIDE} ${SIDE}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <circle cx={CENTER} cy={CENTER} r={132} fill="none" stroke="rgba(17,19,15,0.06)" />
        <circle cx={CENTER} cy={CENTER} r={102} fill="none" stroke="rgba(17,19,15,0.08)" strokeDasharray="2 6" />
        <circle cx={CENTER} cy={CENTER} r={74} fill="none" stroke="rgba(212,97,74,0.30)" />
      </svg>
      <div className="eazo-orbit-track">
        {CAPABILITIES.map((c, i) => {
          // Distribute nodes evenly around the ring, starting from the
          // top (`-Math.PI / 2`).
          const angle = (i / CAPABILITIES.length) * Math.PI * 2 - Math.PI / 2;
          const leftPct = 50 + Math.cos(angle) * RADIUS_PCT;
          const topPct = 50 + Math.sin(angle) * RADIUS_PCT;
          return (
            <div
              key={c.key}
              className="eazo-orbit-node"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              aria-label={c.label}
            >
              <CapIcon k={c.key} size={14} />
            </div>
          );
        })}
      </div>
      <Monolith initials={initials} iconUrl={iconUrl} loading={loading} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monolith — the square logo tile at the orbit's center. Coordinates three
// visual states without layout shift:
//
//   1. App-info still loading        → shimmer overlay alone
//   2. iconUrl present, image decoding → shimmer + invisible <img>; fades
//                                         in on `onLoad`, falls back to
//                                         initials on `onError`
//   3. iconUrl missing OR emoji glyph → initials text immediately
// ---------------------------------------------------------------------------

interface MonolithProps {
  initials: string;
  iconUrl?: string;
  loading: boolean;
}

function Monolith({ initials, iconUrl, loading }: MonolithProps): React.ReactElement {
  type ImgState = "pending" | "loaded" | "errored";
  const [imgState, setImgState] = React.useState<ImgState>(
    iconUrl ? "pending" : "loaded",
  );

  // Reset whenever the URL changes — covers Provider remounts and
  // hot-reload paths where the icon swaps without a fresh component.
  React.useEffect(() => {
    setImgState(iconUrl ? "pending" : "loaded");
  }, [iconUrl]);

  const hasUsableImg = !!iconUrl && imgState !== "errored";
  const showShimmer = loading || (hasUsableImg && imgState === "pending");
  // Text falls in when there's nothing to show as a picture: not loading,
  // and either no URL or the URL failed to load.
  const showText = !loading && !hasUsableImg;

  return (
    <div className="eazo-monolith" aria-hidden="true">
      {hasUsableImg ? (
        <img
          className={`eazo-monolith-img${imgState === "loaded" ? " is-loaded" : ""}`}
          src={iconUrl}
          alt=""
          onLoad={() => setImgState("loaded")}
          onError={() => setImgState("errored")}
        />
      ) : null}
      {showText ? (
        <span style={{ transform: "translateY(-1px)" }}>{initials}</span>
      ) : null}
      {showShimmer ? <div className="eazo-monolith-skel" /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom banner — SDK capability rail on the left, social-proof stats on
// the right. Informational only; the app-handoff prompts are owned by the
// top banner and the center modal.
// ---------------------------------------------------------------------------

interface BottomBannerProps {
  info: PublicAppInfo | null;
  loading: boolean;
  cta: BannerCta;
}

interface Stat {
  key: string;
  icon: React.ReactNode;
  /** Coral filled glyph (heart) vs line glyph (chat, eye, etc.). */
  filled?: boolean;
  /** Formatted display value; null while loading. */
  value: string | null;
  label: string;
}

function BottomBanner({
  info,
  loading,
  cta,
}: BottomBannerProps): React.ReactElement {
  // Source-of-truth stats come from the public app endpoint. Surface
  // only metrics the backend exposes today AND that read meaningfully
  // for a host-app promo surface — likes and comments. `uv` is in the
  // DTO but reads as ambient web-traffic, not social proof, so it's
  // intentionally not on this rail. Installs / rating / trend appeared
  // in the V5 design canvas but require new backend fields — adding
  // them is a backend change, not a banner change.
  const stats: Stat[] = [
    {
      key: "likes",
      icon: <HeartIcon size={16} />,
      filled: true,
      value: loading ? null : formatStat(info?.app.likeNum),
      label: "likes",
    },
    {
      key: "comments",
      icon: <ChatIcon size={16} />,
      value: loading ? null : formatStat(info?.app.commentsCount),
      label: "comments",
    },
  ];

  // Remix tap reuses the same deeplink + iOS-store-timeout flow as the
  // top banner — both point at `eazo://app/<appId>` so the mobile shell
  // can route to the right surface (the Remix vs Open intent split is
  // up to the host app to wire from the URL params, not this banner).
  const onRemixClick = React.useMemo(() => bindCtaClick(cta), [cta]);

  return (
    <div className="eazo-bottom-root" role="contentinfo">
      <div
        className="eazo-bottom-stats"
        aria-label={loading ? "Loading app stats" : "App stats"}
      >
        {stats.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <span className="eazo-bottom-stat-divider" aria-hidden="true" />
            )}
            <span className="eazo-bottom-stat">
              <span
                className={`eazo-bottom-stat-icon${s.filled ? "" : " is-line"}`}
              >
                {s.icon}
              </span>
              <span className="eazo-bottom-stat-text">
                {s.value === null ? (
                  <span className="eazo-bottom-skel" />
                ) : (
                  <span className="eazo-bottom-stat-value">{s.value}</span>
                )}
                <span className="eazo-bottom-stat-label">{s.label}</span>
              </span>
            </span>
          </React.Fragment>
        ))}
      </div>
      <div className="eazo-bottom-actions">
        <a
          className="eazo-bottom-site"
          href="https://eazo.ai/"
          target="_blank"
          rel="noreferrer noopener"
        >
          <b>eazo.ai</b>
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </a>
        <a
          className="eazo-bottom-remix"
          href={cta.href}
          onClick={onRemixClick}
          aria-label="Remix this app"
        >
          <RemixIcon size={17} />
          Remix
          <span className="eazo-bottom-remix-suffix">&nbsp;this app</span>
        </a>
      </div>
    </div>
  );
}
