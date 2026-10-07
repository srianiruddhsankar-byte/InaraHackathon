import { describe, expect, it } from "vitest";
import { buildPatientRecord } from "../patientView";
import {
  buildTrajectories,
  formatPct,
  MEANINGFUL_CHANGE,
  patientTrajectorySentences,
  percentChange,
  plainAmount,
  trajectorySeries,
  trajectorySummary,
} from "../trajectory";
import { seedPatients } from "../seed";
import type { Report } from "../types";
import { approve } from "../versions";
import { karthikDengue, patientData } from "./helpers";

const ravi = seedPatients().find((p) => p.id === "ravi")!;

function report(date: string, values: Report["values"]): Report {
  return { id: `r-${date}`, patientId: "ravi", date, labName: "Lab", values, versions: [] };
}

describe("percentChange", () => {
  it("relative change in % vs the earlier value", () => {
    expect(percentChange(100, 125)).toBeCloseTo(25);
    expect(percentChange(92, 64)).toBeCloseTo(-30.43, 2);
    expect(percentChange(5, 5)).toBe(0);
  });

  it("division by zero and non-finite values → null", () => {
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(NaN, 5)).toBeNull();
    expect(percentChange(5, Infinity)).toBeNull();
  });

  it("negative baselines use |from| so the sign follows the direction", () => {
    expect(percentChange(-10, -5)).toBeCloseTo(50);
  });

  it("formats with a real minus sign", () => {
    expect(formatPct(-30.9)).toBe("−30.9%");
    expect(formatPct(4.24)).toBe("+4.2%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(-0.01)).toBe("0.0%");
  });
});

describe("trajectorySummary", () => {
  it("a single report has no trajectory", () => {
    expect(trajectorySummary("hb", [{ date: "2026-03-15", value: 14 }], "M")).toBeNull();
    expect(trajectorySummary("hb", [], "M")).toBeNull();
  });

  it("two reports: change vs previous = vs baseline = since first", () => {
    const t = trajectorySummary(
      "platelets",
      [
        { date: "2026-03-15", value: 260 },
        { date: "2026-10-05", value: 85 },
      ],
      "M",
    )!;
    expect(t.vsPrevious!.pct).toBeCloseTo(-67.3, 1);
    expect(t.vsBaseline!.pct).toBeCloseTo(-67.3, 1);
    expect(t.sinceFirst!.abs).toBe(-175);
    expect(t.direction).toBe("falling");
    expect(t.meaningful).toBe(true);
    expect(t.inRange).toBe(false);
    expect(t.highlight).toBe(false);
  });

  it("a zero baseline gives no % change (but keeps the absolute change)", () => {
    const t = trajectorySummary(
      "crp",
      [
        { date: "2025-03-15", value: 0 },
        { date: "2026-03-15", value: 3 },
      ],
      "M",
    )!;
    expect(t.vsPrevious).toEqual({ abs: 3, pct: null });
    expect(t.meaningful).toBe(false);
    expect(t.direction).toBe("stable");
  });

  it("censored values ('<5') are shown but excluded from % change, baseline and slope", () => {
    const pts = [
      { date: "2023-03-15", value: 5, qualifier: "<" as const },
      { date: "2024-03-15", value: 2 },
      { date: "2025-03-15", value: 4 },
      { date: "2026-03-15", value: 3 },
    ];
    const t = trajectorySummary("crp", pts, "M")!;
    expect(t.points).toHaveLength(4);
    expect(t.baselineMean).toBeCloseTo(3); // mean of 2 and 4, not the "<5"
    expect(t.sinceFirst!.date).toBe("2024-03-15");
    expect(t.sinceFirst!.pct).toBeCloseTo(50);

    // Censored latest → no % change at all.
    const latestCensored = trajectorySummary(
      "crp",
      [
        { date: "2025-03-15", value: 2 },
        { date: "2026-03-15", value: 5, qualifier: "<" as const },
      ],
      "M",
    )!;
    expect(latestCensored.vsPrevious).toBeUndefined();
    expect(latestCensored.vsBaseline).toBeUndefined();
    expect(latestCensored.sinceFirst).toBeUndefined();
    expect(latestCensored.meaningful).toBe(false);
    expect(latestCensored.inRange).toBe(true); // "<5" with the upper limit 5 is normal
  });

  it("eGFR from a censored creatinine is censored too", () => {
    const reports = [
      report("2025-03-15", [{ testKey: "creatinine", value: 0.5, unit: "mg/dL", flag: "low", qualifier: "<" }]),
      report("2026-03-15", [{ testKey: "creatinine", value: 1.0, unit: "mg/dL", flag: "normal" }]),
    ];
    const s = trajectorySeries(ravi, reports, "egfr");
    expect(s[0].qualifier).toBe(">");
    expect(trajectorySummary("egfr", s, "M")!.vsPrevious).toBeUndefined();
  });
});

