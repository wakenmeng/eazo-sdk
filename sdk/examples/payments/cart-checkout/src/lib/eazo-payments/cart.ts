import {
  EAZO_PAYMENT_CURRENCY,
  type EazoCartItem,
  type EazoCartLine,
} from "@eazo/sdk/payments";
import type { EazoCartFulfill, EazoCartResolution } from "@eazo/sdk/payments/next";

// Every cart is charged in one currency.
export const SHOP_CURRENCY = EAZO_PAYMENT_CURRENCY.USD;

// The app's sellable items, keyed by the id the browser sends in cart lines.
// Replace with the app's own data source. unitAmount is integer minor units
// (cents for USD); one cart subtotal may not exceed USD 5,000.
//
// - Unlock items (owned forever: skins, levels, premium features) set
//   entitlementKey. Eazo grants it when the cart is paid; read it with
//   useEazoEntitlement(entitlementKey). They are always bought one at a time.
// - Consumables (coins, gems, credits, lives) leave entitlementKey unset and are
//   granted by fulfillCartPayment below.
export const SHOP_ITEMS: Record<string, { name: string; unitAmount: number; entitlementKey?: string }> = {
  skin_red: { name: "Red Skin", unitAmount: 499, entitlementKey: "skin_red" },
  gem_100: { name: "100 Gems", unitAmount: 199 },
};

// Server-side pricing: never trust prices or amounts from the browser. Return
// null to reject a cart that references an unknown or unavailable item.
// To offer a discount (for example from the app's own coupon table), look up
// data.couponCode here and return discountAmount / discountLabel, plus
// metadata.coupon_id so fulfillCartPayment can mark the coupon used.
export async function resolveCart({ lines }: { lines: EazoCartLine[]; data?: Record<string, string> }): Promise<EazoCartResolution | null> {
  const items: EazoCartItem[] = [];
  for (const line of lines) {
    const item = SHOP_ITEMS[line.id];
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
  return { currency: SHOP_CURRENCY, items };
}

// Grants consumables of a paid cart to user.id. Eazo calls it only for paid
// cart payments and may call it more than once for the same payment, so it
// must be idempotent. In a real app, use this shape in ONE database transaction:
//
//   INSERT INTO cart_fulfillments (payment_id, user_id) VALUES ($1, $2)
//     ON CONFLICT (payment_id) DO NOTHING RETURNING payment_id;
//   -- no row returned: already granted, stop.
//   -- row returned: add each consumable line to the user's balance.
//
// EXAMPLE ONLY: the in-memory Set/Map below stand in for that table and the
// balance table. They are lost on restart and not shared between serverless
// instances, so never ship them.
const fulfilledPaymentIds = new Set<string>();
const balances = new Map<string, Map<string, number>>();

export function getBalances(userId: string): Record<string, number> {
  return Object.fromEntries(balances.get(userId) ?? []);
}

export const fulfillCartPayment: EazoCartFulfill = async (payment, { user }) => {
  const consumables = payment.line_items.filter((line) => !line.entitlement_key);
  if (consumables.length === 0) return; // Unlock items are granted by Eazo.
  if (fulfilledPaymentIds.has(payment.payment_id)) return;
  const balance = balances.get(user.id) ?? new Map<string, number>();
  for (const line of consumables) {
    const itemId = line.metadata.item_id;
    if (!itemId) continue;
    balance.set(itemId, (balance.get(itemId) ?? 0) + line.quantity);
  }
  balances.set(user.id, balance);
  fulfilledPaymentIds.add(payment.payment_id);
};
