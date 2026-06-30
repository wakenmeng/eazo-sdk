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
import {
  createEazoCheckoutSession,
  getEazoPaymentStatus,
} from "./payments.server";

type JsonBody = Record<string, unknown>;

type RequestLike = {
  url: string;
  json: () => Promise<unknown>;
};

export type EazoCheckoutRouteOptions = {
  getProduct: (productKey: string) => EazoPaymentProduct | null | undefined;
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

export function createEazoCheckoutRoute(options: EazoCheckoutRouteOptions) {
  return async function POST(request: RequestLike) {
    const body = await request.json().catch(() => ({}));
    const bodyRecord = body && typeof body === "object" ? body as JsonBody : {};
    const product = options.getProduct(String(bodyRecord.productKey || "premium"));

    if (!product) {
      return jsonResponse({ error: "Unknown product" }, { status: 400 });
    }

    try {
      const origin = getRequestOrigin(request);
      const checkout = await createEazoCheckoutSession({
        productKey: product.key,
        productName: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        successUrl: `${origin}/payment/success?product=${encodeURIComponent(product.key)}`,
        cancelUrl: `${origin}/payment/cancel?product=${encodeURIComponent(product.key)}`,
        metadata: { product_key: product.key },
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

export function createEazoPaymentStatusRoute() {
  return async function GET(request: { url: string }) {
    const paymentId = new URL(request.url).searchParams.get("paymentId");

    if (!paymentId) {
      return jsonResponse({ error: "Missing paymentId" }, { status: 400 });
    }

    try {
      const status = await getEazoPaymentStatus(paymentId);
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
      const response = await fetch(`/api/payments/status?paymentId=${encodeURIComponent(confirmedPaymentId)}`, {
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
        clearRememberedEazoPaymentId();
        return;
      }

      if (attempts < maxAttempts && POLLABLE_STATUSES.has(nextStatus.status)) {
        window.setTimeout(poll, pollIntervalMs);
      }
    }

    poll().catch(() => setError("Payment status failed"));
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
