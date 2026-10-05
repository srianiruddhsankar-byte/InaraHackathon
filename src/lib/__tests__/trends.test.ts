import { describe, expect, it } from "vitest";
import { computeTrend, computeTrends, findTrend, linearRegression } from "../trends";
import { patientData } from "./helpers";

describe("linearRegression", () => {
  it("returns slope per year from report dates", () => {
    const { slopePerYear, r2 } = linearRegression([
      { date: "2024-01-01", value: 10 },
      { date: "2026-01-01", value: 14 },
    ]);
    expect(slopePerYear).toBeCloseTo(2, 2);
    expect(r2).toBeCloseTo(1, 6);
  });
});

describe("computeTrend", () => {
  it("uses the mean of earlier reports as baseline", () => {
    const t = computeTrend(
      "hba1c",
      [
        { date: "2023-03-15", value: 5.4 },
        { date: "2024-03-15", value: 5.6 },
        { date: "2025-03-15", value: 5.9 },
        { date: "2026-03-15", value: 6.1 },
      ],
      "M",
    )!;
    expect(t.baselineMean).toBeCloseTo(5.633, 3);
    expect(t.deviation).toBeCloseTo(0.467, 3);
    expect(t.direction).toBe("rising");
    expect(t.driftingWithinRange).toBe(false); // 6.1 is out of range
  });

  it("flags drifting within range when the trend is significant but the latest value is normal", () => {
    const t = computeTrend(
      "fasting_glucose",
      [
        { date: "2023-03-15", value: 78 },
        { date: "2024-03-15", value: 84 },
        { date: "2025-03-15", value: 90 },
        { date: "2026-03-15", value: 96 },
      ],
      "M",
    )!;
    expect(t.direction).toBe("rising");
    expect(t.driftingWithinRange).toBe(true);
  });

  it("needs at least 3 reports for a trend", () => {
    const t = computeTrend(
      "hba1c",
      [
        { date: "2025-03-15", value: 5.0 },
        { date: "2026-03-15", value: 5.5 },
      ],
      "M",
    )!;
    expect(t.direction).toBe("stable");
  });
});

describe("Ravi trends", () => {
  const { patient, reports } = patientData("ravi");
  const trends = computeTrends(patient, reports);

  it("latest eGFR ≈ 64 and slope ≈ −9/yr (rapid decline)", () => {
    const egfr = findTrend(trends, "egfr")!;
    expect(Math.abs(egfr.latest - 64)).toBeLessThanOrEqual(2);
    expect(Math.abs(egfr.slopePerYear - -9)).toBeLessThanOrEqual(1);
    expect(egfr.direction).toBe("falling");
  });

  it("HbA1c is rising", () => {
    expect(findTrend(trends, "hba1c")!.direction).toBe("rising");
  });
});

describe("Arjun trends", () => {
  it("are all stable", () => {
    const { patient, reports } = patientData("arjun");
    const moving = computeTrends(patient, reports).filter((t) => t.direction !== "stable");
    expect(moving).toEqual([]);
  });
});
