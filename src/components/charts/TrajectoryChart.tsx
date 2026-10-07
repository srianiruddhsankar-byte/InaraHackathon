"use client";

import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPct, percentChange, type TrajectorySummary } from "@/lib/trajectory";
import { cn } from "@/lib/utils";

const LINE = "#0d9488"; // teal-600
const BAND = "#16a34a"; // green-600 at low opacity: reference range
const BASE = "#64748b"; // slate-500: the patient's own baseline
const OUT = "#dc2626"; // red-600: latest point outside range
const HIGHLIGHT = "#d97706"; // amber-600: meaningful change while in range

function domain(values: number[], range: { low?: number; high?: number }): [number, number] {
  const vmin = Math.min(...values);
  const vmax = Math.max(...values);
  const span = Math.max(vmax - vmin, Math.abs(vmax) * 0.1, 0.5);
  const near = [range.low, range.high].filter((b): b is number => b !== undefined && b >= vmin - span && b <= vmax + span);
  const lo = Math.min(vmin, ...near);
  const hi = Math.max(vmax, ...near);
  const pad = Math.max((hi - lo) * 0.2, 0.5);
  return [Math.max(0, lo - pad), hi + pad * 1.3];
}

/** One biomarker over time: reference range shaded, baseline (mean of earlier reports) dashed, % change vs previous on each point. */
export function TrajectoryChart({ t }: { t: TrajectorySummary }) {
  const data = t.points.map((p, i) => {
    const prev = t.points[i - 1];
    const pct = prev && !prev.qualifier && !p.qualifier ? percentChange(prev.value, p.value) : null;
    return { ...p, label: format(parseISO(p.date), "MMM yy"), pctLabel: i === 0 ? "" : formatPct(pct, 0) };
  });
  const values = [...data.map((d) => d.value), ...(t.baselineMean !== undefined ? [t.baselineMean] : [])];
  const [y0, y1] = domain(values, t.range);
  const bandLow = Math.max(t.range.low ?? y0, y0);
  const bandHigh = Math.min(t.range.high ?? y1, y1);
  const latestColor = !t.inRange ? OUT : t.highlight ? HIGHLIGHT : LINE;
  const since = t.sinceFirst;

  return (
    <figure
      className={cn(
        "flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1",
        t.highlight ? "ring-amber-300" : "ring-slate-200",
      )}
    >
      <figcaption className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
          <p className="text-xs text-slate-500">{t.ref}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-lg leading-none font-semibold tabular-nums", t.inRange ? "text-slate-900" : "text-red-700")}>
            {t.latest.qualifier ?? ""}
            {t.latest.value.toFixed(t.decimals)}
            <span className="ml-1 text-xs font-normal text-slate-500">{t.unit}</span>
          </p>
          {since && (
            <p className={cn("mt-1 text-xs font-medium tabular-nums", t.highlight ? "text-amber-700" : "text-slate-600")}>
              {formatPct(since.pct)} since {format(parseISO(since.date), "MMM yyyy")}
            </p>
          )}
        </div>
      </figcaption>

      <div
        className="mt-2 h-36"
        role="img"
        aria-label={`${t.name} over time, latest ${t.latest.value.toFixed(t.decimals)} ${t.unit}, ${formatPct(since?.pct)} since the first report`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
            {bandHigh > bandLow && (
              <ReferenceArea y1={bandLow} y2={bandHigh} fill={BAND} fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
            )}
            {t.baselineMean !== undefined && (
              <ReferenceLine
                y={t.baselineMean}
                stroke={BASE}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "baseline", position: "insideBottomLeft", fontSize: 10, fill: BASE }}
              />
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
              formatter={(v, _n, item) => {
                const p = item?.payload as { qualifier?: string; pctLabel?: string } | undefined;
                const pct = p?.pctLabel && p.pctLabel !== "—" ? ` (${p.pctLabel} vs previous)` : "";
                return [`${p?.qualifier ?? ""}${Number(v).toFixed(t.decimals)} ${t.unit}${pct}`, t.name];
              }}
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
                    fill={isLatest ? latestColor : "#fff"}
                    stroke={isLatest ? "#fff" : LINE}
                    strokeWidth={2}
                  />
                );
              }}
            >
              <LabelList dataKey="pctLabel" position="top" offset={8} fontSize={10} fill="#475569" />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
