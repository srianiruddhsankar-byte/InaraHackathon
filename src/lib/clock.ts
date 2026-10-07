// One clock for the whole demo. Until the demo clock starts, timestamps are real
// time. Once it starts (the first wearable episode or "+6 h"), every timestamp —
// orders, uploads, approvals, plans, outcomes, wearable events — reads from the
// simulated clock (Day 30, 07:00 IST + simHours) plus the real time that has
// passed since it started, so the timeline always reads in order.
import { simNow } from "./wearable/checkin";

export interface ClockState {
  simHours: number;
  /** Real time (ms) when the demo clock started; null = not running (real time). */
  clockAnchor: number | null;
}

export function isDemoClockActive(c: ClockState): boolean {
  return c.clockAnchor !== null;
}

/** The current time as ISO 8601: the demo clock when it is running, else real time. */
export function clockNow(c: ClockState, realNowMs: number = Date.now()): string {
  if (c.clockAnchor === null) return new Date(realNowMs).toISOString();
  const elapsed = Math.max(0, realNowMs - c.clockAnchor);
  return new Date(Date.parse(simNow(c.simHours)) + elapsed).toISOString();
}

/** The current date (yyyy-MM-dd) in India time, from the same clock. */
export function clockToday(c: ClockState, realNowMs: number = Date.now()): string {
  const ist = new Date(Date.parse(clockNow(c, realNowMs)) + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 10);
}
