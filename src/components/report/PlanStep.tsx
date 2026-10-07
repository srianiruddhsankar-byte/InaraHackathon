"use client";

import { useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import { Check, CheckCircle2, Lightbulb, Plus, Save, ShieldCheck, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FORMULARY_NOTE } from "@/lib/formulary";
import { confirmDefaults, customMedication, editMedication, medicationFromFormulary, unconfirmedCount } from "@/lib/medEntry";
import type { MedNote } from "@/lib/medContext";
import {
  blockRules,
  checkPlan,
  isMedicationSavable,
  type CheckContext,
  type PrescriptionAlert,
} from "@/lib/prescriptionChecks";
import { activeMedications } from "@/lib/record";
import {
  planVersions,
  suggestPlanItems,
  suggestReviewDate,
  type PlanContent,
} from "@/lib/treatment";
import type { CurrentMedication, Finding, FollowUpTest, Medication, Patient, StoppedMedication, TreatmentPlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { CurrentMedsPanel } from "./CurrentMedsPanel";
import { MedicationRow } from "./MedicationRow";
import { MedicineSearch } from "./MedicineSearch";
import { PlanView } from "./PlanView";
import { VersionTimeline } from "./VersionTimeline";

type MedRow = Medication & { uid: string };
type LifestyleItem = { text: string; suggested: boolean };
type TestRow = FollowUpTest & { uid: string; suggested: boolean };

interface FormState {
  medications: MedRow[];
  stopMedications: StoppedMedication[];
  lifestyle: LifestyleItem[];
  followUpTests: TestRow[];
  nextReviewDate: string;
  doctorNotes: string;
}

/** From the last saved draft if there is one, otherwise from the non-drug suggestions. */
function initialForm(draft: TreatmentPlan | undefined, findings: Finding[]): FormState {
  if (draft) {
    return {
      medications: draft.medications.map((m) => ({ ...m, uid: nanoid() })),
      stopMedications: draft.stopMedications ?? [],
      lifestyle: draft.lifestyle.map((text) => ({ text, suggested: false })),
      followUpTests: draft.followUpTests.map((t) => ({ ...t, uid: nanoid(), suggested: false })),
      nextReviewDate: draft.nextReviewDate,
      doctorNotes: draft.doctorNotes,
    };
  }
  const s = suggestPlanItems(findings);
  return {
    medications: [],
    stopMedications: [],
    lifestyle: s.lifestyle.map((text) => ({ text, suggested: true })),
    followUpTests: s.followUpTests.map((t) => ({ ...t, uid: nanoid(), suggested: true })),
    nextReviewDate: suggestReviewDate(useInaraStore.getState().today(), s.followUpTests),
    doctorNotes: "",
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Medicines the patient keeps taking: active current medicines minus those being stopped. */
function continuingMeds(current: CurrentMedication[], stopping: StoppedMedication[]): CurrentMedication[] {
  return activeMedications(current).filter((c) => !stopping.some((s) => sameName(s.name, c.name)));
}

/** Saved form: overrides are kept only while a block applies, stamped with the rules they cover. */
function toContent(f: FormState, alerts: PrescriptionAlert[][]): PlanContent {
  return {
    medications: f.medications.map((m, i) => {
      const rules = blockRules(alerts[i] ?? []);
      const med: Medication = {
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
        formularyId: m.formularyId,
        custom: m.custom,
        foodTiming: m.foodTiming,
      };
      if (m.unconfirmedDefaults?.length) med.unconfirmedDefaults = m.unconfirmedDefaults;
      if (rules.length && m.override?.reason.trim()) med.override = { ...m.override, rules };
      return med;
    }),
    stopMedications: f.stopMedications,
    lifestyle: f.lifestyle.map((l) => l.text),
    followUpTests: f.followUpTests.map((t) => ({ testKey: t.testKey, name: t.name, inWeeks: t.inWeeks })),
    nextReviewDate: f.nextReviewDate,
    doctorNotes: f.doctorNotes,
  };
}

function SuggestedTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">
      <Lightbulb className="size-3" aria-hidden /> Suggested from findings
    </span>
  );
}

function Panel({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PlanStep({
  patient,
  checkContext,
  medNotes,
  doctorName,
  reportId,
  findings,
  plans,
  reportApproved,
  onSaveDraft,
  onApprove,
  onBackToDraft,
}: {
  patient: Patient;
  /** Lab facts from the latest report, for prescription safety checks. */
  checkContext: CheckContext;
  /** Analysis notes about current medicines (e.g. NSAID + kidney finding). */
  medNotes: MedNote[];
  doctorName: string;
  reportId: string;
  /** The findings the doctor kept — used only for non-drug suggestions. */
  findings: Finding[];
  plans: TreatmentPlan[];
  reportApproved: boolean;
  onSaveDraft: (c: PlanContent) => void;
  onApprove: (c: PlanContent) => void;
  onBackToDraft: () => void;
}) {
  const versions = planVersions(plans, reportId);
  const approved = versions.find((p) => p.status === "approved");
  const [form, setForm] = useState<FormState>(() => initialForm(versions.at(-1), findings));
  const [customLifestyle, setCustomLifestyle] = useState("");
  const [confirming, setConfirming] = useState(false);
  const patientName = patient.name;

  if (!reportApproved) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="font-medium text-slate-900">Approve the report first</p>
        <p className="mt-2 text-sm text-slate-500">The treatment plan opens once the report has been approved and released.</p>
        <Button variant="outline" className="mt-4" onClick={onBackToDraft}>
          Go to Edit & approve
        </Button>
      </div>
    );
  }

  const timeline = versions.map((p) => ({
    id: p.id,
    label: p.status === "approved" ? "Plan approved & released" : "Plan draft saved",
    tone: p.status === "approved" ? ("approved" as const) : ("edit" as const),
    author: p.author,
    timestamp: p.timestamp,
  }));

  if (approved) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl bg-teal-600 p-8 text-center text-white shadow-sm">
            <CheckCircle2 className="mx-auto size-12" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">Report and treatment plan released to {patientName}</h2>
            <p className="mt-1 text-sm text-teal-50">
              {patientName} can now see the approved explanation and this plan in their own app.
            </p>
            <Link
              href="/doctor"
              className={cn(buttonVariants({ size: "lg" }), "mt-5 h-10 bg-white px-4 text-teal-800 hover:bg-teal-50")}
            >
              Back to dashboard
            </Link>
          </section>
          <Panel title="Approved treatment plan" hint="Locked — approved plans can’t be edited.">
            <PlanView plan={approved} forDoctor />
          </Panel>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <VersionTimeline title="Plan versions" items={timeline} />
        </aside>
      </div>
    );
  }

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setMed = (uid: string, patch: Partial<Medication>) =>
    update({ medications: form.medications.map((m) => (m.uid === uid ? { ...editMedication(m, patch), uid } : m)) });
  const confirmMed = (uid: string) =>
    update({ medications: form.medications.map((m) => (m.uid === uid ? { ...confirmDefaults(m), uid } : m)) });
  const setTest = (uid: string, patch: Partial<TestRow>) =>
    update({
      followUpTests: form.followUpTests.map((t) =>
        t.uid === uid ? { ...t, ...patch, suggested: false, ...(patch.name !== undefined ? { testKey: undefined } : {}) } : t,
      ),
    });
  const addLifestyle = () => {
    const text = customLifestyle.trim();
    if (!text || form.lifestyle.some((l) => l.text === text)) return;
    update({ lifestyle: [...form.lifestyle, { text, suggested: false }] });
    setCustomLifestyle("");
  };

  // Live safety checks: re-run on every change to the plan or the stop list.
  const continuing = continuingMeds(patient.currentMedications, form.stopMedications);
  const alerts = checkPlan(form.medications, patient, checkContext, continuing);
  const unresolved = form.medications.filter((m, i) => !isMedicationSavable(m, alerts[i])).length;
  const unconfirmed = unconfirmedCount(form.medications);
  const flags: Record<string, string[]> = {};
  for (const n of medNotes) (flags[n.medication] ??= []).push(n.text);

  const pendingSuggestions =
    form.lifestyle.filter((l) => l.suggested).length + form.followUpTests.filter((t) => t.suggested).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        <Panel
          title="Current medications"
          hint="Stop a medicine (with a reason) to list it under “Medicines to stop” in this plan."
        >
          <CurrentMedsPanel
            meds={activeMedications(patient.currentMedications)}
            stopping={form.stopMedications}
            flags={flags}
            onStop={(m, reason) =>
              update({
                stopMedications: [
                  ...form.stopMedications,
                  { name: m.name, dose: m.dose, reason, author: doctorName, timestamp: useInaraStore.getState().now() },
                ],
              })
            }
            onUndo={(name) => update({ stopMedications: form.stopMedications.filter((s) => !sameName(s.name, name)) })}
          />
        </Panel>

        <Panel
          title="New medicines"
          hint="Chosen by you. Inara never suggests medicines — it only checks the ones you add."
        >
          <div className="mb-4">
            <MedicineSearch
              onPick={(e) => update({ medications: [...form.medications, { ...medicationFromFormulary(e), uid: nanoid() }] })}
              onCustom={(name) => update({ medications: [...form.medications, { ...customMedication(name), uid: nanoid() }] })}
            />
          </div>
          {form.medications.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              No medicines added. Search above, or approve a lifestyle-only plan.
            </p>
          ) : (
            <div className="space-y-3">
              {form.medications.map((m, i) => (
                <MedicationRow
                  key={m.uid}
                  med={m}
                  alerts={alerts[i]}
                  doctorName={doctorName}
                  onChange={(patch) => setMed(m.uid, patch)}
                  onConfirmDefaults={() => confirmMed(m.uid)}
                  onRemove={() => update({ medications: form.medications.filter((x) => x.uid !== m.uid) })}
                />
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            {FORMULARY_NOTE} Safety checks use the latest lab report and are decision support, not a substitute for
            clinical judgement.
          </p>
        </Panel>

        <Panel
          title="Lifestyle advice"
          hint="Accept or remove suggestions, or add your own."
          action={
            form.lifestyle.some((l) => l.suggested) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => update({ lifestyle: form.lifestyle.map((l) => ({ ...l, suggested: false })) })}
              >
                <Check /> Accept all
              </Button>
            ) : undefined
          }
        >
          {form.lifestyle.length === 0 && <p className="mb-3 text-sm text-slate-500">No lifestyle advice yet.</p>}
          <ul className="space-y-2">
            {form.lifestyle.map((l) => (
              <li
                key={l.text}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                  l.suggested ? "border-dashed border-violet-300 bg-violet-50/40" : "border-slate-200 bg-white",
                )}
              >
                <span className="min-w-0 flex-1 text-slate-800">{l.text}</span>
                {l.suggested && <SuggestedTag />}
                {l.suggested && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Accept suggestion"
                    onClick={() =>
                      update({ lifestyle: form.lifestyle.map((x) => (x.text === l.text ? { ...x, suggested: false } : x)) })
                    }
                  >
                    <Check className="text-teal-700" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove"
                  onClick={() => update({ lifestyle: form.lifestyle.filter((x) => x.text !== l.text) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="Add your own advice…"
              value={customLifestyle}
              onChange={(e) => setCustomLifestyle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLifestyle())}
            />
            <Button variant="outline" onClick={addLifestyle} disabled={!customLifestyle.trim()}>
              <Plus /> Add
            </Button>
          </div>
        </Panel>

        <Panel
          title="Follow-up tests"
          hint="Edit the test or timing; edited items become yours."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                update({ followUpTests: [...form.followUpTests, { uid: nanoid(), name: "", inWeeks: 12, suggested: false }] })
              }
            >
              <Plus /> Add test
            </Button>
          }
        >
          {form.followUpTests.length === 0 && <p className="text-sm text-slate-500">No follow-up tests.</p>}
          <ul className="space-y-2">
            {form.followUpTests.map((t) => (
              <li key={t.uid} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Test name"
                  placeholder="Test name"
                  value={t.name}
                  onChange={(e) => setTest(t.uid, { name: e.target.value })}
                  className="min-w-40 flex-1"
                />
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  in
                  <Input
                    type="number"
                    min={0}
                    aria-label="Weeks (0 = within 1–2 days)"
                    title="0 = within 1–2 days"
                    value={t.inWeeks}
                    onChange={(e) => setTest(t.uid, { inWeeks: Number(e.target.value) })}
                    className="w-16"
                  />
                  weeks
                </label>
                {t.suggested && <SuggestedTag />}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove test"
                  onClick={() => update({ followUpTests: form.followUpTests.filter((x) => x.uid !== t.uid) })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <Panel title="Next review">
            <Input
              type="date"
              aria-label="Next review date"
              value={form.nextReviewDate}
              onChange={(e) => update({ nextReviewDate: e.target.value })}
            />
          </Panel>
          <Panel title="Doctor notes" hint="Visible to doctors only.">
            <Textarea
              value={form.doctorNotes}
              onChange={(e) => update({ doctorNotes: e.target.value })}
              placeholder="e.g. Discussed results with patient; will review after repeat tests."
              rows={3}
            />
          </Panel>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingSuggestions > 0 && (
            <p className="mr-auto text-xs text-slate-500">
              {pendingSuggestions} suggested item{pendingSuggestions === 1 ? "" : "s"} still listed — they’ll be included
              unless you remove them.
            </p>
          )}
          {unresolved > 0 && (
            <p className="mr-auto text-xs font-medium text-red-700">
              {unresolved} blocked medicine{unresolved === 1 ? "" : "s"} — remove, or tick Override and give a reason, to
              save.
            </p>
          )}
          {unconfirmed > 0 && (
            <p className="mr-auto text-xs font-medium text-amber-800">
              {unconfirmed} medicine{unconfirmed === 1 ? " has" : "s have"} defaults to confirm before approval.
            </p>
          )}
          <Button variant="outline" onClick={() => onSaveDraft(toContent(form, alerts))} disabled={unresolved > 0}>
            <Save /> Save draft
          </Button>
          <Button
            size="lg"
            className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700"
            onClick={() => setConfirming(true)}
            disabled={!form.nextReviewDate || unresolved > 0 || unconfirmed > 0}
          >
            <ShieldCheck /> Approve plan
          </Button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <VersionTimeline title="Plan versions" items={timeline} empty="Not saved yet." />
      </aside>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Approve treatment plan?"
        confirmLabel="Approve plan"
        onConfirm={() => onApprove(toContent(form, alerts))}
      >
        <p>
          This will release the treatment plan to <span className="font-medium text-slate-900">{patientName}</span>.
          You are signing as <span className="font-medium text-slate-900">{doctorName}</span>.
        </p>
        <p className="text-xs">
          {form.medications.filter((m) => m.name.trim()).length} new medicine(s), {form.stopMedications.length} to
          stop, {form.lifestyle.length} lifestyle item(s),{" "}
          {form.followUpTests.filter((t) => t.name.trim()).length} follow-up test(s). Approved plans can’t be edited.
          {form.medications.some((m) => m.override) && " Safety overrides are recorded with your name, time and reason."}
        </p>
      </ConfirmDialog>
    </div>
  );
}
