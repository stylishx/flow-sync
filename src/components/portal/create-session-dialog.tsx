"use client";

import { useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { createSessionAction, type ActionState } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function CreateSessionDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Calling the action inside a transition rather than via useActionState lets the
  // dialog close on success without a setState-in-effect round trip.
  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result: ActionState = await createSessionAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(result.success ?? "Session created.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon className="size-4" />
        New session
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New clinic session</DialogTitle>
          <DialogDescription>
            One session per day. Patients scan its QR code to take a token.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="sessionDate">Date</Label>
            <Input
              id="sessionDate"
              name="sessionDate"
              type="date"
              defaultValue={todayIso()}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="startTime">Opens</Label>
              <Input id="startTime" name="startTime" type="time" defaultValue="09:30" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endTime">Closes</Label>
              <Input id="endTime" name="endTime" type="time" defaultValue="13:00" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="maxPatients">Patient limit</Label>
              <Input
                id="maxPatients"
                name="maxPatients"
                type="number"
                min={1}
                max={500}
                defaultValue={40}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="onlineQuota">Online quota</Label>
              <Input
                id="onlineQuota"
                name="onlineQuota"
                type="number"
                min={0}
                max={500}
                defaultValue={10}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="estimatedConsultMinutes">Minutes per patient</Label>
            <Select name="estimatedConsultMinutes" defaultValue="6">
              <SelectTrigger id="estimatedConsultMinutes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 8, 10, 15, 20].map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Drives every wait estimate patients see. Err high — an early call is a nicer surprise
              than a late one.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
