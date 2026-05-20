const STYLE_ID = "eazo-sdk-banner-ui";

export const BANNER_HEIGHT_DESKTOP = 52;
export const BANNER_HEIGHT_MOBILE = 56;
/* Sized so the V5 / M5 bottom banner fits a 44px coral pill plus the
 * design's 14 / 22-px breathing pad. Bumping these here also bumps the
 * `<html>` padding-bottom the SDK reserves (see banner-ui/index.tsx),
 * so the host page never tucks under the banner. */
export const BOTTOM_HEIGHT_DESKTOP = 72;
export const BOTTOM_HEIGHT_MOBILE = 78;

const TOKENS = `
  --eazo-cream: #f1ebe0;
  --eazo-paper: #faf6ee;
  --eazo-ink: #11130f;
  --eazo-ink-soft: rgba(17,19,15,0.62);
  --eazo-ink-faint: rgba(17,19,15,0.32);
  --eazo-hair: rgba(17,19,15,0.10);
  --eazo-coral: #d4614a;
  --eazo-coral-gradient: linear-gradient(180deg, #F47A42 0%, #EE5C2A 100%);
  --eazo-glow: rgba(212,97,74,0.36);
  --eazo-sans: "Inter", "Helvetica Neue", system-ui, sans-serif;
  --eazo-serif: "Source Serif 4", "GT Sectra", "Tiempos", Georgia, serif;
  --eazo-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace;
`;

