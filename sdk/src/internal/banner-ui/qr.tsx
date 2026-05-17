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
}

/**
 * Renders a real, scannable QR code as inline SVG. Used by the web-only
 * handoff overlay to encode the `eazo://` deep link for the host app so
 * users on a desktop browser can pop their phone over the screen to open
 * the app directly.
 */
export function QrSvg({
  value,
  size = 88,
  fg = "#11130f",
  bg = "#ffffff",
  radius = 6,
}: QrSvgProps): React.ReactElement | null {
  // Memoize the encode — fairly cheap, but the SVG can re-render often
  // (the parent banner re-renders on resize / state changes) and the
  // encoder is deterministic for a given `value`.
  const matrix = React.useMemo(() => {
    if (!value) return null;
    // Type-number 0 = "auto-pick smallest that fits" given the data + ECC.
    // Error-correction level M is a sensible default for promo URLs:
    // resilient to ~15% damage but still compact enough for a 25px-ish
    // module count at 88px box.
    const qr = qrcode(0, "M");
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
  }, [value]);

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
    </svg>
  );
}
