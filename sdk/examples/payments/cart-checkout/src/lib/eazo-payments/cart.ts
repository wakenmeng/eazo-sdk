import {
  EAZO_PAYMENT_CURRENCY,
  type EazoCartItem,
  type EazoCartLine,
} from "@eazo/sdk/payments";
import type { EazoCartFulfill, EazoCartResolution } from "@eazo/sdk/payments/next";

export const CART_CURRENCY = EAZO_PAYMENT_CURRENCY.USD;

// What can be paid for, keyed by the id the browser sends in cart lines. Replace
// with the app's own server-side data. unitAmount is integer minor units.
// entitlementKey: Eazo grants it when paid (quantity 1); read it with
// useEazoEntitlement(key). Lines without it are granted by fulfillCartPayment.
export const CART_ITEMS: Record<string, { name: string; unitAmount: number; entitlementKey?: string }> = {
  item_a: { name: "Item A", unitAmount: 499, entitlementKey: "item_a" },
  item_b: { name: "Item B", unitAmount: 199 },
};

// Prices the browser's lines on the server. Return null to reject the cart.
// Never trust prices or amounts from the browser; a discount, if any, is
// computed here and returned as discountAmount / discountLabel.
export async function resolveCart({ lines }: { lines: EazoCartLine[]; data?: Record<string, string> }): Promise<EazoCartResolution | null> {
  const items: EazoCartItem[] = [];
  for (const line of lines) {
    const item = CART_ITEMS[line.id];
    if (!item) return null;
    if (item.entitlementKey && line.quantity !== 1) return null;
    items.push({
      name: item.name,
      unitAmount: item.unitAmount,
      quantity: line.quantity,
      metadata: { item_id: line.id },
      ...(item.entitlementKey ? { entitlementKey: item.entitlementKey } : {}),
    });
  }
  return { currency: CART_CURRENCY, items };
}

// Grants the paid lines that have no entitlement_key to user.id. Called only for
// paid cart payments, possibly more than once per payment. A real app does this
// in ONE database transaction:
//
//   INSERT INTO cart_fulfillments (payment_id, user_id) VALUES ($1, $2)
//     ON CONFLICT (payment_id) DO NOTHING RETURNING payment_id;
//   -- no row returned: already granted, stop.
//   -- row returned: grant each remaining line to user.id.
//
// EXAMPLE ONLY: the in-memory Set/Map below stand in for those tables; they are
// lost on restart and not shared between serverless instances.
const fulfilledPaymentIds = new Set<string>();
const balances = new Map<string, Map<string, number>>();

export function getBalances(userId: string): Record<string, number> {
  return Object.fromEntries(balances.get(userId) ?? []);
}

export const fulfillCartPayment: EazoCartFulfill = async (payment, { user }) => {
  const lines = payment.line_items.filter((line) => !line.entitlement_key);
  if (lines.length === 0) return; // Entitlement lines are granted by Eazo.
  if (fulfilledPaymentIds.has(payment.payment_id)) return;
  const balance = balances.get(user.id) ?? new Map<string, number>();
  for (const line of lines) {
    const itemId = line.metadata.item_id;
    if (!itemId) continue;
    balance.set(itemId, (balance.get(itemId) ?? 0) + line.quantity);
  }
  balances.set(user.id, balance);
  fulfilledPaymentIds.add(payment.payment_id);
};
