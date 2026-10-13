import {
  EAZO_CART_MAX_LINE_ITEMS,
  EAZO_CART_MAX_QUANTITY,
  EAZO_CART_PAYMENT_MODE,
  EazoPaymentApiError,
  type EazoCartItem,
  type EazoCartLine,
  type EazoCartPayment,
  type EazoPaymentCurrency,
  type EazoPaymentMetadata,
  type EazoPaymentProduct,
} from "./payments";
import {
  cancelEazoSubscription,
  createEazoCartCheckoutSession,
  createEazoCheckoutSession,
  getEazoEntitlementStatus,
  getEazoPaymentStatus,
  listEazoCartPayments,
  listEazoSubscriptions,
  resumeEazoSubscription,
} from "./payments.server";
import { requireAuth, type User } from "./server";

type JsonBody = Record<string, unknown>;

export type EazoCheckoutRouteOptions = {
  getProduct: (productKey: string) => EazoPaymentProduct | null | undefined;
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
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

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function forwardedHeaderPart(forwarded: string | null, key: string) {
  const first = firstHeaderValue(forwarded);
  if (!first) return null;
  for (const segment of first.split(";")) {
    const [rawName, ...rawValueParts] = segment.split("=");
    if (rawName?.trim().toLowerCase() !== key) continue;
    const value = rawValueParts.join("=").trim().replace(/^"|"$/g, "");
    return value || null;
  }
  return null;
}

function normalizeOriginCandidate(candidate: string | null) {
  if (!candidate) return null;
  try {
    const value = candidate.includes("://") ? candidate : `https://${candidate}`;
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (isLocalCheckoutHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalCheckoutHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "0.0.0.0" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost");
}

function envPublicOrigin() {
  if (typeof process === "undefined" || !process.env) return null;
  return normalizeOriginCandidate(
    process.env.EAZO_APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_EAZO_APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    null,
  );
}

function getRequestOrigin(request: { url: string; headers: { get(name: string): string | null } }) {
  const forwardedHost = forwardedHeaderPart(request.headers.get("forwarded"), "host");
  const forwardedProto = forwardedHeaderPart(request.headers.get("forwarded"), "proto");
  const xForwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const xForwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const host = firstHeaderValue(request.headers.get("host"));

  const headerOrigin =
    normalizeOriginCandidate(`${forwardedProto || xForwardedProto || "https"}://${forwardedHost || xForwardedHost || ""}`) ||
    normalizeOriginCandidate(forwardedHost || xForwardedHost) ||
    normalizeOriginCandidate(request.headers.get("origin")) ||
    normalizeOriginCandidate(request.headers.get("referer")) ||
    envPublicOrigin() ||
    normalizeOriginCandidate(host) ||
    normalizeOriginCandidate(request.url);

  if (!headerOrigin) {
    throw new Error(
      "Unable to resolve public app origin for checkout return URL. " +
      "Set EAZO_APP_PUBLIC_URL or ensure x-forwarded-host/x-forwarded-proto reaches the app route.",
    );
  }

  return headerOrigin;
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
  return async function POST(request: Request) {
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
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: Request) {
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
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: Request) {
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

export function createEazoSubscriptionsRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const subscriptions = await listEazoSubscriptions({
        appUserId: authResult.user.id,
        limit: Number(params.get("limit") || 50),
        offset: Number(params.get("offset") || 0),
      });
      return jsonResponse(subscriptions as unknown as JsonBody);
    } catch (error) {
      if (error instanceof EazoPaymentApiError) {
        return jsonResponse(
          { error: error.message, platform: error.body },
          { status: error.status },
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Subscription list failed" },
        { status: 500 },
      );
    }
  };
}

async function subscriptionActionResponse(
  request: Request,
  subscriptionId: string,
  action: "cancel" | "resume",
  getUser?: (request: Request) => ReturnType<typeof requireAuth>,
) {
  const authResult = getUser ? getUser(request) : requireAuth(request);
  if (!authResult.ok) return authResult.response;

  try {
    const result = action === "cancel"
      ? await cancelEazoSubscription(subscriptionId, { appUserId: authResult.user.id })
      : await resumeEazoSubscription(subscriptionId, { appUserId: authResult.user.id });
    return jsonResponse(result as unknown as JsonBody);
  } catch (error) {
    if (error instanceof EazoPaymentApiError) {
      return jsonResponse(
        { error: error.message, platform: error.body },
        { status: error.status },
      );
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Subscription update failed" },
      { status: 500 },
    );
  }
}

export function createEazoCancelSubscriptionRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ subscriptionId?: string; id?: string }> },
  ) {
    const params = await context.params;
    const subscriptionId = params.subscriptionId || params.id || "";
    if (!subscriptionId) return jsonResponse({ error: "Missing subscriptionId" }, { status: 400 });
    return subscriptionActionResponse(request, subscriptionId, "cancel", options.getUser);
  };
}

