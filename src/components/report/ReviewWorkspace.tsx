"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, FileText, FlaskConical, Sparkles, Users, Watch } from "lucide-react";
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
import { activeCase, caseForReport, isOpen } from "@/lib/workflow";
import { findingsContextFor } from "@/lib/caseContext";
import { selectReports, useCurrentUser, useInaraStore } from "@/store/useInaraStore";
import { AnalysisStep } from "./AnalysisStep";
import { DraftStep } from "./DraftStep";
import { PatientHeader } from "./PatientHeader";
import { PlanStep } from "./PlanStep";
import { RecordStep } from "./RecordStep";
import { RawLabReport } from "./RawLabReport";
import { SidebarLayout, setSectionInUrl, useSection, type SidebarGroup } from "@/components/layout/SidebarLayout";
import { OutcomePanel } from "@/components/wearable/OutcomePanel";
import { WearablePanel } from "@/components/wearable/WearablePanel";
import { deriveEpisode } from "@/lib/wearable/checkin";

const NO_EDITS: FindingEdits = {};

const SECTIONS = ["record", "lab", "analysis", "treatment", "wearable"] as const;
type Section = (typeof SECTIONS)[number];

function scrollToApproval() {
  // After the section renders: the approval step sits below the analysis.
  requestAnimationFrame(() => document.getElementById("approval")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export function ReviewWorkspace({ patientId }: { patientId: string }) {
  const doctor = useCurrentUser();
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const allReports = useInaraStore((s) => s.reports);
  const plans = useInaraStore((s) => s.treatmentPlans);
  const findingReviews = useInaraStore((s) => s.findingReviews);
  const analysisRuns = useInaraStore((s) => s.analysisRuns);
  const targetOverrides = useInaraStore((s) => s.targetOverrides);
  const cases = useInaraStore((s) => s.cases);
  const wearableEvents = useInaraStore((s) => s.wearableEvents);
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
  // A case raised by a wearable alert: its outcome can be recorded from the case too.
  const alertEpisode = useMemo(
    () => (current?.origin === "wearable" && current.episodeId ? deriveEpisode(wearableEvents, current.episodeId) : null),
    [current, wearableEvents],
  );
  const otherOpen = useMemo(
    () => cases.filter((c) => c.patientId === patientId && isOpen(c) && c.id !== current?.id),
    [cases, patientId, current],
  );
  const reports = useMemo(() => selectReports(allReports, patientId), [allReports, patientId]);
  const report = reports.at(-1);
  // The case behind the shown report: its suspected disease and any wearable alert that started it.
  const context = useMemo(
    () => findingsContextFor(report ? caseForReport(cases, report.id) : undefined, wearableEvents),
    [report, cases, wearableEvents],
  );
  const analysis = useMemo(
    () => (patient ? runAnalysis(patient, reports, targetOverrides, context) : null),
    [patient, reports, targetOverrides, context],
  );
  const checkContext = useMemo(
    () => (patient ? buildCheckContext(patient, reports, { suspectedDisease: context.suspectedDisease }) : null),
    [patient, reports, context.suspectedDisease],
  );
  const findings = useMemo(
    () => analysis?.findings ?? (patient ? getFindings(patient, reports, context) : []),
    [analysis, patient, reports, context],
  );

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

  const params = useSearchParams();
  // Patients without a lab case (e.g. wearable-only, at most an old routine report) open on Wearable;
  // old links with ?view=wearable (from the alerts list) still open it.
  const fallback: Section =
    params?.get("view") === "wearable" || !report || !current
      ? "wearable"
      : stage !== "awaiting_review"
        ? "treatment"
        : analysed
          ? "analysis"
          : "record";
  const section = useSection(SECTIONS, fallback, params);
  const [visitedRecord, setVisitedRecord] = useState(false);
  /** Unsaved text in the approval text areas; null = show the default below. */
  const [typed, setTyped] = useState<Drafts | null>(null);

  if (!patient) return <EmptyState title="Patient not found">This patient record doesn’t exist.</EmptyState>;

  const approvalLocked = analysed ? undefined : "Run the analysis first";
  const treatmentLocked = !report ? "No lab report yet" : locked ? undefined : "Approve the report first";
  const goTo = (to: Section) => {
    if (to === "treatment" && treatmentLocked) {
      toast.info(treatmentLocked);
      return;
    }
    if (section === "record") setVisitedRecord(true);
    setSectionInUrl(to);
  };
  const groups: SidebarGroup[] = [
    { items: [{ id: "patients", label: "My patients", icon: Users, href: "/doctor" }] },
    {
      label: "Case review",
      items: [
        { id: "record", label: "Patient's Record", icon: FileText, active: section === "record", done: visitedRecord || analysed, onSelect: () => goTo("record") },
        { id: "lab", label: "Lab Report", icon: FlaskConical, active: section === "lab", onSelect: () => goTo("lab") },
        { id: "analysis", label: "AI Analysis", icon: Sparkles, active: section === "analysis", done: locked, onSelect: () => goTo("analysis") },
        {
          id: "treatment",
          label: "Prescription & Treatment Plan",
          icon: ClipboardList,
          active: section === "treatment",
          done: stage === "complete",
          locked: treatmentLocked,
          onSelect: () => goTo("treatment"),
        },
      ],
    },
    { label: "Monitoring", items: [{ id: "wearable", label: "Wearable", icon: Watch, active: section === "wearable", onSelect: () => goTo("wearable") }] },
  ];
  const header = (
    <>
      <PatientHeader patient={patient} report={report} status={report ? (latestVersion(report)?.status ?? "ai_draft") : undefined} />
      {current && <CaseProgress c={current} otherOpen={otherOpen} />}
    </>
  );

  if (!report || !analysis) {
    return (
      <SidebarLayout title={patient.name} groups={groups}>
        <div className="space-y-6">
          {header}
          {section === "wearable" ? (
            <WearablePanel patientId={patient.id} audience="doctor" />
          ) : section === "record" ? (
            <RecordStep patient={patient} reports={reports} findings={findings} doctorName={doctor?.name ?? "Doctor"} onOpenLatest={() => goTo("analysis")} />
          ) : (
            <EmptyState title={`No reports for ${patient.name} yet`}>Reports appear here after the lab uploads results.</EmptyState>
          )}
        </div>
      </SidebarLayout>
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

  return (
    <SidebarLayout title={patient.name} groups={groups}>
    <div className="space-y-6">
      {header}
      {section === "wearable" && <WearablePanel patientId={patient.id} audience="doctor" />}
      {section !== "wearable" && alertEpisode && <OutcomePanel episode={alertEpisode} />}

      {section === "lab" && <RawLabReport reports={[...reports].reverse()} audience="doctor" />}

      {section === "record" && (
        <RecordStep
          patient={patient}
          reports={reports}
          findings={findings}
          doctorName={doctorName}
          onOpenLatest={() => goTo("analysis")}
        />
      )}

      {section === "analysis" && (
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
          wearable={context.wearable}
          suspectedDisease={context.suspectedDisease}
          onContinue={() => {
            markUnderReview(report.id);
            scrollToApproval();
          }}
          onOpenRaw={() => goTo("lab")}
        />
      )}

      {section === "analysis" && approvalLocked && (
        <p id="approval" className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Approval opens after you run the analysis.
        </p>
      )}

      {section === "analysis" && !approvalLocked && (
        <div id="approval" className="scroll-mt-24 space-y-3 border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold text-slate-900">Edit and approve</h2>
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
            setSectionInUrl("treatment");
          }}
          onNext={() => setSectionInUrl("treatment")}
        />
        </div>
      )}

      {section === "treatment" && !treatmentLocked && (
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
          onBackToDraft={() => {
            goTo("analysis");
            scrollToApproval();
          }}
        />
      )}
    </div>
    </SidebarLayout>
  );
}
