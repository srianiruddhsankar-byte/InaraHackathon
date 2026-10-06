"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ClipboardList, FileText } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlanView } from "@/components/report/PlanView";
import { patientVisibleReports } from "@/lib/patientView";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

export default function PatientPage() {
  const user = useCurrentUser();
  const reports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const patientId = user?.patientId;

  // Only this patient's own reports, and only what a doctor has approved.
  const visible = useMemo(
    () => (patientId ? patientVisibleReports(patientId, reports, plans) : []),
    [reports, plans, patientId],
  );

  return (
    <>
      <PageHeader title="My reports" subtitle="Only reports approved by your doctor are shown here." />
      {visible.length === 0 ? (
        <EmptyState title="No approved reports yet">
          You will see your results here once your doctor has reviewed them.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {visible.map((r) => (
            <li key={r.reportId} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-900">Report · {format(parseISO(r.date), "d MMMM yyyy")}</h2>
                <span className="text-xs text-slate-500">
                  {r.labName} · approved by {r.approvedBy}
                </span>
              </div>

              {r.explanation && (
                <div className="mt-4">
                  <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    <FileText className="size-3.5" aria-hidden /> What your results mean
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">{r.explanation}</p>
                </div>
              )}

              {r.prescription && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Doctor&apos;s prescription</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{r.prescription}</p>
                </div>
              )}

              {r.plan && (
                <div className="mt-5 rounded-2xl bg-teal-50/50 p-4 ring-1 ring-teal-100">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-teal-900">
                    <ClipboardList className="size-4" aria-hidden /> Your treatment plan
                  </h3>
                  <PlanView plan={r.plan} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
