"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { roleLabel } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { topBarPhase } from "@/lib/workflow";
import { getSupabase } from "@/lib/sync/client";
import { useCurrentUser, useHydrated, useInaraStore, useSession } from "@/store/useInaraStore";
import { staffLogout } from "@/components/auth/staffSession";
import { resetSharedWorkspace } from "@/store/useSyncStore";
import { SyncChip } from "@/components/sync/SyncChip";

const ROLE_BADGE: Record<Role, string> = {
  doctor: "bg-teal-50 text-teal-700 ring-teal-200",
  patient: "bg-sky-50 text-sky-700 ring-sky-200",
  lab: "bg-violet-50 text-violet-700 ring-violet-200",
  admin: "bg-slate-100 text-slate-700 ring-slate-300",
  health_officer: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function TopBar() {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const session = useSession();
  const resetDemo = useInaraStore((s) => s.resetDemo);
  const pathname = usePathname();
  const cases = useInaraStore((s) => s.cases);
  const patients = useInaraStore((s) => s.patients);
  const phase =
    hydrated && user
      ? topBarPhase({
          role: user.role,
          pathname,
          cases,
          patients,
          patientIds: user.role === "patient" ? (user.patientId ? [user.patientId] : []) : (user.patientIds ?? []),
        })
      : undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex size-7 items-center justify-center rounded-lg bg-teal-600 text-sm text-white">
            B
          </span>
          <span className="hidden sm:inline">BioMarQ: Prodrome</span>
        </Link>
        {phase && (
          <span
            className="hidden min-w-0 truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 md:inline"
            title={phase}
          >
            {phase}
          </span>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {hydrated && <SyncChip />}
          {hydrated && user && (
            <>
              <span className="truncate text-sm font-medium text-slate-700">{user.name}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1", ROLE_BADGE[user.role])}>
                {roleLabel(user.role)}
              </span>
              {user.role !== "patient" && session?.mode !== "supabase" && getSupabase() && (
                <span
                  className="hidden shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 lg:inline"
                  title="Signed in with the simulated offline login (no Supabase account, no 2FA)"
                >
                  Offline demo login
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Logout"
                onClick={() => {
                  void staffLogout();
                  router.push("/login");
                }}
              >
                <LogOut />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          )}
          {hydrated && !user && (
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <LogIn />
              Log in
            </Link>
          )}

          <Button
            variant="outline"
            size="sm"
            aria-label="Reset demo"
            onClick={() => {
              void staffLogout();
              resetDemo();
              void resetSharedWorkspace();
              toast.success("Demo data restored. You have been logged out.");
              router.push("/login");
            }}
          >
            <RotateCcw />
            <span className="hidden sm:inline">Reset demo</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
