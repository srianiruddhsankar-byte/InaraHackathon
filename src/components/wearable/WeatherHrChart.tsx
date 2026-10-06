"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeatherAdjustedDay } from "@/lib/wearable/weather";

/** Afternoon resting HR: observed vs expected for the weather, with "feels like" temperature. */
export function WeatherHrChart({ days, uptoDay }: { days: WeatherAdjustedDay[]; uptoDay: number }) {
  const data = days.map((d) => {
    const day = d.day + 1;
    const shown = day <= uptoDay;
    return {
      day,
      observed: shown ? d.observedHr : null,
      expected: shown ? d.expectedHr : null,
      feelsLike: shown ? d.apparentTemp : null,
    };
  });
  return (
    <div className="h-56" role="img" aria-label={`Afternoon heart rate vs weather-expected heart rate, day 1 to ${uptoDay}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="day" type="number" domain={[1, days.length]} ticks={[1, 8, 15, 22, 30]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="hr" domain={["dataMin - 4", "dataMax + 4"]} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v.toFixed(0)} />
          <YAxis yAxisId="t" orientation="right" domain={[25, 45]} tick={{ fontSize: 11, fill: "#d97706" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v}°`} />
          <ReferenceLine yAxisId="hr" x={uptoDay} stroke="#94a3b8" strokeDasharray="3 3" />
          <Line yAxisId="t" dataKey="feelsLike" name="Feels like (°C)" stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.7} dot={false} isAnimationActive={false} />
          <Line yAxisId="hr" dataKey="expected" name="Expected for the weather (bpm)" stroke="#64748b" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line yAxisId="hr" dataKey="observed" name="Observed (bpm)" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          <Tooltip
            formatter={(v, name) => [typeof v === "number" ? v.toFixed(1) : String(v), String(name)]}
            labelFormatter={(d) => `Day ${d}, 12:00–17:00`}
            contentStyle={{ fontSize: 12, borderRadius: 12 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
