"use client";

import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { consentBadge, formatCountdown, remainingMs } from "@/lib/recordAccess";
import type { AccessRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const FMT = { time: (iso: string) => format(new Date(iso), "h:mm a"), date: (iso: string) => format(new Date(iso), "d MMM yyyy") };

/** "Consent: Ongoing care · until 7 Nov 2026" (+ the time left for a visit / break-glass). */
export function ConsentBadge({ request, now, className }: { request: AccessRequest; now?: number; className?: string }) {
  const short = request.consent !== "ongoing";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        request.via === "break_glass" ? "bg-red-50 text-red-800 ring-red-200" : "bg-teal-50 text-teal-800 ring-teal-200",
        className,
      )}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {consentBadge(request, FMT)}
      {short && now !== undefined && ` · ${formatCountdown(remainingMs(request, now))} left`}
    </span>
  );
}
