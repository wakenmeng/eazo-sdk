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
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
} from "../payments.server";
import {
  createEazoCheckoutRoute,
  createEazoEntitlementRoute,
  EazoPaymentSuccessPage,
} from "../payments.next";
import {
  EazoEntitlementGate,
  EazoPaymentButton,
  refreshEazoEntitlement,
} from "../payments.react";
import {
  assertEazoCheckoutRequestContract,
  mockEazoCheckoutResponse,
  mockEazoEntitlement,
  mockEazoPaymentStatus,
} from "../payments.testing";
import { auth } from "../internal/capabilities/auth";
import { store } from "../internal/store";

const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function seedWebSession() {
  const session = { userId: "app_user_test", email: "test@example.com" };
  window.localStorage.setItem("eazo.session", JSON.stringify(session));
  return JSON.stringify(session);
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
    store.reset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("builds the exact checkout DTO and forbids drifted fields", () => {
    const request = buildEazoCheckoutRequest({
      productKey: "premium",
      productName: "Premium unlock",
      unitAmount: 499,
      currency: "usd",
      mode: "one_time",
      entitlementKey: "premium",
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: "premium",
      entitlement_key: "premium",
      mode: "one_time",
      unit_amount: 499,
      product_name: "Premium unlock",
      metadata: {
        product_key: "premium",
        entitlement_key: "premium",
        mode: "one_time",
        app_user_id: "app_user_test",
      },
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

  it.each(["inactive", "pending", "active", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s entitlement status",
    async (status) => {
      mockPlatformResponse(200, mockEazoEntitlement(status));
      const result = await getEazoEntitlementStatus("premium", { appUserId: "app_user_test" });
      expect(result.status).toBe(status);
      expect(result.active).toBe(status === "active");
    },
  );

  it("starts checkout through the local route and remembers payment id", async () => {
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, {
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      paymentId: "cap_test_eazo",
    });
    const redirect = vi.fn();

    await startEazoCheckout("premium", redirect);

    expect(fetch).toHaveBeenCalledWith("/api/payments/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eazo-session": expect.any(String),
      },
      body: JSON.stringify({ productKey: "premium" }),
    });
    expect(readRememberedEazoPaymentId()).toBe("cap_test_eazo");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test");
  });

  it("requires login before starting checkout", async () => {
    const login = vi.spyOn(auth, "login").mockResolvedValue({
      id: "user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, {
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
      paymentId: "cap_test_eazo",
    });

    await startEazoCheckout("premium", vi.fn());

    expect(login).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(login.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(fetch).mock.invocationCallOrder[0],
    );
  });

  it("recovers payment id from return URL before storage fallback", async () => {
    rememberEazoPaymentId("cap_stored");
    seedWebSession();
    window.history.pushState({}, "", "/payment/success?payment_id=cap_url");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoPaymentStatus("succeeded")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("active")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

    render(<EazoPaymentSuccessPage />);

    expect(await screen.findByText("Premium unlocked")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/payments/status?paymentId=cap_url", {
      headers: { "x-eazo-session": expect.any(String) },
      cache: "no-store",
    });
    expect(fetch).toHaveBeenCalledWith("/api/payments/entitlements?productKey=premium", {
      headers: { "x-eazo-session": expect.any(String) },
      cache: "no-store",
    });
    clearRememberedEazoPaymentId();
    expect(readRememberedEazoPaymentId()).toBeNull();
    expect(readEazoPaymentIdFromUrl("?payment_id=cap_url")).toBe("cap_url");
  });

  it("refreshes entitlement from the app-local route and caches active state", async () => {
    seedWebSession();
    mockPlatformResponse(200, mockEazoEntitlement("active"));

    await expect(refreshEazoEntitlement("premium")).resolves.toMatchObject({
      status: "active",
      active: true,
    });
    expect(window.localStorage.getItem("eazo:paymentEntitlement:premium")).toContain("active");
  });

  it("renders the paid branch through the entitlement gate", async () => {
    seedWebSession();
    mockPlatformResponse(200, mockEazoEntitlement("active"));

    render(
      <EazoEntitlementGate
        productKey="premium"
        loading={<span>Checking</span>}
        paid={<span>Pro is active</span>}
        free={<span>Upgrade</span>}
      />,
    );

    expect(await screen.findByText("Pro is active")).toBeTruthy();
  });

  it("payment button starts checkout only after entitlement check and login", async () => {
    seedWebSession();
    vi.spyOn(auth, "login").mockResolvedValue({
      id: "app_user_test",
      email: "test@example.com",
      name: "Test",
      avatarUrl: null,
    });
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mockEazoEntitlement("inactive")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test",
          paymentId: "cap_test_eazo",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);

    render(<EazoPaymentButton productKey="premium">Upgrade</EazoPaymentButton>);
    await screen.findByText("Upgrade");
    screen.getByText("Upgrade").click();

    await waitFor(() => expect(auth.login).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test"));
  });

  it("creates Next route handlers without handwritten platform bodies", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const POST = createEazoCheckoutRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
      getProduct: () => ({
        key: "premium",
        name: "Premium unlock",
        unitAmount: 499,
        currency: "usd",
      }),
    });
    const sessionHeader = seedWebSession();

    const response = await POST(new Request("https://app.example.com/api/payments/checkout", {
      method: "POST",
      headers: { "x-eazo-session": sessionHeader },
      body: JSON.stringify({ productKey: "premium" }),
    }));

    expect(response.status).toBe(200);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(body).toHaveProperty("unit_amount", 499);
    expect(body).toHaveProperty("product_name", "Premium unlock");
    expect(body).toHaveProperty("app_user_id", "app_user_test");
    expect(body).toHaveProperty("entitlement_key", "premium");
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("title");
  });

  it("creates Next entitlement route handlers that require app user session", async () => {
    mockPlatformResponse(200, mockEazoEntitlement("active"));
    const GET = createEazoEntitlementRoute({
      getUser: () => ({
        ok: true,
        user: { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null },
      }),
    });
    const sessionHeader = seedWebSession();

    const response = await GET(new Request("https://app.example.com/api/payments/entitlements?productKey=premium", {
      headers: { "x-eazo-session": sessionHeader },
    }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://creator.dev1.eazo.ai/api/open/payments/entitlements?app_id=app_test&product_key=premium&app_user_id=app_user_test",
      expect.objectContaining({
        headers: { Authorization: "Bearer eazo_private_test" },
        cache: "no-store",
      }),
    );
  });

  it("scaffolds thin Next payment files", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-"));
    const result = scaffoldPayments({ cwd });

    expect(result.files).toContain("src/lib/eazo-payments/catalog.ts");
    expect(result.files).toContain("src/app/api/payments/checkout/route.ts");
    expect(result.files).toContain("src/app/api/payments/entitlements/route.ts");
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
