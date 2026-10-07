"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SENSE_INFO, type SenseEvaluation, type SenseMetric } from "@/lib/wearable/senseClean";
import { cn } from "@/lib/utils";

const LINE = "#0d9488"; // teal-600
const HIGH = "#dc2626"; // red-600
const WATCH = "#d97706"; // amber-600
const BAND_Z = 2;

function zColour(z: number | undefined): string {
  if (z === undefined) return LINE;
  const a = Math.abs(z);
  return a >= 3 ? HIGH : a >= 2 ? WATCH : LINE;
}

/** One MarQ Sense daily value across the window with the personal baseline band (doctor view). */
export function SenseChart({ metric, days, uptoDay, compact = false }: { metric: SenseMetric; days: SenseEvaluation[]; uptoDay: number; compact?: boolean }) {
  const info = SENSE_INFO[metric];
  const data = days.map((e) => {
    const day = e.sense.day + 1;
    const b = e.baseline[metric];
    const shown = day <= uptoDay;
    return {
      day,
      value: shown ? e.sense[metric] : null,
      band: shown && b ? [b.median - BAND_Z * b.spread, b.median + BAND_Z * b.spread] : null,
      z: e.z[metric],
    };
  });
  const current = days[uptoDay - 1];
  const value = current?.sense[metric] ?? null;
  const z = current?.z[metric];
  const usual = current?.baseline[metric]?.median;
  const values = data.flatMap((d) => [d.value, ...(d.band ?? [])]).filter((v): v is number => typeof v === "number");
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = Math.max((hi - lo) * 0.15, 10 ** -info.decimals);

  return (
    <figure className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{info.label}</p>
          <p className="text-xs text-slate-500">
            {usual !== undefined ? `Usual ≈ ${usual.toFixed(info.decimals)} ${info.unit}` : "Building personal baseline…"}
            {info.research && " · research-grade"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums" style={{ color: zColour(z) }}>
            {value !== null ? value.toFixed(info.decimals) : "—"}
            <span className="ml-1 text-xs font-normal text-slate-500">{info.unit}</span>
          </p>
          {z !== undefined && (
            <p className={cn("text-xs", Math.abs(z) >= 2 ? "font-medium" : "text-slate-500")} style={Math.abs(z) >= 2 ? { color: zColour(z) } : undefined}>
              z = {z > 0 ? "+" : ""}
              {z.toFixed(1)}
            </p>
          )}
        </div>
      </figcaption>
      <div className={cn("mt-2", compact ? "h-24" : "h-36")} role="img" aria-label={`${info.label} by day, day 1 to ${uptoDay}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="day" type="number" domain={[1, days.length]} ticks={[1, 8, 15, 22, 30]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[lo - pad, hi + pad]}
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toFixed(Math.min(info.decimals, 2))}
              width={48}
            />
            <Area dataKey="band" stroke="none" fill={LINE} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} name="Personal baseline" />
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
              labelFormatter={(d) => `Day ${d}`}
              contentStyle={{ fontSize: 12, borderRadius: 12 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
