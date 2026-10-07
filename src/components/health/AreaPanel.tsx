"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Droplets, EyeOff, TrendingUp, Wind, Thermometer } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AreaView } from "@/lib/surveillance/aggregate";
import type { ClusterStatus } from "@/lib/surveillance/cluster";
import { aqiCategory, type EnvDay } from "@/lib/surveillance/environment";
import { cn } from "@/lib/utils";

const FEVER = "#0f766e"; // teal-700
const TEMP = "#c2410c"; // orange-700 (second categorical hue)
const EXPECTED = "#64748b"; // slate-500, dashed

const STATUS: Record<ClusterStatus, { label: string; icon: typeof AlertTriangle; cls: string }> = {
  cluster: { label: "Cluster flagged", icon: AlertTriangle, cls: "bg-red-50 text-red-800 ring-red-200" },
  rising: { label: "Rising — keep watching", icon: TrendingUp, cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  none: { label: "No unusual rise", icon: CheckCircle2, cls: "bg-green-50 text-green-800 ring-green-200" },
  insufficient: { label: "Not enough history yet", icon: CircleDashed, cls: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export function StatusChip({ status }: { status: ClusterStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", s.cls)}>
      <Icon className="size-3.5" />
      {s.label}
    </span>
  );
}

const axis = { fontSize: 11, fill: "#64748b" };
const tooltipStyle = { fontSize: 12, borderRadius: 12 };

function Card({ title, note, icon: Icon, children }: { title: string; note: string; icon: typeof Wind; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Icon className="size-4 text-slate-400" />
          {title}
        </h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{note}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AreaPanel({ area, env, day }: { area: AreaView; env: EnvDay[]; day: number }) {
  if (area.hidden) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <EyeOff className="size-5 text-slate-400" />
          {area.name}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{area.reason}</p>
        <p className="mt-1 text-xs text-slate-500">
          Nothing about this area is shown — not counts, trends or rates — so that no one there can be singled out.
        </p>
      </section>
    );
  }
  const today = area.days.at(-1)!;
  const envUpTo = env.filter((e) => e.day <= day);
  const envToday = envUpTo.at(-1);
  const recentWater = area.water.slice(-7);
  const w = recentWater.at(-1);
  const coliform = recentWater.reduce((a, x) => a + x.coliformPositive, 0);
  const samples = recentWater.reduce((a, x) => a + x.samples, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{area.name}</h2>
            <p className="text-xs text-slate-500">
              {area.people} people sharing anonymised wearable data · {area.city} · {today.date}
            </p>
          </div>
          <StatusChip status={area.cluster.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Fever-like patterns", `${today.feverLike} (${today.feverLikePct}%)`],
            ["Raised night temp", `${today.raisedTempPct}%`],
            ["Avg night HR change", `${today.hrChange > 0 ? "+" : ""}${today.hrChange} bpm`],
            ["Confirmed this month", `${area.confirmed.count} (${area.confirmed.per1000} / 1,000)`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        {area.cluster.status !== "insufficient" && (
          <ul className="mt-4 space-y-1 text-sm text-slate-700">
            {area.cluster.evidence.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
                {e}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card title="Last 30 days" note="Aggregated · consenting people only" icon={TrendingUp}>
        <div className="h-52" role="img" aria-label={`Fever-like patterns and raised night temperature in ${area.name}, % of people, by day`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={area.days} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" type="number" domain={[1, 30]} ticks={[1, 8, 15, 22, 30]} tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} unit="%" width={48} />
              <Line dataKey="feverLikePct" name="Fever-like patterns" stroke={FEVER} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="expectedPct" name="Expected (own baseline × season)" stroke={EXPECTED} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="raisedTempPct" name="Raised night temperature" stroke={TEMP} strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine x={26} stroke="#cbd5e1" label={{ value: "1 Oct", position: "insideTopLeft", fontSize: 10, fill: "#64748b" }} />
              <Tooltip formatter={(v, name) => [`${v}%`, String(name)]} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 h-32" role="img" aria-label={`Average night heart-rate change in ${area.name}, bpm, by day`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={area.days} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" type="number" domain={[1, 30]} ticks={[1, 8, 15, 22, 30]} tick={axis} tickLine={false} axisLine={false} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Line dataKey="hrChange" name="Avg night HR change (bpm)" stroke={FEVER} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Tooltip formatter={(v) => [`${v} bpm`, "Avg night HR change"]} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-center text-xs text-slate-500">Average night heart-rate change vs each person&apos;s own usual (bpm)</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Weather" note="Real · Open-Meteo · Chennai" icon={Thermometer}>
          {envToday?.maxFeelsLike != null ? (
            <>
              <p className="text-sm text-slate-700">
                Feels like up to <strong className="tabular-nums">{envToday.maxFeelsLike} °C</strong> · humidity{" "}
                <strong className="tabular-nums">{envToday.meanHumidity}%</strong>
              </p>
              <EnvSpark data={envUpTo} dataKey="maxFeelsLike" unit=" °C" name="Max feels-like" />
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading weather…</p>
          )}
        </Card>
        <Card title="Air quality" note="Real · Open-Meteo · Chennai" icon={Wind}>
          {envToday?.maxAqi != null && envToday.meanPm25 != null ? (
            <>
              <p className="text-sm text-slate-700">
                PM2.5 <strong className="tabular-nums">{envToday.meanPm25} µg/m³</strong> · AQI up to{" "}
                <strong className="tabular-nums">{envToday.maxAqi}</strong> ({aqiCategory(envToday.maxAqi).label})
              </p>
              <EnvSpark data={envUpTo} dataKey="meanPm25" unit=" µg/m³" name="Daily mean PM2.5" />
            </>
          ) : (
            <p className="text-sm text-slate-500">Loading air quality…</p>
          )}
        </Card>
      </div>

      <Card title="Water quality" note="SIMULATED — not real data" icon={Droplets}>
        {w ? (
          <div className="space-y-2 text-sm text-slate-700">
            <ul className="grid gap-2 sm:grid-cols-3">
              <WaterStat label="Turbidity" value={`${w.turbidityNtu} NTU`} ok={w.turbidityNtu <= 1} hint="≤ 1 acceptable (BIS 10500)" />
              <WaterStat label="Residual chlorine" value={`${w.chlorineMgL} mg/L`} ok={w.chlorineMgL >= 0.2} hint="≥ 0.2 at the tap" />
              <WaterStat label="Coliform (7 days)" value={`${coliform} of ${samples} samples`} ok={coliform === 0} hint="Should be none" />
            </ul>
            <p className="text-xs text-slate-500">Simulated municipal sampling for the prototype. Standing water after rain also helps mosquitoes breed.</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No samples.</p>
        )}
      </Card>
    </div>
  );
}

function WaterStat({ label, value, ok, hint }: { label: string; value: string; ok: boolean; hint: string }) {
  return (
    <li className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums text-slate-900">
        {ok ? <CheckCircle2 className="size-3.5 text-green-600" /> : <AlertTriangle className="size-3.5 text-amber-600" />}
        {value}
      </p>
      <p className="text-[11px] text-slate-500">
        {ok ? "Within limit" : "Outside limit"} · {hint}
      </p>
    </li>
  );
}

function EnvSpark({ data, dataKey, unit, name }: { data: EnvDay[]; dataKey: keyof EnvDay; unit: string; name: string }) {
  return (
    <div className="mt-2 h-24" role="img" aria-label={`${name} by day`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <XAxis dataKey="day" type="number" domain={[1, 30]} ticks={[1, 15, 30]} tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
          <Line dataKey={dataKey} name={name} stroke={FEVER} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip formatter={(v) => [`${v}${unit}`, name]} labelFormatter={(d) => `Day ${d}`} contentStyle={tooltipStyle} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
