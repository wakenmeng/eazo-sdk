import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CartPaymentSync } from "@/components/eazo-payments/CartPaymentSync";

export const metadata: Metadata = {
  title: "Eazo Cart Checkout Example",
  description: "Multi-item cart checkout using @eazo/sdk/payments"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CartPaymentSync />
        {children}
      </body>
    </html>
  );
}
