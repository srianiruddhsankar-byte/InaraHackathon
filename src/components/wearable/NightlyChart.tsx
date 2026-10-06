"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NightEvaluation } from "@/lib/wearable/baseline";
import { METRIC_INFO, type NightMetric } from "@/lib/wearable/types";
import { cn } from "@/lib/utils";

const LINE = "#0d9488"; // teal-600
const BAND = "#0d9488";
const HIGH = "#dc2626"; // red-600
const WATCH = "#d97706"; // amber-600

/** Band = personal baseline median ± 2 robust SD (from the nights before each night). */
const BAND_Z = 2;

function zColour(z: number | undefined): string {
  if (z === undefined) return LINE;
  const a = Math.abs(z);
  return a >= 3 ? HIGH : a >= 2 ? WATCH : LINE;
}

/**
 * One nightly metric across the window, up to `uptoDay` (1-based), with the
 * personal baseline band shaded. Nights after `uptoDay` are hidden so the
 * slider/replay builds the picture up day by day.
 */
export function NightlyChart({
  metric,
  nights,
  uptoDay,
  title,
  plainZ = false,
}: {
  metric: NightMetric;
  nights: NightEvaluation[];
  uptoDay: number;
  title?: string;
  /** Patient view: describe the colour in words rather than showing z. */
  plainZ?: boolean;
}) {
  const info = METRIC_INFO[metric];
  const data = nights.map((e) => {
    const day = e.night.day + 1;
    const b = e.baseline[metric];
    const shown = day <= uptoDay;
    return {
      day,
      value: shown ? e.night[metric] : null,
      band: shown && b ? [b.median - BAND_Z * b.spread, b.median + BAND_Z * b.spread] : null,
      z: e.z[metric],
    };
  });
  const current = nights[uptoDay - 1];
  const value = current?.night[metric] ?? null;
  const z = current?.z[metric];
  const usual = current?.baseline[metric]?.median;

  const values = data.flatMap((d) => [d.value, ...(d.band ?? [])]).filter((v): v is number => typeof v === "number");
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = Math.max((hi - lo) * 0.15, metric === "skinTemp" ? 0.2 : 1);

  return (
    <figure className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title ?? info.label}</p>
          <p className="text-xs text-slate-500">
            {usual !== undefined ? `Usual for this person ≈ ${usual.toFixed(info.decimals)} ${info.unit}` : "Building personal baseline…"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums" style={{ color: zColour(z) }}>
            {value !== null ? value.toFixed(info.decimals) : "—"}
            <span className="ml-1 text-xs font-normal text-slate-500">{info.unit}</span>
          </p>
          {z !== undefined && (
            <p className={cn("text-xs", Math.abs(z) >= 2 ? "font-medium" : "text-slate-500")} style={Math.abs(z) >= 2 ? { color: zColour(z) } : undefined}>
              {plainZ ? (Math.abs(z) < 2 ? "Within your usual range" : z > 0 ? "Higher than usual" : "Lower than usual") : `z = ${z > 0 ? "+" : ""}${z.toFixed(1)}`}
            </p>
          )}
        </div>
      </figcaption>
      <div className="mt-2 h-36" role="img" aria-label={`${info.label} by night, day 1 to ${uptoDay}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="day" type="number" domain={[1, nights.length]} ticks={[1, 8, 15, 22, 30]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis domain={[lo - pad, hi + pad]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(metric === "skinTemp" || metric === "spo2" ? 1 : 0)} width={48} />
            <Area dataKey="band" stroke="none" fill={BAND} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} name="Personal baseline" />
            <ReferenceLine x={uptoDay} stroke="#94a3b8" strokeDasharray="3 3" />
            <Line
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
              dot={(props: { cx?: number; cy?: number; payload?: { z?: number; value: number | null; day: number } }) => {
                const { cx, cy, payload } = props;
                if (cx === undefined || cy === undefined || payload?.value == null) return <g key={`d-${payload?.day}`} />;
                return <circle key={`d-${payload.day}`} cx={cx} cy={cy} r={payload.day === uptoDay ? 4 : 2.5} fill={zColour(payload.z)} stroke="white" strokeWidth={1} />;
              }}
              name={info.label}
            />
            <Tooltip
              formatter={(v, name) =>
                Array.isArray(v)
                  ? [`${Number(v[0]).toFixed(info.decimals)}–${Number(v[1]).toFixed(info.decimals)} ${info.unit}`, "Usual range"]
                  : [`${Number(v).toFixed(info.decimals)} ${info.unit}`, String(name)]
              }
              labelFormatter={(d) => `Night of day ${d}`}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
