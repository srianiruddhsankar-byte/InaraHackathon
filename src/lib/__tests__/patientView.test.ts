import { describe, expect, it } from "vitest";
import { patientVisibleReports } from "../patientView";
import { approvePlan, savePlanDraft, type PlanContent } from "../treatment";
import type { Report } from "../types";
import { addDoctorEdit, approve } from "../versions";
import { patientData } from "./helpers";

const plan: PlanContent = {
  medications: [{ name: "As typed by doctor", dose: "x", frequency: "y", duration: "z", instructions: "" }],
  lifestyle: ["Walk daily"],
  followUpTests: [{ name: "HbA1c", testKey: "hba1c", inWeeks: 12 }],
  nextReviewDate: "2026-06-15",
  doctorNotes: "",
};

function withDraftSecrets(report: Report): Report {
  const draft = report.versions[0];
  const marked: Report = { ...report, versions: [{ ...draft, text: "AI-SECRET", patientText: "AI-PATIENT-SECRET" }] };
  return addDoctorEdit(marked, {
    id: "e1",
    author: "Dr",
    timestamp: "2026-03-16T10:00:00Z",
    text: "EDIT-SECRET",
    patientText: "EDIT-PATIENT-SECRET",
  });
}

describe("patientVisibleReports", () => {
  it("shows only approved reports, newest first, with patient text for every one", () => {
    const { reports } = patientData("ravi");
    const views = patientVisibleReports("ravi", reports, []);
    expect(views.map((v) => v.date)).toEqual(["2025-03-15", "2024-03-15", "2023-03-15"]);
    for (const v of views) expect(v.explanation).toBeTruthy();
  });

  it("never shows ai_draft or doctor_edited text, or the clinical summary", () => {
    const { reports } = patientData("ravi");
    const latest = withDraftSecrets(reports.at(-1)!);
    const unapproved = [...reports.slice(0, 3), latest];
    expect(JSON.stringify(patientVisibleReports("ravi", unapproved, []))).not.toMatch(/SECRET/);

    const approved = approve(latest, {
      id: "a1",
      author: "Dr. Meera Nair",
      timestamp: "2026-03-16T11:00:00Z",
      text: "CLINICAL-ONLY",
      patientText: "Approved words for Ravi.",
    });
    const views = patientVisibleReports("ravi", [...reports.slice(0, 3), approved], []);
    expect(views[0].explanation).toBe("Approved words for Ravi.");
    const json = JSON.stringify(views);
    expect(json).not.toMatch(/SECRET|CLINICAL-ONLY/);
  });

  it("shows only the approved treatment plan, verbatim", () => {
    const { reports } = patientData("ravi");
    const latest = approve(reports.at(-1)!, { id: "a1", author: "Dr", timestamp: "2026-03-16T11:00:00Z" });
    const input = (id: string, content: PlanContent) => ({
      id, patientId: "ravi", reportId: latest.id, author: "Dr", timestamp: `2026-03-16T1${id.length}:00:00Z`, content,
    });
    const draftOnly = savePlanDraft([], input("d", { ...plan, doctorNotes: "PLAN-DRAFT" }));
    expect(patientVisibleReports("ravi", [latest], draftOnly)[0].plan).toBeUndefined();

    const approvedPlans = approvePlan(draftOnly, input("ap", plan));
    const shown = patientVisibleReports("ravi", [latest], approvedPlans)[0].plan!;
    expect(shown.status).toBe("approved");
    expect(shown.medications[0].name).toBe("As typed by doctor");
  });

  it("strips safety overrides and doctor notes from the patient's plan", () => {
    const { reports } = patientData("ravi");
    const latest = approve(reports.at(-1)!, { id: "a1", author: "Dr", timestamp: "2026-03-16T11:00:00Z" });
    const content: PlanContent = {
      ...plan,
      doctorNotes: "DOCTOR-ONLY",
      medications: [
        {
          name: "Ibuprofen", dose: "400 mg", frequency: "SOS", duration: "", instructions: "",
          override: { reason: "OVERRIDE-REASON", author: "Dr", timestamp: "2026-03-16T10:00:00Z", rules: ["x"] },
        },
      ],
      stopMedications: [{ name: "Diclofenac", dose: "50 mg", reason: "Kidneys", author: "Dr", timestamp: "2026-03-16T10:00:00Z" }],
    };
    const plans = approvePlan([], { id: "ap", patientId: "ravi", reportId: latest.id, author: "Dr", timestamp: "2026-03-16T12:00:00Z", content });
    const shown = patientVisibleReports("ravi", [latest], plans)[0].plan!;
    expect(JSON.stringify(shown)).not.toMatch(/OVERRIDE-REASON|DOCTOR-ONLY/);
    expect(shown.stopMedications?.[0].name).toBe("Diclofenac");
  });

  it("never shows another patient's reports", () => {
    const { reports } = patientData("priya");
    expect(patientVisibleReports("ravi", reports, [])).toEqual([]);
  });
});
