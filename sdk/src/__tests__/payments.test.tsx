import { render, screen, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scaffoldPayments } from "../cli";
import {
  clearRememberedEazoPaymentId,
  readEazoPaymentIdFromUrl,
  readRememberedEazoPaymentId,
  rememberEazoPaymentId,
  startEazoCheckout,
} from "../payments";
import {
  buildEazoCheckoutRequest,
  createEazoCheckoutSession,
  getEazoPaymentStatus,
} from "../payments.server";
import {
  createEazoCheckoutRoute,
  EazoPaymentSuccessPage,
} from "../payments.next";
import {
  assertEazoCheckoutRequestContract,
  mockEazoCheckoutResponse,
  mockEazoPaymentStatus,
} from "../payments.testing";

const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("Eazo Payments SDK", () => {
  beforeEach(() => {
    process.env.EAZO_API_BASE = "https://creator.dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("builds the exact checkout DTO and forbids drifted fields", () => {
    const request = buildEazoCheckoutRequest({
      productKey: "premium",
      productName: "Premium unlock",
      unitAmount: 499,
      currency: "usd",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      unit_amount: 499,
      product_name: "Premium unlock",
      metadata: { product_key: "premium" },
    });
    assertEazoCheckoutRequestContract(request);
  });

  it("normalizes checkout creation and preserves platform failures", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    await expect(
      createEazoCheckoutSession({
        productKey: "premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).resolves.toMatchObject({
      checkoutUrl: expect.stringContaining("checkout.stripe.com"),
      paymentId: "cap_test_eazo",
    });

    mockPlatformResponse(422, { detail: [{ msg: "Field required" }] });
    await expect(
      createEazoCheckoutSession({
        productKey: "premium",
        productName: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Field required",
    });
  });

  it.each(["pending", "succeeded", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s payment status",
    async (status) => {
      mockPlatformResponse(200, mockEazoPaymentStatus(status));
      const result = await getEazoPaymentStatus("cap_test_eazo");
      expect(result.status).toBe(status);
      expect(result.paid).toBe(status === "succeeded");
    },
  );

  it("starts checkout through the local route and remembers payment id", async () => {
    mockPlatformResponse(200, {
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      paymentId: "cap_test_eazo",
    });
    const redirect = vi.fn();

    await startEazoCheckout("premium", redirect);

    expect(fetch).toHaveBeenCalledWith("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productKey: "premium" }),
    });
    expect(readRememberedEazoPaymentId()).toBe("cap_test_eazo");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("recovers payment id from return URL before storage fallback", async () => {
    rememberEazoPaymentId("cap_stored");
    window.history.pushState({}, "", "/payment/success?payment_id=cap_url");
    mockPlatformResponse(200, mockEazoPaymentStatus("succeeded"));

    render(<EazoPaymentSuccessPage />);

    expect(await screen.findByText("Premium unlocked")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/payments/status?paymentId=cap_url", {
      cache: "no-store",
    });
    clearRememberedEazoPaymentId();
    expect(readRememberedEazoPaymentId()).toBeNull();
    expect(readEazoPaymentIdFromUrl("?payment_id=cap_url")).toBe("cap_url");
  });

  it("creates Next route handlers without handwritten platform bodies", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getProduct: () => ({
        key: "premium",
        name: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
      }),
    });

    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: "premium" }),
    }));

    expect(response.status).toBe(200);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(body).toHaveProperty("unit_amount", 499);
    expect(body).toHaveProperty("product_name", "Premium unlock");
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("title");
  });

  it("scaffolds thin Next payment files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-"));
    const result = scaffoldPayments({ cwd });

    expect(result.files).toContain("src/lib/eazo-payments/catalog.ts");
    expect(result.files).toContain("src/app/api/payments/checkout/route.ts");
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/payments/checkout/route.ts"),
      "utf8",
    );
    expect(route).toContain("@eazo/sdk/payments/next");
    expect(route).not.toContain("/api/open/payments/checkout-sessions");
    expect(route).not.toContain("unit_amount");
  });

  it("does not use popup checkout", () => {
    const source = fs.readFileSync(path.join(__dirname, "../payments.ts"), "utf8");
    expect(source).toContain("window.location.assign");
    expect(source).not.toContain("window.open");
  });
});
