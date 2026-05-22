import * as React from "react";
// `qrcode-generator` is a zero-dep, browser-friendly QR encoder. CJS-only
// default export — we import via require shim to avoid the ES-interop
// landmines that come with its UMD shape.
import qrcode from "qrcode-generator";

interface QrSvgProps {
  /** Payload to encode. URLs work as expected; arbitrary strings encode too. */
  value: string;
  /** Total SVG side length in CSS px. */
  size?: number;
  /** Foreground / module color. */
  fg?: string;
  /** Background color, paints behind the modules. */
  bg?: string;
  /** Border-radius applied to the SVG host. */
  radius?: number;
  /**
   * Optional logo overlaid at the QR's center. When supplied the encoder
   * is forced to ECC level `H` (~30% damage tolerance) so the masked
   * region remains decodable. Pass an http(s)/data image URL, or omit
   * and use `logoGlyph` for emoji / initials.
   */
  logoUrl?: string;
  /**
   * Optional short glyph (emoji, 1–2 initials) drawn at the QR's center
   * as text. Used when the app has no image icon. Ignored when
   * `logoUrl` is also set.
   */
  logoGlyph?: string;
}

/**
 * Renders a real, scannable QR code as inline SVG. Used by the web-only
 * handoff overlay to encode the `eazo://` deep link for the host app so
 * users on a desktop browser can pop their phone over the screen to open
 * the app directly.
 *
 * Pass `logoUrl` (or `logoGlyph`) to embed the host app's icon in the
 * QR's dead center — purely cosmetic; the encoder upgrades to ECC level
 * `H` so the masked region still resolves under typical phone-camera
 * scans.
 */
export function QrSvg({
  value,
  size = 88,
  fg = "#11130f",
  bg = "#ffffff",
  radius = 6,
  logoUrl,
  logoGlyph,
}: QrSvgProps): React.ReactElement | null {
  // `pending` until the image decodes; falls back to glyph / nothing on
  // error so a broken icon URL never blanks out the QR's center area.
  type LogoImgState = "idle" | "pending" | "loaded" | "errored";
  const [logoImgState, setLogoImgState] = React.useState<LogoImgState>(
    logoUrl ? "pending" : "idle",
  );
  React.useEffect(() => {
    setLogoImgState(logoUrl ? "pending" : "idle");
  }, [logoUrl]);

  const hasLogo = !!(logoUrl || logoGlyph);

  // Memoize the encode — fairly cheap, but the SVG can re-render often
  // (the parent banner re-renders on resize / state changes) and the
  // encoder is deterministic for a given `value`.
  const matrix = React.useMemo(() => {
    if (!value) return null;
    // Type-number 0 = "auto-pick smallest that fits" given the data + ECC.
    // With a center logo we punch out ~22% of the symbol; bump ECC from
    // `M` (~15%) to `H` (~30%) so the masked region still decodes. Without
    // a logo, stay on `M` — `H` would balloon the module count and shrink
    // each cell needlessly.
    const ecc = hasLogo ? "H" : "M";
    const qr = qrcode(0, ecc);
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < count; r += 1) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c += 1) {
        row.push(qr.isDark(r, c));
      }
      rows.push(row);
    }
    return { rows, count };
  }, [value, hasLogo]);

  if (!matrix) return null;

  const { rows, count } = matrix;
  // Reserve a 2-module quiet zone on each side so scanners can lock on
  // even when the SVG sits flush against neighboring chrome.
  const quiet = 2;
  const totalCells = count + quiet * 2;
  const cell = size / totalCells;

  const rects: React.ReactElement[] = [];
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (!rows[r][c]) continue;
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={(c + quiet) * cell}
          y={(r + quiet) * cell}
          width={cell}
          height={cell}
          fill={fg}
        />,
      );
    }
  }

  // Render the logo overlay only when there's something usable. A URL
  // that errored out collapses to either the glyph fallback (if both
  // were supplied) or to nothing — the QR's center reads as a sea of
  // modules, which is fine since ECC was bumped on the assumption a
  // logo would land there.
  const showLogoImg = !!logoUrl && logoImgState !== "errored";
  const showLogoGlyph = !showLogoImg && !!logoGlyph;
  const showLogoLayer = showLogoImg || showLogoGlyph;

  // Geometry for the center logo. Sizing in SVG-user-space so the SVG
  // scales cleanly under `viewBox` if the parent ever overrides width/height.
  // Inner content (image / glyph) is ~22% of the QR; the white tile that
  // backs it is slightly larger (~30%) so transparent icons don't bleed
  // into surrounding modules.
  const tileSize = size * 0.3;
  const contentSize = size * 0.22;
  const tileX = (size - tileSize) / 2;
  const tileY = (size - tileSize) / 2;
  const contentX = (size - contentSize) / 2;
  const contentY = (size - contentSize) / 2;
  // Tile corner radius scales with tile size so the rounding stays
  // visually consistent across the 88px (modal) and 140px (popover) sizes.
  const tileRadius = Math.max(4, tileSize * 0.18);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ background: bg, borderRadius: radius, display: "block" }}
      aria-label="QR code"
      role="img"
    >
      {rects}
      {showLogoLayer ? (
        <>
          <rect
            x={tileX}
            y={tileY}
            width={tileSize}
            height={tileSize}
            rx={tileRadius}
            ry={tileRadius}
            fill={bg}
          />
          {showLogoImg ? (
            // `preserveAspectRatio="xMidYMid slice"` matches CSS
            // `object-fit: cover` — the icon fills the content square and
            // any overflow gets clipped by the rounded tile (via the
            // clipPath below).
            <image
              href={logoUrl}
              x={contentX}
              y={contentY}
              width={contentSize}
              height={contentSize}
              preserveAspectRatio="xMidYMid slice"
              clipPath="inset(0 round 4px)"
              onLoad={() => setLogoImgState("loaded")}
              onError={() => setLogoImgState("errored")}
              style={{
                opacity: logoImgState === "loaded" ? 1 : 0,
                transition: "opacity 160ms ease-out",
              }}
            />
          ) : null}
          {showLogoGlyph ? (
            <text
              x={size / 2}
              y={size / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={contentSize * 0.78}
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              fontWeight={600}
              fill={fg}
            >
              {logoGlyph}
            </text>
          ) : null}
        </>
      ) : null}
    </svg>
  );
}
