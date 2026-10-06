"use client";

import { useState } from "react";
import Link from "next/link";
import { nanoid } from "nanoid";
import { format } from "date-fns";
import { Check, CheckCircle2, Lightbulb, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyMedication,
  planVersions,
  suggestPlanItems,
  suggestReviewDate,
  type PlanContent,
} from "@/lib/treatment";
import type { Finding, FollowUpTest, Medication, TreatmentPlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { PlanView } from "./PlanView";
import { VersionTimeline } from "./VersionTimeline";

type MedRow = Medication & { uid: string };
type LifestyleItem = { text: string; suggested: boolean };
type TestRow = FollowUpTest & { uid: string; suggested: boolean };

interface FormState {
  medications: MedRow[];
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
      lifestyle: draft.lifestyle.map((text) => ({ text, suggested: false })),
      followUpTests: draft.followUpTests.map((t) => ({ ...t, uid: nanoid(), suggested: false })),
      nextReviewDate: draft.nextReviewDate,
      doctorNotes: draft.doctorNotes,
    };
  }
  const s = suggestPlanItems(findings);
  return {
    medications: [],
    lifestyle: s.lifestyle.map((text) => ({ text, suggested: true })),
    followUpTests: s.followUpTests.map((t) => ({ ...t, uid: nanoid(), suggested: true })),
    nextReviewDate: suggestReviewDate(format(new Date(), "yyyy-MM-dd"), s.followUpTests),
    doctorNotes: "",
  };
}

function toContent(f: FormState): PlanContent {
  return {
    medications: f.medications.map((m) => ({
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      duration: m.duration,
      instructions: m.instructions,
    })),
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
  patientName,
  doctorName,
  reportId,
  findings,
  plans,
  reportApproved,
  onSaveDraft,
  onApprove,
  onBackToDraft,
}: {
  patientName: string;
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
            <PlanView plan={approved} showNotes />
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
    update({ medications: form.medications.map((m) => (m.uid === uid ? { ...m, ...patch } : m)) });
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
  const pendingSuggestions =
    form.lifestyle.filter((l) => l.suggested).length + form.followUpTests.filter((t) => t.suggested).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        <Panel
          title="Medications"
          hint="Typed by you. Inara never suggests medicines or doses."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => update({ medications: [...form.medications, { ...emptyMedication(), uid: nanoid() }] })}
            >
              <Plus /> Add medicine
            </Button>
          }
        >
          {form.medications.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              No medicines added. Add one, or approve a lifestyle-only plan.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1.4fr_0.9fr_1fr_0.9fr_1.4fr_auto] gap-2 px-1 text-xs font-medium text-slate-500 md:grid">
                <span>Name</span>
                <span>Dose</span>
                <span>Frequency</span>
                <span>Duration</span>
                <span>Instructions</span>
                <span className="w-7" />
              </div>
              {form.medications.map((m) => (
                <div
                  key={m.uid}
                  className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 md:grid-cols-[1.4fr_0.9fr_1fr_0.9fr_1.4fr_auto] md:bg-transparent md:p-0"
                >
                  <Input aria-label="Medicine name" placeholder="Name" value={m.name} onChange={(e) => setMed(m.uid, { name: e.target.value })} className="col-span-2 bg-white md:col-span-1" />
                  <Input aria-label="Dose" placeholder="Dose" value={m.dose} onChange={(e) => setMed(m.uid, { dose: e.target.value })} className="bg-white" />
                  <Input aria-label="Frequency" placeholder="Frequency" value={m.frequency} onChange={(e) => setMed(m.uid, { frequency: e.target.value })} className="bg-white" />
                  <Input aria-label="Duration" placeholder="Duration" value={m.duration} onChange={(e) => setMed(m.uid, { duration: e.target.value })} className="bg-white" />
                  <Input aria-label="Instructions" placeholder="Instructions" value={m.instructions} onChange={(e) => setMed(m.uid, { instructions: e.target.value })} className="bg-white" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove medicine"
                    onClick={() => update({ medications: form.medications.filter((x) => x.uid !== m.uid) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
                    min={1}
                    aria-label="Weeks"
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
          <Button variant="outline" onClick={() => onSaveDraft(toContent(form))}>
            <Save /> Save draft
          </Button>
          <Button
            size="lg"
            className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700"
            onClick={() => setConfirming(true)}
            disabled={!form.nextReviewDate}
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
        onConfirm={() => onApprove(toContent(form))}
      >
        <p>
          This will release the treatment plan to <span className="font-medium text-slate-900">{patientName}</span>.
          You are signing as <span className="font-medium text-slate-900">{doctorName}</span>.
        </p>
        <p className="text-xs">
          {form.medications.filter((m) => m.name.trim()).length} medicine(s), {form.lifestyle.length} lifestyle item(s),{" "}
          {form.followUpTests.filter((t) => t.name.trim()).length} follow-up test(s). Approved plans can’t be edited.
        </p>
      </ConfirmDialog>
    </div>
  );
}
