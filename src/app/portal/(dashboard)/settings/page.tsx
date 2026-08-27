import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";

import { PasscodeForm } from "@/components/portal/passcode-form";
import { SettingsForm } from "@/components/portal/settings-form";
import { Button } from "@/components/ui/button";
import { getPortalClinicId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { formatMobile } from "@/lib/mobile";
import { ClinicModel } from "@/models";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  await connectToDatabase();
  const clinic = await ClinicModel.findById(clinicId).lean();
  if (!clinic) redirect("/portal/login");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          render={<Link href="/portal" />}
          nativeButton={false}
          variant="ghost"
          size="icon"
          aria-label="Back to sessions"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Clinic ID <span className="font-mono">{clinic.slug}</span> — staff use this to sign in.
          </p>
        </div>

        {clinic.onlineBooking?.enabled ? (
          <Button
            render={<Link href={`/c/${clinic.slug}`} target="_blank" />}
            nativeButton={false}
            variant="outline"
            className="ml-auto"
          >
            <ExternalLinkIcon className="size-4" />
            View booking page
          </Button>
        ) : null}
      </div>

      <SettingsForm
        settings={{
          name: clinic.name,
          doctorName: clinic.doctorName,
          specialization: clinic.specialization ?? "",
          phone: formatMobile(clinic.phone),
          city: clinic.address?.city ?? "",
          onlineEnabled: Boolean(clinic.onlineBooking?.enabled),
          // Stored as integer paise; shown to staff as rupees.
          onlineFeeRupees: ((clinic.onlineBooking?.feeInPaise ?? 0) / 100).toFixed(2),
          whatsappEnabled: Boolean(clinic.whatsapp?.enabled),
          whatsappPhoneNumberId: clinic.whatsapp?.phoneNumberId ?? "",
          whatsappTemplateName: clinic.whatsapp?.templateName ?? "",
        }}
      />

      <PasscodeForm />
    </div>
  );
}
