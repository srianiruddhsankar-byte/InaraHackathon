"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSection } from "@/components/layout/SidebarLayout";
import { AnalysisSection, TreatmentSection } from "@/components/patient/PatientSections";
import { PATIENT_SECTIONS } from "@/components/patient/PatientSidebar";
import { RawLabReport } from "@/components/report/RawLabReport";
import { WearablePanel } from "@/components/wearable/WearablePanel";
import { patientRawReports } from "@/lib/rawReport";
import { DetailedView } from "@/components/patient/DetailedView";
import { PrintReport } from "@/components/patient/PrintReport";
import { SimpleView } from "@/components/patient/SimpleView";
import { CheckInBanner } from "@/components/wearable/CheckIn";
import { useWearableMonitor } from "@/components/wearable/useWearableMonitor";
import { buildPatientRecord, printableReport, wearableOneLiner } from "@/lib/patientView";
import { cn } from "@/lib/utils";
import { activeCase } from "@/lib/workflow";
import { useCurrentUser, useInaraStore } from "@/store/useInaraStore";

type ViewMode = "simple" | "detailed";

const prefKey = (patientId: string) => `inara:patient-view:${patientId}`;

function readPref(patientId: string): ViewMode {
  try {
    return localStorage.getItem(prefKey(patientId)) === "detailed" ? "detailed" : "simple";
  } catch {
    return "simple";
  }
}

function writePref(patientId: string, mode: ViewMode) {
  try {
    localStorage.setItem(prefKey(patientId), mode);
  } catch {
    // Storage unavailable (private window): the choice just isn't remembered.
  }
}

export default function PatientPage() {
  const user = useCurrentUser();
  if (!user?.patientId) return null;
  // Keyed so the remembered view is read per patient.
  return <PatientHome key={user.patientId} patientId={user.patientId} />;
}

function PatientHome({ patientId }: { patientId: string }) {
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const reports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const cases = useInaraStore((s) => s.cases);
  const overrides = useInaraStore((s) => s.targetOverrides);
  const [mode, setMode] = useState<ViewMode>(() => readPref(patientId));
  const section = useSection(PATIENT_SECTIONS, "records", useSearchParams());
  // Raw rows of approved reports only.
  const rawReports = useMemo(() => patientRawReports(patientId, reports), [patientId, reports]);
  // Today's wearable check: starts a check-in when Prodrome noticed a concerning change.
  const { episode, streaming, topLevel } = useWearableMonitor(patientId);

  // Approved reports and approved plans only — the one source for both views and print.
  const record = useMemo(
    () =>
      patient
        ? buildPatientRecord({ patient, reports, plans, cases, targetOverrides: overrides, episode })
        : null,
    [patient, reports, plans, cases, overrides, episode],
  );
  const active = useMemo(() => activeCase(cases, patientId), [cases, patientId]);
  // A wearable case's tracker already shows in the check-in banner above.
  const current = active?.episodeId && active.episodeId === episode?.episodeId && episode.latest ? undefined : active;
  const wearable = wearableOneLiner({ streaming, topLevel, episode });
  const print = useMemo(() => (patient && record ? printableReport(patient, record) : null), [patient, record]);

  const choose = (m: ViewMode) => {
    setMode(m);
    writePref(patientId, m);
    window.scrollTo({ top: 0 });
  };

  if (!patient || !record) return null;
  return (
    <>
      <div className="print:hidden">
        <div className={cn(section === "records" && mode === "simple" && "mx-auto max-w-2xl")}>
          <CheckInBanner episode={episode} />
        </div>
        {section === "records" && (
          <>
            <div className={cn("mb-6 flex justify-center sm:justify-end", mode === "simple" && "mx-auto max-w-2xl")}>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-base" role="tablist" aria-label="How much detail">
                {(["simple", "detailed"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => choose(m)}
                    className={cn(
                      "min-w-28 rounded-lg px-5 py-2 font-medium transition-colors",
                      mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {m === "simple" ? "Simple" : "Detailed"}
                  </button>
                ))}
              </div>
            </div>
            {mode === "simple" ? (
              <SimpleView
                firstName={patient.name.split(" ")[0]}
                record={record}
                current={current}
                wearable={wearable}
                onShowDetails={() => choose("detailed")}
              />
            ) : (
              <>
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My health record</h1>
                  <p className="mt-1 text-slate-600">Only results and plans approved by your doctor are shown here.</p>
                </div>
                <DetailedView patientId={patientId} record={record} />
              </>
            )}
          </>
        )}
        {section === "lab" && <RawLabReport reports={rawReports} audience="patient" />}
        {section === "analysis" && <AnalysisSection record={record} current={active} />}
        {section === "treatment" && <TreatmentSection record={record} />}
        {section === "wearable" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My wearable</h1>
              <p className="mt-1 text-slate-600">Your watch readings compared with your own usual — early warning, not a diagnosis.</p>
            </div>
            <WearablePanel patientId={patientId} audience="patient" />
          </>
        )}
      </div>
      {print && <PrintReport report={print} />}
    </>
  );
}