export const BANNER_UI_CSS = `
/* ════════════════════════════════════════════════════════════════════════
 *  Host content safe area
 *
 *  '.eazo-app-area' wraps the host's children at the EazoProvider level.
 *  The wrapper element is ALWAYS rendered (the markup is static and
 *  identical across SSR and CSR, so hydration is clean), but the styles
 *  that change scroll semantics — \`position: fixed\`, \`overflow: auto\`,
 *  and \`transform: translateZ(0)\` — only apply when the host is a plain
 *  web browser AND the handoff banners are mounted. We signal that with
 *  the \`eazo-host-web\` class on \`<html>\`, set/cleared by the banner-ui
 *  effect.
 *
 *  Why scope the styles:
 *    - The wrapper only EXISTS to keep host content clear of the SDK's
 *      bottom banner. In a mobile WebView or an embedded iframe, the
 *      banner doesn't render (banner-ui bails on those hosts), so the
 *      wrapper's overlap-avoidance has no job. Activating the fixed-
 *      positioning + overflow + containing-block semantics anyway would
 *      silently break \`window.scrollY\`, \`window\` scroll listeners,
 *      \`document.body { overflow: hidden }\` modal locks, and contain
 *      host modals at \`position: fixed; inset: 0\` — for ZERO product
 *      benefit in those environments.
 *    - On plain web (where the banner DOES render and DOES overlap),
 *      these semantic changes are the price of automatic safe-area
 *      handling and are documented in CHANGELOG.
 *
 *  How the fix works on web:
 *    - \`transform: translateZ(0)\` makes the wrapper a containing block
 *      for \`position: fixed\` descendants. A host's own bottom-fixed
 *      element (sticky toolbar, glass CTA, mobile tab bar) now resolves
 *      to the wrapper's edge — which sits between the banners — instead
 *      of the viewport's bottom edge, so it never overlaps the SDK's
 *      bottom banner.
 *    - \`inset\` reads the \`--eazo-handoff-top|bottom\` CSS variables
 *      (set on \`<html>\` by the banner-ui effect) with a \`0px\`
 *      fallback for the brief frame between mount and effect-run.
 *
 *  Known trade-offs on web (called out in CHANGELOG):
 *    - Scrolling happens inside the wrapper, not on \`window\`. Code
 *      reading \`window.scrollY\` or attaching \`scroll\` listeners to
 *      \`window\` must migrate to the wrapper element.
 *    - \`document.body { overflow: hidden }\` no longer locks scroll
 *      (the body isn't the scroll container); modal libraries that
 *      rely on body-scroll-lock must target the wrapper or use a
 *      portal-friendly lock.
 *    - Host modals at \`position: fixed; inset: 0\` are contained to
 *      the wrapper rather than covering the full viewport — visually
 *      equivalent (the wrapper IS the safe-area box) but \`inset: 0\`
 *      no longer means "cover everything including the banners".
 */
html.eazo-host-web .eazo-app-area {
  position: fixed;
  inset: var(--eazo-handoff-top, 0px) 0 var(--eazo-handoff-bottom, 0px) 0;
  /* overflow-x:hidden so horizontal overflow doesn't bleed past the
   * wrapper edges into the banner area; overflow-y:auto so the wrapper
   * is the scroll container for host content. */
  overflow-x: hidden;
  overflow-y: auto;
  /* Establishes a containing block for fixed-positioned descendants —
   * the entire point of the wrapper. Without this, host's \`position:
   * fixed; bottom: 0\` resolves to the viewport and overlaps our banner. */
  transform: translateZ(0);
}

/* The whole handoff UI lives inside ONE fixed-positioned container that
 * fills the viewport and flex-columns its three children: top banner +
 * overlay (which holds the modal) + bottom banner. This replaces the
 * earlier design where each piece was independently position:fixed
 * with hand-tuned top:52px / bottom:60px insets — that scheme broke
 * any time an ancestor of the SDK mount established a containing block
 * (transform / filter / backdrop-filter / contain on <body>, a wrapper,
 * etc.), at which point position:fixed becomes relative to that
 * ancestor and the math goes wrong. Flex layout makes the overlay
 * genuinely between the banners by structure, not by pixel math.
 *
 * The root is pointer-events:none so the user's page underneath stays
 * interactive in transparent regions (there shouldn't be any when the
 * overlay's modal is up, but it's the right default). Each visual child
 * (banners + overlay dim) opts back in with pointer-events:auto. */
.eazo-handoff-root {
  ${TOKENS}
  position: fixed;
  inset: 0;
  z-index: 2147483540;
  display: flex;
  flex-direction: column;
  /* justify-content:space-between keeps the bottom banner pinned even
   * when the user dismisses the modal (the overlay child unmounts) —
   * without it the flex-column would collapse the bottom banner up to
   * sit right under the top one. */
  justify-content: space-between;
  color: var(--eazo-ink);
  font-family: var(--eazo-sans);
  box-sizing: border-box;
  pointer-events: none;
}
.eazo-handoff-root *, .eazo-handoff-root *::before, .eazo-handoff-root *::after {
  box-sizing: border-box;
}

@keyframes eazo-handoff-slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes eazo-handoff-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes eazo-handoff-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes eazo-handoff-orbit-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes eazo-handoff-glow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
@keyframes eazo-handoff-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes eazo-handoff-pop-in {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============ TOP BANNER ============
 *
 * Slim three-piece strip: brand mark, single-line copy, CTA. The
 * underlying app's content sits below this. Non-dismissible.
 */
.eazo-banner-root {
  /* Flex child of .eazo-handoff-root — naturally pinned to the top of
   * the viewport-filling container. No position:fixed needed. */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  height: ${BANNER_HEIGHT_DESKTOP}px;
  padding: 0 14px 0 18px;
  background: var(--eazo-cream);
  border-bottom: 1px solid var(--eazo-hair);
  pointer-events: auto;
  animation: eazo-handoff-slide-down 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.eazo-banner-brand {
  display: inline-flex; align-items: center;
  flex-shrink: 0;
  color: var(--eazo-ink);
}
.eazo-banner-copy {
  flex: 1; min-width: 0;
  font-size: 14px; font-weight: 500;
  color: var(--eazo-ink-soft);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.eazo-banner-cta {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 14px; border-radius: 10px;
  background: var(--eazo-coral-gradient); color: #fff;
  font-size: 12px; font-weight: 600; border: 0; cursor: pointer;
  text-decoration: none;
  box-shadow: 0 10px 22px var(--eazo-glow);
  transition: filter 160ms ease, box-shadow 160ms ease;
}
.eazo-banner-cta:hover { filter: brightness(1.06); }

/* CTA wrapper anchors the hover/focus popover. position:relative is the
 * coordinate origin for the absolutely-positioned popover below. */
.eazo-banner-cta-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

/* Hover popover holding the page-URL QR. Matches the v5-stagelight
 * design (project/v5-stagelight.jsx:59-85). The CTA's right edge anchors
 * the right edge of the popover so it never spills off the viewport on
 * a banner where the CTA is hugged to the right padding. */
.eazo-banner-cta-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 2147483560;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-width: 168px;
  padding: 14px;
  background: #fff;
  border: 1px solid var(--eazo-hair);
  border-radius: 14px;
  box-shadow:
    0 24px 50px -20px rgba(17,19,15,0.22),
    0 0 0 1px rgba(17,19,15,0.03);
  animation: eazo-handoff-fade-in 140ms ease-out;
}
/* Triangular tail pointing back up at the CTA. Rotated square so it
 * inherits the card's border + background without an extra SVG. */
.eazo-banner-cta-popover-arrow {
  position: absolute;
  top: -7px; right: 24px;
  width: 12px; height: 12px;
  background: #fff;
  border-top: 1px solid var(--eazo-hair);
  border-left: 1px solid var(--eazo-hair);
  transform: rotate(45deg);
}
.eazo-banner-cta-popover-qr {
  padding: 4px;
  background: #fff;
  line-height: 0;
}
.eazo-banner-cta-popover-caption {
  font-family: var(--eazo-mono);
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.04em;
  color: var(--eazo-ink-soft);
  text-align: center;
}

/* ============ OVERLAY (backdrop + spotlight + modal) ============
 *
 * The flex-middle of .eazo-handoff-root. Takes whatever vertical space
 * the top and bottom banners don't claim — i.e. it IS the inter-banner
 * area by structure, not by pixel math. overflow:hidden clips any
 * oversized modal at this seam; the modal's own max-height:100% plus
 * the overlay's flex centering keeps it inside.
 */
.eazo-handoff-overlay {
  flex: 1;
  min-height: 0;  /* allow the flex item to shrink below content size */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 16px;
  pointer-events: auto;
  animation: eazo-handoff-fade-in 320ms ease-out;
}
.eazo-handoff-overlay-dim {
  position: absolute; inset: 0;
  background: rgba(241,235,224,0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.eazo-handoff-overlay-spot {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(212,97,74,0.22) 0%, rgba(212,97,74,0.06) 30%, transparent 58%);
  pointer-events: none;
}

.eazo-modal {
  /* Natural flex centering by the overlay parent — no absolute
   * positioning. This keeps the modal inside the overlay's banner-
   * constrained box even when its content is tall, so it never bleeds
   * into the top or bottom banner area. If the modal is taller than the
   * overlay, the inner content scrolls. */
  position: relative;
  width: min(540px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 32px 32px 28px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--eazo-hair);
  border-radius: 24px;
  color: var(--eazo-ink);
  box-shadow:
    0 60px 100px -40px rgba(17,19,15,0.28),
    inset 0 1px 0 rgba(255,255,255,0.7),
    0 0 60px var(--eazo-glow);
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  animation: eazo-handoff-pop-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
/* Close button — sits in the modal's top-right corner. The top + bottom
 * Eazo banners stay visible after the user dismisses the modal; only
 * this center "strong CTA" goes away (per-tab via sessionStorage). */
.eazo-modal-close {
  position: absolute;
  top: 12px; right: 12px;
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 0;
  border-radius: 999px;
  background: rgba(17,19,15,0.04);
  color: var(--eazo-ink-soft);
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.eazo-modal-close:hover {
  background: rgba(17,19,15,0.08);
  color: var(--eazo-ink);
}
.eazo-modal-close:focus-visible {
  outline: 2px solid var(--eazo-coral);
  outline-offset: 2px;
}

/* ============ ORBITING CAPABILITIES + APP MONOLITH ============
 *
 * Geometry runs in a 280-unit coordinate space (matches the V5 design
 * canvas). The rings SVG uses a viewBox so its content scales to whatever
 * pixel size the .eazo-orbit container is in CSS (280 desktop, 220
 * mobile). The capability nodes position via percentage left/top on
 * the rotating track, then use negative margins to center on that point
 * — margins do not fight the track rotate animation the way a
 * transform: translate(-50%, -50%) would.
 */
.eazo-orbit {
  position: relative;
  width: 280px; height: 280px;
  display: grid; place-items: center;
}
.eazo-orbit-rings {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  opacity: 0.95;
}
.eazo-orbit-track {
  position: absolute; inset: 0; width: 100%; height: 100%;
  animation: eazo-handoff-orbit 30s linear infinite;
}
.eazo-orbit-node {
  position: absolute;
  width: 36px; height: 36px;
  margin: -18px 0 0 -18px;
  border-radius: 10px;
  background: #fff; border: 1px solid var(--eazo-hair);
  display: grid; place-items: center;
  box-shadow: 0 10px 22px -10px rgba(17,19,15,0.15);
  animation: eazo-handoff-orbit-rev 30s linear infinite;
  color: var(--eazo-coral);
}
.eazo-monolith {
  width: 96px; height: 96px; border-radius: 22px;
  /* Default fallback background — visible behind emoji icons and the
   * typographic initials fallback. URL icons render as a child <img>
   * that covers this completely. Eazo coral gradient (same as primary
   * CTAs) so the empty state reads as a clear Eazo-brand placeholder. */
  background: var(--eazo-coral-gradient);
  display: grid; place-items: center;
  position: relative;
  color: #ffffff;
  font-family: var(--eazo-serif); font-weight: 500;
  font-size: 42px; letter-spacing: -0.02em;
  box-shadow:
    0 30px 60px -20px var(--eazo-glow),
    inset 0 1px 0 rgba(255,255,255,0.30),
    0 0 0 1px rgba(255,255,255,0.14);
  overflow: hidden;
}
.eazo-monolith img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}

.eazo-modal-eyebrow {
  font-family: var(--eazo-mono); font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--eazo-ink-faint);
  text-align: center;
}
.eazo-modal-title {
  margin: 0; font-family: var(--eazo-serif); font-weight: 500;
  font-size: 32px; line-height: 1.15; letter-spacing: -0.02em;
  text-align: center; max-width: 360px;
  /* Clamp at 2 lines so an unusually long app name doesn't blow up the
   * modal height. Ellipsis takes over for the overflow. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.eazo-modal-sub {
  margin: 0; font-size: 13px; line-height: 1.5;
  color: var(--eazo-ink-soft);
  text-align: center; max-width: 360px;
  /* Same idea — long taglines clamp to 3 lines to keep the QR + CTA
   * visible without scrolling. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* Skeleton blocks shown while public app info is in flight. The modal
 * frame appears immediately so the user sees Eazo's commitment to the
 * handoff; the name / tagline swap in once the fetch resolves. */
.eazo-skel {
  display: inline-block;
  vertical-align: middle;
  background: linear-gradient(90deg,
    rgba(17,19,15,0.05) 0%,
    rgba(17,19,15,0.12) 50%,
    rgba(17,19,15,0.05) 100%);
  background-size: 200% 100%;
  border-radius: 8px;
  animation: eazo-skel-shimmer 1.4s linear infinite;
}
.eazo-skel-title { width: 60%; height: 36px; }
.eazo-skel-sub-1 { width: 80%; height: 13px; margin-top: 8px; }
.eazo-skel-sub-2 { width: 55%; height: 13px; margin-top: 6px; }
.eazo-skel-stat  { width: 28px; height: 11px; border-radius: 4px; }
@keyframes eazo-skel-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* Monolith-tuned shimmer — sweeps a brighter band over the dark navy
 * gradient. Used while public app info is still loading, and as the
 * placeholder behind an <img> until it decodes. */
.eazo-monolith-skel {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    rgba(255,255,255,0.00) 0%,
    rgba(255,255,255,0.18) 50%,
    rgba(255,255,255,0.00) 100%);
  background-size: 200% 100%;
  animation: eazo-skel-shimmer 1.4s linear infinite;
  pointer-events: none;
}
.eazo-monolith-img {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
  opacity: 0;
  transition: opacity 220ms ease-out;
}
.eazo-monolith-img.is-loaded { opacity: 1; }

/* ============ QR + CTA ROW ============ */
.eazo-cta-row {
  width: 100%; display: flex; gap: 12px; align-items: stretch; margin-top: 6px;
}
.eazo-qr-tile {
  padding: 8px; border-radius: 10px;
  background: #fff; border: 1px solid var(--eazo-hair);
  display: grid; place-items: center;
}
.eazo-cta-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; justify-content: space-between; gap: 8px;
}
.eazo-cta-headline {
  font-size: 12px; font-weight: 600;
}
.eazo-cta-fine {
  font-size: 10px; color: var(--eazo-ink-faint); margin-top: 4px;
  font-family: var(--eazo-mono); letter-spacing: 0.04em; line-height: 1.5;
}
.eazo-cta-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; border-radius: 10px;
  background: var(--eazo-coral-gradient); color: #fff;
  font-size: 13px; font-weight: 600; border: 0; cursor: pointer;
  text-decoration: none;
  box-shadow: 0 14px 26px var(--eazo-glow);
  transition: filter 160ms ease;
}
.eazo-cta-primary:hover { filter: brightness(1.06); }

/* ============ BOTTOM BANNER ============
 *
 * Per V5 / M5 design: two prominent stats on the left (heart + chat,
 * each rendered as a tinted icon-tile with a stacked value-over-label
 * column) separated by a thin hair-divider, and a coral "Remix" pill
 * on the right that reuses the top-banner CTA handoff. A small
 * "eazo.ai ↗" mark sits to the left of the pill on desktop only —
 * on phone widths (≤480px) it drops out so the Remix pill keeps its
 * thumb-zone weight.
 */
.eazo-bottom-root {
  /* Flex child of .eazo-handoff-root — naturally pinned to the bottom of
   * the viewport-filling container. No position:fixed needed. */
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  height: ${BOTTOM_HEIGHT_DESKTOP}px;
  padding: 0 22px 0 26px;
  background: #fff;
  border-top: 1px solid var(--eazo-hair);
  pointer-events: auto;
  animation: eazo-handoff-slide-up 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.eazo-bottom-stats {
  display: inline-flex; align-items: center; gap: 22px;
  min-width: 0; color: var(--eazo-ink);
}
.eazo-bottom-stat {
  display: inline-flex; align-items: center; gap: 9px;
  font-family: var(--eazo-sans);
  flex-shrink: 0;
}
/* Tinted square tile that frames each stat icon — coral-on-cream for
 * filled glyphs (heart), neutral-on-cream for line glyphs (chat). */
.eazo-bottom-stat-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(212,97,74,0.10);
  color: var(--eazo-coral);
  flex-shrink: 0;
}
.eazo-bottom-stat-icon.is-line {
  background: rgba(17,19,15,0.05);
  color: var(--eazo-ink);
}
.eazo-bottom-stat-text {
  display: inline-flex; flex-direction: column; line-height: 1.05;
}
.eazo-bottom-stat-value {
  font-family: var(--eazo-sans);
  font-size: 16px; font-weight: 600; letter-spacing: -0.01em;
}
.eazo-bottom-stat-label {
  font-family: var(--eazo-sans);
  font-size: 11px; font-weight: 500;
  color: var(--eazo-ink-faint);
  margin-top: 1px;
}
.eazo-bottom-stat-divider {
  width: 1px; height: 28px;
  background: var(--eazo-hair);
  flex-shrink: 0;
}
.eazo-bottom-skel {
  display: inline-block; vertical-align: middle;
  width: 32px; height: 18px; border-radius: 4px;
  background: linear-gradient(90deg,
    rgba(17,19,15,0.05) 0%,
    rgba(17,19,15,0.12) 50%,
    rgba(17,19,15,0.05) 100%);
  background-size: 200% 100%;
  animation: eazo-skel-shimmer 1.4s linear infinite;
}

.eazo-bottom-actions {
  display: inline-flex; align-items: center; gap: 14px;
  flex-shrink: 0;
}
.eazo-bottom-site {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--eazo-ink-soft);
  text-decoration: none;
  font-family: var(--eazo-sans); font-size: 12px; font-weight: 500;
  white-space: nowrap;
  transition: color 140ms ease;
}
.eazo-bottom-site:hover { color: var(--eazo-ink); }
.eazo-bottom-site b { color: var(--eazo-ink); font-weight: 600; }

/* Primary CTA on the bottom banner. Renders as <a> so it picks up the
 * same iOS-timeout fallback handler as the top-banner CTA via the
 * shared bindCtaClick — keeps the Remix tap on the same install /
 * deeplink path as the rest of the handoff UX. */
.eazo-bottom-remix {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  height: 44px; padding: 0 20px 0 18px;
  border: 0; cursor: pointer;
  border-radius: 999px;
  background: var(--eazo-coral-gradient); color: #fff;
  font-family: var(--eazo-sans);
  font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
  white-space: nowrap;
  box-shadow:
    0 12px 24px var(--eazo-glow),
    inset 0 1px 0 rgba(255,255,255,0.18);
  text-decoration: none;
  transition: transform 140ms ease, box-shadow 140ms ease;
}
.eazo-bottom-remix:hover {
  transform: translateY(-1px);
  box-shadow:
    0 14px 28px var(--eazo-glow),
    inset 0 1px 0 rgba(255,255,255,0.22);
}
.eazo-bottom-remix:active { transform: translateY(0); }

/* ============ MOBILE TWEAKS (≤480px) ============ */
@media (max-width: 480px) {
  .eazo-banner-root {
    height: ${BANNER_HEIGHT_MOBILE}px;
    padding: 0 10px 0 14px;
    gap: 10px;
  }
  .eazo-banner-copy {
    font-size: 12px; line-height: 1.25; white-space: normal;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  }
  .eazo-banner-cta { height: 28px; padding: 0 10px; font-size: 11px; border-radius: 8px; }
  /* Hover doesn't resolve reliably on touch — the CTA still works as a
   * plain link, no popover needed. Belt-and-suspenders to the JS check
   * (the popover render is also gated on the 'open' state, which never
   * flips without mouseenter / focus). */
  .eazo-banner-cta-popover { display: none; }

  .eazo-modal {
    width: calc(100vw - 32px);
    padding: 24px 20px 20px;
    border-radius: 20px;
    gap: 14px;
  }
  .eazo-orbit { width: 220px; height: 220px; }
  .eazo-monolith {
    width: 76px; height: 76px; border-radius: 18px;
    font-size: 32px;
  }
  .eazo-orbit-node {
    width: 28px; height: 28px; border-radius: 8px;
    margin: -14px 0 0 -14px;
  }
  .eazo-modal-title { font-size: 26px; }
  .eazo-modal-sub { font-size: 12px; }

  /* Mobile: the user is already on a phone — no point showing them a QR
   * to scan with their phone, and the "Scan to open" headline + fine
   * print only made sense paired with the QR. Collapse to the primary
   * CTA alone. */
  .eazo-qr-tile { display: none; }
  .eazo-cta-row { flex-direction: column; gap: 10px; }
  .eazo-cta-primary { height: 44px; width: 100%; font-size: 14px; border-radius: 12px; }
  .eazo-cta-headline { display: none; }
  .eazo-cta-fine { display: none; }

  .eazo-bottom-root {
    height: ${BOTTOM_HEIGHT_MOBILE}px;
    padding: 0 16px 0 20px;
    gap: 12px;
  }
  /* Tighter cells per the M5 (390px) spec: smaller icon tile, smaller
   * value, smaller divider. Labels stay — they're a key part of the
   * visual rhythm in M5. */
  .eazo-bottom-stats { gap: 12px; }
  .eazo-bottom-stat { gap: 7px; }
  .eazo-bottom-stat-icon { width: 26px; height: 26px; border-radius: 7px; }
  .eazo-bottom-stat-value { font-size: 14px; }
  .eazo-bottom-stat-label { font-size: 10px; }
  .eazo-bottom-stat-divider { height: 24px; }
  .eazo-bottom-skel { width: 28px; height: 15px; }
  /* M5 drops the secondary eazo.ai mark on phone widths so the Remix
   * pill keeps unambiguous thumb-zone weight. */
  .eazo-bottom-site { display: none; }
  .eazo-bottom-remix {
    height: 44px; padding: 0 18px 0 16px;
    gap: 8px; font-size: 13px;
    box-shadow:
      0 10px 22px var(--eazo-glow),
      inset 0 1px 0 rgba(255,255,255,0.18);
  }
  /* Drop the trailing "this app" wording on phone widths — the icon
   * plus the verb is already unambiguous and the pill stays compact. */
  .eazo-bottom-remix-suffix { display: none; }
}
`;

export function ensureBannerStylesInjected(): void {
  if (typeof document === "undefined") return;
  // Always overwrite the textContent rather than early-return on
  // existing tag presence. Next.js Fast Refresh re-imports this module
  // with updated `BANNER_UI_CSS`, but the previously-injected <style>
  // tag survives the React tree's hot reload — so an early-return left
  // the page running stale CSS until a hard refresh. Overwriting is
  // O(short string) and idempotent.
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== BANNER_UI_CSS) existing.textContent = BANNER_UI_CSS;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute("data-eazo-sdk", "banner-ui");
  style.textContent = BANNER_UI_CSS;
  document.head.appendChild(style);
}
