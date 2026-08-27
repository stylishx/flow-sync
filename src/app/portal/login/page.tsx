import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/portal/login-form";
import { getPortalClinicId } from "@/lib/auth";

export const metadata: Metadata = { title: "Staff sign in — Flow-Sync" };

export default async function PortalLoginPage() {
  if (await getPortalClinicId()) redirect("/portal");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center page-gradient p-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Flow-Sync</h1>
        <p className="text-sm text-muted-foreground">Clinic queue control</p>
      </div>
      <LoginForm />
    </main>
  );
}
