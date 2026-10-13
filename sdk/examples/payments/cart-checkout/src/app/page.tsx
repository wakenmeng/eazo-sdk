"use client";

import * as React from "react";
import { EazoEntitlementGate } from "@eazo/sdk/payments/react";
import { CartCheckoutButton } from "@/components/eazo-payments/CartCheckoutButton";

// Display copy only. The server prices carts from SHOP_ITEMS in
// src/lib/eazo-payments/cart.ts; the browser sends item ids and quantities.
const PRODUCTS = [
  { id: "skin_red", name: "Red Skin", price: "$4.99", unlock: true },
  { id: "gem_100", name: "100 Gems", price: "$1.99", unlock: false },
];

export default function ShopPage() {
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const lines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => ({ id, quantity }));

  function change(id: string, delta: number) {
    setQuantities((current) => ({
      ...current,
      // Unlock items are bought at most once per cart.
      [id]: Math.min(PRODUCTS.find((p) => p.id === id)?.unlock ? 1 : 999, Math.max(0, (current[id] ?? 0) + delta)),
    }));
  }

  return (
    <main style={{ maxWidth: 480, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui" }}>
      <h1>Shop</h1>
      <p>Use this as a working cart payment reference. Match the final styling to the app.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {PRODUCTS.map((product) => (
          <li key={product.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
            <span style={{ flex: 1 }}>
              {product.name} · {product.price}
            </span>
            <button type="button" onClick={() => change(product.id, -1)} aria-label={`Remove ${product.name}`}>
              −
            </button>
            <span>{quantities[product.id] ?? 0}</span>
            <button type="button" onClick={() => change(product.id, 1)} aria-label={`Add ${product.name}`}>
              +
            </button>
          </li>
        ))}
      </ul>
      <CartCheckoutButton lines={lines}>Checkout</CartCheckoutButton>
      <EazoEntitlementGate
        productKey="skin_red"
        paid={<p>Red Skin unlocked.</p>}
        free={<p>Red Skin not owned yet.</p>}
      />
    </main>
  );
}
