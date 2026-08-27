import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchXIcon className="size-6" />
      </span>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This link may have expired, or the session has closed for the day.
        </p>
      </div>
      <Button render={<Link href="/" />} nativeButton={false} variant="outline">
        Go to the start
      </Button>
    </main>
  );
}
