"use client";

import { useActionState, useState } from "react";
import { CreditCardIcon, MessageCircleIcon } from "lucide-react";

import { updateClinicAction, type ActionState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

const initialState: ActionState = {};

export interface ClinicSettings {
  name: string;
  doctorName: string;
  specialization: string;
  phone: string;
  city: string;
  onlineEnabled: boolean;
  onlineFeeRupees: string;
  whatsappEnabled: boolean;
  whatsappPhoneNumberId: string;
  whatsappTemplateName: string;
}

export function SettingsForm({ settings }: { settings: ClinicSettings }) {
  const [state, formAction, pending] = useActionState(updateClinicAction, initialState);

  // Base UI's Switch is driven here and mirrored into a hidden input, so the Server
  // Action always receives an explicit "true"/"false" rather than the absent-when-off
  // behaviour of a bare checkbox.
  const [onlineEnabled, setOnlineEnabled] = useState(settings.onlineEnabled);
  const [whatsappEnabled, setWhatsappEnabled] = useState(settings.whatsappEnabled);

  return (
    <form action={formAction} className="space-y-6">
      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle>Clinic details</CardTitle>
          <CardDescription>Shown to patients on the booking and token screens.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Clinic name</Label>
            <Input id="name" name="name" defaultValue={settings.name} required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="doctorName">Doctor&apos;s name</Label>
              <Input
                id="doctorName"
                name="doctorName"
                defaultValue={settings.doctorName}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="specialization">Specialization</Label>
              <Input
                id="specialization"
                name="specialization"
                defaultValue={settings.specialization}
              />
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
                defaultValue={settings.phone}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue={settings.city} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCardIcon className="size-4" />
            Online booking
          </CardTitle>
          <CardDescription>
            Lets patients reserve a token from home for a convenience fee, up to the per-session
            online quota.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="online-toggle" className="font-normal">
              Accept online bookings
            </Label>
            <Switch id="online-toggle" checked={onlineEnabled} onCheckedChange={setOnlineEnabled} />
            <input type="hidden" name="onlineEnabled" value={String(onlineEnabled)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="onlineFeeRupees">Convenience fee (₹)</Label>
            <Input
              id="onlineFeeRupees"
              name="onlineFeeRupees"
              type="number"
              min={0}
              step="0.01"
              defaultValue={settings.onlineFeeRupees}
              disabled={!onlineEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircleIcon className="size-4" />
            WhatsApp alerts
          </CardTitle>
          <CardDescription>
            Messages patients when they are two away. Requires a Meta-approved template —
            business-initiated messages cannot be free-form.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="whatsapp-toggle" className="font-normal">
              Send WhatsApp alerts
            </Label>
            <Switch
              id="whatsapp-toggle"
              checked={whatsappEnabled}
              onCheckedChange={setWhatsappEnabled}
            />
            <input type="hidden" name="whatsappEnabled" value={String(whatsappEnabled)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="whatsappPhoneNumberId">Phone number ID</Label>
              <Input
                id="whatsappPhoneNumberId"
                name="whatsappPhoneNumberId"
                defaultValue={settings.whatsappPhoneNumberId}
                disabled={!whatsappEnabled}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="whatsappTemplateName">Template name</Label>
              <Input
                id="whatsappTemplateName"
                name="whatsappTemplateName"
                placeholder="queue_almost_your_turn"
                defaultValue={settings.whatsappTemplateName}
                disabled={!whatsappEnabled}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center gap-3">
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}
        <Button type="submit" disabled={pending} className="ml-auto">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
