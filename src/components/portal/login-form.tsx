"use client";

import { useActionState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { LoaderCircleIcon, LockIcon } from "lucide-react";

import { loginAction, type ActionState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <Card className="border-border/60 bg-card/70 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockIcon className="size-5" />
          </div>
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>Clinic ID and shift passcode.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="slug">Clinic ID</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="sunrise-family-clinic"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                name="passcode"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {pending ? "Checking…" : "Sign in"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              New clinic?{" "}
              <Link
                href="/portal/register"
                className="text-foreground underline underline-offset-4"
              >
                Register here
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
