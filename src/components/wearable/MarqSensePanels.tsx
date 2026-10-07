"use client";

import { useState } from "react";
import { BatteryLow, BatteryMedium, Bluetooth, BluetoothOff, CheckCircle2, ChevronDown, CircleAlert, Droplets, FlaskConical, HeartPulse, MapPin, Waves } from "lucide-react";
import type { SenseEvaluation, SenseMetric } from "@/lib/wearable/senseClean";
import { MARQ_PLATFORM, type DeviceStatus, type PlainCard } from "@/lib/wearable/senseView";
import { SWEAT_LABEL } from "@/lib/wearable/sense";
import { cn } from "@/lib/utils";
import { SenseChart } from "./SenseChart";

/** The MarQ Sense band: battery, sync, connection, firmware and each sensor with its hardware. */
export function DevicePanel({ device, audience }: { device: DeviceStatus; audience: "doctor" | "patient" }) {
  const [open, setOpen] = useState(audience === "doctor");
  const Battery = device.batteryLow ? BatteryLow : BatteryMedium;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Waves className="size-4 text-teal-600" aria-hidden /> MarQ Sense device
        </h3>
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">Simulated</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Stat label="Battery" icon={<Battery className={cn("size-4", device.batteryLow ? "text-amber-600" : "text-slate-400")} />} warn={device.batteryLow}>
          {device.battery}%{device.batteryLow ? " · charge soon" : ""}
        </Stat>
        <Stat
          label="Connection"
          icon={device.connected ? <Bluetooth className="size-4 text-teal-600" /> : <BluetoothOff className="size-4 text-amber-600" />}
          warn={!device.connected}
        >
          {device.connected ? "Connected" : "Disconnected"}
        </Stat>
        <Stat label="Last sync">{device.connected ? device.lastSync : "When the band came off"}</Stat>
        <Stat label="Firmware">{device.firmware}</Stat>
      </dl>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        Sensors and hardware ({device.sensors.length})
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {device.sensors.map((s) => (
              <li key={s.id} className="flex items-start gap-2 py-2">
                {s.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" aria-label="OK" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Needs attention" />}
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {s.name}
                    {s.research && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">{SWEAT_LABEL}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.hardware} · {s.measures}
                  </p>
                  <p className={cn("text-xs", s.ok ? "text-slate-600" : "text-amber-700")}>{s.status}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-2 grid grid-cols-1 gap-1 border-t border-slate-100 pt-2 text-xs sm:grid-cols-2">
            {MARQ_PLATFORM.map((p) => (
              <div key={p.label}>
                <dt className="inline text-slate-500">{p.label}: </dt>
                <dd className="inline text-slate-700">{p.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function Stat({ label, icon, warn, children }: { label: string; icon?: React.ReactNode; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn("mt-0.5 flex items-center gap-1.5 font-medium", warn ? "text-amber-800" : "text-slate-900")}>
        {icon}
        {children}
      </dd>
    </div>
  );
}

const DOCTOR_MAIN: SenseMetric[] = ["nightEda", "bodyWater", "sodium"];
const RESEARCH: SenseMetric[] = ["potassium", "glucose", "lactate"];

/** Doctor: the new signals against the personal baseline, sweat analytes marked research-grade. */
export function SenseCharts({ days, uptoDay }: { days: SenseEvaluation[]; uptoDay: number }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Waves className="size-4 text-teal-600" aria-hidden /> MarQ Sense signals vs personal baseline
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {DOCTOR_MAIN.map((m) => (
          <SenseChart key={m} metric={m} days={days} uptoDay={uptoDay} />
        ))}
        <div className="rounded-2xl bg-amber-50/60 p-3 ring-1 ring-amber-200">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
            <FlaskConical className="size-3.5" /> {SWEAT_LABEL} — not a blood test
          </p>
          <p className="mt-1 text-xs text-amber-900/80">
            Sweat values are not blood values (sweat glucose is far lower than blood glucose). Use them for trends only.
          </p>
          <div className="mt-2 space-y-2">
            {RESEARCH.map((m) => (
              <SenseChart key={m} metric={m} days={days} uptoDay={uptoDay} compact />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        EDA and body water: night 00:00–05:00 at rest (electrode contact ≥ 50%). Body water is a prototype bioimpedance estimate. Sweat: daytime
        median while sweating (≥ 6 readings). Shaded band = usual range (median ± 2 robust SD).
      </p>
    </section>
  );
}

const CARD_ICON: Record<PlainCard["id"], typeof Droplets> = { hydration: Droplets, stress: HeartPulse, sweat: FlaskConical };
const TONE: Record<PlainCard["tone"], string> = {
  ok: "bg-white ring-slate-200",
  attention: "bg-amber-50 ring-amber-200",
  info: "bg-slate-50 ring-slate-200",
};

/** Patient: plain-language cards. No z-scores; a sweat number only with what it means. */
export function SenseCards({ cards, area }: { cards: PlainCard[]; area?: string }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">From your MarQ Sense band</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = CARD_ICON[c.id];
          return (
            <article key={c.id} className={cn("rounded-2xl p-4 shadow-sm ring-1", TONE[c.tone])}>
              <p className="flex items-start gap-2 font-semibold text-slate-900">
                <Icon className={cn("mt-0.5 size-4 shrink-0", c.tone === "attention" ? "text-amber-600" : "text-teal-600")} aria-hidden />
                {c.headline}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{c.detail}</p>
              {c.note && <p className="mt-2 text-[11px] font-medium text-amber-800">{c.note}</p>}
            </article>
          );
        })}
      </div>
      {area && (
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="size-3.5" /> Location is kept as your area only ({area}) — never your exact position.
        </p>
      )}
    </section>
  );
}

