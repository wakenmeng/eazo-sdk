"use client";

import * as React from "react";

export function CloseIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * A minimal phone-with-arrow glyph: hints the modal is about continuing
 * the share flow inside a mobile app. Inline SVG keeps the SDK free of
 * an icon-pack dependency.
 */
export function ShareToPhoneIcon({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
      <line x1="11" y1="18.5" x2="13" y2="18.5" />
      <path d="M3 10.5h7" />
      <path d="M7 7l-3.5 3.5L7 14" />
    </svg>
  );
}