export function createEazoResumeSubscriptionRoute(options: {
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
} = {}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ subscriptionId?: string; id?: string }> },
  ) {
    const params = await context.params;
    const subscriptionId = params.subscriptionId || params.id || "";
    if (!subscriptionId) return jsonResponse({ error: "Missing subscriptionId" }, { status: 400 });
    return subscriptionActionResponse(request, subscriptionId, "resume", options.getUser);
  };
}

const CART_LINE_ID_MAX_LENGTH = 128;
const CART_DATA_MAX_KEYS = 20;
const CART_DATA_VALUE_MAX_LENGTH = 500;
const CART_SYNC_PAGE_SIZE = 100;
const CART_SYNC_MAX_PAGES = 10;

export type EazoCartResolution = {
  currency: EazoPaymentCurrency;
  items: EazoCartItem[];
  /** Amount off the subtotal, computed here on the server (e.g. from the app's own coupon). */
  discountAmount?: number;
  /** Shown next to the discount on the Stripe checkout page. */
  discountLabel?: string;
  /** Returned on the paid payment, e.g. { coupon_id } so fulfill can mark it used. */
  metadata?: EazoPaymentMetadata;
};

export type EazoCartFulfill = (
  payment: EazoCartPayment,
  context: { user: User },
) => void | Promise<void>;

export type EazoCartCheckoutRouteOptions = {
  /**
   * Turn the browser's `{ id, quantity }` lines into priced items using the app's
   * own server-side data. Return null to reject the cart (unknown or unavailable
   * item). Never trust prices sent from the browser.
   */
  resolveCart: (input: {
    lines: EazoCartLine[];
    /** Untrusted string values from startEazoCartCheckout({ data }), e.g. a coupon code. */
    data: Record<string, string>;
    user: User;
    request: Request;
  }) => EazoCartResolution | null | undefined | Promise<EazoCartResolution | null | undefined>;
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
  successPath?: string;
  cancelPath?: string;
};

export type EazoCartFulfillRouteOptions = {
  /**
   * Grant what a paid cart bought. Called only for paid cart payments, and may be
   * called more than once for the same payment, so it must be idempotent by
   * `payment.payment_id` (for example a unique key in the app's own table).
   */
  fulfill: EazoCartFulfill;
  getUser?: (request: Request) => ReturnType<typeof requireAuth>;
};

function platformErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof EazoPaymentApiError) {
    return jsonResponse(
      { error: error.message, platform: error.body },
      { status: error.status },
    );
  }
  return jsonResponse(
    { error: error instanceof Error ? error.message : fallbackMessage },
    { status: 500 },
  );
}

function parseCartLines(body: JsonBody): EazoCartLine[] | null {
  const lines = body.lines;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > EAZO_CART_MAX_LINE_ITEMS) {
    return null;
  }
  const parsed: EazoCartLine[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") return null;
    const { id, quantity } = line as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > CART_LINE_ID_MAX_LENGTH) return null;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > EAZO_CART_MAX_QUANTITY) {
      return null;
    }
    parsed.push({ id, quantity: quantity as number });
  }
  return parsed;
}

