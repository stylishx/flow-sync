"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BuildingIcon, LoaderCircleIcon } from "lucide-react";

import { registerAction, type ActionState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { slugify, validateSlug } from "@/lib/slug";

const initialState: ActionState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [name, setName] = useState("");
  // Empty until touched, so the slug tracks the clinic name; once edited it stops.
  const [slugEdit, setSlugEdit] = useState<string | null>(null);

  const slug = slugEdit === null ? slugify(name) : slugify(slugEdit);
  const slugProblem = slug.length > 0 ? validateSlug(slug) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="w-full max-w-lg"
    >
      <Card className="border-border/60 bg-card/70 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BuildingIcon className="size-5" />
          </div>
          <CardTitle>Register your clinic</CardTitle>
          <CardDescription>
            Takes a minute. You can create your first session straight after.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Clinic name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Sunrise Family Clinic"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Clinic ID</Label>
              <Input
                id="slug"
                name="slug"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="sunrise-family-clinic"
                value={slug}
                onChange={(event) => setSlugEdit(event.target.value)}
                required
              />
              {slugProblem ? (
                <p className="text-xs text-destructive">{slugProblem}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Staff type this to sign in, and it becomes your booking link:{" "}
                  <span className="font-mono">/c/{slug || "your-clinic"}</span>
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="doctorName">Doctor&apos;s name</Label>
                <Input id="doctorName" name="doctorName" placeholder="Dr. Meera Iyer" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="specialization">Specialization</Label>
                <Input id="specialization" name="specialization" placeholder="General Physician" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="phone">Contact number</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="Pune" />
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="passcode">Staff passcode</Label>
                <Input
                  id="passcode"
                  name="passcode"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPasscode">Confirm passcode</Label>
                <Input
                  id="confirmPasscode"
                  name="confirmPasscode"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Everyone at the desk shares this passcode, so treat it like a door key and change it
              when staff leave.
            </p>

            {state.error ? (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending || Boolean(slugProblem)} className="w-full">
              {pending ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {pending ? "Creating…" : "Create clinic"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link href="/portal/login" className="text-foreground underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
