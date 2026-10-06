"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ClipboardList, FileText, Settings } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlanView } from "@/components/report/PlanView";
import { StageTracker } from "@/components/workflow/StageTracker";
import { WearablePanel } from "@/components/wearable/WearablePanel";
import { cn } from "@/lib/utils";
import { patientVisibleReports } from "@/lib/patientView";
import { activeCase, orderedAt, patientStepIndex, patientStepLabel } from "@/lib/workflow";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

export default function PatientPage() {
  const user = useCurrentUser();
  const reports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const cases = useInaraStore((s) => s.cases);
  const patientId = user?.patientId;
  const [view, setView] = useState<"reports" | "wearable">("reports");

  // Only this patient's own reports, and only what a doctor has approved.
  const visible = useMemo(
    () => (patientId ? patientVisibleReports(patientId, reports, plans) : []),
    [reports, plans, patientId],
  );

  // Stage only — no results. Results appear below once the doctor approves them.
  const current = useMemo(() => (patientId ? activeCase(cases, patientId) : undefined), [cases, patientId]);
  const waiting = current && patientStepIndex(current.stage) < patientStepIndex("approved");

  return (
    <>
      <PageHeader
        title={view === "reports" ? "My reports" : "My wearable"}
        subtitle={
          view === "reports"
            ? "Only reports approved by your doctor are shown here."
            : "Your watch readings compared with your own usual — early warning, not a diagnosis."
        }
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm" role="tablist" aria-label="My health view">
          {(["reports", "wearable"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-lg px-4 py-1.5 font-medium transition-colors",
                view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {v === "reports" ? "My reports" : "Wearable"}
            </button>
          ))}
        </div>
        <Link href="/patient/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
          <Settings className="size-4" aria-hidden /> Privacy & settings
        </Link>
      </div>
      {view === "wearable" && patientId && <WearablePanel patientId={patientId} audience="patient" />}
      {view === "reports" && current && (
        <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Your latest tests</h2>
            <span className="text-xs text-slate-500">
              Ordered {format(parseISO(orderedAt(current)), "d MMM yyyy")} by {current.orderedBy}
            </span>
          </div>
          <StageTracker c={current} variant="patient" />
          <p className="mt-3 rounded-xl bg-teal-50/60 px-3 py-2 text-sm text-teal-900">
            {waiting
              ? patientStepLabel(current.stage) === "With your doctor"
                ? "Your results are with your doctor. You’ll see them here once your doctor has reviewed and approved them."
                : "Your tests are on their way. We’ll show your results here once your doctor has reviewed them."
              : "Your doctor has reviewed your results — see your report below."}
          </p>
        </section>
      )}
      {view === "reports" && (visible.length === 0 ? (
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
      ))}
    </>
  );
}
