"use client";

import { EazoCartPaymentSync } from "@eazo/sdk/payments/next/client";

// Mount once in the root layout so paid carts are delivered even when the buyer
// closed the page before returning from checkout.
export function CartPaymentSync() {
  return <EazoCartPaymentSync />;
}
