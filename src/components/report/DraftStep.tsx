"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Info, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Drafts } from "@/lib/review";
import type { Report, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiDraftBadge } from "./badges";
import { ConfirmDialog } from "./ConfirmDialog";
import { VersionTimeline, type TimelineItem } from "./VersionTimeline";

const VERSION_LABEL: Record<ReportStatus, { label: string; tone: TimelineItem["tone"] }> = {
  ai_draft: { label: "AI draft generated", tone: "ai" },
  doctor_edited: { label: "Doctor edited", tone: "edit" },
  approved: { label: "Approved & released", tone: "approved" },
};

function TextBadge({ locked, isAi }: { locked: boolean; isAi: boolean }) {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">
        <CheckCircle2 className="size-3" /> Approved
      </span>
    );
  }
  if (isAi) return <AiDraftBadge />;
  return (
    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
      Edited by doctor
    </span>
  );
}

function DraftField({
  label,
  hint,
  value,
  onChange,
  locked,
  isAi,
  rows,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
  isAi: boolean;
  rows: number;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        <TextBadge locked={locked} isAi={isAi} />
      </div>
      <Textarea
        value={value}
        readOnly={locked}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={cn(
          "field-sizing-fixed min-h-0 resize-y font-[inherit] leading-relaxed",
          isAi && !locked && "bg-violet-50/30",
          locked && "bg-slate-50 text-slate-700",
        )}
      />
    </section>
  );
}

export function DraftStep({
  patientName,
  doctorName,
  report,
  generated,
  texts,
  onChange,
  locked,
  findingsChanged,
  onSave,
  onApprove,
  onNext,
}: {
  patientName: string;
  doctorName: string;
  report: Report;
  /** Fresh AI drafts from the findings the doctor kept. */
  generated: Drafts;
  /** What's in the two text areas now. */
  texts: Drafts;
  onChange: (t: Drafts) => void;
  locked: boolean;
  /** Findings were changed after the last saved edit, so the text may be stale. */
  findingsChanged: boolean;
  onSave: () => void;
  onApprove: () => void;
  onNext: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const last = report.versions.at(-1);
  const unsaved = last?.text !== texts.clinical || last?.patientText !== texts.patient;
  const isAi = (field: keyof Drafts) => texts[field] === generated[field];
  const empty = !texts.clinical.trim() || !texts.patient.trim();

  const timeline: TimelineItem[] = report.versions.map((v) => ({
    id: v.id,
    label: VERSION_LABEL[v.status].label,
    tone: VERSION_LABEL[v.status].tone,
    author: v.author,
    timestamp: v.timestamp,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        {!locked && findingsChanged && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            You changed the findings after your last saved edit. Use “Reset to AI draft” to rebuild the text from the
            current findings.
          </p>
        )}

        <DraftField
          label="Clinical summary (doctor only)"
          hint="Never shown to the patient."
          value={texts.clinical}
          onChange={(clinical) => onChange({ ...texts, clinical })}
          locked={locked}
          isAi={isAi("clinical")}
          rows={18}
        />
        <DraftField
          label="Patient explanation (what the patient will see)"
          hint={`${patientName} sees this text only after you approve.`}
          value={texts.patient}
          onChange={(patient) => onChange({ ...texts, patient })}
          locked={locked}
          isAi={isAi("patient")}
          rows={14}
        />

        {locked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-teal-50 px-4 py-3 ring-1 ring-teal-200">
            <p className="flex items-center gap-2 text-sm text-teal-900">
              <ShieldCheck className="size-4" aria-hidden />
              Approved by {report.versions.find((v) => v.status === "approved")?.author}. Approved reports can’t be edited.
            </p>
            <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={onNext}>
              Treatment plan <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onChange(generated)}
              disabled={isAi("clinical") && isAi("patient")}
            >
              <RotateCcw /> Reset to AI draft
            </Button>
            <Button variant="outline" onClick={onSave} disabled={!unsaved || empty}>
              <Save /> Save edit
            </Button>
            <Button
              size="lg"
              className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700"
              onClick={() => setConfirming(true)}
              disabled={empty}
            >
              <ShieldCheck /> Approve & release
            </Button>
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <VersionTimeline title="Version history" items={timeline} />
        <p className="px-1 text-xs text-slate-500">
          AI text stays marked <span className="font-medium text-violet-700">AI DRAFT</span> until you change it.
        </p>
      </aside>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Approve & release report?"
        confirmLabel="Approve & release"
        onConfirm={onApprove}
      >
        <p>
          This will release the report to <span className="font-medium text-slate-900">{patientName}</span>. You are
          signing as <span className="font-medium text-slate-900">{doctorName}</span>.
        </p>
        <p className="text-xs">
          The patient will see the patient explanation only. The clinical summary stays doctor-only. Approved reports
          can’t be edited later.
        </p>
      </ConfirmDialog>
    </div>
  );
}
