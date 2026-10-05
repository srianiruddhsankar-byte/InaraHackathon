import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";

describe("store", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("loads seed data and exposes selectors", () => {
    const s = useInaraStore.getState();
    expect(s.getPatient("ravi")?.name).toBe("Ravi Kumar");
    expect(s.getReports("ravi")).toHaveLength(4);
    expect(s.getLatestReport("ravi")?.date).toBe("2026-03-15");
    expect(s.getApprovedReports("ravi")).toHaveLength(3);
  });

  it("saveDoctorEdit and approveReport append versions and keep the old ones", () => {
    const { getLatestReport, saveDoctorEdit, approveReport } = useInaraStore.getState();
    const before = getLatestReport("ravi")!;
    const draft = before.versions[0];

    saveDoctorEdit(before.id, "Edited text", "Metformin 500 mg");
    approveReport(before.id);

    const after = useInaraStore.getState().getLatestReport("ravi")!;
    expect(after.versions.map((v) => v.status)).toEqual(["ai_draft", "doctor_edited", "approved"]);
    expect(after.versions[0]).toEqual(draft);
    expect(after.versions[2]).toMatchObject({ text: "Edited text", prescription: "Metformin 500 mg" });
    expect(useInaraStore.getState().getApprovedReports("ravi")).toHaveLength(4);
  });

  it("does not change a report that is already approved", () => {
    const { getReports, approveReport, saveDoctorEdit } = useInaraStore.getState();
    const approved = getReports("ravi")[0];
    approveReport(approved.id);
    saveDoctorEdit(approved.id, "late edit");
    expect(useInaraStore.getState().getReports("ravi")[0].versions).toEqual(approved.versions);
  });

  it("resetDemo restores the seed", () => {
    const { getLatestReport, approveReport, resetDemo } = useInaraStore.getState();
    approveReport(getLatestReport("ravi")!.id);
    resetDemo();
    expect(useInaraStore.getState().getApprovedReports("ravi")).toHaveLength(3);
  });
});
