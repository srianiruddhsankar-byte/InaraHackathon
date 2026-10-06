"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

/** Tiny trend line without axes. The latest point is drawn larger. */
export function Sparkline({ values, out }: { values: number[]; out?: boolean }) {
  const data = values.map((value, i) => ({ i, value }));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.3, Math.abs(max) * 0.05, 0.1);
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 6, bottom: 4, left: 6 }}>
          <YAxis hide domain={[min - pad, max + pad]} />
          <Line
            type="linear"
            dataKey="value"
            stroke="#0d9488"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === data.length - 1 ? (
                <circle key="last" cx={p.cx} cy={p.cy} r={3.5} fill={out ? "#dc2626" : "#0d9488"} stroke="#fff" strokeWidth={1.5} />
              ) : (
                <g key={`d${p.index}`} />
              )
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
