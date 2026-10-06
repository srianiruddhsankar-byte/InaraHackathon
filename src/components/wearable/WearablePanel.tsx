"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CloudSun, Gauge, Pause, Play, RefreshCw, Watch } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { analyseWearable } from "@/lib/wearable/analyse";
import { BASELINE, usualHrAmplitude } from "@/lib/wearable/baseline";
import { canProcessWearable, doctorCanView } from "@/lib/wearable/consent";
import { detectPatterns } from "@/lib/wearable/detect";
import { dayDate, METRIC_INFO, NIGHT_METRICS, WINDOW_DAYS } from "@/lib/wearable/types";
import { cn } from "@/lib/utils";
import { useInaraStore } from "@/store/useInaraStore";
import { usePopulationStore } from "@/store/usePopulationStore";
import { useWeatherStore } from "@/store/useWeatherStore";
import { ConsentSummary } from "./ConsentSummary";
import { LocalComparison } from "./LocalComparison";
import { NightlyChart } from "./NightlyChart";
import { PossiblePatterns } from "./PossiblePatterns";
import { WeatherHrChart } from "./WeatherHrChart";

const REPLAY_FROM = 20;
const REPLAY_MS_PER_DAY = 1000;

type Audience = "doctor" | "patient";

const fmt = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : v.toFixed(d));

/**
 * Wearable view for one patient: nightly resting metrics against the personal
 * baseline, daytime heart rate against the weather, data quality, and a
 * Day 1 → Day 30 slider (with Replay). Doctors also see possible patterns and
 * the local population comparison for the selected day. No alerts yet.
 */
