// The patient's medicines as a daily schedule (Morning / Afternoon / Night /
// Once a week / Only when needed). Pure: reads the approved plan's frequency
// codes (OD, BD, …) or free text and never changes what the doctor wrote.
import type { FoodTiming, Medication, TreatmentPlan } from "./types";

export type Slot = "morning" | "afternoon" | "night" | "weekly" | "when_needed" | "as_directed";

export const SLOT_ORDER: Slot[] = ["morning", "afternoon", "night", "weekly", "when_needed", "as_directed"];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
  weekly: "Once a week",
  when_needed: "Only when needed",
  as_directed: "As your doctor told you",
};

const BEDTIME = /\b(bed ?time|at night|night ?time|before (sleep|bed)|hs)\b/i;

/** When in the day a medicine is taken, from its frequency (and "bedtime" in the instructions for OD). */
export function scheduleFor(med: Pick<Medication, "frequency" | "instructions">): Slot[] {
  const f = med.frequency.trim().toLowerCase();
  const has = (re: RegExp) => re.test(f);
  if (has(/^(sos|prn)$|as needed|when needed|if needed|only when/)) return ["when_needed"];
  if (has(/^weekly$|once (a|per) week|every week/)) return ["weekly"];
  if (has(/^hs$|bed ?time|at night/)) return ["night"];
  if (has(/^(tds|tid)$|thrice|three times/)) return ["morning", "afternoon", "night"];
  if (has(/^bd$|^bid$|twice|two times/)) return ["morning", "night"];
  if (has(/^od$|once (a )?daily|once a day|^daily$/)) return BEDTIME.test(med.instructions ?? "") ? ["night"] : ["morning"];
  return ["as_directed"];
}

export interface ScheduledMedicine {
  name: string;
  dose: string;
  foodTiming?: FoodTiming;
  duration: string;
  instructions: string;
  /** The doctor's frequency, verbatim (shown under "As your doctor told you"). */
  frequency: string;
}

export interface ScheduleGroup {
  slot: Slot;
  label: string;
  medicines: ScheduledMedicine[];
}

/** Medicines grouped by time of day, in day order; empty slots left out. */
export function buildDailySchedule(medications: Medication[]): ScheduleGroup[] {
  const groups = new Map<Slot, ScheduledMedicine[]>();
  for (const m of medications) {
    const item: ScheduledMedicine = {
      name: m.name,
      dose: m.dose,
      foodTiming: m.foodTiming,
      duration: m.duration,
      instructions: m.instructions,
      frequency: m.frequency,
    };
    for (const slot of scheduleFor(m)) groups.set(slot, [...(groups.get(slot) ?? []), item]);
  }
  return SLOT_ORDER.filter((s) => groups.has(s)).map((slot) => ({ slot, label: SLOT_LABEL[slot], medicines: groups.get(slot)! }));
}

export function planSchedule(plan: TreatmentPlan | undefined): ScheduleGroup[] {
  return plan ? buildDailySchedule(plan.medications) : [];
}
