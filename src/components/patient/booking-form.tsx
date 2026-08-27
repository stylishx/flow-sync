"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon, TicketIcon } from "lucide-react";

import { bookTokenAction, type BookingState } from "@/app/s/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDeviceId } from "@/lib/device";
import { formatMobile, normalizeMobile } from "@/lib/mobile";

interface BookingFormProps {
  qrToken: string;
}

type Step = "name" | "age" | "mobile";
const STEPS: Step[] = ["name", "age", "mobile"];

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

/**
 * One field per screen. A patient filling this in is often unwell, standing, and on a
 * cheap phone in bad light — a single large field with a single obvious action beats a
 * dense form, and lets each answer be validated before the next question.
 */
export function BookingForm({ qrToken }: BookingFormProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [values, setValues] = useState({ name: "", age: "", mobile: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step = STEPS[stepIndex];

  function validateStep(): string | null {
    if (step === "name") {
      if (values.name.trim().length < 2) return "Please enter the patient's name.";
    }
    if (step === "age") {
      const age = Number(values.age);
      if (!Number.isInteger(age) || age < 0 || age > 130) return "Enter a valid age.";
    }
    if (step === "mobile") {
      if (!normalizeMobile(values.mobile)) return "Enter a valid 10-digit mobile number.";
    }
    return null;
  }

  function next() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    if (stepIndex < STEPS.length - 1) {
      setDirection(1);
      setStepIndex((index) => index + 1);
      return;
    }
    submit();
  }

  function back() {
    setError(null);
    setDirection(-1);
    setStepIndex((index) => Math.max(0, index - 1));
  }

  function submit() {
    const formData = new FormData();
    formData.set("qrToken", qrToken);
    formData.set("name", values.name.trim());
    formData.set("age", values.age);
    formData.set("mobile", values.mobile);
    // Read at submit time rather than on mount: localStorage does not exist during
    // SSR, and holding it in state would mean a setState inside an effect.
    formData.set("fingerprint", getDeviceId());

    startTransition(async () => {
      const result: BookingState = await bookTokenAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.publicId) router.replace(`/t/${result.publicId}`);
    });
  }

  const normalizedPreview = step === "mobile" ? normalizeMobile(values.mobile) : null;

  return (
    <div className="space-y-6">
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuenow={stepIndex + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        {STEPS.map((name, index) => (
          <motion.span
            key={name}
            className="h-1 flex-1 rounded-full"
            animate={{
              backgroundColor: index <= stepIndex ? "var(--color-primary)" : "var(--color-muted)",
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      <div className="relative min-h-[132px]">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="space-y-2"
          >
            {step === "name" ? (
              <>
                <Label htmlFor="name" className="text-base">
                  Patient&apos;s name
                </Label>
                <Input
                  id="name"
                  autoFocus
                  autoComplete="name"
                  className="h-12 text-lg"
                  value={values.name}
                  onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && next()}
                />
              </>
            ) : null}

            {step === "age" ? (
              <>
                <Label htmlFor="age" className="text-base">
                  Age
                </Label>
                <Input
                  id="age"
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={130}
                  className="h-12 text-lg"
                  value={values.age}
                  onChange={(event) => setValues((v) => ({ ...v, age: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && next()}
                />
              </>
            ) : null}

            {step === "mobile" ? (
              <>
                <Label htmlFor="mobile" className="text-base">
                  Mobile number
                </Label>
                <Input
                  id="mobile"
                  autoFocus
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  className="h-12 text-lg"
                  value={values.mobile}
                  onChange={(event) => setValues((v) => ({ ...v, mobile: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && next()}
                />
                <p className="text-sm text-muted-foreground">
                  {normalizedPreview
                    ? `We'll message ${formatMobile(normalizedPreview)} when you're nearly up.`
                    : "Used only to alert you when your turn is close."}
                </p>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
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

      <div className="flex gap-2">
        {stepIndex > 0 ? (
          <Button variant="outline" size="lg" onClick={back} disabled={pending}>
            <ArrowLeftIcon className="size-4" />
          </Button>
        ) : null}

        <Button size="lg" className="flex-1" onClick={next} disabled={pending}>
          {pending ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : stepIndex === STEPS.length - 1 ? (
            <TicketIcon className="size-4" />
          ) : (
            <ArrowRightIcon className="size-4" />
          )}
          {pending
            ? "Getting your token…"
            : stepIndex === STEPS.length - 1
              ? "Get my token"
              : "Continue"}
        </Button>
      </div>
    </div>
  );
}
