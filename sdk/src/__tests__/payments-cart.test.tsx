import { render, screen, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectPaymentsSourceRoot, scaffoldPayments } from "../cli";
import {
  assertEazoCartItems,
  EAZO_CART_MAXIMUM_AMOUNT_BY_CURRENCY,
  EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY,
  getEazoCartMaximumAmount,
  readRememberedEazoPaymentId,
  startEazoCartCheckout,
} from "../payments";
import {
  buildEazoCartCheckoutRequest,
  createEazoCartCheckoutSession,
  listEazoCartPayments,
} from "../payments.server";
import {
  createEazoCartCheckoutRoute,
  createEazoCartPaymentStatusRoute,
  createEazoCartSyncRoute,
} from "../payments.next";
import { EazoCartPaymentSuccessPage } from "../payments.next.client";
import {
  assertEazoCartCheckoutRequestContract,
  assertLocalCartCheckoutBodyContract,
  assertNoLegacyPaymentFlowSource,
  mockEazoCartPayment,
  mockEazoCartPaymentFromResolution,
  mockEazoCheckoutResponse,
} from "../payments.testing";
import { auth } from "../internal/capabilities/auth";
import { store } from "../internal/store";
import { __resetSDK } from "../testing";

const originalEnv = { ...process.env };
const TEST_USER = { id: "app_user_test", email: "test@example.com", name: "Test", avatarUrl: null };
const getUser = () => ({ ok: true as const, user: TEST_USER });
const ITEMS = [
  { name: "100 Gems", unitAmount: 199, quantity: 2, metadata: { item_id: "gem_100" } },
  { name: "Red Skin", unitAmount: 499 },
];

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

function mockPlatformResponses(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }
  global.fetch = fetchMock as unknown as typeof fetch;
}

function lastRequestBody() {
  const [, request] = vi.mocked(fetch).mock.calls.at(-1)!;
  return JSON.parse(String(request?.body));
}

