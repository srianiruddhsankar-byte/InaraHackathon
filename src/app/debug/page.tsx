"use client";

// TEMPORARY: raw view of the medical logic output for checking in the browser.
// Remove before the final demo.
import { useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/layout/EmptyState";
import { doctorDraft, patientExplanation } from "@/lib/draft";
import { getFindings } from "@/lib/findings";
import { computeTrends } from "@/lib/trends";
import { useHydrated, useInaraStore, selectReports } from "@/store/useInaraStore";

function round(value: unknown): unknown {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

export default function DebugPage() {
  const hydrated = useHydrated();
  const patients = useInaraStore((s) => s.patients);
  const reports = useInaraStore((s) => s.reports);

  const rows = useMemo(
    () =>
      patients.map((patient) => {
        const history = selectReports(reports, patient.id);
        const findings = getFindings(patient, history);
        const trends = computeTrends(patient, history);
        const latest = history.at(-1);
        return {
          patient,
          findings,
          trends,
          draft: doctorDraft(findings, trends, history.length),
          explanation: patientExplanation(findings, latest?.values ?? []),
          latest,
        };
      }),
    [patients, reports],
  );

  if (!hydrated) {
    return <p className="py-24 text-center text-sm text-slate-500">Loading demo data…</p>;
  }

  return (
    <>
      <PageHeader title="Debug: medical logic" subtitle="Temporary page. Raw output of src/lib for each patient." />
      {rows.length === 0 && <EmptyState title="No patients">Press “Reset demo” to load the synthetic data.</EmptyState>}
      <div className="space-y-10">
        {rows.map(({ patient, findings, trends, draft, explanation, latest }) => (
          <section key={patient.id} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold">
              {patient.name} · {patient.age} {patient.sex} · suspected: {patient.suspectedDisease}
            </h2>
            <p className="text-sm text-slate-500">
              Latest report: {latest?.date} · versions: {latest?.versions.map((v) => v.status).join(" → ")}
            </p>
            <Block title="Findings" body={JSON.stringify(findings, null, 2)} />
            <Block title="Trends" body={JSON.stringify(trends, (_k, v) => round(v), 2)} />
            <Block title="doctorDraft()" body={draft} />
            <Block title="patientExplanation()" body={explanation} />
          </section>
        ))}
      </div>
    </>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <details open className="rounded-xl bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{body}</pre>
    </details>
  );
}
