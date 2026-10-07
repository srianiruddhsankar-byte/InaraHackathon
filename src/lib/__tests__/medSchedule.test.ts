import { describe, expect, it } from "vitest";
import { buildDailySchedule, scheduleFor } from "../medSchedule";
import type { Medication } from "../types";

const med = (frequency: string, instructions = "", name = "X"): Medication => ({ name, dose: "1 tab", frequency, duration: "30 days", instructions });

describe("scheduleFor (frequency → time of day)", () => {
  it.each([
    ["OD", ["morning"]],
    ["BD", ["morning", "night"]],
    ["TDS", ["morning", "afternoon", "night"]],
    ["HS", ["night"]],
    ["SOS", ["when_needed"]],
    ["Weekly", ["weekly"]],
    ["Once daily", ["morning"]],
    ["Twice daily", ["morning", "night"]],
    ["As needed for knee pain", ["when_needed"]],
    ["Once a week", ["weekly"]],
  ])("%s → %j", (frequency, slots) => {
    expect(scheduleFor(med(frequency))).toEqual(slots);
  });

  it("OD goes to night when the instructions say bedtime", () => {
    expect(scheduleFor(med("OD", "Take at bedtime"))).toEqual(["night"]);
    expect(scheduleFor(med("od", "After dinner, at night"))).toEqual(["night"]);
    expect(scheduleFor(med("OD", "After breakfast"))).toEqual(["morning"]);
  });

  it("unknown free text is kept 'as your doctor told you'", () => {
    expect(scheduleFor(med("Alternate days"))).toEqual(["as_directed"]);
  });
});

describe("buildDailySchedule", () => {
  it("groups medicines in day order and lists a BD medicine twice", () => {
    const groups = buildDailySchedule([
      med("SOS", "", "Paracetamol"),
      med("BD", "", "Metformin"),
      med("OD", "at bedtime", "Atorvastatin"),
      med("TDS", "", "Iron"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Morning", "Afternoon", "Night", "Only when needed"]);
    expect(groups[0].medicines.map((m) => m.name)).toEqual(["Metformin", "Iron"]);
    expect(groups[1].medicines.map((m) => m.name)).toEqual(["Iron"]);
    expect(groups[2].medicines.map((m) => m.name)).toEqual(["Metformin", "Atorvastatin", "Iron"]);
    expect(groups[3].medicines.map((m) => m.name)).toEqual(["Paracetamol"]);
  });

  it("empty plan → no groups", () => {
    expect(buildDailySchedule([])).toEqual([]);
  });
});
