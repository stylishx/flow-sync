"use client";

import { useActionState } from "react";
import { KeyRoundIcon } from "lucide-react";

import { changePasscodeAction, type ActionState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function PasscodeForm() {
  const [state, formAction, pending] = useActionState(changePasscodeAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          Staff passcode
        </CardTitle>
        <CardDescription>
          Everyone at the desk shares this. Change it when staff leave.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="currentPasscode">Current passcode</Label>
            <Input
              id="currentPasscode"
              name="currentPasscode"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="newPasscode">New passcode</Label>
              <Input
                id="newPasscode"
                name="newPasscode"
                type="password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPasscode">Confirm new passcode</Label>
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

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}

          <Button type="submit" variant="outline" disabled={pending} className="justify-self-start">
            {pending ? "Changing…" : "Change passcode"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
