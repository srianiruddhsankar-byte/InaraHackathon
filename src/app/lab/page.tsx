"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Siren } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StageChip } from "@/components/workflow/StageChip";
import { isOpen, orderedAt, panelName, stageIndex } from "@/lib/workflow";
import { useInaraStore } from "@/store/useInaraStore";

export default function LabPage() {
  const cases = useInaraStore((s) => s.cases);
  const patients = useInaraStore((s) => s.patients);

  // Status only — the lab never sees analysis, drafts or approvals here.
  // Orders still with the lab first (urgent first), then the newest.
  const open = useMemo(
    () =>
      cases
        .filter(isOpen)
        .sort(
          (a, b) =>
            Number(stageIndex(a.stage) > stageIndex("in_lab")) - Number(stageIndex(b.stage) > stageIndex("in_lab")) ||
            Number(b.urgency === "urgent") - Number(a.urgency === "urgent") ||
            orderedAt(b).localeCompare(orderedAt(a)),
        ),
    [cases],
  );

  return (
    <>
      <PageHeader title="Lab orders" subtitle="Open orders and where each one is. Results upload is coming next." />
      {open.length === 0 ? (
        <EmptyState title="No open orders">New orders from doctors appear here.</EmptyState>
      ) : (
        <ul className="mb-8 space-y-3">
          {open.map((c) => {
            const patient = patients.find((p) => p.id === c.patientId);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {patient?.name ?? "Unknown patient"}
                    {c.urgency === "urgent" && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 align-middle text-[11px] font-medium text-red-700 ring-1 ring-red-200">
                        <Siren className="size-3" aria-hidden /> Urgent
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">{c.panels.map(panelName).join(", ")}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ordered by {c.orderedBy} · {format(parseISO(orderedAt(c)), "d MMM yyyy")}
                  </p>
                </div>
                <StageChip stage={c.stage} />
              </li>
            );
          })}
        </ul>
      )}
      <EmptyState title="CSV upload coming soon">Columns: test_name, value, unit, date.</EmptyState>
    </>
  );
}
