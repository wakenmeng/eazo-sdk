import type {
  EazoCheckoutSessionResponse,
  EazoCheckoutSessionRequest,
  EazoEntitlement,
  EazoEntitlementStatusValue,
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

export function mockEazoEntitlement(
  status: EazoEntitlementStatusValue,
  overrides: Partial<EazoEntitlement> = {},
): EazoEntitlement {
  return {
    app_id: "app_test",
    app_user_id: "app_user_test",
    product_key: "premium",
    entitlement_key: "premium",
    status,
    active: status === "active",
    payment_id: status === "active" ? "cap_test_eazo" : null,
    source_payment_id: status === "active" ? "cap_test_eazo" : null,
    current_period_end: null,
    metadata: {},
    updated_at: 1_800_000_000_000,
    ...overrides,
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
  if (body.product_key === undefined) {
    throw new Error("Eazo checkout request must include product_key");
  }
  if (body.entitlement_key === undefined) {
    throw new Error("Eazo checkout request must include entitlement_key");
  }
  if (body.mode !== "one_time" && body.mode !== "subscription") {
    throw new Error("Eazo checkout request must include a supported mode");
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
