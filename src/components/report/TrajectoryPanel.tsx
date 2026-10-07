"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, Info, Minus } from "lucide-react";
import { TrajectoryChart } from "@/components/charts/TrajectoryChart";
import { Button } from "@/components/ui/button";
import { formatPct, MEANINGFUL_CHANGE, type Change, type TrajectorySummary } from "@/lib/trajectory";
import { trendName } from "@/lib/review";
import type { TrendKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionTitle } from "./FindingsPanel";

function signed(n: number, decimals: number): string {
  const s = Math.abs(n).toFixed(decimals);
  return Number(s) === 0 ? s : n < 0 ? `−${s}` : `+${s}`;
}

function ChangeCell({ c, decimals }: { c?: Change; decimals: number }) {
  if (!c) return <span className="text-slate-400">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {signed(c.abs, decimals)} <span className="text-slate-500">({formatPct(c.pct)})</span>
    </span>
  );
}

function Direction({ d }: { d: TrajectorySummary["direction"] }) {
  const Icon = d === "rising" ? ArrowUpRight : d === "falling" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-700 capitalize">
      <Icon className="size-3.5" aria-hidden /> {d}
    </span>
  );
}

function Status({ t }: { t: TrajectorySummary }) {
  if (t.highlight)
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200">
        Meaningful change · in range
      </span>
    );
  if (!t.inRange)
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-red-700 ring-1 ring-red-200">
        Out of range
      </span>
    );
  return (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-green-700 ring-1 ring-green-200">
      In range
    </span>
  );
}

/** How "meaningful" is decided, per biomarker shown. */
function ThresholdNote({ keys }: { keys: TrendKey[] }) {
  const egfr = MEANINGFUL_CHANGE.egfr;
  const acr = MEANINGFUL_CHANGE.urine_acr;
  const rcvKeys = keys.filter((k) => k !== "egfr" && k !== "urine_acr");
  return (
    <details className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 ring-1 ring-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-700">
        <Info className="size-3.5" aria-hidden /> How “meaningful change” is decided
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p>
          A change is <span className="font-medium">meaningful</span> when the latest value differs from the patient’s own
          baseline (mean of earlier reports) or from the first report by at least the biomarker’s threshold, <em>and</em> the
          direction is not stable (≥ 3 reports: good straight-line fit and ≥ 3% of baseline per year; 2 reports: the change
          itself reaches the threshold). Censored results (“&lt;5”) are shown but never used for % change, baseline or slope;
          qualitative tests (NS1, IgM) have no trajectory.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <span className="font-medium">eGFR ≥ {egfr.percent}%</span> — {egfr.reason}
          </li>
          <li>
            <span className="font-medium">Urine ACR ≥ {acr.percent}%</span> — {acr.reason}
          </li>
          <li>
            <span className="font-medium">Other biomarkers</span> — {MEANINGFUL_CHANGE.hb.reason}{" "}
            {rcvKeys.length > 0 && (
              <>
                Here:{" "}
                {rcvKeys.map((k, i) => (
                  <span key={k} className="whitespace-nowrap">
                    {trendName(k)} {MEANINGFUL_CHANGE[k].percent}%{i < rcvKeys.length - 1 ? ", " : "."}
                  </span>
                ))}
              </>
            )}
          </li>
        </ul>
        <p className="text-slate-500">Prototype thresholds (rounded, approximate) — decision support, the doctor decides.</p>
      </div>
    </details>
  );
}

/**
 * Longitudinal biomarker trajectory analysis (doctor): meaningful in-range changes
 * first, trajectory charts for the key biomarkers, then the full table.
 */