describe("Eazo cart checkout SDK", () => {
  beforeEach(() => {
    __resetSDK();
    process.env.EAZO_API_BASE = "https://dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    __resetSDK();
    store.reset();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("scales the cart ceiling to USD 5,000 for every SDK currency", () => {
    expect(Object.keys(EAZO_CART_MAXIMUM_AMOUNT_BY_CURRENCY).sort())
      .toEqual(Object.keys(EAZO_PAYMENT_MAXIMUM_UNIT_AMOUNT_BY_CURRENCY).sort());
    expect(getEazoCartMaximumAmount("usd")).toBe(500_000);
    expect(getEazoCartMaximumAmount("cny")).toBe(3_394_300);
    expect(getEazoCartMaximumAmount("jpy")).toBe(811_550);
  });

  it("validates cart lines against the cart total instead of the single-product ceiling", () => {
    expect(assertEazoCartItems(ITEMS, "usd")).toEqual({ subtotal: 897, discountAmount: 0, total: 897 });
    expect(assertEazoCartItems([{ name: "Bundle", unitAmount: 450_000 }], "usd").total).toBe(450_000);
    expect(() => assertEazoCartItems([], "usd")).toThrow("non-empty");
    expect(() => assertEazoCartItems([{ name: "Bundle", unitAmount: 300_000, quantity: 2 }], "usd"))
      .toThrow("cart total for USD must not exceed 500000");
    expect(() => assertEazoCartItems([{ name: "Cheap", unitAmount: 10 }], "usd")).toThrow("at least 50");
    expect(() => assertEazoCartItems([{ name: "Many", unitAmount: 50, quantity: 1000 }], "usd"))
      .toThrow("quantity must be an integer from 1 to 999");
    expect(() => assertEazoCartItems([{ name: " ", unitAmount: 100 }], "usd")).toThrow("name is required");
    expect(() => assertEazoCartItems([{ name: "Odd", unitAmount: 150 }], "isk")).toThrow("multiple of 100");
  });

  it("validates unlock items and discounts", () => {
    expect(assertEazoCartItems(
      [{ name: "Red Skin", unitAmount: 500, entitlementKey: "skin_red" }, { name: "Gems", unitAmount: 400, quantity: 2 }],
      "usd",
      { discountAmount: 300 },
    )).toEqual({ subtotal: 1300, discountAmount: 300, total: 1000 });
    expect(() => assertEazoCartItems([{ name: "Skin", unitAmount: 500, quantity: 2, entitlementKey: "skin_red" }], "usd"))
      .toThrow("must have quantity 1");
    expect(() => assertEazoCartItems([
      { name: "Skin", unitAmount: 500, entitlementKey: "skin_red" },
      { name: "Skin 2", unitAmount: 500, entitlementKey: "skin_red" },
    ], "usd")).toThrow("appears more than once");
    expect(() => assertEazoCartItems([{ name: "Skin", unitAmount: 500, entitlementKey: "Bad Key" }], "usd"))
      .toThrow("entitlementKey");
    expect(() => assertEazoCartItems([{ name: "Gems", unitAmount: 500 }], "usd", { discountAmount: 500 }))
      .toThrow("discountAmount");
    expect(() => assertEazoCartItems([{ name: "Gems", unitAmount: 500 }], "usd", { discountAmount: 460 }))
      .toThrow("after discount for USD must be at least 50");
  });

  it("sends unlock keys and the discount only when present", () => {
    const request = buildEazoCartCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: [{ name: "Red Skin", unitAmount: 500, entitlementKey: "skin_red" }, { name: "Gems", unitAmount: 400, quantity: 2 }],
      discountAmount: 300,
      discountLabel: "Spend 10 save 3",
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
      idempotencyKey: "cart-once",
    });
    assertEazoCartCheckoutRequestContract(request);
    expect(request.items).toEqual([
      { name: "Red Skin", unit_amount: 500, quantity: 1, metadata: {}, entitlement_key: "skin_red" },
      { name: "Gems", unit_amount: 400, quantity: 2, metadata: {} },
    ]);
    expect(request).toMatchObject({ discount_amount: 300, discount_label: "Spend 10 save 3" });
    expect(() => buildEazoCartCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      discountLabel: "No amount",
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    })).toThrow("discountLabel requires discountAmount");
  });

  it("builds the exact cart checkout DTO", () => {
    const request = buildEazoCartCheckoutRequest({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      metadata: { order_id: "order_9" },
      successUrl: "https://app.example.com/payment/cart/success",
      cancelUrl: "https://app.example.com/payment/cart/cancel",
      idempotencyKey: "cart-once",
    });

    assertEazoCartCheckoutRequestContract(request);
    expect(request).toEqual({
      app_id: "app_test",
      app_user_id: "app_user_test",
      mode: "cart",
      currency: "usd",
      items: [
        { name: "100 Gems", unit_amount: 199, quantity: 2, metadata: { item_id: "gem_100" } },
        { name: "Red Skin", unit_amount: 499, quantity: 1, metadata: {} },
      ],
      success_url: "https://app.example.com/payment/cart/success",
      cancel_url: "https://app.example.com/payment/cart/cancel",
      metadata: { order_id: "order_9" },
      idempotency_key: "cart-once",
    });
    expect(() =>
      buildEazoCartCheckoutRequest({
        appUserId: "",
        currency: "usd",
        items: ITEMS,
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).toThrow("appUserId is required");
  });

  it("creates cart checkout sessions through the platform checkout endpoint", async () => {
    mockPlatformResponse(200, { ...mockEazoCheckoutResponse(), amount_total: 897, line_items: [] });

    const result = await createEazoCartCheckoutSession({
      appUserId: "app_user_test",
      currency: "usd",
      items: ITEMS,
      successUrl: "https://app.example.com/s",
      cancelUrl: "https://app.example.com/c",
    });

    expect(result.paymentId).toBe("cap_test_eazo");
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://dev1.eazo.ai/creator/api/open/payments/checkout-sessions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer eazo_private_test");
    expect(lastRequestBody().mode).toBe("cart");
  });

  it("rejects invalid carts before calling the platform", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      createEazoCartCheckoutSession({
        appUserId: "app_user_test",
        currency: "usd",
        items: [{ name: "Bundle", unitAmount: 300_000, quantity: 2 }],
        successUrl: "https://app.example.com/s",
        cancelUrl: "https://app.example.com/c",
      }),
    ).rejects.toThrow("cart total");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists cart payments with mode=cart and optional filters", async () => {
    mockPlatformResponse(200, { items: [mockEazoCartPayment("succeeded")], has_more: false, limit: 20, offset: 0 });

    const result = await listEazoCartPayments({
      appUserId: "app_user_test",
      status: "succeeded",
      updatedAfter: new Date("2026-10-01T00:00:00.000Z"),
      limit: 20,
    });

    expect(result.items[0].line_items).toHaveLength(2);
    const [url] = vi.mocked(fetch).mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/creator/api/open/payments");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      app_id: "app_test",
      mode: "cart",
      limit: "20",
      offset: "0",
      app_user_id: "app_user_test",
      status: "succeeded",
      updated_after: "2026-10-01T00:00:00.000Z",
    });
  });

  it("starts cart checkout with item ids only and remembers the payment", async () => {
    vi.spyOn(auth, "login").mockResolvedValue(TEST_USER);
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    mockPlatformResponse(200, { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_cart", paymentId: "cap_cart" });
    const redirect = vi.fn();

    await startEazoCartCheckout([{ id: "gem_100", quantity: 2 }], { redirect, data: { couponCode: "NEW3" } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/payments/cart-checkout");
    const body = JSON.parse(String(init?.body));
    assertLocalCartCheckoutBodyContract(body);
    expect(body).toEqual({ lines: [{ id: "gem_100", quantity: 2 }], data: { couponCode: "NEW3" } });
    expect(readRememberedEazoPaymentId()).toBe("cap_cart");
    expect(redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_cart");
  });

  it("prices carts on the server through resolveCart", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());
    const resolveCart = vi.fn(({ lines, data }) => ({
      currency: "usd" as const,
      items: lines.map((line: { id: string; quantity: number }) => ({
        name: line.id,
        unitAmount: 300,
        quantity: line.quantity,
      })),
      ...(data.couponCode === "NEW3" ? { discountAmount: 100, discountLabel: "New user" } : {}),
    }));
    const POST = createEazoCartCheckoutRoute({ resolveCart, getUser });

    const response = await POST(new Request("https://app.example.com/api/payments/cart-checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "gem_100", quantity: 3 }], data: { couponCode: "NEW3" } }),
    }));

    expect(response.status).toBe(200);
    expect(resolveCart).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ id: "gem_100", quantity: 3 }],
      data: { couponCode: "NEW3" },
      user: TEST_USER,
    }));
    const body = lastRequestBody();
    assertEazoCartCheckoutRequestContract(body);
    expect(body.items).toEqual([{ name: "gem_100", unit_amount: 300, quantity: 3, metadata: {} }]);
    expect(body).toMatchObject({ discount_amount: 100, discount_label: "New user" });
    expect(body.success_url).toBe("https://app.example.com/payment/cart/success");
    expect(body.cancel_url).toBe("https://app.example.com/payment/cart/cancel");
  });

  it("rejects malformed lines and carts resolveCart refuses", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch;
    const POST = createEazoCartCheckoutRoute({ resolveCart: () => null, getUser });

    const badData = await POST(new Request("https://app.example.com/api/payments/cart-checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "a", quantity: 1 }], data: { discountAmount: 500 } }),
    }));
    expect(badData.status).toBe(400);
    for (const lines of [undefined, [], [{ id: "", quantity: 1 }], [{ id: "a", quantity: 0 }], [{ id: "a", quantity: 1.5 }]]) {
      const response = await POST(new Request("https://app.example.com/api/payments/cart-checkout", {
        method: "POST",
        body: JSON.stringify({ lines }),
      }));
      expect(response.status).toBe(400);
    }
    const refused = await POST(new Request("https://app.example.com/api/payments/cart-checkout", {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "unknown", quantity: 1 }] }),
    }));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "Invalid cart" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fulfills only paid cart payments from the status route", async () => {
    const fulfill = vi.fn();
    const GET = createEazoCartPaymentStatusRoute({ fulfill, getUser });
    const request = () => new Request("https://app.example.com/api/payments/cart-status?payment_id=cap_test_cart");

    mockPlatformResponse(200, mockEazoCartPayment("processing"));
    expect(await (await GET(request())).json()).toMatchObject({ paid: false, fulfilled: false });
    expect(fulfill).not.toHaveBeenCalled();

    mockPlatformResponse(200, mockEazoCartPayment("succeeded"));
    expect(await (await GET(request())).json()).toMatchObject({ paid: true, fulfilled: true });
    expect(fulfill).toHaveBeenCalledWith(
      expect.objectContaining({ payment_id: "cap_test_cart", mode: "cart" }),
      { user: TEST_USER },
    );
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("app_user_id=app_user_test");
  });

  it("reports paid-but-undelivered carts when fulfill fails", async () => {
    const GET = createEazoCartPaymentStatusRoute({
      fulfill: () => {
        throw new Error("inventory service down");
      },
      getUser,
    });
    mockPlatformResponse(200, mockEazoCartPayment("succeeded"));

    const response = await GET(new Request("https://app.example.com/api/payments/cart-status?paymentId=cap_test_cart"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "inventory service down",
      payment_id: "cap_test_cart",
      paid: true,
      fulfilled: false,
    });
  });

  it("refuses non-cart payments on the cart status route", async () => {
    const fulfill = vi.fn();
    const GET = createEazoCartPaymentStatusRoute({ fulfill, getUser });
    mockPlatformResponse(200, { ...mockEazoCartPayment("succeeded"), mode: "one_time" });

    const response = await GET(new Request("https://app.example.com/api/payments/cart-status?paymentId=cap_1"));

    expect(response.status).toBe(400);
    expect(fulfill).not.toHaveBeenCalled();
  });

  it("syncs every paid cart payment across pages", async () => {
    const fulfill = vi.fn();
    const POST = createEazoCartSyncRoute({ fulfill, getUser });
    mockPlatformResponses(
      { items: [mockEazoCartPayment("succeeded", { payment_id: "cap_1" })], has_more: true, limit: 100, offset: 0 },
      { items: [mockEazoCartPayment("succeeded", { payment_id: "cap_2" })], has_more: false, limit: 100, offset: 100 },
    );

    const response = await POST(new Request("https://app.example.com/api/payments/cart-sync", { method: "POST" }));

    expect(await response.json()).toEqual({ fulfilled: 2 });
    expect(fulfill.mock.calls.map(([payment]) => payment.payment_id)).toEqual(["cap_1", "cap_2"]);
    const offsets = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).searchParams.get("offset"));
    expect(offsets).toEqual(["0", "100"]);
  });

  it("shows a delivered state once the cart status route fulfills the payment", async () => {
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    window.history.pushState({}, "", "/payment/cart/success?payment_id=cap_test_cart");
    mockPlatformResponse(200, { ...mockEazoCartPayment("succeeded"), fulfilled: true });

    render(<EazoCartPaymentSuccessPage />);

    await waitFor(() => expect(screen.getByText("Purchase complete")).toBeTruthy());
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe("/api/payments/cart-status?paymentId=cap_test_cart");
    // The cart's unlock line refreshes its entitlement so gates update.
    expect(urls.some((url) => url.startsWith("/api/payments/entitlements?") && url.includes("skin_red"))).toBe(true);
  });

  it("tells the buyer delivery is pending when payment succeeded but fulfill failed", async () => {
    vi.spyOn(auth, "getSessionHeader").mockResolvedValue("session_test");
    window.history.pushState({}, "", "/payment/cart/success?payment_id=cap_test_cart");
    mockPlatformResponse(500, { error: "down", payment_id: "cap_test_cart", paid: true, fulfilled: false });

    render(<EazoCartPaymentSuccessPage />);

    await waitFor(() => expect(screen.getByText("Payment received")).toBeTruthy());
  });

  it("builds a paid mock payment from a resolved cart", () => {
    const payment = mockEazoCartPaymentFromResolution({
      currency: "usd",
      items: [{ name: "Red Skin", unitAmount: 500, entitlementKey: "skin_red" }, { name: "Gems", unitAmount: 400, quantity: 2 }],
      discountAmount: 300,
      metadata: { coupon_id: "c_1" },
    });
    expect(payment).toMatchObject({ paid: true, amount_subtotal: 1300, discount_amount: 300, amount_total: 1000 });
    expect(payment.line_items.map((line) => line.entitlement_key)).toEqual(["skin_red", null]);
  });

  it("scaffolds into a root app/ directory when the project has no src/app", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-root-app-"));
    fs.mkdirSync(path.join(cwd, "app"));
    expect(detectPaymentsSourceRoot(cwd)).toBe("");

    const cart = scaffoldPayments({ cwd, recipe: "cart-checkout" });
    expect(cart.files).toContain("app/api/payments/cart-checkout/route.ts");
    expect(cart.files).toContain("lib/eazo-payments/cart.ts");
    expect(cart.files.some((file) => file.startsWith("src/"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, "src"))).toBe(false);
    const contractTest = fs.readFileSync(path.join(cwd, "lib/eazo-payments/cart-contract.test.ts"), "utf8");
    expect(contractTest).toContain('["app", "lib", "components"]');
    expect(contractTest).not.toContain('path.resolve(process.cwd(), "src")');

    const oneTime = scaffoldPayments({ cwd, recipe: "one-time-unlock" });
    expect(oneTime.files).toContain("app/api/payments/checkout/route.ts");
  });

  it("keeps src/ when the project uses src/app or has no app directory yet", () => {
    const withSrc = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-src-app-"));
    fs.mkdirSync(path.join(withSrc, "src", "app"), { recursive: true });
    fs.mkdirSync(path.join(withSrc, "app"));
    expect(detectPaymentsSourceRoot(withSrc)).toBe("src");
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-empty-"));
    expect(detectPaymentsSourceRoot(empty)).toBe("src");
  });

  it("scaffolds the cart-checkout recipe with thin routes and an explicit fulfill stub", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "eazo-payments-cart-"));
    const result = scaffoldPayments({ cwd, recipe: "cart-checkout" });

    expect(result.files).toEqual([
      "src/lib/eazo-payments/cart.ts",
      "src/lib/eazo-payments/cart-contract.test.ts",
      "src/components/eazo-payments/CartCheckoutButton.tsx",
      "src/components/eazo-payments/CartPaymentSync.tsx",
      "src/app/api/payments/cart-checkout/route.ts",
      "src/app/api/payments/cart-status/route.ts",
      "src/app/api/payments/cart-sync/route.ts",
      "src/app/payment/cart/success/page.tsx",
      "src/app/payment/cart/cancel/page.tsx",
    ]);
    const cart = fs.readFileSync(path.join(cwd, "src/lib/eazo-payments/cart.ts"), "utf8");
    expect(cart).toContain("export async function resolveCart");
    expect(cart).toContain("Implement fulfillCartPayment");
    expect(cart).toContain("entitlementKey: \"skin_red\"");
    expect(cart).toContain("ON CONFLICT (payment_id) DO NOTHING");
    expect(cart).not.toContain("productKey");
    for (const file of result.files) {
      const source = fs.readFileSync(path.join(cwd, file), "utf8");
      expect(source).not.toContain("/api/open/payments");
      if (!file.endsWith(".test.ts")) assertNoLegacyPaymentFlowSource(source, file);
    }
  });
});
