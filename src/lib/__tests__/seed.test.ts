import { describe, expect, it } from "vitest";
import { seedPatients, seedReports } from "../seed";
import { TEST_KEYS } from "../tests";

describe("seed", () => {
  const reports = seedReports();

  it("has 3 patients with 4 reports each and all 15 tests", () => {
    expect(seedPatients()).toHaveLength(3);
    expect(reports).toHaveLength(12);
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
