"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CreditCardIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";

import {
  useRazorpayCheckout,
  type CheckoutOrder,
  type RazorpaySuccess,
} from "@/components/patient/razorpay-checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getDeviceId } from "@/lib/device";
import { normalizeMobile } from "@/lib/mobile";

interface OnlineBookingFormProps {
  qrToken: string;
  feeInPaise: number;
  isStubPayment: boolean;
}

type Stage = "form" | "creating" | "checkout" | "verifying";

export function OnlineBookingForm({ qrToken, feeInPaise, isStubPayment }: OnlineBookingFormProps) {
  const router = useRouter();
  const { open, RazorpayScript } = useRazorpayCheckout();

  const [values, setValues] = useState({ name: "", age: "", mobile: "" });
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [, startTransition] = useTransition();

  const busy = stage !== "form";
  const rupees = (feeInPaise / 100).toFixed(2);

  function validate(): string | null {
    if (values.name.trim().length < 2) return "Please enter the patient's name.";
    const age = Number(values.age);
    if (!Number.isInteger(age) || age < 0 || age > 130) return "Enter a valid age.";
    if (!normalizeMobile(values.mobile)) return "Enter a valid 10-digit mobile number.";
    return null;
  }

  /** Step 3: hand Razorpay's signed response back for server-side verification. */
  async function verify(response: RazorpaySuccess) {
    setStage("verifying");
    try {
      const res = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      const data = (await res.json()) as { publicId?: string; error?: string };

      if (!res.ok || !data.publicId) {
        setError(data.error ?? "Payment could not be verified.");
        setStage("form");
        return;
      }
      startTransition(() => router.replace(`/t/${data.publicId}`));
    } catch {
      // The money may well have been taken; never imply otherwise.
      setError(
        "We could not confirm your payment. Do not pay again — please check with the clinic.",
      );
      setStage("form");
    }
  }

  /** Steps 1 and 2: create the order, then open the checkout modal. */
  async function book() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStage("creating");

    let order: CheckoutOrder;
    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          name: values.name.trim(),
          age: values.age,
          mobile: values.mobile,
          fingerprint: getDeviceId(),
        }),
      });
      const data = (await res.json()) as CheckoutOrder & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not start the booking.");
        setStage("form");
        return;
      }
      order = data;
    } catch {
      setError("Could not reach the clinic. Please check your connection.");
      setStage("form");
      return;
    }

    // The stub provider has no modal and no real money; short-circuit straight to
    // verification so the flow is walkable end to end without live keys.
    if (order.provider === "stub") {
      await verify({
        razorpay_order_id: order.orderId,
        razorpay_payment_id: "stub_payment",
        razorpay_signature: "stub_signature",
      });
      return;
    }

    setStage("checkout");
    const opened = open(
      order,
      (response) => void verify(response),
      () => {
        setStage("form");
        setError("Payment was cancelled. Your slot is held for a few more minutes.");
      },
    );

    if (!opened) {
      setStage("form");
      setError("The payment window could not open. Please refresh and try again.");
    }
  }

  return (
    <div className="space-y-4">
      <RazorpayScript />

      <div className="grid gap-2">
        <Label htmlFor="online-name">Patient&apos;s name</Label>
        <Input
          id="online-name"
          autoComplete="name"
          disabled={busy}
          value={values.name}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="online-age">Age</Label>
          <Input
            id="online-age"
            type="number"
            inputMode="numeric"
            min={0}
            max={130}
            disabled={busy}
            value={values.age}
            onChange={(event) => setValues((v) => ({ ...v, age: event.target.value }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="online-mobile">Mobile</Label>
          <Input
            id="online-mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98765 43210"
            disabled={busy}
            value={values.mobile}
            onChange={(event) => setValues((v) => ({ ...v, mobile: event.target.value }))}
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Convenience fee</span>
        <span className="font-mono font-semibold tabular-nums">₹{rupees}</span>
      </div>

      {error ? (
        <motion.p
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-destructive"
        >
          {error}
        </motion.p>
      ) : null}

      <Button
        size="lg"
        className="w-full animate-brand-gradient border-transparent bg-brand-gradient text-white shadow-brand hover:opacity-90"
        onClick={() => void book()}
        disabled={busy}
      >
        {busy ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : (
          <CreditCardIcon className="size-4" />
        )}
        {stage === "creating"
          ? "Reserving your slot…"
          : stage === "checkout"
            ? "Waiting for payment…"
            : stage === "verifying"
              ? "Confirming payment…"
              : `Pay ₹${rupees} and book`}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Your token is issued only after the payment is confirmed.
      </p>

      {isStubPayment ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-amber-600 dark:text-amber-500">
          <ShieldCheckIcon className="size-3" />
          Test mode — no real payment is taken.
        </p>
      ) : null}
    </div>
  );
}