describe("buildTrajectories", () => {
  it("qualitative tests (NS1, IgM) are excluded", () => {
    const { patient, reports } = karthikDengue();
    const keys = buildTrajectories(patient, reports).map((t) => t.key);
    expect(keys).not.toContain("ns1");
    expect(keys).not.toContain("dengue_igm");
    expect(keys).toContain("platelets");
  });

  it("only biomarkers with ≥ 2 reports (Karthik before the alert: none)", () => {
    const { patient, reports } = patientData("karthik");
    expect(buildTrajectories(patient, reports)).toEqual([]);
  });

  it("Ravi: eGFR ≈ −31% since 2023 while still in range → highlighted first (KDIGO ≥ 25%)", () => {
    const { patient, reports } = patientData("ravi");
    const all = buildTrajectories(patient, reports);
    const egfr = all[0];
    expect(egfr.key).toBe("egfr");
    expect(egfr.points.map((p) => Math.round(p.value))).toEqual([92, 78, 71, 64]);
    expect(egfr.sinceFirst!.pct).toBeCloseTo(-30.9, 0);
    expect(egfr.vsBaseline!.pct).toBeCloseTo(-20.9, 0);
    expect(egfr.direction).toBe("falling");
    expect(egfr.inRange).toBe(true);
    expect(egfr.highlight).toBe(true);
    expect(egfr.threshold).toBe(MEANINGFUL_CHANGE.egfr);
    expect(egfr.ref).toBe("Ref: ≥60 mL/min/1.73m²");
    expect(egfr.slopePerYear!).toBeLessThan(-5);
    // Only eGFR is a meaningful in-range change; HbA1c, glucose, creatinine and ACR are meaningful but out of range.
    expect(all.filter((t) => t.highlight).map((t) => t.key)).toEqual(["egfr"]);
    expect(all.filter((t) => t.meaningful && !t.highlight).map((t) => t.key)).toEqual([
      "hba1c",
      "fasting_glucose",
      "creatinine",
      "urine_acr",
    ]);
    // Stable lipids are not meaningful (LDL +8.7% < 25%).
    expect(all.find((t) => t.key === "ldl")!.meaningful).toBe(false);
    expect(all.find((t) => t.key === "hba1c")!.ref).toBe("Ref: 4.0–5.6 %");
  });

  it("Arjun and Priya: no meaningful changes (no over-alerting)", () => {
    for (const id of ["arjun", "priya"]) {
      const { patient, reports } = patientData(id);
      expect(buildTrajectories(patient, reports).filter((t) => t.meaningful)).toEqual([]);
    }
  });

  it("Karthik after dengue: haematocrit +16.7% still in range is highlighted; platelets −67% out of range", () => {
    const { patient, reports } = karthikDengue();
    const all = buildTrajectories(patient, reports);
    const hct = all.find((t) => t.key === "hct")!;
    expect(hct.highlight).toBe(true);
    expect(hct.sinceFirst!.pct).toBeCloseTo(16.7, 1);
    const plt = all.find((t) => t.key === "platelets")!;
    expect(plt.meaningful && !plt.inRange).toBe(true);
  });

  it("every threshold has a reason", () => {
    for (const th of Object.values(MEANINGFUL_CHANGE)) {
      expect(th.percent).toBeGreaterThan(0);
      expect(th.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("patient wording", () => {
  it("plain amounts, no numbers", () => {
    expect(plainAmount(-31)).toBe("by about a third");
    expect(plainAmount(-50)).toBe("by about half");
    expect(plainAmount(275)).toBe("to more than double");
    expect(plainAmount(4)).toBe("slightly");
  });

  it("Ravi: kidney filtering dropped by about a third since 2023 — no z-scores, slopes or %", () => {
    const { patient, reports } = patientData("ravi");
    const sentences = patientTrajectorySentences(buildTrajectories(patient, reports));
    expect(sentences[0]).toBe(
      "Your kidney filtering has dropped by about a third since 2023 — it is still in the normal range, and your doctor is following this up.",
    );
    // Creatinine says the same as eGFR → not repeated.
    expect(sentences.some((s) => /creatinine/i.test(s))).toBe(false);
    for (const s of sentences) {
      expect(s).not.toMatch(/\d+(\.\d+)?\s*%|z-?score|slope|\/yr|you have/i);
    }
  });

  it("the patient record uses approved reports only", () => {
    const { patient, reports } = patientData("ravi");
    // Mar 2026 not approved yet → eGFR since 2023 is −23%, below the 25% threshold.
    const before = buildPatientRecord({ patient, reports, plans: [] });
    expect(before.changes.some((s) => /kidney filtering/.test(s))).toBe(false);
    const approved = approve(reports.at(-1)!, { id: "a1", author: "Dr. Meera Nair", timestamp: "2026-03-20T09:00:00.000Z" });
    const after = buildPatientRecord({ patient, reports: [...reports.slice(0, -1), approved], plans: [] });
    expect(after.changes[0]).toMatch(/^Your kidney filtering has dropped by about a third since 2023/);
  });

  it("Arjun: no change sentences", () => {
    const { patient, reports } = patientData("arjun");
    expect(buildPatientRecord({ patient, reports, plans: [] }).changes).toEqual([]);
  });
});
