# Eazo Payments Cart Checkout Example

Complete Next.js App Router example for buying several items, each in any
quantity, in one Eazo checkout.

Eazo only collects the money and reports whether a payment is paid. What the
items are, their prices, and what the buyer receives stay in the app.

## What This Example Implements

- A shop page whose cart is plain React state (`{ id, quantity }` lines).
- Server-side pricing: `resolveCart` turns item ids into priced lines from the
  app's own data. Browser prices are never trusted.
- Same-window redirect to Stripe Checkout with `startEazoCartCheckout`.
- Delivery on the server through `fulfillCartPayment`, called only for paid
  cart payments and idempotent by `payment_id`.
- Two delivery triggers: the success page (`/payment/cart/success`) and
  `CartPaymentSync` in the root layout, which delivers paid carts the buyer
  never returned from.

## File Map

```text
src/lib/eazo-payments/cart.ts                 items, resolveCart, fulfillCartPayment
src/lib/eazo-payments/cart-contract.test.ts   contract tests
src/components/eazo-payments/CartCheckoutButton.tsx
src/components/eazo-payments/CartPaymentSync.tsx
src/app/api/payments/cart-checkout/route.ts   createEazoCartCheckoutRoute({ resolveCart })
src/app/api/payments/cart-status/route.ts     createEazoCartPaymentStatusRoute({ fulfill })
src/app/api/payments/cart-sync/route.ts       createEazoCartSyncRoute({ fulfill })
src/app/payment/cart/success/page.tsx
src/app/payment/cart/cancel/page.tsx
src/app/layout.tsx                            mounts CartPaymentSync
src/app/page.tsx                              shop UI
```

## The Two Functions the App Writes

### `resolveCart({ lines })`

Receives the browser's `{ id, quantity }` lines and returns
`{ currency, items }`, where each item is `{ name, unitAmount, quantity, metadata }`.
Return `null` when any id is unknown or unavailable.

- `unitAmount` is integer minor units (cents for USD).
- One cart uses one currency, has at most 100 lines, each quantity 1–999.
- The cart total may not exceed USD 5,000 or its per-currency equivalent
  (`getEazoCartMaximumAmount(currency)`).
- Put the app's own item id in `metadata` so delivery can read it back from
  `payment.line_items`.

### `fulfillCartPayment(payment, { user })`

Grants `payment.line_items` to `user.id`. It must be idempotent by
`payment.payment_id`: Eazo may call it from the success page and again from the
sync route. Write the payment id (unique) and the granted goods in one database
transaction. The in-memory version in this example is for demonstration only.

## Rules

- Never call `/api/open/payments/*` or Stripe from the app.
- Never grant goods from the browser, from a Stripe redirect, or from
  localStorage. Only `fulfillCartPayment` grants, and only for paid payments.
- Refunds are not supported by the cart flow yet.
