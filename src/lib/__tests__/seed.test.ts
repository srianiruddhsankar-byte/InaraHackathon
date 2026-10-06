import { describe, expect, it } from "vitest";
import { seedPatients, seedReports } from "../seed";
import { TEST_KEYS } from "../tests";

describe("seed", () => {
  const reports = seedReports();

  it("has 3 lab patients with the 25 routine tests (incl. haematocrit, no dengue-only tests); Ravi's Mar 2026 report is not seeded", () => {
    expect(seedPatients().map((p) => p.id)).toEqual(["ravi", "priya", "arjun", "karthik"]);
    const lab = reports.filter((r) => r.patientId !== "karthik");
    expect(lab).toHaveLength(11);
    expect(reports.filter((r) => r.patientId === "ravi").map((r) => r.date)).toEqual(["2023-03-15", "2024-03-15", "2025-03-15"]);
    const routine = TEST_KEYS.filter((k) => !["wbc", "ns1", "dengue_igm"].includes(k));
    for (const r of lab) expect(r.values.map((v) => v.testKey)).toEqual(routine);
  });

  it("approves the first 3 reports and leaves Mar 2026 as an AI draft", () => {
    for (const r of reports.filter((x) => x.patientId !== "karthik")) {
      const statuses = r.versions.map((v) => v.status);
      expect(statuses).toEqual(r.date === "2026-03-15" ? ["ai_draft"] : ["ai_draft", "approved"]);
    }
  });

  it("Karthik has one approved routine report (Mar 2026): his personal baseline", () => {
    const k = reports.filter((r) => r.patientId === "karthik");
    expect(k).toHaveLength(1);
    expect(k[0].date).toBe("2026-03-15");
    expect(k[0].versions.map((v) => v.status)).toEqual(["ai_draft", "approved"]);
    const v = Object.fromEntries(k[0].values.map((x) => [x.testKey, x.value]));
    expect(v).toMatchObject({ hb: 15.0, wbc: 6.8, platelets: 260, hct: 42, ast: 26, alt: 30 });
    expect(k[0].values.every((x) => x.flag === "normal")).toBe(true);
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
