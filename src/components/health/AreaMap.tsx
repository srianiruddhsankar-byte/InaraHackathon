"use client";

import { AlertTriangle } from "lucide-react";
import { metricLevel, metricValue, METRIC_SCALE, METRICS, type AreaView, type MetricId } from "@/lib/surveillance/aggregate";
import { CHENNAI_AREAS, labelPoint, MAP_VIEWBOX, polygonPath } from "@/lib/surveillance/areas";
import { cn } from "@/lib/utils";

/** One hue, light → dark (magnitude). Status colours stay reserved for the cluster marker. */
export const SEQUENTIAL = ["#f0fdfa", "#99f6e4", "#2dd4bf", "#0f766e"];
const INK = ["#134e4a", "#134e4a", "#134e4a", "#ffffff"];

export function formatMetric(metric: MetricId, value: number): string {
  switch (metric) {
    case "raised_temp":
      return `${value.toFixed(1)}%`;
    case "hr_change":
      return `${value > 0 ? "+" : ""}${value.toFixed(1)} bpm`;
    case "concerning":
      return `${value}`;
    case "low_hydration":
      return `${value.toFixed(1)}%`;
    case "confirmed":
      return value.toFixed(1);
  }
}

/** Schematic area map of Chennai, coloured by the chosen metric. Hidden areas are hatched. */
export function AreaMap({
  areas,
  metric,
  selected,
  onSelect,
}: {
  areas: AreaView[];
  metric: MetricId;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const info = METRICS.find((m) => m.id === metric)!;
  const steps = METRIC_SCALE[metric].steps;
  return (
    <figure className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <svg
        viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        className="mx-auto h-auto w-full max-w-md"
        role="group"
        aria-label={`Chennai areas coloured by ${info.label}`}
      >
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#f8fafc" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="3" />
          </pattern>
        </defs>
        {/* Sea */}
        <path d="M352,0 C340,120 360,250 362,330 C366,400 380,440 400,480 L400,0 Z" fill="#eff6ff" />
        <text x={388} y={210} fontSize={11} fill="#64748b" textAnchor="middle" transform="rotate(90 388 210)">
          Bay of Bengal
        </text>
        {CHENNAI_AREAS.map((geo) => {
          const area = areas.find((a) => a.id === geo.id);
          if (!area) return null;
          const [lx, ly] = labelPoint(geo.points);
          const isSel = selected === geo.id;
          if (area.hidden) {
            return (
              <g key={geo.id} onClick={() => onSelect(geo.id)} className="cursor-pointer">
                <title>{`${area.name}: hidden — ${area.reason}`}</title>
                <path d={polygonPath(geo.points)} fill="url(#hatch)" stroke={isSel ? "#0f172a" : "#ffffff"} strokeWidth={isSel ? 3 : 2} />
                <text x={lx} y={ly - 2} fontSize={11} fontWeight={600} fill="#475569" textAnchor="middle">
                  {area.name}
                </text>
                <text x={lx} y={ly + 12} fontSize={10} fill="#64748b" textAnchor="middle">
                  hidden (&lt;10)
                </text>
              </g>
            );
          }
          const value = metricValue(area, metric);
          const level = metricLevel(metric, value);
          const cluster = area.cluster.status === "cluster";
          return (
            <g
              key={geo.id}
              role="button"
              tabIndex={0}
              aria-label={`${area.name}: ${formatMetric(metric, value)}${cluster ? ", cluster flagged" : ""}`}
              onClick={() => onSelect(geo.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(geo.id)}
              className="cursor-pointer outline-none focus-visible:opacity-80"
            >
              <title>{`${area.name} · ${info.short}: ${formatMetric(metric, value)} · ${area.people} people sharing data${cluster ? ` · ${area.cluster.label}` : ""}`}</title>
              <path
                d={polygonPath(geo.points)}
                fill={SEQUENTIAL[level]}
                stroke={isSel ? "#0f172a" : "#ffffff"}
                strokeWidth={isSel ? 3 : 2}
                className="transition-[fill] duration-300"
              />
              {cluster && <path d={polygonPath(geo.points)} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" />}
              <text x={lx} y={ly - 2} fontSize={11} fontWeight={600} fill={INK[level]} textAnchor="middle">
                {area.name}
              </text>
              <text x={lx} y={ly + 12} fontSize={11} fill={INK[level]} textAnchor="middle" className="tabular-nums">
                {formatMetric(metric, value)}
              </text>
              {cluster && (
                <g transform={`translate(${lx + 30}, ${ly - 26})`}>
                  <circle r={9} fill="#dc2626" stroke="#ffffff" strokeWidth={2} />
                  <text y={4} fontSize={12} fontWeight={700} fill="#ffffff" textAnchor="middle">
                    !
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-slate-700">{info.label}</span>
          <span className="flex items-center gap-1">
            {SEQUENTIAL.map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                <span className="inline-block size-3 rounded-sm ring-1 ring-slate-200" style={{ background: c }} />
                <span className="tabular-nums">
                  {i === 0 ? `< ${formatMetric(metric, steps[0])}` : `≥ ${formatMetric(metric, steps[i - 1])}`}
                </span>
              </span>
            ))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <AlertTriangle className="size-3.5 text-red-600" /> Red dashed outline = cluster flagged
          </span>
          <span className="flex items-center gap-1">
            <span className={cn("inline-block size-3 rounded-sm ring-1 ring-slate-200")} style={{ background: "repeating-linear-gradient(45deg,#f8fafc 0 3px,#cbd5e1 3px 5px)" }} />
            Hidden: fewer than 10 people (privacy)
          </span>
          <span>Schematic map · not to scale · areas only</span>
        </div>
      </figcaption>
    </figure>
  );
}
