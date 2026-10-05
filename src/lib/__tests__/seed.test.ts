import { describe, expect, it } from "vitest";
import { seedPatients, seedReports } from "../seed";

describe("seed", () => {
  it("returns fresh arrays on every call", () => {
    expect(Array.isArray(seedPatients())).toBe(true);
    expect(seedReports()).not.toBe(seedReports());
  });
});
