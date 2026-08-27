import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Payment abstraction. Only an order-creation + verification shape is defined, because
 * that is all both Razorpay and Stripe need from us; the actual checkout runs in the
 * browser against the provider's own SDK.
 */

export interface PaymentOrder {
  orderId: string;
  amountInPaise: number;
  currency: "INR";
  provider: string;
  /** Public key the browser checkout needs. Never the secret. */
  publicKey: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(amountInPaise: number, reference: string): Promise<PaymentOrder>;
  /** Verifies the provider's signed callback. Returns false on any mismatch. */
  verifyPayment(orderId: string, paymentId: string, signature: string): Promise<boolean>;
}

/**
 * Development provider: issues a fake order and accepts any confirmation. It exists so
 * the online booking flow can be exercised end to end without live keys.
 *
 * It refuses to run in production — an "accept everything" payment provider silently
 * enabled on a live deployment would hand out paid slots for free.
 */
const stubPaymentProvider: PaymentProvider = {
  name: "stub",

  async createOrder(amountInPaise: number): Promise<PaymentOrder> {
    if (env.NODE_ENV === "production") {
      throw new Error("PAYMENT_PROVIDER=stub cannot be used in production. Configure Razorpay.");
    }
    return {
      orderId: `stub_order_${randomUUID()}`,
      amountInPaise,
      currency: "INR",
      provider: "stub",
      publicKey: null,
    };
  },

  async verifyPayment(): Promise<boolean> {
    return env.NODE_ENV !== "production";
  },
};

/**
 * PLACEHOLDER — not implemented.
 *
 * Wiring this up means: `POST https://api.razorpay.com/v1/orders` with basic auth for
 * the order, then verifying the checkout callback by computing
 * `HMAC_SHA256(orderId + "|" + paymentId, RAZORPAY_KEY_SECRET)` and comparing it to
 * the returned signature with a timing-safe compare. It throws rather than returning
 * a plausible-looking fake, so selecting it before it is finished fails loudly.
 */
const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder(): Promise<PaymentOrder> {
    throw new Error("Razorpay provider is not implemented yet. See lib/payments/index.ts.");
  },

  async verifyPayment(): Promise<boolean> {
    throw new Error("Razorpay provider is not implemented yet. See lib/payments/index.ts.");
  },
};

export function getPaymentProvider(): PaymentProvider {
  return env.PAYMENT_PROVIDER === "razorpay" ? razorpayProvider : stubPaymentProvider;
}
