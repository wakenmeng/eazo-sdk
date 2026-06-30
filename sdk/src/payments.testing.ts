import type {
  EazoCheckoutSessionResponse,
  EazoCheckoutSessionRequest,
  EazoPaymentStatus,
  EazoPaymentStatusValue,
} from "./payments";

export function mockEazoCheckoutResponse(
  overrides: Partial<EazoCheckoutSessionResponse> = {},
): EazoCheckoutSessionResponse {
  return {
    checkout_session_id: "cs_test_eazo",
    checkout_url: "https://checkout.stripe.com/c/pay/cs_test_eazo",
    payment_id: "cap_test_eazo",
    ...overrides,
  };
}

export function mockEazoPaymentStatus(
  status: EazoPaymentStatusValue,
  paid = status === "succeeded",
): EazoPaymentStatus {
  return {
    payment_id: "cap_test_eazo",
    app_id: "app_test",
    status,
    paid,
    amount_total: 499,
    currency: "usd",
    product_name: "Premium unlock",
    metadata: { product_key: "premium" },
  };
}

export function mockFetchJson(status: number, body: unknown) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function assertEazoCheckoutRequestContract(request: EazoCheckoutSessionRequest) {
  const body = request as unknown as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  if (body.unit_amount === undefined) {
    throw new Error("Eazo checkout request must include unit_amount");
  }
  if (body.product_name === undefined) {
    throw new Error("Eazo checkout request must include product_name");
  }
  for (const forbidden of ["amount", "title", "product_id", "checkout_url", "order_id"]) {
    if (Object.prototype.hasOwnProperty.call(body, forbidden)) {
      throw new Error(`Eazo checkout request must not include ${forbidden}`);
    }
  }
  if (serialized.includes("STRIPE_SECRET_KEY")) {
    throw new Error("Generated apps must not include Stripe secrets");
  }
}