function parseCartData(body: JsonBody): Record<string, string> | null {
  const data = body.data;
  if (data === undefined) return {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > CART_DATA_MAX_KEYS) return null;
  const parsed: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length > CART_DATA_VALUE_MAX_LENGTH) return null;
    parsed[key] = value;
  }
  return parsed;
}

export function createEazoCartCheckoutRoute(options: EazoCartCheckoutRouteOptions) {
  const successPath = options.successPath || "/payment/cart/success";
  const cancelPath = options.cancelPath || "/payment/cart/cancel";

  return async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    const bodyRecord = body && typeof body === "object" ? body as JsonBody : {};
    const lines = parseCartLines(bodyRecord);
    const data = parseCartData(bodyRecord);
    if (!data) {
      return jsonResponse(
        { error: `Invalid cart data: send at most ${CART_DATA_MAX_KEYS} string values` },
        { status: 400 },
      );
    }
    if (!lines) {
      return jsonResponse(
        { error: `Invalid cart: send lines as [{ id, quantity }] with 1-${EAZO_CART_MAX_LINE_ITEMS} entries` },
        { status: 400 },
      );
    }

    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    try {
      const cart = await options.resolveCart({ lines, data, user: authResult.user, request });
      if (!cart) {
        return jsonResponse({ error: "Invalid cart" }, { status: 400 });
      }
      const origin = getRequestOrigin(request);
      const checkout = await createEazoCartCheckoutSession({
        appUserId: authResult.user.id,
        currency: cart.currency,
        items: cart.items,
        discountAmount: cart.discountAmount,
        discountLabel: cart.discountLabel,
        metadata: cart.metadata,
        successUrl: `${origin}${successPath}`,
        cancelUrl: `${origin}${cancelPath}`,
      });
      return jsonResponse(checkout);
    } catch (error) {
      return platformErrorResponse(error, "Checkout failed");
    }
  };
}

function isCartPayment(payment: { mode?: string | null }): payment is EazoCartPayment {
  return payment.mode === EAZO_CART_PAYMENT_MODE;
}

export function createEazoCartPaymentStatusRoute(options: EazoCartFulfillRouteOptions) {
  return async function GET(request: Request) {
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

    let status;
    try {
      status = await getEazoPaymentStatus(paymentId, { appUserId: authResult.user.id });
    } catch (error) {
      return platformErrorResponse(error, "Payment status failed");
    }
    if (!isCartPayment(status)) {
      return jsonResponse({ error: "Not a cart payment" }, { status: 400 });
    }
    if (!status.paid) {
      return jsonResponse({ ...status, fulfilled: false } as unknown as JsonBody);
    }

    try {
      await options.fulfill(status, { user: authResult.user });
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : "Fulfillment failed",
          payment_id: status.payment_id,
          paid: true,
          fulfilled: false,
        },
        { status: 500 },
      );
    }
    return jsonResponse({ ...status, fulfilled: true } as unknown as JsonBody);
  };
}

export function createEazoCartSyncRoute(options: EazoCartFulfillRouteOptions) {
  return async function POST(request: Request) {
    const authResult = options.getUser ? options.getUser(request) : requireAuth(request);
    if (!authResult.ok) return authResult.response;

    let fulfilled = 0;
    try {
      for (let page = 0; page < CART_SYNC_MAX_PAGES; page += 1) {
        const result = await listEazoCartPayments({
          appUserId: authResult.user.id,
          status: "succeeded",
          limit: CART_SYNC_PAGE_SIZE,
          offset: page * CART_SYNC_PAGE_SIZE,
        });
        for (const payment of result.items) {
          await options.fulfill(payment, { user: authResult.user });
          fulfilled += 1;
        }
        if (!result.has_more) break;
      }
    } catch (error) {
      const response = platformErrorResponse(error, "Cart sync failed");
      const body = await response.json();
      return jsonResponse({ ...body, fulfilled }, { status: response.status });
    }
    return jsonResponse({ fulfilled });
  };
}
