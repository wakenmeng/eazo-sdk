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
// (cents for USD); one cart total may not exceed USD 5,000.
export const SHOP_ITEMS: Record<string, { name: string; unitAmount: number }> = {
  gem_100: { name: "100 Gems", unitAmount: 199 },
  skin_red: { name: "Red Skin", unitAmount: 499 },
};

// Server-side pricing: never trust prices from the browser. Return null to
// reject a cart that references an unknown or unavailable item.
export async function resolveCart({ lines }: { lines: EazoCartLine[] }): Promise<EazoCartResolution | null> {
  const items: EazoCartItem[] = [];
  for (const line of lines) {
    const item = SHOP_ITEMS[line.id];
    if (!item) return null;
    items.push({
      name: item.name,
      unitAmount: item.unitAmount,
      quantity: line.quantity,
      metadata: { item_id: line.id },
    });
  }
  return { currency: SHOP_CURRENCY, items };
}

// Grant what a paid cart bought to user.id, using payment.line_items
// (line.metadata.item_id and line.quantity). Eazo calls this only for paid cart
// payments, but may call it more than once for the same payment: store
// payment.payment_id with a unique constraint and skip payments already granted.
//
// EXAMPLE ONLY: this keeps state in memory, which is lost on every server
// restart and is not shared between serverless instances. A real app writes the
// granted payment id and the inventory change in one database transaction.
const grantedPaymentIds = new Set<string>();
const inventories = new Map<string, Map<string, number>>();

export function getInventory(userId: string): Record<string, number> {
  return Object.fromEntries(inventories.get(userId) ?? []);
}

export const fulfillCartPayment: EazoCartFulfill = async (payment, { user }) => {
  if (grantedPaymentIds.has(payment.payment_id)) return;
  const inventory = inventories.get(user.id) ?? new Map<string, number>();
  for (const line of payment.line_items) {
    const itemId = line.metadata.item_id;
    if (!itemId) continue;
    inventory.set(itemId, (inventory.get(itemId) ?? 0) + line.quantity);
  }
  inventories.set(user.id, inventory);
  grantedPaymentIds.add(payment.payment_id);
};
