import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

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
 * Razorpay.
 *
 * Two server-side responsibilities, and only these two: create the order, and verify
 * the signature the browser hands back. The checkout itself runs in Razorpay's modal,
 * so the key secret never leaves this process.
 *
 * Verification is the security boundary. The browser reports "payment succeeded" and
 * that claim is worthless on its own — only the HMAC, computed from the secret,
 * proves Razorpay actually took the money.
 */
const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder(amountInPaise: number, reference: string): Promise<PaymentOrder> {
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    // env validation guarantees these when PAYMENT_PROVIDER=razorpay.
    if (!keyId || !keySecret) throw new Error("Razorpay credentials missing.");

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        // Razorpay caps receipt at 40 characters and rejects anything longer.
        receipt: `fs_${reference}`.slice(0, 40),
        payment_capture: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Razorpay order failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const order = (await response.json()) as { id?: string; amount?: number };
    if (!order.id) throw new Error("Razorpay returned no order id.");

    return {
      orderId: order.id,
      amountInPaise: order.amount ?? amountInPaise,
      currency: "INR",
      provider: "razorpay",
      // Publishable by design — this is what the checkout modal needs.
      publicKey: keyId,
    };
  },

  async verifyPayment(orderId: string, paymentId: string, signature: string): Promise<boolean> {
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return false;
    if (!orderId || !paymentId || !signature) return false;

    const expected = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    // Length check first: timingSafeEqual throws on a length mismatch.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  },
};

export function getPaymentProvider(): PaymentProvider {
  return env.PAYMENT_PROVIDER === "razorpay" ? razorpayProvider : stubPaymentProvider;
}
