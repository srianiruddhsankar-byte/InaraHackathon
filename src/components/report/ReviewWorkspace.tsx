"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { CaseProgress } from "@/components/workflow/CaseProgress";
import { runAnalysis } from "@/lib/analysis";
import { getFindings } from "@/lib/findings";
import { buildCheckContext } from "@/lib/prescriptionChecks";
import { activeMedications } from "@/lib/record";
import { applyFindingEdits, buildDrafts, reviewStage, type Drafts } from "@/lib/review";
import type { FindingEdits } from "@/lib/types";
import { approvedVersion, latestVersion } from "@/lib/versions";
import { activeCase, isOpen } from "@/lib/workflow";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { AnalysisStep } from "./AnalysisStep";
import { DraftStep } from "./DraftStep";
import { PatientHeader } from "./PatientHeader";
import { PlanStep } from "./PlanStep";
import { RecordStep } from "./RecordStep";
import { Stepper } from "./Stepper";

const NO_EDITS: FindingEdits = {};

const RECORD = 0;
const ANALYSIS = 1;
const APPROVAL = 2;
const TREATMENT = 3;

export function ReviewWorkspace({ patientId }: { patientId: string }) {
  const doctor = useCurrentUser();
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const allReports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const findingReviews = useInaraStore((s) => s.findingReviews);
  const analysisRuns = useInaraStore((s) => s.analysisRuns);
  const targetOverrides = useInaraStore((s) => s.targetOverrides);
  const cases = useInaraStore((s) => s.cases);
  const {
    setFindingEdit,
    clearFindingEdit,
    saveDoctorEdit,
    approveReport,
    savePlanDraft,
    approvePlan,
    markAnalysisRun,
    markUnderReview,
    setTargetOverride,
    revertTargetOverride,
  } = useInaraStore.getState();

  const current = useMemo(() => activeCase(cases, patientId), [cases, patientId]);
  const otherOpen = useMemo(
    () => cases.filter((c) => c.patientId === patientId && isOpen(c) && c.id !== current?.id),
    [cases, patientId, current],
  );
  const reports = useMemo(() => selectReports(allReports, patientId), [allReports, patientId]);
  const report = reports.at(-1);
  const analysis = useMemo(
    () => (patient ? runAnalysis(patient, reports, targetOverrides) : null),
    [patient, reports, targetOverrides],
  );
  const checkContext = useMemo(() => (patient ? buildCheckContext(patient, reports) : null), [patient, reports]);
  const findings = useMemo(() => analysis?.findings ?? (patient ? getFindings(patient, reports) : []), [analysis, patient, reports]);

  const approved = report ? approvedVersion(report) : undefined;
  const locked = !!approved;
  // Once approved, show exactly the finding choices that were signed off.
  const edits = (locked ? approved?.findingEdits : report && findingReviews[report.id]) ?? NO_EDITS;
  const kept = useMemo(() => applyFindingEdits(findings, edits), [findings, edits]);
  const generated = useMemo(
    () =>
      report && analysis && patient
        ? buildDrafts(findings, edits, analysis.allTrends, report.values, reports.length, activeMedications(patient.currentMedications))
        : { clinical: "", patient: "" },
    [findings, edits, analysis, report, reports.length, patient],
  );

  const stage = report ? reviewStage(report, plans) : "awaiting_review";
  // Already-approved reports count as analysed (no forced re-run).
  const analysedAt = report ? analysisRuns[report.id] : undefined;
  const analysed = !!analysedAt || locked;

  const [step, setStep] = useState(stage !== "awaiting_review" ? TREATMENT : analysed ? ANALYSIS : RECORD);
  const [visitedRecord, setVisitedRecord] = useState(false);
  /** Unsaved text in the approval text areas; null = show the default below. */
  const [typed, setTyped] = useState<Drafts | null>(null);

  if (!patient) return <EmptyState title="Patient not found">This patient record doesn’t exist.</EmptyState>;
  if (!report || !analysis) {
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

  const steps = [
    { label: "Patient record", done: visitedRecord || analysed },
    { label: "Lab report & analysis", done: analysed },
    { label: "Approval", done: locked, locked: analysed ? undefined : "Run the analysis first" },
    { label: "Treatment", done: stage === "complete", locked: locked ? undefined : "Approve the report first" },
  ];

  const goTo = (i: number) => {
    const reason = steps[i].locked;
    if (reason) {
      toast.info(reason);
      return;
    }
    if (step === RECORD) setVisitedRecord(true);
    if (i === APPROVAL && report) markUnderReview(report.id);
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <Link href="/doctor" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700">
        <ChevronLeft className="size-4" /> My patients
      </Link>
      <PatientHeader patient={patient} report={report} status={last?.status ?? "ai_draft"} />
      {current && <CaseProgress c={current} otherOpen={otherOpen} />}
      <Stepper steps={steps} current={step} onSelect={goTo} />

      {step === RECORD && (
        <RecordStep
          patient={patient}
          reports={reports}
          findings={findings}
          doctorName={doctorName}
          onOpenLatest={() => goTo(ANALYSIS)}
        />
      )}

      {step === ANALYSIS && (
        <AnalysisStep
          patient={patient}
          reports={reports}
          report={report}
          analysis={analysis}
          analysedAt={analysedAt}
          edits={edits}
          locked={locked}
          onComplete={() => {
            markAnalysisRun(report.id);
            toast.success("Analysis complete");
          }}
          onEdit={(id, patch) => setFindingEdit(report.id, id, patch)}
          onClearEdit={(id) => clearFindingEdit(report.id, id)}
          onOverride={(testKey, o) => {
            setTargetOverride({ patientId: patient.id, testKey, ...o, author: doctorName });
            toast.success("Target set for this patient");
          }}
          onRevert={(testKey) => {
            revertTargetOverride(patient.id, testKey);
            toast.success("Reverted to the guideline target");
          }}
          onContinue={() => {
            markUnderReview(report.id);
            setStep(APPROVAL);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {step === APPROVAL && (
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
            setStep(TREATMENT);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onNext={() => goTo(TREATMENT)}
        />
      )}

      {step === TREATMENT && (
        <PlanStep
          patient={patient}
          checkContext={checkContext!}
          medNotes={analysis.medNotes}
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
            toast.success(`Treatment plan released to ${patient.name}. Current medications updated.`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onBackToDraft={() => goTo(APPROVAL)}
        />
      )}
    </div>
  );
}
