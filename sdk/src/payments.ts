export type EazoPaymentCurrency = "usd";

export type EazoPaymentStatusValue =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | "disputed";

export type EazoPaymentMetadata = Record<string, string>;

export type EazoPaymentProduct = {
  key: string;
  name: string;
  unitAmount: number;
  currency: EazoPaymentCurrency;
};

export type CreateEazoCheckoutInput = {
  productKey: string;
  productName: string;
  unitAmount: number;
  currency: EazoPaymentCurrency;
  successUrl: string;
  cancelUrl: string;
  quantity?: number;
  metadata?: EazoPaymentMetadata;
  idempotencyKey?: string;
};

export type EazoCheckoutSessionRequest = {
  app_id: string;
  unit_amount: number;
  currency: EazoPaymentCurrency;
  product_name: string;
  success_url: string;
  cancel_url: string;
  quantity: number;
  metadata: EazoPaymentMetadata;
  idempotency_key: string;
};

export type EazoCheckoutSessionResponse = {
  checkout_session_id: string;
  checkout_url: string;
  payment_id: string;
};

export type CreateEazoCheckoutResult = {
  checkoutSessionId: string;
  checkoutUrl: string;
  paymentId: string;
};

export type EazoPaymentStatus = {
  payment_id: string;
  app_id: string;
  status: EazoPaymentStatusValue;
  paid: boolean;
  amount_total: number;
  currency: EazoPaymentCurrency;
  product_name: string;
  metadata: EazoPaymentMetadata;
};

export type EazoPaymentApiErrorBody = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
};

export class EazoPaymentApiError extends Error {
  status: number;
  body: EazoPaymentApiErrorBody;

  constructor(status: number, body: EazoPaymentApiErrorBody, fallbackMessage: string) {
    super(getEazoPaymentErrorMessage(body, fallbackMessage));
    this.name = "EazoPaymentApiError";
    this.status = status;
    this.body = body;
  }
}

export function getEazoPaymentErrorMessage(
  body: EazoPaymentApiErrorBody,
  fallbackMessage: string,
) {
  if (typeof body.error === "string") return body.error;
  if (
    typeof body.error === "object" &&
    body.error &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  if (typeof body.message === "string") return body.message;
  if (
    typeof body.detail === "object" &&
    body.detail &&
    "message" in body.detail &&
    typeof body.detail.message === "string"
  ) {
    return body.detail.message;
  }
  if (Array.isArray(body.detail) && body.detail[0] && typeof body.detail[0] === "object") {
    const message = (body.detail[0] as Record<string, unknown>).msg;
    if (typeof message === "string") return message;
  }
  if (typeof body.detail === "string") return body.detail;
  return fallbackMessage;
}

const LAST_PAYMENT_ID_KEY = "eazo:lastPaymentId";
const LAST_PAYMENT_RECORD_KEY = "eazo:lastPayment";

export type EazoCheckoutRedirect = (checkoutUrl: string) => void;

type StoredPayment = {
  paymentId: string;
  createdAt: number;
};

function browserStorage(kind: "sessionStorage" | "localStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind] || null;
  } catch {
    return null;
  }
}

function storageGet(storage: Storage | null, key: string) {
  try {
    return storage?.getItem(key) || null;
  } catch {
    return null;
  }
}

function storageSet(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Checkout can still continue because the return URL carries payment_id.
  }
}

function storageRemove(storage: Storage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function rememberEazoPaymentId(paymentId: string) {
  const record: StoredPayment = { paymentId, createdAt: Date.now() };
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    storageSet(storage, LAST_PAYMENT_ID_KEY, paymentId);
    storageSet(storage, LAST_PAYMENT_RECORD_KEY, JSON.stringify(record));
  }
}

export function readRememberedEazoPaymentId() {
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    const legacyValue = storageGet(storage, LAST_PAYMENT_ID_KEY);
    if (legacyValue) return legacyValue;

    const recordValue = storageGet(storage, LAST_PAYMENT_RECORD_KEY);
    if (!recordValue) continue;
    try {
      const parsed = JSON.parse(recordValue) as Partial<StoredPayment>;
      if (typeof parsed.paymentId === "string" && parsed.paymentId) {
        return parsed.paymentId;
      }
    } catch {
      // Ignore malformed storage and keep looking.
    }
  }
  return null;
}

export function clearRememberedEazoPaymentId() {
  for (const storage of [browserStorage("sessionStorage"), browserStorage("localStorage")]) {
    storageRemove(storage, LAST_PAYMENT_ID_KEY);
    storageRemove(storage, LAST_PAYMENT_RECORD_KEY);
  }
}

export function readEazoPaymentIdFromUrl(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  if (!search) return null;
  const query = search.startsWith("http")
    ? new URL(search).search
    : search;
  return new URLSearchParams(query).get("payment_id");
}

function checkoutErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return "Checkout failed";
  return getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Checkout failed");
}

export async function startEazoCheckout(
  productKey = "premium",
  redirect: EazoCheckoutRedirect = (checkoutUrl) => {
    window.location.assign(checkoutUrl);
  },
) {
  const response = await fetch("/api/payments/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productKey }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.checkoutUrl || !data.paymentId) {
    throw new Error(checkoutErrorMessage(data));
  }

  rememberEazoPaymentId(data.paymentId);
  redirect(data.checkoutUrl);
}
