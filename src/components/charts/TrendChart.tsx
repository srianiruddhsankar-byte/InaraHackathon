"use client";

import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SEVERITY_STYLE } from "@/components/report/badges";
import { formatRange, slopeLabel, trendLabel } from "@/lib/review";
import type { Trend } from "@/lib/types";
import { cn } from "@/lib/utils";

const LINE = "#0d9488"; // teal-600
const BAND = "#16a34a"; // green-600, used at low opacity for the normal range
const OUT = "#dc2626"; // red-600: latest point outside range

export interface TrendChartProps {
  title: string;
  unit: string;
  decimals: number;
  points: { date: string; value: number }[];
  range: { low?: number; high?: number };
  trend?: Trend;
}

function niceDomain(values: number[], range: { low?: number; high?: number }, stable: boolean): [number, number] {
  const vmin = Math.min(...values);
  const vmax = Math.max(...values);
  const span = Math.max(vmax - vmin, Math.abs(vmax) * 0.1, 0.5);
  // Include a range bound only when it is near the data, so the line isn't squashed.
  const near = [range.low, range.high].filter(
    (b): b is number => b !== undefined && b >= vmin - span && b <= vmax + span,
  );
  let lo = Math.min(vmin, ...near);
  let hi = Math.max(vmax, ...near);
  // Keep a minimum visible span so tiny wobbles in flat data don't look like big swings.
  const minSpan = Math.max(Math.abs(vmax) * (stable ? 0.4 : 0.2), 1);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.15;
  return [Math.max(0, lo - pad), hi + pad];
}

export function TrendChart({ title, unit, decimals, points, range, trend }: TrendChartProps) {
  const data = points.map((p) => ({ ...p, label: format(parseISO(p.date), "MMM yy") }));
  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-200">No {title} results yet.</div>
    );
  }
  const latest = data[data.length - 1];
  const [y0, y1] = niceDomain(
    data.map((d) => d.value),
    range,
    trend?.direction === "stable",
  );
  const bandLow = Math.max(range.low ?? y0, y0);
  const bandHigh = Math.min(range.high ?? y1, y1);
  const latestOut =
    (range.low !== undefined && latest.value < range.low) || (range.high !== undefined && latest.value > range.high);
  const label = trend && data.length >= 2 ? trendLabel(trend) : undefined;

  return (
    <figure className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            Normal {formatRange(range)} {unit}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-lg leading-none font-semibold tabular-nums", latestOut ? "text-red-700" : "text-slate-900")}>
            {latest.value.toFixed(decimals)}
            <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
          </p>
        </div>
      </figcaption>

      <div className="mt-2 h-32" role="img" aria-label={`${title} over time, latest ${latest.value.toFixed(decimals)} ${unit}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
            {bandHigh > bandLow && (
              <ReferenceArea y1={bandLow} y2={bandHigh} fill={BAND} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
            )}
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis
              domain={[y0, y1]}
              tickLine={false}
              axisLine={false}
              width={36}
              tickCount={4}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v: number) => v.toFixed(y1 - y0 > 10 ? 0 : 1)}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(v) => [`${Number(v).toFixed(decimals)} ${unit}`, title]}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              isAnimationActive={false}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const isLatest = props.index === data.length - 1;
                return (
                  <circle
                    key={`dot-${props.index}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={isLatest ? 5.5 : 3}
                    fill={isLatest ? (latestOut ? OUT : LINE) : "#fff"}
                    stroke={isLatest ? "#fff" : LINE}
                    strokeWidth={2}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {label && trend && (
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-slate-100 pt-2">
          <p className="text-xs">
            <span className={cn("font-semibold", SEVERITY_STYLE[label.tone].text)}>{label.main}</span>
            {label.secondary && <span className="ml-1 text-slate-500">· {label.secondary}</span>}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">{slopeLabel(trend)}</p>
        </div>
      )}
    </figure>
  );
}
