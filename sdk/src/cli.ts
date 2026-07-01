#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

type ScaffoldOptions = {
  cwd?: string;
  recipe?: string;
  force?: boolean;
  dryRun?: boolean;
};

type TemplateFile = {
  filePath: string;
  content: string;
};

const REQUIRED_RECIPE = "one-time-unlock";

function normalizeNewline(content: string) {
  return content.trimStart().replace(/\s+$/, "") + "\n";
}

function paymentCatalogTemplate() {
  return normalizeNewline(`
import type { EazoPaymentProduct } from "@eazo/sdk/payments";

export const PAYMENT_PRODUCTS = {
  premium: {
    key: "premium",
    name: "Premium unlock",
    unitAmount: 499,
    currency: "usd",
    mode: "one_time",
    entitlementKey: "premium",
  },
} as const satisfies Record<string, EazoPaymentProduct>;

export type PaymentProductKey = keyof typeof PAYMENT_PRODUCTS;

export function getPaymentProduct(productKey: string): EazoPaymentProduct | null {
  return PAYMENT_PRODUCTS[productKey as PaymentProductKey] ?? null;
}
`);
}

function checkoutRouteTemplate() {
  return normalizeNewline(`
import { createEazoCheckoutRoute } from "@eazo/sdk/payments/next";
import { getPaymentProduct } from "@/lib/eazo-payments/catalog";

export const POST = createEazoCheckoutRoute({ getProduct: getPaymentProduct });
`);
}

function statusRouteTemplate() {
  return normalizeNewline(`
import { createEazoPaymentStatusRoute } from "@eazo/sdk/payments/next";

export const GET = createEazoPaymentStatusRoute();
`);
}

function entitlementRouteTemplate() {
  return normalizeNewline(`
import { createEazoEntitlementRoute } from "@eazo/sdk/payments/next";

export const GET = createEazoEntitlementRoute();
`);
}

function successPageTemplate() {
  return normalizeNewline(`
"use client";

import { EazoPaymentSuccessPage } from "@eazo/sdk/payments/next";

export default function PaymentSuccessPage() {
  return <EazoPaymentSuccessPage />;
}
`);
}

function cancelPageTemplate() {
  return normalizeNewline(`
"use client";

import { EazoPaymentCancelPage } from "@eazo/sdk/payments/next";

export default function PaymentCancelPage() {
  return <EazoPaymentCancelPage />;
}
`);
}

function paymentContractTestTemplate() {
  return normalizeNewline(`
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildEazoCheckoutRequest,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
} from "@eazo/sdk/payments/server";
import {
  assertEazoCheckoutRequestContract,
  mockEazoCheckoutResponse,
  mockEazoEntitlement,
  mockEazoPaymentStatus,
} from "@eazo/sdk/payments/testing";
import { PAYMENT_PRODUCTS } from "./catalog";

const TEST_PRODUCT = PAYMENT_PRODUCTS.premium;

const originalEnv = { ...process.env };

function mockPlatformResponse(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("Eazo Payments integration contract", () => {
  beforeEach(() => {
    process.env.EAZO_API_BASE = "https://creator.dev1.eazo.ai";
    process.env.EAZO_APP_ID = "app_test";
    process.env.EAZO_PRIVATE_KEY = "eazo_private_test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds the platform checkout DTO from the product catalog", () => {
    const product = TEST_PRODUCT;
    const request = buildEazoCheckoutRequest({
      productKey: product.key,
      productName: product.name,
      unitAmount: product.unitAmount,
      currency: product.currency,
      mode: product.mode,
      entitlementKey: product.entitlementKey,
      appUserId: "app_user_test",
      successUrl: "https://app.example.com/payment/success",
      cancelUrl: "https://app.example.com/payment/cancel",
      idempotencyKey: "checkout-once",
    });

    expect(request).toMatchObject({
      app_id: "app_test",
      app_user_id: "app_user_test",
      product_key: product.key,
      entitlement_key: product.entitlementKey,
      mode: "one_time",
      unit_amount: product.unitAmount,
      product_name: product.name,
      metadata: {
        product_key: product.key,
        entitlement_key: product.entitlementKey,
        mode: product.mode,
        app_user_id: "app_user_test",
      },
    });
    assertEazoCheckoutRequestContract(request);
  });

  it("creates checkout through Eazo platform and normalizes the result", async () => {
    mockPlatformResponse(200, mockEazoCheckoutResponse());

    await expect(
      createEazoCheckoutSession({
        productKey: TEST_PRODUCT.key,
        productName: TEST_PRODUCT.name,
        unitAmount: TEST_PRODUCT.unitAmount,
        currency: TEST_PRODUCT.currency,
        mode: TEST_PRODUCT.mode,
        entitlementKey: TEST_PRODUCT.entitlementKey,
        appUserId: "app_user_test",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).resolves.toMatchObject({
      checkoutUrl: expect.stringContaining("checkout.stripe.com"),
      paymentId: "cap_test_eazo",
    });
  });

  it("preserves platform checkout failure status and body", async () => {
    mockPlatformResponse(422, { detail: [{ msg: "Field required" }] });

    await expect(
      createEazoCheckoutSession({
        productKey: TEST_PRODUCT.key,
        productName: TEST_PRODUCT.name,
        unitAmount: TEST_PRODUCT.unitAmount,
        currency: TEST_PRODUCT.currency,
        mode: TEST_PRODUCT.mode,
        entitlementKey: TEST_PRODUCT.entitlementKey,
        appUserId: "app_user_test",
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Field required",
    });
  });

  it.each(["pending", "succeeded", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s payment status from the Eazo ledger",
    async (status) => {
      mockPlatformResponse(200, mockEazoPaymentStatus(status));
      const result = await getEazoPaymentStatus("cap_test_eazo");
      expect(result.status).toBe(status);
      expect(result.paid).toBe(status === "succeeded");
    },
  );

  it.each(["inactive", "pending", "active", "failed", "expired", "refunded", "disputed"] as const)(
    "reads %s entitlement status from the Eazo ledger",
    async (status) => {
      mockPlatformResponse(200, mockEazoEntitlement(status, { product_key: TEST_PRODUCT.key }));
      const result = await getEazoEntitlementStatus(TEST_PRODUCT.key, {
        appUserId: "app_user_test",
      });
      expect(result.status).toBe(status);
      expect(result.active).toBe(status === "active");
    },
  );

  it("fails clearly when server env is missing", () => {
    delete process.env.EAZO_APP_ID;
    expect(() =>
      buildEazoCheckoutRequest({
        productKey: "premium",
        productName: TEST_PRODUCT.name,
        unitAmount: TEST_PRODUCT.unitAmount,
        currency: TEST_PRODUCT.currency,
        successUrl: "https://app.example.com/payment/success",
        cancelUrl: "https://app.example.com/payment/cancel",
      }),
    ).toThrow("Missing EAZO_APP_ID");
  });
});
`);
}

