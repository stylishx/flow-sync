import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/portal/register-form";
import { getPortalClinicId } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Register your clinic — Flow-Sync",
  robots: { index: false, follow: false },
};

export default async function PortalRegisterPage() {
  if (await getPortalClinicId()) redirect("/portal");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Flow-Sync</h1>
        <p className="text-sm text-muted-foreground">Clinic queue control</p>
      </div>
      <RegisterForm />
    </main>
  );
}
