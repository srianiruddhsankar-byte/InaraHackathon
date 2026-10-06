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

  it("login starts a single-role session and logout ends it", () => {
    const { users, login, logout } = useInaraStore.getState();
    const meera = users.find((u) => u.id === "u-meera")!;
    const ravi = users.find((u) => u.id === "u-ravi")!;

    login(meera);
    expect(useInaraStore.getState().session).toMatchObject({ userId: "u-meera", role: "doctor" });

    login(ravi);
    expect(useInaraStore.getState().session).toMatchObject({ userId: "u-ravi", role: "patient" });

    logout();
    expect(useInaraStore.getState().session).toBeNull();
  });

  it("resetDemo logs the user out", () => {
    const { users, login, resetDemo } = useInaraStore.getState();
    login(users[0]);
    resetDemo();
    expect(useInaraStore.getState().session).toBeNull();
    expect(useInaraStore.getState().users).toHaveLength(6);
  });
});
