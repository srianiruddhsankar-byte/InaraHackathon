"use client";

import { format, parseISO } from "date-fns";
import { PackageCheck, Siren, Upload } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { StageChip } from "@/components/workflow/StageChip";
import type { Case, Patient } from "@/lib/types";
import { orderedAt, panelName } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";

/** Open orders still with the lab: who, what, how urgent — and the two lab actions. */
export function PendingOrders({ orders, patients, onUpload }: { orders: Case[]; patients: Patient[]; onUpload: (caseId: string) => void }) {
  const markSampleReceived = useInaraStore((s) => s.markSampleReceived);

  if (orders.length === 0) {
    return <EmptyState title="No pending orders">New orders from doctors appear here.</EmptyState>;
  }

  return (
    <ul className="space-y-3">
      {orders.map((c) => {
        const patient = patients.find((p) => p.id === c.patientId);
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">
                {patient?.name ?? "Unknown patient"}
                {c.urgency === "urgent" ? (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 align-middle text-[11px] font-medium text-red-700 ring-1 ring-red-200">
                    <Siren className="size-3" aria-hidden /> Urgent
                  </span>
                ) : (
                  <span className="ml-2 align-middle text-xs font-normal text-slate-500">Routine</span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{c.panels.map(panelName).join(", ")}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Ordered by {c.orderedBy} · {format(parseISO(orderedAt(c)), "d MMM yyyy")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StageChip stage={c.stage} />
              {c.stage === "ordered" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    markSampleReceived(c.id);
                    toast.success(`Sample received for ${patient?.name ?? "patient"}`);
                  }}
                >
                  <PackageCheck aria-hidden /> Mark sample received
                </Button>
              )}
              <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => onUpload(c.id)}>
                <Upload aria-hidden /> Upload results
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
