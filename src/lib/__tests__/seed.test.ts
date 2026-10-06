import { describe, expect, it } from "vitest";
import { seedPatients, seedReports } from "../seed";
import { TEST_KEYS } from "../tests";

describe("seed", () => {
  const reports = seedReports();

  it("has 3 patients with all 24 tests; Ravi's Mar 2026 report is not seeded (the lab uploads it)", () => {
    expect(seedPatients()).toHaveLength(3);
    expect(reports).toHaveLength(11);
    expect(reports.filter((r) => r.patientId === "ravi").map((r) => r.date)).toEqual(["2023-03-15", "2024-03-15", "2025-03-15"]);
    for (const r of reports) expect(r.values.map((v) => v.testKey)).toEqual(TEST_KEYS);
  });

  it("approves the first 3 reports and leaves Mar 2026 as an AI draft", () => {
    for (const r of reports) {
      const statuses = r.versions.map((v) => v.status);
      expect(statuses).toEqual(r.date === "2026-03-15" ? ["ai_draft"] : ["ai_draft", "approved"]);
    }
  });

  it("is deterministic and returns fresh copies", () => {
    expect(seedReports()).toEqual(reports);
    expect(seedReports()).not.toBe(reports);
  });
});

describe("seed: patient text", () => {
  it("every approved seeded version has a plain-language patient explanation", () => {
    for (const r of seedReports()) {
      for (const v of r.versions) expect(v.patientText, `${r.id} ${v.status}`).toBeTruthy();
    }
  });
});

describe("seed: patient records and raw lab rows", () => {
  it("raw lab rows normalise back to the stored values", async () => {
    const { normalise } = await import("../normalise");
    for (const r of seedReports()) {
      expect(r.raw).toHaveLength(r.values.length);
      r.raw!.forEach((raw, i) => {
        const n = normalise(raw.name, raw.value, raw.unit);
        expect(n.testKey, raw.name).toBe(r.values[i].testKey);
        expect(n.value, `${r.id} ${raw.name}`).toBe(r.values[i].value);
      });
    }
  });

  it("Ravi has hypertension, amlodipine and self-reported ibuprofen, with 3 past visits", () => {
    const ravi = seedPatients().find((p) => p.id === "ravi")!;
    expect(ravi.chronicConditions).toEqual(["Hypertension (since 2021)"]);
    expect(ravi.currentMedications.map((m) => m.name)).toEqual(["Amlodipine", "Ibuprofen"]);
    expect(ravi.visitHistory).toHaveLength(3);
    const priya = seedPatients().find((p) => p.id === "priya")!;
    expect(priya.allergies).toEqual(["Sulfa drugs"]);
    expect(priya.currentMedications).toEqual([]);
  });
});
