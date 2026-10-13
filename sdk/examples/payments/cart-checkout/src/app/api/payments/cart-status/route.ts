import { createEazoCartPaymentStatusRoute } from "@eazo/sdk/payments/next";
import { fulfillCartPayment } from "@/lib/eazo-payments/cart";

export const GET = createEazoCartPaymentStatusRoute({ fulfill: fulfillCartPayment });
