"use client";

import { useCallback, useRef, useState } from "react";
import Script from "next/script";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** The slice of Razorpay's global we actually use. */
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; contact?: string };
  theme: { color: string };
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): { open: () => void; close: () => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export interface CheckoutOrder {
  orderId: string;
  amountInPaise: number;
  currency: string;
  keyId: string | null;
  provider: string;
  clinicName: string;
  prefill: { name: string; contact: string };
}

/**
 * Loads Razorpay's checkout script and exposes a function to open the modal.
 *
 * The script is the app's only external dependency at runtime; `lazyOnload` keeps it
 * off the critical path, since a patient reading session times does not need it until
 * they actually book.
 */
export function useRazorpayCheckout() {
  const [scriptReady, setScriptReady] = useState(false);
  const readyRef = useRef(false);

  const markReady = useCallback(() => {
    readyRef.current = true;
    setScriptReady(true);
  }, []);

  const open = useCallback(
    (order: CheckoutOrder, onSuccess: (r: RazorpaySuccess) => void, onDismiss: () => void) => {
      if (!window.Razorpay || !order.keyId) {
        onDismiss();
        return false;
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountInPaise,
        currency: order.currency,
        name: order.clinicName,
        description: "Online queue booking fee",
        order_id: order.orderId,
        prefill: { name: order.prefill.name, contact: order.prefill.contact },
        theme: { color: "#0f172a" },
        handler: onSuccess,
        // Fires when the patient closes the modal without paying. The hold is left to
        // expire on its own rather than cancelled here — a client-side "cancel" is not
        // trustworthy, and the cron sweep releases it within ten minutes anyway.
        modal: { ondismiss: onDismiss },
      });

      checkout.open();
      return true;
    },
    [],
  );

  const RazorpayScript = useCallback(
    () => <Script src={CHECKOUT_SRC} strategy="lazyOnload" onReady={markReady} />,
    [markReady],
  );

  return { open, scriptReady, RazorpayScript };
}
