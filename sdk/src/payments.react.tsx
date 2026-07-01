"use client";

import * as React from "react";

import { auth } from "./internal/capabilities/auth";
import {
  getEazoPaymentErrorMessage,
  type EazoEntitlement,
  type EazoEntitlementStatusValue,
  type EazoPaymentApiErrorBody,
} from "./payments";
import { startEazoCheckout } from "./payments";

const ENTITLEMENT_CACHE_PREFIX = "eazo:paymentEntitlement:";

export type EazoEntitlementState = {
  entitlement: EazoEntitlement;
  status: EazoEntitlementStatusValue;
  active: boolean;
  checking: boolean;
  error: string | null;
  refresh: () => Promise<EazoEntitlement>;
};

export type EazoPaymentButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "children"
> & {
  productKey?: string;
  children?: React.ReactNode;
  unlockedChildren?: React.ReactNode;
  disabled?: boolean;
  onCheckoutError?: (error: Error) => void;
  onUnlockedClick?: () => void;
};

export type EazoEntitlementGateProps = {
  productKey?: string;
  paid: React.ReactNode;
  free: React.ReactNode;
  loading?: React.ReactNode;
  inactiveStatuses?: EazoEntitlementStatusValue[];
};

function inactiveEntitlement(productKey: string): EazoEntitlement {
  return {
    app_id: "",
    product_key: productKey,
    entitlement_key: productKey,
    status: "inactive",
    active: false,
    payment_id: null,
    metadata: {},
  };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(productKey: string) {
  return `${ENTITLEMENT_CACHE_PREFIX}${productKey}`;
}

export function rememberEazoEntitlement(entitlement: EazoEntitlement) {
  try {
    storage()?.setItem(cacheKey(entitlement.product_key), JSON.stringify(entitlement));
  } catch {
    // Cache is only an acceleration path; the platform entitlement API is authoritative.
  }
}

export function readCachedEazoEntitlement(productKey: string): EazoEntitlement | null {
  try {
    const raw = storage()?.getItem(cacheKey(productKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EazoEntitlement>;
    if (parsed.product_key === productKey && typeof parsed.status === "string") {
      return {
        ...inactiveEntitlement(productKey),
        ...parsed,
        active: parsed.status === "active" || Boolean(parsed.active),
      } as EazoEntitlement;
    }
  } catch {
    // Ignore malformed cache.
  }
  return null;
}

async function readEntitlementJson(response: Response) {
  return response.json().catch(() => ({}));
}

export async function getEazoPaymentSessionHeaders(): Promise<Record<string, string>> {
  const sessionHeader = await auth.getSessionHeader();
  return sessionHeader ? { "x-eazo-session": sessionHeader } : {};
}

export async function refreshEazoEntitlement(productKey = "premium"): Promise<EazoEntitlement> {
  const headers = await getEazoPaymentSessionHeaders();
  if (!headers["x-eazo-session"]) {
    const inactive = inactiveEntitlement(productKey);
    rememberEazoEntitlement(inactive);
    return inactive;
  }

  const response = await fetch(
    `/api/payments/entitlements?productKey=${encodeURIComponent(productKey)}`,
    {
      headers,
      cache: "no-store",
    },
  );
  const data = await readEntitlementJson(response);
  if (!response.ok) {
    throw new Error(
      getEazoPaymentErrorMessage(data as EazoPaymentApiErrorBody, "Payment entitlement failed"),
    );
  }

  const entitlement = data as EazoEntitlement;
  rememberEazoEntitlement(entitlement);
  return entitlement;
}

export function useEazoEntitlement(productKey = "premium"): EazoEntitlementState {
  const cached = readCachedEazoEntitlement(productKey);
  const [entitlement, setEntitlement] = React.useState<EazoEntitlement>(
    cached || inactiveEntitlement(productKey),
  );
  const [checking, setChecking] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const next = await refreshEazoEntitlement(productKey);
      setEntitlement(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment entitlement failed";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setChecking(false);
    }
  }, [productKey]);

  React.useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError(null);
    refreshEazoEntitlement(productKey)
      .then((next) => {
        if (!cancelled) setEntitlement(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Payment entitlement failed");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productKey]);

  return {
    entitlement,
    status: checking ? "checking" : entitlement.status,
    active: entitlement.active,
    checking,
    error,
    refresh,
  };
}

export function EazoPaymentButton({
  productKey = "premium",
  children = "Unlock premium",
  unlockedChildren = "Unlocked",
  disabled,
  onCheckoutError,
  onUnlockedClick,
  ...buttonProps
}: EazoPaymentButtonProps) {
  const entitlement = useEazoEntitlement(productKey);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (entitlement.active) {
      onUnlockedClick?.();
      return;
    }
    setStarting(true);
    setError(null);
    try {
      await startEazoCheckout(productKey);
    } catch (err) {
      const checkoutError = err instanceof Error ? err : new Error("Checkout failed");
      setError(checkoutError.message);
      onCheckoutError?.(checkoutError);
    } finally {
      setStarting(false);
    }
  }

  const isDisabled = Boolean(disabled || starting || entitlement.checking);

  return (
    <>
      <button
        {...buttonProps}
        type={buttonProps.type || "button"}
        disabled={isDisabled}
        aria-busy={starting || entitlement.checking}
        data-eazo-payment-status={entitlement.status}
        onClick={handleClick}
      >
        {entitlement.active ? unlockedChildren : starting ? "Opening checkout..." : children}
      </button>
      {(error || entitlement.error) ? (
        <p role="alert">{error || entitlement.error}</p>
      ) : null}
    </>
  );
}

export function EazoEntitlementGate({
  productKey = "premium",
  paid,
  free,
  loading = null,
  inactiveStatuses = ["inactive", "failed", "expired", "refunded", "disputed"],
}: EazoEntitlementGateProps) {
  const entitlement = useEazoEntitlement(productKey);
  if (entitlement.checking) return <>{loading}</>;
  if (entitlement.active) return <>{paid}</>;
  if (inactiveStatuses.includes(entitlement.status)) return <>{free}</>;
  return <>{loading ?? free}</>;
}
