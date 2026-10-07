"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Map as MapIcon, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SidebarLayout, setSectionInUrl, useSection, type SidebarGroup } from "@/components/layout/SidebarLayout";
import { METRICS, type MetricId, type VisibleArea } from "@/lib/surveillance/aggregate";
import { environmentDays } from "@/lib/surveillance/environment";
import { WINDOW_DAYS } from "@/lib/wearable/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { useWeatherStore } from "@/store/useWeatherStore";
import { AlertsPanel } from "./AlertsPanel";
import { AreaMap } from "./AreaMap";
import { AreaPanel, StatusChip } from "./AreaPanel";
import { useAirQualityStore, useSurveillance } from "./useSurveillance";

const SECTIONS = ["map", "alerts"] as const;

export function SurveillanceWorkspace() {
  const section = useSection(SECTIONS, "map", useSearchParams());
  const [day, setDay] = useState(WINDOW_DAYS);
  const [metric, setMetric] = useState<MetricId>("raised_temp");
  const [selected, setSelected] = useState<string | null>("velachery");
  const { view, loading } = useSurveillance(day);
  const alerts = useInaraStore((s) => s.publicHealthAlerts);
  const weather = useWeatherStore((s) => s.weather);
  const air = useAirQualityStore((s) => s.air);
  const env = useMemo(() => environmentDays(weather, air, WINDOW_DAYS), [weather, air]);
  const proposed = alerts.filter((a) => a.status === "proposed").length;
  const area = view?.areas.find((a) => a.id === selected) ?? null;
  const clusters = view?.areas.filter((a): a is VisibleArea => !a.hidden && a.cluster.status === "cluster") ?? [];

  const groups: SidebarGroup[] = [
    {
      items: [
        { id: "map", label: "Area map", icon: MapIcon, active: section === "map", onSelect: () => setSectionInUrl("map") },
        {
          id: "alerts",
          label: "Public alerts",
          icon: Megaphone,
          active: section === "alerts",
          onSelect: () => setSectionInUrl("alerts"),
          badge: proposed ? <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{proposed}</span> : undefined,
        },
      ],
    },
  ];

  return (
    <SidebarLayout title="Regional surveillance" groups={groups}>
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Anonymised, aggregated wearable data from people who agreed to share it. No names, IDs or exact locations. Areas with
        fewer than 10 people are hidden. Possible patterns, not diagnoses.
      </p>

      {section === "map" && (
        <>
          <PageHeader title="Regional health surveillance · Chennai" subtitle="Where fever-like changes are rising, compared with each area's own usual level and the season." />
          {loading || !view ? (
            <div className="py-24 text-center text-sm text-slate-500">Loading area data…</div>
          ) : (
            <div className="space-y-4">
              {clusters.length > 0 && day === WINDOW_DAYS && (
                <button
                  type="button"
                  onClick={() => setSectionInUrl("alerts")}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-red-50 p-4 text-left text-sm text-red-900 ring-1 ring-red-200 hover:bg-red-100"
                >
                  <span>
                    <strong>{clusters.map((c) => c.name).join(", ")}</strong>: {clusters[0].cluster.label.toLowerCase()} flagged.{" "}
                    {proposed ? `${proposed} proposed alert${proposed === 1 ? "" : "s"} waiting for your review.` : "See Public alerts."}
                  </span>
                  <Megaphone className="size-5 shrink-0" />
                </button>
              )}

              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour the map by">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={metric === m.id}
                    onClick={() => setMetric(m.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors",
                      metric === m.id ? "bg-teal-600 text-white ring-teal-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <label className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
                <span className="font-medium text-slate-700">
                  Day {day} · {view.date}
                </span>
                <input
                  type="range"
                  min={1}
                  max={WINDOW_DAYS}
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className="min-w-40 flex-1 accent-teal-600"
                  aria-label="Day"
                />
                <span className="text-xs text-slate-500">{view.people.toLocaleString("en-IN")} people sharing data in the areas shown</span>
              </label>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <div className="space-y-3">
                  <AreaMap areas={view.areas} metric={metric} selected={selected} onSelect={setSelected} />
                  <ul className="divide-y divide-slate-100 rounded-2xl bg-white text-sm shadow-sm ring-1 ring-slate-200">
                    {view.areas.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(a.id)}
                          className={cn("flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-slate-50", selected === a.id && "bg-teal-50/60")}
                        >
                          <span className="font-medium text-slate-800">{a.name}</span>
                          {a.hidden ? <span className="text-xs text-slate-500">Hidden (&lt;10 people)</span> : <StatusChip status={a.cluster.status} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>{area ? <AreaPanel area={area} env={env} day={day} /> : <p className="text-sm text-slate-500">Choose an area on the map.</p>}</div>
              </div>
            </div>
          )}
        </>
      )}

      {section === "alerts" && (
        <>
          <PageHeader
            title="Public alerts"
            subtitle="Prodrome proposes; you review the evidence, edit the message and authorise. Only then do patients in that area see it."
          />
          <AlertsPanel alerts={alerts} />
        </>
      )}
    </SidebarLayout>
  );
}
