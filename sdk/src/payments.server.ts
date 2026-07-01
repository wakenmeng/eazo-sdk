import {
  EazoPaymentApiError,
  type CreateEazoCheckoutInput,
  type CreateEazoCheckoutResult,
  type EazoCheckoutSessionRequest,
  type EazoCheckoutSessionResponse,
  type EazoEntitlement,
  type EazoPaymentApiErrorBody,
  type EazoPaymentStatus,
} from "./payments";

export type EazoPaymentEnv = {
  apiBase: string;
  appId: string;
  privateKey: string;
};

function readEnvByNames(names: readonly string[]): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function requireEazoPaymentEnv(): EazoPaymentEnv {
  const apiBase = readEnvByNames(["EAZO_API_BASE", "EAZO_PLATFORM_API_BASE"]);
  const appId = readEnvByNames(["EAZO_APP_ID"]);
  const privateKey = readEnvByNames(["EAZO_PRIVATE_KEY"]);

  if (!apiBase) throw new Error("Missing EAZO_API_BASE");
  if (!appId) throw new Error("Missing EAZO_APP_ID");
  if (!privateKey) throw new Error("Missing EAZO_PRIVATE_KEY");

  return {
    apiBase: apiBase.replace(/\/$/, ""),
    appId,
    privateKey,
  };
}

export function createStableCheckoutIdempotencyKey(
  appId: string,
  productKey: string,
  userId?: string,
) {
  const actor = userId || "anonymous";
  return `${appId}:${productKey}:${actor}:${Date.now()}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function buildEazoCheckoutRequest(
  input: CreateEazoCheckoutInput,
): EazoCheckoutSessionRequest {
  const { appId } = requireEazoPaymentEnv();
  const productKey = input.productKey;
  const entitlementKey = input.entitlementKey || productKey;
  const mode = input.mode || "one_time";

  return {
    app_id: appId,
    ...(input.appUserId ? { app_user_id: input.appUserId } : {}),
    product_key: productKey,
    entitlement_key: entitlementKey,
    mode,
    unit_amount: input.unitAmount,
    currency: input.currency,
    product_name: input.productName,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    quantity: input.quantity || 1,
    metadata: {
      product_key: productKey,
      entitlement_key: entitlementKey,
      mode,
      ...(input.appUserId ? { app_user_id: input.appUserId } : {}),
      ...(input.metadata || {}),
    },
    idempotency_key:
      input.idempotencyKey ||
      createStableCheckoutIdempotencyKey(appId, productKey, input.appUserId || input.metadata?.user_id),
  };
}

export async function createEazoCheckoutSession(
  input: CreateEazoCheckoutInput,
): Promise<CreateEazoCheckoutResult> {
  const { apiBase, privateKey } = requireEazoPaymentEnv();
  const requestBody = buildEazoCheckoutRequest(input);

  const response = await fetch(`${apiBase}/api/open/payments/checkout-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${privateKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await readJson(response)) as EazoCheckoutSessionResponse & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Checkout failed");
  }

  return {
    checkoutSessionId: data.checkout_session_id,
    checkoutUrl: data.checkout_url,
    paymentId: data.payment_id,
  };
}

export async function getEazoPaymentStatus(
  paymentId: string,
  options: { appUserId?: string } = {},
): Promise<EazoPaymentStatus> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({ app_id: appId });
  if (options.appUserId) query.set("app_user_id", options.appUserId);
  const response = await fetch(
    `${apiBase}/api/open/payments/${encodeURIComponent(paymentId)}/status?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${privateKey}` },
      cache: "no-store",
    },
  );

  const data = (await readJson(response)) as EazoPaymentStatus & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Payment status failed");
  }
  return data;
}

export async function getEazoEntitlementStatus(
  productKey: string,
  options: { appUserId?: string } = {},
): Promise<EazoEntitlement> {
  const { apiBase, appId, privateKey } = requireEazoPaymentEnv();
  const query = new URLSearchParams({
    app_id: appId,
    product_key: productKey,
  });
  if (options.appUserId) query.set("app_user_id", options.appUserId);

  const response = await fetch(`${apiBase}/api/open/payments/entitlements?${query.toString()}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  });

  const data = (await readJson(response)) as EazoEntitlement & EazoPaymentApiErrorBody;
  if (!response.ok) {
    throw new EazoPaymentApiError(response.status, data, "Payment entitlement failed");
  }
  return data;
}

export type {
  CreateEazoCheckoutInput,
  CreateEazoCheckoutResult,
  EazoCheckoutSessionRequest,
  EazoCheckoutSessionResponse,
  EazoEntitlement,
  EazoEntitlementStatusValue,
  EazoPaymentInterval,
  EazoPaymentMode,
  EazoPaymentApiErrorBody,
  EazoPaymentCurrency,
  EazoPaymentMetadata,
  EazoPaymentProduct,
  EazoPaymentStatus,
  EazoPaymentStatusValue,
} from "./payments";
export { EazoPaymentApiError, getEazoPaymentErrorMessage } from "./payments";
