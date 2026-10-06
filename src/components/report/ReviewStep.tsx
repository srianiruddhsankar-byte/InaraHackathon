"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRight, ChevronDown, Lock, Sparkles } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Button } from "@/components/ui/button";
import {
  chartKeysFor,
  findingChips,
  labRows,
  trendDecimals,
  trendLabel,
  trendName,
  trendRange,
  trendUnit,
} from "@/lib/review";
import { TEST_KEYS } from "@/lib/tests";
import { findTrend, seriesFor } from "@/lib/trends";
import type { Finding, FindingEdit, FindingEdits, Patient, Report, Trend, TrendKey } from "@/lib/types";
import { FindingCard } from "./FindingCard";
import { LabTable } from "./LabTable";

const ALL_TREND_KEYS: TrendKey[] = [...TEST_KEYS.slice(0, 7), "egfr", ...TEST_KEYS.slice(7)];

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ReviewStep({
  patient,
  reports,
  report,
  findings,
  trends,
  edits,
  locked,
  onEdit,
  onClearEdit,
  onContinue,
}: {
  patient: Patient;
  reports: Report[];
  report: Report;
  findings: Finding[];
  trends: Trend[];
  edits: FindingEdits;
  locked: boolean;
  onEdit: (findingId: string, patch: Partial<FindingEdit>) => void;
  onClearEdit: (findingId: string) => void;
  onContinue: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const previous = reports.length >= 2 ? reports[reports.length - 2] : undefined;
  const rows = useMemo(() => labRows(report, previous, patient.sex), [report, previous, patient.sex]);
  const primaryKeys = useMemo(() => chartKeysFor(findings), [findings]);
  const otherKeys = ALL_TREND_KEYS.filter((k) => !primaryKeys.includes(k));
  const chartKeys = primaryKeys.length === 0 || showAll ? [...primaryKeys, ...otherKeys] : primaryKeys;

  const suspected = findings.filter((f) => f.category === "suspected");
  const others = findings.filter((f) => f.category !== "suspected");
  const egfrLabel = (() => {
    const t = findTrend(trends, "egfr");
    const l = t && reports.length >= 2 ? trendLabel(t) : undefined;
    return l?.main === "Rapid decline" ? l : undefined;
  })();

  const card = (f: Finding, large = false) => (
    <FindingCard
      key={f.id}
      finding={f}
      edit={edits[f.id]}
      chips={findingChips(f, trends)}
      statusLabel={f.screen === "kidney" ? egfrLabel : undefined}
      large={large}
      readOnly={locked}
      onToggle={(included) => onEdit(f.id, { included })}
      onSaveWording={(w) => onEdit(f.id, w)}
      onResetWording={() =>
        edits[f.id]?.included === false
          ? onEdit(f.id, { title: undefined, summary: undefined, recommendation: undefined })
          : onClearEdit(f.id)
      }
    />
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-violet-200">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        <p className="flex-1">
          <span className="font-semibold">AI analysis</span> · based on {reports.length - 1} previous report
          {reports.length - 1 === 1 ? "" : "s"} + this report · <span className="font-medium">requires doctor review</span>
        </p>
        {locked && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
            <Lock className="size-3.5" aria-hidden /> Approved — read-only
          </span>
        )}
      </div>

      <section>
        <SectionTitle
          title="Suspected condition"
          hint={`Doctor’s suspected condition, screened first · ${patient.suspectedDisease}`}
        />
        {suspected.length ? (
          <div className="space-y-4">{suspected.map((f) => card(f, true))}</div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            “{patient.suspectedDisease}” does not map to a specific screen, so the whole panel was screened.
          </p>
        )}
      </section>

      <section>
        <SectionTitle
          title="Also detected from the same panel"
          hint={locked ? undefined : "Toggle or reword findings — your choices flow into the draft."}
        />
        <div className="grid gap-4 lg:grid-cols-2">{others.map((f) => card(f))}</div>
      </section>

      <section>
        <SectionTitle
          title={primaryKeys.length ? "Trends behind these findings" : "Trends"}
          hint={`${reports.length} reports · shaded band = normal range · large dot = this report`}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chartKeys.map((key) => (
            <TrendChart
              key={key}
              title={trendName(key)}
              unit={trendUnit(key)}
              decimals={trendDecimals(key)}
              points={seriesFor(patient, reports, key)}
              range={trendRange(key, patient.sex)}
              trend={findTrend(trends, key)}
            />
          ))}
        </div>
        {primaryKeys.length > 0 && (
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              <ChevronDown className={showAll ? "rotate-180" : undefined} />
              {showAll ? "Show fewer trends" : `Show all trends (${otherKeys.length} more)`}
            </Button>
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          title="Lab values"
          hint={`${format(parseISO(report.date), "d MMM yyyy")} · ${report.labName}`}
        />
        <LabTable rows={rows} previousDate={previous ? format(parseISO(previous.date), "MMM yyyy") : undefined} />
      </section>

      <div className="flex justify-end">
        <Button size="lg" className="h-10 bg-teal-600 px-4 text-white hover:bg-teal-700" onClick={onContinue}>
          {locked ? "View approved report" : "Continue to edit draft"}
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