export function TrajectoryPanel({
  trajectories,
  primaryKeys,
  reportCount,
}: {
  trajectories: TrajectorySummary[];
  /** Biomarkers behind the findings, charted first. */
  primaryKeys: TrendKey[];
  reportCount: number;
}) {
  const [showAllCharts, setShowAllCharts] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  const highlights = trajectories.filter((t) => t.highlight);
  const chartList = useMemo(() => {
    const byKey = new Map(trajectories.map((t) => [t.key, t]));
    const keys = [
      ...highlights.map((t) => t.key),
      ...primaryKeys,
      ...trajectories.filter((t) => t.meaningful).map((t) => t.key),
    ].filter((k, i, all) => all.indexOf(k) === i && byKey.has(k));
    const rest = trajectories.map((t) => t.key).filter((k) => !keys.includes(k));
    const shown = showAllCharts || keys.length === 0 ? [...keys, ...rest] : keys;
    return { shown: shown.map((k) => byKey.get(k)!), more: keys.length === 0 ? 0 : rest.length };
  }, [trajectories, highlights, primaryKeys, showAllCharts]);

  const dates = useMemo(
    () => [...new Set(trajectories.flatMap((t) => t.points.map((p) => p.date)))].sort(),
    [trajectories],
  );
  const keyRows = trajectories.filter((t) => t.meaningful || primaryKeys.includes(t.key));
  const rows = showAllRows || keyRows.length === 0 ? trajectories : keyRows;

  if (trajectories.length === 0) {
    return (
      <section>
        <SectionTitle title="Longitudinal biomarker trajectory analysis" />
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
          Only one report so far — trajectories need at least 2 reports of the same biomarker.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle
        title="Longitudinal biomarker trajectory analysis"
        hint={`${reportCount} reports · % change vs previous, vs own baseline and since the first report`}
      />

      {highlights.length > 0 ? (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-4" aria-hidden /> Meaningful change while still in range
          </p>
          <ul className="space-y-1 text-sm text-amber-900">
            {highlights.map((t) => (
              <li key={t.key}>
                <span className="font-semibold">{t.name}</span> {t.direction === "falling" ? "fell" : "rose"}{" "}
                {t.sinceFirst && (
                  <>
                    <span className="font-semibold tabular-nums">{formatPct(t.sinceFirst.pct)}</span> since{" "}
                    {format(parseISO(t.sinceFirst.date), "MMM yyyy")}
                  </>
                )}
                {t.vsBaseline && <> ({formatPct(t.vsBaseline.pct)} vs own baseline)</>} — latest{" "}
                {t.latest.value.toFixed(t.decimals)} {t.unit}, still within {t.ref.replace(/^Ref: /, "")}. Threshold ≥{" "}
                {t.threshold.percent}% — consider follow-up.
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">
          No in-range biomarker has changed by a clinically meaningful amount.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chartList.shown.map((t) => (
          <TrajectoryChart key={t.key} t={t} />
        ))}
      </div>
      {chartList.more > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAllCharts((v) => !v)}>
            <ChevronDown className={showAllCharts ? "rotate-180" : undefined} />
            {showAllCharts ? "Show fewer charts" : `Show all charts (${chartList.more} more)`}
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Shaded band = reference range · dashed line = own baseline (mean of earlier reports) · labels = % change vs the previous
        report · large dot = this report (amber = meaningful change in range, red = out of range)
      </p>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Biomarker</th>
              {dates.map((d) => (
                <th key={d} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  {format(parseISO(d), "MMM yyyy")}
                </th>
              ))}
              <th className="px-2 py-2 font-medium whitespace-nowrap">vs previous</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">vs own baseline</th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Since first</th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Slope / yr</th>
              <th className="px-2 py-2 font-medium">Direction</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.key} className={cn(t.highlight && "bg-amber-50/60")}>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{t.name}</p>
                  <p className="text-[11px] text-slate-500">{t.ref}</p>
                </td>
                {dates.map((d) => {
                  const p = t.points.find((x) => x.date === d);
                  return (
                    <td key={d} className="px-2 py-2 text-right text-slate-800 tabular-nums">
                      {p ? `${p.qualifier ?? ""}${p.value.toFixed(t.decimals)}` : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-2">
                  <ChangeCell c={t.vsPrevious} decimals={t.decimals} />
                </td>
                <td className="px-2 py-2">
                  <ChangeCell c={t.vsBaseline} decimals={t.decimals} />
                </td>
                <td
                  className={cn(
                    "px-2 py-2 text-right font-medium tabular-nums",
                    t.meaningful ? (t.highlight ? "text-amber-700" : "text-red-700") : "text-slate-700",
                  )}
                  title={`Meaningful at ≥ ${t.threshold.percent}%`}
                >
                  {formatPct(t.sinceFirst?.pct)}
                </td>
                <td className="px-2 py-2 text-right text-slate-700 tabular-nums">
                  {t.slopePerYear !== undefined ? signed(t.slopePerYear, t.decimals + 1) : "—"}
                </td>
                <td className="px-2 py-2">
                  <Direction d={t.direction} />
                </td>
                <td className="px-3 py-2">
                  <Status t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {keyRows.length > 0 && keyRows.length < trajectories.length && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAllRows((v) => !v)}>
            <ChevronDown className={showAllRows ? "rotate-180" : undefined} />
            {showAllRows ? "Show key biomarkers only" : `Show all biomarkers (${trajectories.length - keyRows.length} more)`}
          </Button>
        </div>
      )}

      <ThresholdNote keys={rows.map((t) => t.key)} />
    </section>
  );
}
