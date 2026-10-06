"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { approvedVersion, isApproved } from "@/lib/versions";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";

export default function PatientPage() {
  const user = useCurrentUser();
  const reports = useInaraStore((s) => s.reports);
  const patientId = user?.patientId;

  // Only this patient's own reports, and only those a doctor has approved.
  const approved = useMemo(
    () => (patientId ? selectReports(reports, patientId).filter(isApproved).reverse() : []),
    [reports, patientId],
  );

  return (
    <>
      <PageHeader title="My reports" subtitle="Only reports approved by your doctor are shown here." />
      {approved.length === 0 ? (
        <EmptyState title="No approved reports yet">
          You will see your results here once your doctor has reviewed them.
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {approved.map((report) => {
            const version = approvedVersion(report)!;
            return (
              <li key={report.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-slate-900">Report · {report.date}</h2>
                  <span className="text-xs text-slate-500">
                    {report.labName} · approved by {version.author}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{version.text}</p>
                {version.prescription && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Doctor&apos;s prescription</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{version.prescription}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
