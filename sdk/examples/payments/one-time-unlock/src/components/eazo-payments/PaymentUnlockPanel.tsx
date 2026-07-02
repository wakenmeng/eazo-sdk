"use client";

import * as React from "react";
import {
  EazoPaymentLifecycle,
  type EazoPaymentLifecycleState
} from "@eazo/sdk/payments/react";

export type PaymentUnlockPanelProps = {
  productKey?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  ctaLabel?: React.ReactNode;
  activeLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
  children?: (payment: EazoPaymentLifecycleState) => React.ReactNode;
};

export function PaymentUnlockPanel({
  productKey = "premium",
  title = "Premium unlock",
  description = "Unlock the paid experience for this app.",
  ctaLabel = "Unlock premium",
  activeLabel = "Premium active",
  pendingLabel = "Payment pending",
  className,
  children
}: PaymentUnlockPanelProps) {
  return (
    <EazoPaymentLifecycle productKey={productKey}>
      {(payment) => {
        if (children) return children(payment);

        const disabled = payment.active || payment.checking || payment.starting || payment.pending;
        const label = payment.active
          ? activeLabel
          : payment.starting
            ? "Opening checkout..."
            : payment.pending
              ? pendingLabel
              : ctaLabel;

        return (
          <section className={className} data-eazo-payment-status={payment.status}>
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <button
              type="button"
              disabled={disabled}
              aria-busy={payment.checking || payment.starting}
              onClick={() => {
                void payment.checkout();
              }}
            >
              {label}
            </button>
            {payment.error ? <p role="alert">{payment.error}</p> : null}
          </section>
        );
      }}
    </EazoPaymentLifecycle>
  );
}

export type PremiumEntitlementGateProps = {
  paid: React.ReactNode;
  free: React.ReactNode;
  checking?: React.ReactNode;
  productKey?: string;
};

export function PremiumEntitlementGate({
  paid,
  free,
  checking = null,
  productKey = "premium"
}: PremiumEntitlementGateProps) {
  return (
    <EazoPaymentLifecycle productKey={productKey}>
      {(payment) => {
        if (payment.checking) return <>{checking}</>;
        if (payment.active) return <>{paid}</>;
        return <>{free}</>;
      }}
    </EazoPaymentLifecycle>
  );
}
