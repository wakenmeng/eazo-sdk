"use client";

import * as React from "react";
import { startEazoCartCheckout, type EazoCartLine } from "@eazo/sdk/payments";

export type CartCheckoutButtonProps = {
  lines: EazoCartLine[];
  children?: React.ReactNode;
  className?: string;
};

// Cart contents (lines) can live in React state or localStorage; payment state
// never does. The button only starts checkout; delivery happens on the server.
export function CartCheckoutButton({ lines, children = "Checkout", className }: CartCheckoutButtonProps) {
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function checkout() {
    setStarting(true);
    setError("");
    try {
      await startEazoCartCheckout(lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setStarting(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} disabled={starting || lines.length === 0} onClick={checkout}>
        {children}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
