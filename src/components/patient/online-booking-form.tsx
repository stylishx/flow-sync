"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CreditCardIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";

import { bookOnlineAction, confirmPaymentAction } from "@/app/c/actions";
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

export function OnlineBookingForm({ qrToken, feeInPaise, isStubPayment }: OnlineBookingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", age: "", mobile: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (values.name.trim().length < 2) return setError("Please enter the patient's name.");
    const age = Number(values.age);
    if (!Number.isInteger(age) || age < 0 || age > 130) return setError("Enter a valid age.");
    if (!normalizeMobile(values.mobile)) return setError("Enter a valid 10-digit mobile number.");
    setError(null);

    const formData = new FormData();
    formData.set("qrToken", qrToken);
    formData.set("name", values.name.trim());
    formData.set("age", values.age);
    formData.set("mobile", values.mobile);
    formData.set("fingerprint", getDeviceId());

    startTransition(async () => {
      const booked = await bookOnlineAction({}, formData);
      if (booked.error || !booked.publicId) {
        setError(booked.error ?? "Booking failed.");
        return;
      }

      // With a real gateway this is where the provider's checkout opens and the
      // signed callback drives confirmPaymentAction. The stub confirms immediately so
      // the flow is walkable end to end without live keys.
      const confirmed = await confirmPaymentAction(booked.publicId, "stub_payment", "stub_sig");
      if (confirmed.error) {
        setError(`Token reserved, but payment failed: ${confirmed.error}`);
        return;
      }

      router.replace(`/t/${booked.publicId}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="online-name">Patient&apos;s name</Label>
        <Input
          id="online-name"
          autoComplete="name"
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
            value={values.mobile}
            onChange={(event) => setValues((v) => ({ ...v, mobile: event.target.value }))}
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Convenience fee</span>
        <span className="font-mono font-semibold tabular-nums">
          ₹{(feeInPaise / 100).toFixed(2)}
        </span>
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

      <Button size="lg" className="w-full" onClick={submit} disabled={pending}>
        {pending ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : (
          <CreditCardIcon className="size-4" />
        )}
        {pending ? "Reserving…" : `Pay ₹${(feeInPaise / 100).toFixed(2)} and book`}
      </Button>

      {isStubPayment ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-amber-600 dark:text-amber-500">
          <ShieldCheckIcon className="size-3" />
          Test mode — no real payment is taken.
        </p>
      ) : null}
    </div>
  );
}
