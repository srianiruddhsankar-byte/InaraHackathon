"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { getFindings } from "@/lib/findings";
import { applyFindingEdits, buildDrafts, reviewStage, type Drafts } from "@/lib/review";
import { computeTrends } from "@/lib/trends";
import type { FindingEdits } from "@/lib/types";
import { approvedVersion, latestVersion } from "@/lib/versions";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { DraftStep } from "./DraftStep";
import { PatientHeader } from "./PatientHeader";
import { PlanStep } from "./PlanStep";
import { ReviewStep } from "./ReviewStep";
import { Stepper } from "./Stepper";

const NO_EDITS: FindingEdits = {};

export function ReviewWorkspace({ patientId }: { patientId: string }) {
  const doctor = useCurrentUser();
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const allReports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const findingReviews = useInaraStore((s) => s.findingReviews);
  const { setFindingEdit, clearFindingEdit, saveDoctorEdit, approveReport, savePlanDraft, approvePlan } =
    useInaraStore.getState();

  const reports = useMemo(() => selectReports(allReports, patientId), [allReports, patientId]);
  const report = reports.at(-1);
  const findings = useMemo(() => (patient ? getFindings(patient, reports) : []), [patient, reports]);
  const trends = useMemo(() => (patient ? computeTrends(patient, reports) : []), [patient, reports]);

  const approved = report ? approvedVersion(report) : undefined;
  const locked = !!approved;
  // Once approved, show exactly the finding choices that were signed off.
  const edits = (locked ? approved?.findingEdits : report && findingReviews[report.id]) ?? NO_EDITS;
  const kept = useMemo(() => applyFindingEdits(findings, edits), [findings, edits]);
  const generated = useMemo(
    () => (report ? buildDrafts(findings, edits, trends, report.values, reports.length) : { clinical: "", patient: "" }),
    [findings, edits, trends, report, reports.length],
  );

  const stage = report ? reviewStage(report, plans) : "awaiting_review";
  const [step, setStep] = useState(stage === "awaiting_review" ? 0 : 2);
  const [reviewed, setReviewed] = useState(false);
  /** Unsaved text in the step-2 text areas; null = show the default below. */
  const [typed, setTyped] = useState<Drafts | null>(null);

  if (!patient) return <EmptyState title="Patient not found">This patient record doesn’t exist.</EmptyState>;
  if (!report) {
    return (
      <EmptyState title={`No reports for ${patient.name} yet`}>
        Reports appear here after the lab uploads results.
      </EmptyState>
    );
  }

  const last = latestVersion(report);
  const savedTexts: Drafts | null = approved
    ? { clinical: approved.text, patient: approved.patientText ?? "" }
    : last?.status === "doctor_edited"
      ? { clinical: last.text, patient: last.patientText ?? "" }
      : null;
  const texts = typed ?? savedTexts ?? generated;
  const findingsChanged =
    last?.status === "doctor_edited" && JSON.stringify(last.findingEdits ?? {}) !== JSON.stringify(edits);
  const doctorName = doctor?.name ?? "Doctor";

  const goTo = (i: number) => {
    setStep(i);
    if (i > 0) setReviewed(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const steps = [
    { label: "Review", done: reviewed || locked },
    { label: "Edit & approve", done: locked },
    { label: "Treatment plan", done: stage === "complete" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/doctor" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
        <ChevronLeft className="size-4" /> My patients
      </Link>
      <PatientHeader
        patient={patient}
        report={report}
        status={last?.status ?? "ai_draft"}
        reportCount={reports.length}
        firstDate={reports[0].date}
      />
      <Stepper steps={steps} current={step} onSelect={goTo} />

      {step === 0 && (
        <ReviewStep
          patient={patient}
          reports={reports}
          report={report}
          findings={findings}
          trends={trends}
          edits={edits}
          locked={locked}
          onEdit={(id, patch) => setFindingEdit(report.id, id, patch)}
          onClearEdit={(id) => clearFindingEdit(report.id, id)}
          onContinue={() => goTo(1)}
        />
      )}

      {step === 1 && (
        <DraftStep
          patientName={patient.name}
          doctorName={doctorName}
          report={report}
          generated={generated}
          texts={texts}
          onChange={setTyped}
          locked={locked}
          findingsChanged={findingsChanged}
          onSave={() => {
            saveDoctorEdit(report.id, { text: texts.clinical, patientText: texts.patient, findingEdits: edits }, doctorName);
            setTyped(null);
            toast.success("Edit saved as a new version");
          }}
          onApprove={() => {
            approveReport(report.id, doctorName, { text: texts.clinical, patientText: texts.patient, findingEdits: edits });
            setTyped(null);
            toast.success(`Report approved and released to ${patient.name}`);
            goTo(2);
          }}
          onNext={() => goTo(2)}
        />
      )}

      {step === 2 && (
        <PlanStep
          patientName={patient.name}
          doctorName={doctorName}
          reportId={report.id}
          findings={kept}
          plans={plans}
          reportApproved={locked}
          onSaveDraft={(c) => {
            savePlanDraft(report.id, c, doctorName);
            toast.success("Treatment plan draft saved");
          }}
          onApprove={(c) => {
            approvePlan(report.id, c, doctorName);
            toast.success(`Treatment plan released to ${patient.name}`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onBackToDraft={() => goTo(1)}
        />
      )}
    </div>
  );
}
