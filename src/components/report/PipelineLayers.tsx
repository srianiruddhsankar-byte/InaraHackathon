"use client";

import { ArrowRight, Brain, Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { LAYERS, type AnalysisResult } from "@/lib/analysis";
import { personalisedTargets } from "@/lib/targets";
import { formatValue, TESTS } from "@/lib/tests";
import type { Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SEVERITY_STYLE } from "./badges";

type LayerState = "pending" | "running" | "done" | "soon";

function Chip({ children, tone }: { children: ReactNode; tone?: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums ring-1",
        tone ? SEVERITY_STYLE[tone].badge : "bg-slate-50 text-slate-700 ring-slate-200",
      )}
    >
      {children}
    </span>
  );
}

function NormaliseOutput({ a }: { a: AnalysisResult }) {
  const n = a.normalise;
  const changed = n.rows.filter((r) => r.converted || (r.name && r.name.toLowerCase() !== r.rawName.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Chip>{n.total} received</Chip>
        <Chip tone="normal">{n.mapped} mapped to LOINC</Chip>
        <Chip>{n.renamed} names standardised</Chip>
        <Chip>{n.converted} units converted</Chip>
        <Chip tone={n.unknown ? "high" : undefined}>{n.unknown} unknown</Chip>
      </div>
      <ul className="grid gap-1 text-xs text-slate-600 md:grid-cols-2">
        {changed.map((r) => (
          <li key={r.rawName} className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-slate-500">
              {r.rawName} {r.rawValue} {r.rawUnit}
            </span>
            <ArrowRight className="size-3 shrink-0 text-slate-400" aria-hidden />
            <span className={cn("truncate", r.converted && "font-medium text-teal-800")}>
              {r.name} {r.testKey && r.value !== null && TESTS[r.testKey].qualitative ? formatValue(r.testKey, r.value) : r.value} {r.unit}
            </span>
            <span className="shrink-0 text-[10px] text-slate-400">LOINC {r.loinc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RangeOutput({ a }: { a: AnalysisResult }) {
  if (a.range.length === 0) return <p className="text-sm text-slate-600">All values are within population reference ranges.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {a.range.map((r) => (
        <Chip key={r.testKey} tone={r.flag === "high" ? "high" : "watch"}>
          {r.name} {r.value} · {r.flag === "high" ? "above" : "below"} {r.range}
        </Chip>
      ))}
    </div>
  );
}

function ScoresOutput({ a }: { a: AnalysisResult }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {a.scores.map((s) => (
        <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500">{s.label}</p>
          <p className="text-sm font-semibold text-slate-900 tabular-nums">{s.value}</p>
          <p className={cn("text-xs font-medium", SEVERITY_STYLE[s.tone].text)}>{s.interpretation}</p>
          <p className="text-[10px] text-slate-400">{s.source}</p>
        </div>
      ))}
    </div>
  );
}

function TargetsOutput({ a }: { a: AnalysisResult }) {
  const personal = personalisedTargets(a.targets);
  return (
    <div className="space-y-2 text-sm">
      {personal.length === 0 ? (
        <p className="text-slate-600">
          No guideline-specific targets apply to this patient — population ranges are used for all {a.targets.length} tests.
        </p>
      ) : (
        <ul className="space-y-1">
          {personal.map((t) => (
            <li key={t.testKey} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-slate-800">{TESTS[t.testKey].name}</span>
              <span className={cn("font-semibold", t.kind === "override" ? "text-sky-700" : "text-teal-700")}>{t.label}</span>
              <span className="text-xs text-slate-500">
                instead of {t.populationRange} · {t.reason} · {t.source}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.egfrDecline && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-medium">eGFR decline: </span>
          {a.egfrDecline.text}
        </p>
      )}
      <p className="text-[11px] text-slate-400">
        Guideline-based examples. The doctor can override any target in the lab table below.
      </p>
    </div>
  );
}

function TrendsOutput({ a }: { a: AnalysisResult }) {
  if (a.previousReportCount === 0) return <p className="text-sm text-slate-600">No previous reports — no personal baseline yet.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Compared with {a.previousReportCount} previous report{a.previousReportCount === 1 ? "" : "s"}.{" "}
        {a.stableTrendCount} test{a.stableTrendCount === 1 ? " is" : "s are"} stable.
      </p>
      {a.trends.length === 0 ? (
        <p className="text-sm text-slate-600">No significant changes over time.</p>
      ) : (
        <ul className="grid gap-1.5 md:grid-cols-2">
          {a.trends.map((t) => (
            <li key={t.key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium text-slate-800">{t.name}</span>
              <span className={cn("text-xs font-semibold", SEVERITY_STYLE[t.tone].text)}>{t.label}</span>
              {t.secondary && <span className="text-[11px] text-slate-500">{t.secondary}</span>}
              <span className="text-xs text-slate-500 tabular-nums">
                {t.slope} · {t.baseline}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const OUTPUT: Record<(typeof LAYERS)[number]["id"], ((p: { a: AnalysisResult }) => ReactNode) | null> = {
  normalise: NormaliseOutput,
  range: RangeOutput,
  scores: ScoresOutput,
  targets: TargetsOutput,
  trends: TrendsOutput,
  model: null,
};

/** The analysis layers. `revealed` = how many layers have finished. */
export function PipelineLayers({ analysis, revealed }: { analysis: AnalysisResult; revealed: number }) {
  return (
    <ol className="space-y-3">
      {LAYERS.map((layer, i) => {
        const soon = layer.id === "model";
        const state: LayerState = soon ? (i < revealed ? "soon" : "pending") : i < revealed ? "done" : i === revealed ? "running" : "pending";
        const Output = OUTPUT[layer.id];
        return (
          <li
            key={layer.id}
            className={cn(
              "rounded-2xl bg-white p-4 shadow-sm ring-1 transition-all duration-300",
              state === "done" ? "ring-slate-200" : state === "running" ? "ring-teal-300" : "ring-slate-100",
              (state === "pending" || state === "soon") && "opacity-55",
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full",
                  state === "done" ? "bg-teal-600 text-white" : state === "running" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400",
                )}
              >
                {state === "done" ? (
                  <Check className="size-4" aria-label="Done" />
                ) : state === "running" ? (
                  <Loader2 className="size-4 animate-spin" aria-label="Running" />
                ) : soon ? (
                  <Brain className="size-4" aria-hidden />
                ) : (
                  <span className="text-[11px] font-semibold">{layer.num}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{layer.label}</p>
                <p className="text-xs text-slate-500">{layer.hint}</p>
              </div>
              {soon && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                  Coming soon — trained model
                </span>
              )}
            </div>
            {state === "done" && Output && (
              <div className="mt-3 border-t border-slate-100 pt-3 pl-10">
                <Output a={analysis} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
