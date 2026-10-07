"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock, ShieldX } from "lucide-react";
import { accessFor } from "@/lib/access";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useHydrated, useSession } from "@/store/useInaraStore";
import { refreshRealSession, staffLogout } from "./staffSession";

/**
 * Client-side route guard for a role's area (decision: accessFor in src/lib/access.ts).
 * Wrong role or logged out → /login. Pending/suspended staff → a clear "no access" screen.
 * Verified doctor/admin on a real login without 2FA → the authenticator step.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const hydrated = useHydrated();
  const session = useSession();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  // The layout's role decides the area, whatever the exact path.
  const access = accessFor(pathname.startsWith(`/${role}`) ? pathname : `/${role}`, session, user);
  const redirect = access.kind === "login" || access.kind === "mfa" ? access.redirect : null;
  const realSession = session?.mode === "supabase" ? session.userId : null;

  useEffect(() => {
    if (hydrated && redirect) router.replace(redirect);
  }, [hydrated, redirect, router]);

  // Real logins: re-check the account status and 2FA level each time the area opens.
  useEffect(() => {
    if (hydrated && realSession) void refreshRealSession();
  }, [hydrated, realSession]);

  if (!hydrated || redirect) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500">
        {!hydrated ? "Loading…" : access.kind === "mfa" ? "Two-factor check…" : "Redirecting to login…"}
      </div>
    );
  }
  if (access.kind === "blocked") {
    const Icon = access.status === "pending" ? Clock : ShieldX;
    return (
      <div className="mx-auto max-w-lg py-16">
        <div
          role="alert"
          className={
            access.status === "pending"
              ? "rounded-2xl bg-amber-50 p-6 text-amber-950 ring-1 ring-amber-200"
              : "rounded-2xl bg-red-50 p-6 text-red-950 ring-1 ring-red-200"
          }
        >
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Icon className="size-5" />
            {access.title}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{access.message}</p>
          <p className="mt-3 text-xs opacity-80">
            Signed in as {user?.name}
            {user?.email ? ` (${user.email})` : ""}.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void refreshRealSession()}>
              Check again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void staffLogout();
                router.push("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
