"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Button } from "@/components/ui/button";
import { notesFor, type MedNote } from "@/lib/medContext";
import {
  chartKeysFor,
  findingChips,
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

const ALL_TREND_KEYS: TrendKey[] = [...TEST_KEYS.slice(0, 7), "egfr", ...TEST_KEYS.slice(7)];

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Findings (suspected first, then "Also detected") with include/edit controls, then trend charts. */
export function FindingsPanel({
  patient,
  reports,
  findings,
  trends,
  medNotes,
  edits,
  locked,
  onEdit,
  onClearEdit,
}: {
  patient: Patient;
  reports: Report[];
  findings: Finding[];
  trends: Trend[];
  medNotes: MedNote[];
  edits: FindingEdits;
  locked: boolean;
  onEdit: (findingId: string, patch: Partial<FindingEdit>) => void;
  onClearEdit: (findingId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
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
      notes={notesFor(medNotes, f.id)}
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
      <section>
        <SectionTitle title="Suspected condition" hint={`Doctor’s suspected condition, screened first · ${patient.suspectedDisease}`} />
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
    </div>
  );
}
