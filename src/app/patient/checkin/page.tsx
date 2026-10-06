"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { CheckInFlow, CheckInResult } from "@/components/wearable/CheckIn";
import { useWearableMonitor } from "@/components/wearable/useWearableMonitor";
import { WATCH_MESSAGE } from "@/lib/wearable/checkin";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

export default function CheckInPage() {
  const user = useCurrentUser();
  const patientId = user?.patientId;
  const users = useInaraStore((s) => s.users);
  const doctorName = users.find((u) => u.role === "doctor" && patientId && u.patientIds?.includes(patientId))?.name ?? "your doctor";
  const { episode, streaming, analysis, today, topLevel } = useWearableMonitor(patientId);

  let body: React.ReactNode;
  if (!streaming) {
    body = <EmptyState title="Wearable monitoring not enabled">Turn on streaming in Privacy & settings to use check-ins.</EmptyState>;
  } else if (episode?.checkInDue) {
    body = <CheckInFlow key={`${episode.episodeId}-${episode.round}`} episode={episode} />;
  } else if (episode?.latest) {
    body = <CheckInResult episode={episode} doctorName={doctorName} />;
  } else if (!analysis || !today) {
    body = <div className="animate-pulse rounded-2xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">Checking your watch data…</div>;
  } else {
    body = (
      <EmptyState title="No check-in right now">
        {topLevel === "watch" ? WATCH_MESSAGE : "Your readings look like your usual. We'll let you know if anything changes."}
      </EmptyState>
    );
  }

  return (
    <>
      <Link href="/patient" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
        <ChevronLeft className="size-4" /> My health
      </Link>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Health check-in</h1>
      {body}
    </>
  );
}
