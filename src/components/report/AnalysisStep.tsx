"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Camera, FileSpreadsheet, FlaskConical, Lock, Minus, Play, RotateCcw, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAYERS, type AnalysisResult } from "@/lib/analysis";
import { labRows } from "@/lib/review";
import type { FindingEdit, FindingEdits, Patient, Report, TestKey, WearableContext } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SEVERITY_STYLE } from "./badges";
import { FindingsPanel, SectionTitle } from "./FindingsPanel";
import { LabTable, type OverrideInput } from "./LabTable";
import { PipelineLayers } from "./PipelineLayers";
import { WearableContextCard } from "./WearableContextCard";

const STEP_MS = 400;

function AbnormalBiomarkers({ analysis }: { analysis: AnalysisResult }) {
  if (analysis.abnormal.length === 0) {
    return (
      <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
        No abnormal biomarkers — every value is in range and stable over time.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <ul className="divide-y divide-slate-100">
        {analysis.abnormal.map((b) => {
          const Arrow = b.direction === "rising" ? ArrowUpRight : b.direction === "falling" ? ArrowDownRight : Minus;
          return (
            <li key={b.key} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-sm">
              <span className="truncate font-medium text-slate-900">{b.name}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{b.value}</span>
              <span className="truncate text-xs text-slate-500 tabular-nums">{b.range}</span>
              <span className="flex items-center justify-end gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", SEVERITY_STYLE[b.tone].badge)}>
                  {b.reason}
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs whitespace-nowrap text-slate-600 tabular-nums" title={b.direction}>
                  <Arrow className="size-3.5" aria-label={b.direction} />
                  {b.slope && b.direction !== "stable" ? b.slope.replace(/\s.*\/yr$/, "/yr") : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AnalysisStep({
  patient,
  reports,
  report,
  analysis,
  analysedAt,
  edits,
  locked,
  onComplete,
  onEdit,
  onClearEdit,
  onOverride,
  onRevert,
  onContinue,
  onOpenRaw,
  wearable,
  suspectedDisease,
}: {
  patient: Patient;
  reports: Report[];
  report: Report;
  analysis: AnalysisResult;
  /** When the analysis was last run (cached); undefined = not run yet. */
  analysedAt?: string;
  edits: FindingEdits;
  locked: boolean;
  onComplete: () => void;
  onEdit: (findingId: string, patch: Partial<FindingEdit>) => void;
  onClearEdit: (findingId: string) => void;
  onOverride: (testKey: TestKey, o: OverrideInput) => void;
  onRevert: (testKey: TestKey) => void;
  onContinue: () => void;
  /** Open the Lab Report section (raw rows as received). */
  onOpenRaw: () => void;
  /** The wearable alert behind this case, if it started from one. */
  wearable?: WearableContext;
  /** The case's suspected disease (e.g. "Dengue (from wearable alert)"). */
  suspectedDisease?: string;
}) {
  // How many layers are revealed: -1 = not started, LAYERS.length = finished.
  const [revealed, setRevealed] = useState(analysedAt || locked ? LAYERS.length : -1);
  const running = revealed >= 0 && revealed < LAYERS.length;
  const done = revealed === LAYERS.length;

  const run = () => {
    setRevealed(0);
    const tick = (n: number) => {
      setTimeout(() => {
        setRevealed(n);
        if (n < LAYERS.length) tick(n + 1);
        else onComplete();
      }, STEP_MS);
    };
    tick(1);
  };

  const previous = reports.length >= 2 ? reports[reports.length - 2] : undefined;
  const rows = useMemo(() => labRows(report, previous, patient.sex), [report, previous, patient.sex]);
  const raw = report.raw ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-violet-200">
        <Workflow className="size-4 shrink-0" aria-hidden />
        <p className="flex-1">
          <span className="font-semibold">Automated analysis (guideline rules + personal trends)</span> · based on{" "}
          {analysis.previousReportCount} previous report{analysis.previousReportCount === 1 ? "" : "s"} + this report ·{" "}
          <span className="font-medium">requires doctor review</span>
        </p>
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
            <Lock className="size-3.5" aria-hidden /> Approved — read-only
          </span>
        )}
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start gap-4">
          {report.photoThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored data-URL thumbnail (the full photo is never kept)
            <img
              src={report.photoThumbnail}
              alt="Thumbnail of the photographed lab report"
              className="h-28 w-auto shrink-0 rounded-lg ring-1 ring-slate-200"
            />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FlaskConical className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Lab report · {format(parseISO(report.date), "d MMMM yyyy")}</h2>
            <p className="text-sm text-slate-600">
              {report.labName}
              {report.receivedAt && <> · received {format(parseISO(report.receivedAt), "d MMM yyyy, HH:mm")}</>} ·{" "}
              {raw.length || report.values.length} values
            </p>
            {report.verifiedBy && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {report.source === "photo" ? <Camera className="size-3.5" aria-hidden /> : <FileSpreadsheet className="size-3.5" aria-hidden />}
                {report.source === "photo" ? "Photo report" : "CSV upload"} · verified by {report.verifiedBy}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {done ? (
              <>
                <Button variant="outline" onClick={run} disabled={running}>
                  <RotateCcw /> Re-run analysis
                </Button>
                {analysedAt && (
                  <span className="text-xs text-slate-500">Analysed {format(parseISO(analysedAt), "d MMM, HH:mm")}</span>
                )}
              </>
            ) : (
              <Button size="lg" className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700" onClick={run} disabled={running}>
                <Play /> {running ? "Running…" : "Run analysis"}
              </Button>
            )}
          </div>
        </div>

        {raw.length > 0 && (
          <button type="button" onClick={onOpenRaw} className="mt-3 text-xs font-medium text-teal-700 hover:underline">
            See the raw lab report ({raw.length} rows as received) →
          </button>
        )}
      </section>

      {wearable && <WearableContextCard context={wearable} />}

      {revealed >= 0 ? (
        <section>
          <SectionTitle title="Analysis pipeline" hint="Each layer is deterministic and explainable" />
          <PipelineLayers analysis={analysis} revealed={revealed} />
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="font-medium text-slate-900">Analysis not run yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Run the analysis to normalise the values, check ranges, apply guideline scores, personal targets and trends.
          </p>
        </div>
      )}

      {done && (
        <>
          <section>
            <SectionTitle title="Abnormal biomarkers" hint="Out of range, missing a personal target, or drifting within range" />
            <AbnormalBiomarkers analysis={analysis} />
          </section>

          <FindingsPanel
            patient={patient}
            reports={reports}
            findings={analysis.findings}
            trends={analysis.allTrends}
            medNotes={analysis.medNotes}
            edits={edits}
            locked={locked}
            onEdit={onEdit}
            onClearEdit={onClearEdit}
            suspectedDisease={suspectedDisease}
          />

          <section>
            <SectionTitle title="Lab values" hint="Population range vs the target for this patient · pencil = set your own target" />
            <LabTable
              rows={rows}
              targets={analysis.targets}
              previousDate={previous ? format(parseISO(previous.date), "MMM yyyy") : undefined}
              onOverride={onOverride}
              onRevert={onRevert}
            />
          </section>

          <div className="flex justify-end">
            <Button size="lg" className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700" onClick={onContinue}>
              {locked ? "View approved report" : "Continue to approval"}
              <ArrowRight />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
