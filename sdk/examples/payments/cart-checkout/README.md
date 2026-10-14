# Eazo Payments Cart Checkout Example

One payment for several line items, or more than one of the same item.

## Boundary

Eazo charges one Stripe Checkout for the lines the app priced, applies an
optional app-computed discount, grants an entitlement for each line with
`entitlementKey`, and reports whether the payment is paid.

The app prices the lines on its server (`resolveCart`) and grants lines without
`entitlementKey` (`fulfillCartPayment`), once per payment.

## Files

```text
src/lib/eazo-payments/cart.ts                CART_ITEMS, resolveCart, fulfillCartPayment
src/lib/eazo-payments/cart-contract.test.ts
src/components/eazo-payments/CartCheckoutButton.tsx
src/components/eazo-payments/CartPaymentSync.tsx   mounted in src/app/layout.tsx
src/app/api/payments/checkout/route.ts       createEazoCheckoutRoute({ resolveCart })
src/app/api/payments/status/route.ts         createEazoPaymentStatusRoute({ fulfill: fulfillCartPayment })
src/app/api/payments/sync/route.ts           createEazoCartSyncRoute({ fulfill: fulfillCartPayment })
src/app/payment/success/page.tsx
src/app/payment/cancel/page.tsx
```

`checkout`, `status`, `success` and `cancel` are the same routes the one-time and
subscription recipes use; an app with both passes `getProduct` and
`resolveCart` to one `createEazoCheckoutRoute`.

## `resolveCart({ lines, data })`

Receives `{ id, quantity }` lines and optional string `data`, and returns
`{ currency, items, discountAmount?, discountLabel?, metadata? }`. Each item is
`{ name, unitAmount, quantity, metadata, entitlementKey? }`. Return `null` to
reject the cart. Prices and discounts come from server-side data only.

## `fulfillCartPayment(payment, { user })`

Grants the lines of `payment.line_items` that have no `entitlement_key`. It runs
only for paid payments and may run more than once, so dedupe on
`payment.payment_id` (`INSERT ... ON CONFLICT (payment_id) DO NOTHING RETURNING`).
The in-memory version here is for demonstration only.

## Rules

- Never call `/api/open/payments/*` or Stripe from the app.
- Grant only in `fulfillCartPayment` or through entitlements; never from the
  browser, a Stripe redirect, or localStorage.