export function WearablePanel({ patientId, audience }: { patientId: string; audience: Audience }) {
  const allSettings = useInaraStore((s) => s.patientSettings);
  const patient = useInaraStore((s) => s.patients.find((p) => p.id === patientId));
  const settings = allSettings.find((p) => p.patientId === patientId);
  const { weather, origin, status, error, load, refresh } = useWeatherStore();
  const population = usePopulationStore();
  const [day, setDay] = useState(WINDOW_DAYS);
  const [playing, setPlaying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const allowed = audience === "doctor" ? doctorCanView(settings) : canProcessWearable(settings);

  const doctor = audience === "doctor";
  const loadPopulation = population.load;
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);
  useEffect(() => {
    if (allowed && doctor) void loadPopulation();
  }, [allowed, doctor, loadPopulation]);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  // Consent is checked inside analyseWearable too: nothing is generated without streaming consent.
  const analysis = useMemo(
    () => (allowed && weather ? analyseWearable(patientId, settings, weather) : null),
    [allowed, weather, patientId, settings],
  );

  // Possible patterns for the selected day (doctor only). Waits for the population file
  // (or its failure) so the ranking with local prevalence doesn't flicker.
  const populationSettled = population.status === "ready" || population.status === "error";
  const detection = useMemo(
    () =>
      doctor && patient && analysis?.status === "ok" && populationSettled
        ? detectPatterns({
            person: patient,
            nights: analysis.nights,
            amplitude: analysis.amplitude,
            weather: analysis.weatherDays,
            population: population.db,
            record: patient,
            settings: allSettings,
            day,
          })
        : null,
    [doctor, patient, analysis, populationSettled, population.db, allSettings, day],
  );

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  const replay = () => {
    stop();
    let d = REPLAY_FROM;
    setDay(d);
    setPlaying(true);
    timer.current = setInterval(() => {
      d += 1;
      setDay(d);
      if (d >= WINDOW_DAYS) stop();
    }, REPLAY_MS_PER_DAY);
  };
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success("Weather refreshed from Open-Meteo");
    } catch {
      toast.error("Couldn't reach Open-Meteo — still using the saved weather.");
    } finally {
      setRefreshing(false);
    }
  };

  if (!settings?.streaming.granted) {
    return (
      <EmptyState title="Wearable monitoring not enabled">
        {audience === "patient" ? (
          <>
            Turn on “Stream wearable data continuously” in{" "}
            <Link href="/patient/settings" className="font-medium text-teal-700 hover:underline">
              Privacy & settings
            </Link>{" "}
            to use this. No wearable data is processed while it is off.
          </>
        ) : (
          "The patient has not turned on continuous wearable streaming. No wearable data is processed."
        )}
      </EmptyState>
    );
  }
  if (!allowed) {
    return (
      <EmptyState title="Not shared for care">The patient has not allowed their wearable data to be used for their care.</EmptyState>
    );
  }
  if (!weather || !analysis) {
    return status === "error" ? (
      <EmptyState title="Couldn’t load weather">{error}</EmptyState>
    ) : (
      <div className="animate-pulse rounded-2xl bg-white p-10 text-center text-sm text-slate-500 ring-1 ring-slate-200">Loading wearable data…</div>
    );
  }
  if (analysis.status !== "ok") {
    return <EmptyState title="No wearable connected">This patient has no wearable device linked yet.</EmptyState>;
  }

  const night = analysis.nights[day - 1];
  const wx = analysis.weatherDays[day - 1];
  const amp = analysis.amplitude[day - 1];
  const usualAmp = usualHrAmplitude(analysis.amplitude, day - 1);
  const explained = wx.residual !== null && Math.abs(wx.residual) < 3;

  return (
    <div className="space-y-5">
      {/* Source + time controls */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto flex items-center gap-2 font-semibold text-slate-900">
            <Watch className="size-4 text-teal-600" aria-hidden /> Wearable monitoring
          </h2>
          <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">Simulated wearable data</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
            <CloudSun className="size-3.5" aria-hidden /> Real weather · {weather.location.name} · Open-Meteo ({origin === "live" ? "live" : "saved"})
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden /> Refresh from Open-Meteo
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex min-w-[240px] flex-1 items-center gap-3 text-sm">
            <span className="shrink-0 text-xs font-medium text-slate-500">Day 1</span>
            <input
              type="range"
              min={1}
              max={WINDOW_DAYS}
              value={day}
              onChange={(e) => {
                stop();
                setDay(Number(e.target.value));
              }}
              className="w-full accent-teal-600"
              aria-label="Replay the days"
            />
            <span className="shrink-0 text-xs font-medium text-slate-500">Day {WINDOW_DAYS}</span>
          </label>
          <Button
            className={cn("min-w-[104px]", playing ? "" : "bg-teal-600 text-white hover:bg-teal-700")}
            variant={playing ? "outline" : "default"}
            onClick={playing ? stop : replay}
          >
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />} {playing ? "Pause" : `Replay ${REPLAY_FROM}→${WINDOW_DAYS}`}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-semibold text-slate-900 tabular-nums" aria-live="polite">
            Day {day} · {format(parseISO(dayDate(day - 1)), "EEE d MMM yyyy")}
          </p>
          <p className="text-xs text-slate-500">
            {night.judged
              ? `Compared with the previous ${night.baselineNights} valid nights`
              : `Building personal baseline: ${Math.min(night.baselineNights, BASELINE.minNights)}/${BASELINE.minNights} nights`}
          </p>
        </div>
      </section>

      <div className={cn("grid gap-5", doctor && "lg:grid-cols-[1fr_360px]")}>
        <div className="space-y-5">
          {/* Nightly resting metrics */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              {doctor ? "Nightly resting metrics (00:00–05:00, low motion) vs personal baseline" : "Your nights compared with your usual"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {NIGHT_METRICS.map((m) => (
                <NightlyChart
                  key={m}
                  metric={m}
                  nights={analysis.nights}
                  uptoDay={day}
                  title={doctor ? undefined : METRIC_INFO[m].patientLabel}
                  plainZ={!doctor}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Shaded band = this person’s usual range (median ± 2 robust SD of the previous {BASELINE.targetNights}–{BASELINE.maxNights} nights).
            </p>
          </section>

          {/* Weather */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">
              {doctor ? "Afternoon heart rate vs weather-expected" : "Heat and your daytime heart rate"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {doctor && analysis.heatModel
                ? `Personal heat effect learned from Days 1–21: +${analysis.heatModel.slope.toFixed(1)} bpm per °C “feels like” and +${analysis.heatModel.humiditySlope.toFixed(2)} bpm per % humidity (R² ${analysis.heatModel.r2.toFixed(2)}, ${analysis.heatModel.n} hours).`
                : "Heart rate goes up in hot, humid weather. Inara takes the real weather into account."}
            </p>
            <WeatherHrChart days={analysis.weatherDays} uptoDay={day} />
            <p className={cn("mt-2 rounded-xl px-3 py-2 text-sm", explained ? "bg-slate-50 text-slate-700" : "bg-amber-50 text-amber-900")}>
              Day {day} afternoon: feels like {fmt(wx.apparentTemp, 1)} °C, humidity {fmt(wx.humidity)}%.{" "}
              {doctor ? (
                <>
                  Observed {fmt(wx.observedHr, 1)} bpm vs expected {fmt(wx.expectedHr, 1)} bpm (residual{" "}
                  {wx.residual === null ? "—" : `${wx.residual > 0 ? "+" : ""}${wx.residual.toFixed(1)}`}) —{" "}
                  {explained ? "explained by the weather." : "higher than the weather explains."}
                </>
              ) : explained ? (
                "Your daytime heart rate matched what we expect in this weather."
              ) : (
                "Your daytime heart rate was higher than the weather explains."
              )}
            </p>
          </section>
        </div>

        {doctor && (
          <aside className="space-y-5">
            <PossiblePatterns detection={detection} />
            <LocalComparison
              reference={detection?.reference ?? null}
              usualHr={night.baseline.restingHr?.median ?? null}
              tonightHr={night.night.valid ? night.night.restingHr : null}
              loading={!populationSettled}
            />
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Gauge className="size-4 text-teal-600" aria-hidden /> Data quality
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Usable samples (30 days)" value={`${analysis.quality}%`} />
                <Row label={`Night of day ${day}`} value={night.night.valid ? `${night.night.quality}% usable` : "Not enough data"} warn={!night.night.valid} />
                <Row label="Dropped: off-wrist" value={String(analysis.dropped.notWorn)} />
                <Row label="Dropped: gaps" value={String(analysis.dropped.missing)} />
                <Row label="Dropped: impossible values" value={String(analysis.dropped.impossible)} />
              </dl>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Day–night rhythm</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row
                  label="HR day − night"
                  value={`${fmt(amp.hr)} bpm`}
                  warn={amp.hr !== null && usualAmp !== null && amp.hr < usualAmp * 0.7}
                />
                <Row label="Usual" value={usualAmp === null ? "—" : `${usualAmp.toFixed(0)} bpm`} />
                <Row label="Skin temp day − night" value={`${fmt(amp.skinTemp, 1)} °C`} />
              </dl>
              <p className="mt-2 text-xs text-slate-500">A much smaller day–night difference (flattened rhythm) can be an early sign of illness.</p>
            </section>
            <ConsentSummary settings={settings} />
          </aside>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Early warning, not a diagnosis. Wearable data is simulated in this prototype; weather is real.
        {!doctor && " If you feel unwell, contact your doctor."}
      </p>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className={cn("font-medium tabular-nums", warn ? "text-amber-700" : "text-slate-900")}>{value}</dd>
    </div>
  );
}
