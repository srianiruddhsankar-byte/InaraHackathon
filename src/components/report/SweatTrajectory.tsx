"use client";

import { useEffect, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, FlaskConical, Minus } from "lucide-react";
import { cachedAnalysis } from "@/components/wearable/useWearableMonitor";
import { SPECIMEN_LABEL } from "@/lib/tests";
import { doctorCanView } from "@/lib/wearable/consent";
import { SWEAT_LABEL } from "@/lib/wearable/sense";
import { SWEAT_NOT_BLOOD } from "@/lib/wearable/sweatPanel";
import { sweatTrends, SWEAT_TREND, type SweatTrend } from "@/lib/wearable/sweatTrends";
import { WINDOW_DAYS } from "@/lib/wearable/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { useWeatherStore } from "@/store/useWeatherStore";

function Spark({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const pts = values
    .map((v, i) => (v === null ? null : `${((i / (values.length - 1)) * 100).toFixed(1)},${(18 - ((v - lo) / span) * 16).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg viewBox="0 0 100 20" className="h-5 w-24" aria-hidden preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#0d9488" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Dir({ t }: { t: SweatTrend }) {
  if (!t.direction) return <span className="text-slate-400">—</span>;
  const Icon = t.direction === "rising" ? ArrowUpRight : t.direction === "falling" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-700 capitalize">
      <Icon className="size-3.5" aria-hidden /> {t.direction}
    </span>
  );
}

/**
 * Longitudinal view, wearable part: daily sweat trends (last 7 days vs the person's own
 * baseline). Only with the patient's wearable consent for care; alcohol is never included.
 */
export function SweatTrajectory({ patientId }: { patientId: string }) {
  const settings = useInaraStore((s) => s.patientSettings.find((p) => p.patientId === patientId));
  const { weather, load } = useWeatherStore();
  const allowed = doctorCanView(settings);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);
  const trends = useMemo(() => {
    if (!allowed || !weather) return null;
    const a = cachedAnalysis(patientId, settings, weather);
    return a.status === "ok" && a.sense ? sweatTrends(a.sense.days, WINDOW_DAYS) : null;
  }, [allowed, weather, patientId, settings]);

  if (!trends) return null;
  const fmt = (t: SweatTrend, v: number | null) => (v === null ? "—" : v.toFixed(t.decimals));
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <FlaskConical className="size-4 text-teal-600" aria-hidden /> {SPECIMEN_LABEL.sweat} · daily trends (MarQ Sense, 30 days)
        <span className="rounded bg-amber-50 px-1.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">{SWEAT_LABEL}</span>
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Last {SWEAT_TREND.recentDays} days vs this person&apos;s own baseline (earlier days). {SWEAT_NOT_BLOOD}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1.5 pr-3 font-medium">Analyte</th>
              <th className="py-1.5 pr-3 font-medium">Usual (own)</th>
              <th className="py-1.5 pr-3 font-medium">Last 7 days</th>
              <th className="py-1.5 pr-3 font-medium">Change</th>
              <th className="py-1.5 pr-3 font-medium">Direction</th>
              <th className="py-1.5 pr-3 font-medium">30 days</th>
              <th className="py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trends.map((t) => (
              <tr key={t.analyte} className={cn(t.outsideUsual && "bg-amber-50/50")}>
                <td className="py-2 pr-3">
                  <span className="font-medium text-slate-900">{t.label}</span>
                  <span className="block text-[11px] text-slate-400">Typical: {t.typical}</span>
                </td>
                <td className="py-2 pr-3 tabular-nums">
                  {fmt(t, t.baseline)} <span className="text-slate-500">{t.unit}</span>
                </td>
                <td className="py-2 pr-3 tabular-nums">{fmt(t, t.recent)}</td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                  {t.change ? `${t.change.abs > 0 ? "+" : ""}${t.change.abs.toFixed(t.decimals)}${t.change.pct !== null ? ` (${t.change.pct > 0 ? "+" : ""}${t.change.pct}%)` : ""}` : "—"}
                </td>
                <td className="py-2 pr-3">
                  <Dir t={t} />
                </td>
                <td className="py-2 pr-3">
                  <Spark values={t.values} />
                </td>
                <td className="py-2">
                  {t.outsideUsual ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800 ring-1 ring-amber-200">
                      Outside own usual
                    </span>
                  ) : t.baseline !== null ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-green-700 ring-1 ring-green-200">
                      Within own usual
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Building baseline</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Outside own usual = beyond ± {SWEAT_TREND.bandSd} robust SD of the person&apos;s baseline; stable = change under {SWEAT_TREND.stablePct}%.
        Alcohol is never shown here.
      </p>
    </section>
  );
}
