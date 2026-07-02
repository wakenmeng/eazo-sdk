import * as React from "react";

import {
  clearRememberedEazoPaymentId,
  getEazoPaymentErrorMessage,
  readEazoPaymentIdFromUrl,
  readRememberedEazoPaymentId,
  type EazoPaymentApiErrorBody,
  EazoPaymentApiError,
  type EazoPaymentProduct,
  type EazoPaymentStatus,
} from "./payments";
import { getEazoPaymentSessionHeaders, refreshEazoEntitlement } from "./payments.react";
import {
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
} from "./payments.server";
import { requireAuth } from "./server";

type JsonBody = Record<string, unknown>;

type RequestLike = {
  url: string;
  headers: { get(name: string): string | null };
  json: () => Promise<unknown>;
};

export type EazoCheckoutRouteOptions = {
  getProduct: (productKey: string) => EazoPaymentProduct | null | undefined;
  getUser?: (request: { headers: { get(name: string): string | null } }) => ReturnType<typeof requireAuth>;
};

function jsonResponse(body: JsonBody, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function getRequestOrigin(request: { url: string }) {
  return new URL(request.url).origin;
}

function firstSearchParam(params: URLSearchParams, names: readonly string[]) {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

function firstBodyString(body: JsonBody, names: readonly string[]) {
  for (const name of names) {
    const value = body[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function createEazoCheckoutRoute(options: EazoCheckoutRouteOptions) {
  return async function POST(request: RequestLike) {
    const body = await request.json().catch(() => ({}));
    const bodyRecord = body && typeof body === "object" ? body as JsonBody : {};
    const productKey = firstBodyString(bodyRecord, ["productKey", "product_key", "key"]) || "premium";
    const product = options.getProduct(productKey);

    if (!product) {
      return jsonResponse({ error: "Unknown product" }, { status: 400 });
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const origin = getRequestOrigin(request);
      const checkout = await createEazoCheckoutSession({
        productKey: product.key,
        productName: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        mode: product.mode || "one_time",
        entitlementKey: product.entitlementKey || product.key,
        appUserId: authResult.user.id,
        successUrl: `${origin}/payment/success?product=${encodeURIComponent(product.key)}`,
        cancelUrl: `${origin}/payment/cancel?product=${encodeURIComponent(product.key)}`,
        metadata: {
          product_key: product.key,
          entitlement_key: product.entitlementKey || product.key,
          mode: product.mode || "one_time",
        },
      });

      return jsonResponse(checkout);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Checkout failed" },
        { status: 500 },
      );
    }
  };
}

export function createEazoPaymentStatusRoute(options: {
  getUser?: (request: { headers: { get(name: string): string | null } }) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: { url: string; headers: { get(name: string): string | null } }) {
    const paymentId = firstSearchParam(
      new URL(request.url).searchParams,
      ["paymentId", "payment_id"],
    );

    if (!paymentId) {
      return jsonResponse(
        { error: "Missing paymentId", accepted: ["paymentId", "payment_id"] },
        { status: 400 },
      );
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const status = await getEazoPaymentStatus(paymentId, { appUserId: authResult.user.id });
      return jsonResponse(status as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Payment status failed" },
        { status: 500 },
      );
    }
  };
}

export function createEazoEntitlementRoute(options: {
  getUser?: (request: { headers: { get(name: string): string | null } }) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: { url: string; headers: { get(name: string): string | null } }) {
    const productKey = firstSearchParam(
      new URL(request.url).searchParams,
      ["productKey", "product_key", "key"],
    );

    if (!productKey) {
      return jsonResponse(
        { error: "Missing productKey", accepted: ["productKey", "product_key", "key"] },
        { status: 400 },
      );
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const entitlement = await getEazoEntitlementStatus(productKey, {
        appUserId: authResult.user.id,
      });
      return jsonResponse(entitlement as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Payment entitlement failed" },
        { status: 500 },
      );
    }
  };
}

const POLLABLE_STATUSES = new Set(["pending", "processing"]);

export type EazoPaymentSuccessPageProps = {
  homeHref?: string;
  maxAttempts?: number;
  pollIntervalMs?: number;
};

export function EazoPaymentSuccessPage({
  homeHref = "/",
  maxAttempts = 15,
  pollIntervalMs = 1500,
}: EazoPaymentSuccessPageProps) {
  const [status, setStatus] = React.useState<EazoPaymentStatus | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const paymentId = readEazoPaymentIdFromUrl() || readRememberedEazoPaymentId();
    if (!paymentId) {
      setError("We could not find this payment. Please return to the app and try again.");
      return;
    }
    const confirmedPaymentId = paymentId;

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      const headers = await getEazoPaymentSessionHeaders();
      const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(confirmedPaymentId)}`, {
        headers,
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;

      if (!response.ok) {
        setError(getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Payment status failed"));
        return;
      }

      const nextStatus = data as EazoPaymentStatus;
      setStatus(nextStatus);
      if (nextStatus.paid) {
        const productKey =
          nextStatus.entitlement?.product_key ||
          nextStatus.metadata?.product_key ||
          new URLSearchParams(window.location.search).get("product") ||
          "premium";
        await refreshEazoEntitlement(productKey);
        clearRememberedEazoPaymentId();
        return;
      }

      if (attempts < maxAttempts && POLLABLE_STATUSES.has(nextStatus.status)) {
        window.setTimeout(poll, pollIntervalMs);
      }
    }

    poll().catch((err) => {
      setError(err instanceof Error ? err.message : "Payment status failed");
    });
    return () => {
      cancelled = true;
    };
  }, [maxAttempts, pollIntervalMs]);

  if (error) {
    return (
      <main>
        <h1>Payment needs attention</h1>
        <p>{error}</p>
        <a href={homeHref}>Return home</a>
      </main>
    );
  }

  if (status?.paid) {
    return (
      <main>
        <h1>Premium unlocked</h1>
        <p>Your payment is complete.</p>
        <a href={homeHref}>Continue</a>
      </main>
    );
  }

  if (status && !POLLABLE_STATUSES.has(status.status)) {
    return (
      <main>
        <h1>Payment was not completed</h1>
        <p>Status: {status.status}</p>
        <a href={homeHref}>Try again</a>
      </main>
    );
  }

  return (
    <main>
      <h1>Confirming payment</h1>
      <p>This usually takes a few seconds.</p>
    </main>
  );
}

export type EazoPaymentCancelPageProps = {
  homeHref?: string;
};

export function EazoPaymentCancelPage({ homeHref = "/" }: EazoPaymentCancelPageProps) {
  React.useEffect(() => {
    clearRememberedEazoPaymentId();
  }, []);

  return (
    <main>
      <h1>Checkout cancelled</h1>
      <p>No payment was collected.</p>
      <a href={homeHref}>Return home</a>
    </main>
  );
}
