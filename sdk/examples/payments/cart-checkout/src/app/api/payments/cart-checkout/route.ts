import { createEazoCartCheckoutRoute } from "@eazo/sdk/payments/next";
import { resolveCart } from "@/lib/eazo-payments/cart";

export const POST = createEazoCartCheckoutRoute({ resolveCart });
