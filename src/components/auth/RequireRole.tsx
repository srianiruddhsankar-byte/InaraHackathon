"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { useCurrentUser, useHydrated } from "@/store/useInaraStore";

/** Client-side route guard: renders children only for a logged-in user with `role`, else redirects to /login. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const router = useRouter();
  const allowed = user?.role === role;

  useEffect(() => {
    if (hydrated && !allowed) router.replace(`/login?tab=${role}`);
  }, [hydrated, allowed, role, router]);

  if (!hydrated || !allowed) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500">
        {hydrated ? "Redirecting to login…" : "Loading…"}
      </div>
    );
  }
  return <>{children}</>;
}
