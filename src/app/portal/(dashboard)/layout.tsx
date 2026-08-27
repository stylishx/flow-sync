import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOutIcon, SettingsIcon, StethoscopeIcon } from "lucide-react";

import { logoutAction } from "@/app/portal/actions";
import { Button } from "@/components/ui/button";
import { getPortalClinicId } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { ClinicModel } from "@/models";

/**
 * Auth gate for everything under /portal except the login page. Server Actions are
 * separately guarded in actions.ts — a layout check alone would not protect them,
 * since actions are directly addressable endpoints and do not re-run layouts.
 */
export default async function DashboardLayout({ children }: LayoutProps<"/portal">) {
  const clinicId = await getPortalClinicId();
  if (!clinicId) redirect("/portal/login");

  await connectToDatabase();
  const clinic = await ClinicModel.findById(clinicId).lean();
  if (!clinic) redirect("/portal/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/40 glass-strong dark:border-white/10 print:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-brand">
              <StethoscopeIcon className="size-4" />
            </span>
            <span className="hidden sm:inline">Flow-Sync</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{clinic.name}</p>
              <p className="text-xs text-muted-foreground">{clinic.doctorName}</p>
            </div>
            <Button
              render={<Link href="/portal/settings" />}
              nativeButton={false}
              variant="ghost"
              size="icon"
              aria-label="Settings"
            >
              <SettingsIcon className="size-4" />
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                <LogOutIcon className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
