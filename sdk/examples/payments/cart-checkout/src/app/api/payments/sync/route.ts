import { createEazoCartSyncRoute } from "@eazo/sdk/payments/next";
import { fulfillCartPayment } from "@/lib/eazo-payments/cart";

export const POST = createEazoCartSyncRoute({ fulfill: fulfillCartPayment });
