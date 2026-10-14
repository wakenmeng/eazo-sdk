import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";
import { fulfillCartPayment } from "@/lib/eazo-payments/cart";

export const GET = createEazoPaymentStatusRoute({ fulfill: fulfillCartPayment });