function templateFiles(): TemplateFile[] {
  return [
    {
      filePath: "src/lib/eazo-payments/catalog.ts",
      content: paymentCatalogTemplate(),
    },
    {
      filePath: "src/lib/eazo-payments/payment-contract.test.ts",
      content: paymentContractTestTemplate(),
    },
    {
      filePath: "src/app/api/payments/checkout/route.ts",
      content: checkoutRouteTemplate(),
    },
    {
      filePath: "src/app/api/payments/status/route.ts",
      content: statusRouteTemplate(),
    },
    {
      filePath: "src/app/api/payments/entitlements/route.ts",
      content: entitlementRouteTemplate(),
    },
    {
      filePath: "src/app/payment/success/page.tsx",
      content: successPageTemplate(),
    },
    {
      filePath: "src/app/payment/cancel/page.tsx",
      content: cancelPageTemplate(),
    },
  ];
}

export function scaffoldPayments(options: ScaffoldOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const recipe = options.recipe || REQUIRED_RECIPE;

  if (recipe !== REQUIRED_RECIPE) {
    throw new Error(`Unsupported payments recipe: ${recipe}`);
  }

  const files = templateFiles();
  const existing = files
    .map((file) => path.join(cwd, file.filePath))
    .filter((filePath) => fs.existsSync(filePath));

  if (existing.length > 0 && !options.force) {
    throw new Error(
      `Refusing to overwrite existing payment files:\n${existing.map((file) => `- ${file}`).join("\n")}\nRun again with --force to overwrite.`,
    );
  }

  if (!options.dryRun) {
    for (const file of files) {
      const absolutePath = path.join(cwd, file.filePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, "utf8");
    }
  }

  return {
    recipe,
    cwd,
    files: files.map((file) => file.filePath),
  };
}

function printUsage() {
  console.log(`Usage:
  eazo-sdk payments init --recipe one-time-unlock [--force] [--cwd <path>]

Commands:
  payments init   Scaffold Eazo marketplace payment files for a Next.js app.
`);
}

function readOption(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

export function main(argv = process.argv.slice(2)) {
  const [domain, command] = argv;
  if (domain !== "payments" || command !== "init") {
    printUsage();
    return domain ? 1 : 0;
  }

  const result = scaffoldPayments({
    recipe: readOption(argv, "--recipe") || REQUIRED_RECIPE,
    cwd: readOption(argv, "--cwd") || process.cwd(),
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  });

  console.log(`Eazo Payments scaffolded (${result.recipe}):`);
  for (const file of result.files) {
    console.log(`- ${file}`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
