import { describe, expect, it } from "vitest";
import { getFindings } from "../findings";
import {
  buildPatientRecord,
  explanationPoints,
  nextSteps,
  overallStatus,
  printableReport,
  wearableOneLiner,
  type EpisodeStatusInput,
} from "../patientView";
import { seedPatients, seedReports } from "../seed";
import { approvePlan, DENGUE_WARNING_SIGNS, savePlanDraft, suggestPlanItems, type PlanContent } from "../treatment";
import type { Report, TargetOverride, TreatmentPlan } from "../types";
import { addDoctorEdit, approve } from "../versions";
import { karthikDengue, patientData } from "./helpers";

const urgent: EpisodeStatusInput = { closed: false, dismissed: false, latest: { recommendation: { level: "urgent" } } };

function approveWithPlan(report: Report, content: PlanContent, author = "Dr. Meera Nair"): { report: Report; plans: TreatmentPlan[] } {
  const approved = approve(report, { id: `a-${report.id}`, author, timestamp: "2026-10-05T04:00:00.000Z" });
  const plans = approvePlan([], { id: `p-${report.id}`, patientId: report.patientId, reportId: report.id, author, timestamp: "2026-10-05T05:00:00.000Z", content });
  return { report: approved, plans };
}

/** Ravi after demo step 2: his uploaded Mar 2026 report approved with a plan. */
function raviAfterDemo() {
  const { patient, reports } = patientData("ravi");
  const { report, plans } = approveWithPlan(reports.at(-1)!, {
    medications: [
      { name: "Metformin", dose: "500 mg", frequency: "BD", duration: "3 months", instructions: "After food", foodTiming: "after food" },
      { name: "Atorvastatin", dose: "10 mg", frequency: "OD", duration: "3 months", instructions: "At bedtime" },
    ],
    lifestyle: ["Walk 30 minutes daily"],
    followUpTests: [{ name: "HbA1c", testKey: "hba1c", inWeeks: 12 }],
    nextReviewDate: "2026-06-15",
    doctorNotes: "",
  });
  return { patient, reports: [...reports.slice(0, -1), report], plans };
}

/** Karthik after the full dengue flow: report approved, plan with the suggested dengue advice. */
function karthikAfterDengue() {
  const story = karthikDengue();
  const findings = getFindings(story.patient, story.reports, { suspectedDisease: story.ordered.suspectedDisease });
  const sug = suggestPlanItems(findings);
  const { report, plans } = approveWithPlan(story.report, {
    medications: [{ name: "Paracetamol", dose: "650 mg", frequency: "SOS", duration: "5 days", instructions: "For fever, max 4 g/day", foodTiming: "after food" }],
    lifestyle: sug.lifestyle,
    followUpTests: sug.followUpTests,
    nextReviewDate: "2026-10-12",
    doctorNotes: "",
  });
  return { patient: story.patient, reports: [...story.reports.slice(0, -1), report], plans, cases: [story.ordered] };
}

describe("overall status (traffic light) for the four demo patients", () => {
  it("Ravi → amber with calm wording (kidney decline is not urgent)", () => {
    const { patient, reports, plans } = raviAfterDemo();
    const r = buildPatientRecord({ patient, reports, plans });
    expect(r.status.level).toBe("amber");
    expect(r.status.title).toBe("A few things to keep an eye on");
    expect(r.status.message).toMatch(/not an emergency/);
    // Before the demo too (3 approved reports, prediabetes watch).
    expect(buildPatientRecord({ patient, reports: reports.slice(0, 3), plans: [] }).status.level).toBe("amber");
  });

  it("Priya → amber (her Mar 2026 draft is not counted)", () => {
    const { patient, reports } = patientData("priya");
    const r = buildPatientRecord({ patient, reports, plans: [] });
    expect(r.status.level).toBe("amber");
    expect(r.reports).toHaveLength(3);
  });

  it("Arjun → green", () => {
    const { patient, reports } = patientData("arjun");
    const r = buildPatientRecord({ patient, reports, plans: [] });
    expect(r.status).toMatchObject({ level: "green", title: "All looks good" });
  });

  it("Karthik → red after the dengue flow (warning signs in the approved plan)", () => {
    const k = karthikAfterDengue();
    const r = buildPatientRecord(k);
    expect(r.warningSigns).toBe(true);
    expect(r.status).toMatchObject({ level: "red", title: "Please follow your doctor's advice now" });
    // Before: one normal routine report → green.
    const before = buildPatientRecord({ patient: k.patient, reports: seedReports().filter((x) => x.patientId === "karthik"), plans: [] });
    expect(before.status.level).toBe("green");
  });
});

describe("overallStatus rules", () => {
  const base = { hasApproved: true, findings: [] };
  it("red only for urgent situations", () => {
    expect(overallStatus({ ...base, findings: [{ severity: "high" }] }).level).toBe("amber");
    expect(overallStatus({ ...base, episode: urgent }).level).toBe("red");
    expect(overallStatus({ ...base, plan: { lifestyle: [DENGUE_WARNING_SIGNS] } }).level).toBe("red");
  });
  it("closed or dismissed urgent episodes no longer count; see_doctor is amber", () => {
    expect(overallStatus({ ...base, episode: { ...urgent, closed: true } }).level).toBe("green");
    expect(overallStatus({ ...base, episode: { ...urgent, dismissed: true } }).level).toBe("green");
    expect(overallStatus({ ...base, episode: { ...urgent, latest: { recommendation: { level: "see_doctor" } } } }).level).toBe("amber");
  });
  it("no approved reports → neutral", () => {
    expect(overallStatus({ hasApproved: false, findings: [] }).level).toBe("none");
  });
});

describe("Simple view pieces", () => {
  it("Karthik: medicines by time of day, next steps with the review date", () => {
    const r = buildPatientRecord(karthikAfterDengue());
    expect(r.schedule.map((g) => g.label)).toEqual(["Only when needed"]);
    expect(r.nextSteps.map((s) => s.text)).toContain("See Dr. Meera Nair on Mon 12 Oct");
    expect(r.nextSteps.some((s) => /within 1–2 days/.test(s.text))).toBe(true);
  });

  it("Ravi: BD in the morning and night, OD at bedtime at night", () => {
    const { patient, reports, plans } = raviAfterDemo();
    const r = buildPatientRecord({ patient, reports, plans });
    expect(r.schedule.map((g) => [g.label, g.medicines.map((m) => m.name)])).toEqual([
      ["Morning", ["Metformin"]],
      ["Night", ["Metformin", "Atorvastatin"]],
    ]);
    expect(nextSteps(r.plan).map((s) => s.text)).toEqual(["HbA1c in 12 weeks", "See Dr. Meera Nair on Mon 15 Jun"]);
  });

  it("explanation points: 3–5 short points from the approved text", () => {
    for (const id of ["ravi", "priya", "arjun"]) {
      const { patient, reports } = patientData(id);
      const pts = buildPatientRecord({ patient, reports, plans: [] }).points;
      expect(pts.length).toBeGreaterThanOrEqual(3);
      expect(pts.length).toBeLessThanOrEqual(5);
    }
    expect(explanationPoints("One. Two.\n\nList:\n- A: a\n- B: b\n\nEnd.", 5)).toEqual(["One.", "Two.", "List — A: a", "List — B: b", "End."]);
  });

  it("wearable one-liner", () => {
    expect(wearableOneLiner({ streaming: false, topLevel: "none" }).text).toBe("Monitoring off");
    expect(wearableOneLiner({ streaming: true, topLevel: "none" }).text).toBe("Your watch readings look normal");
    expect(wearableOneLiner({ streaming: true, topLevel: "watch" }).text).toBe("Inara is keeping a closer eye");
    const due = wearableOneLiner({ streaming: true, topLevel: "concerning", episode: { ...urgent, latest: null, checkInDue: true } });
    expect(due).toMatchObject({ text: "Please answer a few quick questions", href: "/patient/checkin" });
  });
});

describe("Detailed view pieces", () => {
  it("results grouped, flag in words, change since last approved report, plain trend sentences", () => {
    const { patient, reports, plans } = raviAfterDemo();
    const r = buildPatientRecord({ patient, reports, plans });
    expect(r.groups[0].name).toBe("Blood sugar");
    const a1c = r.groups[0].results.find((x) => x.testKey === "hba1c")!;
    expect(a1c).toMatchObject({ display: "6.1", flagText: "Higher than the healthy range", deltaText: "+0.2" });
    expect(a1c.description).toMatch(/average blood sugar/);
    expect(r.trends[0].sentence).toBe("Your HbA1c has gone up slowly since 2023.");
    expect(r.trends.some((t) => t.key === "egfr" && /kidney function \(eGFR\) has gone down faster than usual since 2023/.test(t.sentence))).toBe(true);
    expect(JSON.stringify(r.trends)).not.toMatch(/\/yr|slope|z-?score/i);
  });

  it("shows 'Your target' only where a personalised target applies", () => {
    const { patient, reports, plans } = raviAfterDemo();
    const override: TargetOverride = { patientId: "ravi", testKey: "hba1c", op: "<", value: 6.5, reason: "R", author: "Dr", timestamp: "x" };
    const r = buildPatientRecord({ patient, reports, plans, targetOverrides: [override] });
    const all = r.groups.flatMap((g) => g.results);
    expect(all.find((x) => x.testKey === "hba1c")?.target?.label).toMatch(/6\.5/);
    expect(all.find((x) => x.testKey === "ast")?.target).toBeUndefined();
  });

  it("Priya: no draft results; Karthik: dengue tests in words", () => {
    const { patient, reports } = patientData("priya");
    expect(buildPatientRecord({ patient, reports, plans: [] }).latest?.date).toBe("2025-03-15");
    const k = buildPatientRecord(karthikAfterDengue());
    const ns1 = k.groups.flatMap((g) => g.results).find((x) => x.testKey === "ns1")!;
    expect(ns1).toMatchObject({ display: "Positive", flagText: "Detected (positive)" });
    expect(ns1.deltaText).toBeUndefined();
  });
});

describe("never exposes non-approved content (Simple, Detailed and print)", () => {
  function secretState() {
    const { patient, reports } = patientData("ravi");
    const latest = reports.at(-1)!;
    const draft = latest.versions[0];
    const unapproved = addDoctorEdit(
      { ...latest, versions: [{ ...draft, text: "AI-SECRET", patientText: "AI-PATIENT-SECRET" }] },
      { id: "e1", author: "Dr", timestamp: "2026-03-16T10:00:00Z", text: "EDIT-SECRET", patientText: "EDIT-PATIENT-SECRET" },
    );
    // The approved older report carries a clinical summary the patient must not see.
    const older = reports.slice(0, 3).map((r) => ({ ...r, versions: r.versions.map((v) => (v.status === "approved" ? { ...v, text: `CLINICAL-SECRET ${v.text}` } : v)) }));
    const approvedOlder = older.at(-1)!;
    let plans = savePlanDraft([], {
      id: "d1", patientId: "ravi", reportId: approvedOlder.id, author: "Dr", timestamp: "2025-03-16T10:00:00Z",
      content: { medications: [{ name: "DRAFT-MED", dose: "", frequency: "OD", duration: "", instructions: "" }], lifestyle: ["DRAFT-LIFESTYLE"], followUpTests: [], nextReviewDate: "", doctorNotes: "DRAFT-NOTE" },
    });
    plans = approvePlan(plans, {
      id: "a1", patientId: "ravi", reportId: approvedOlder.id, author: "Dr. Meera Nair", timestamp: "2025-03-16T11:00:00Z",
      content: {
        medications: [{ name: "Metformin", dose: "500 mg", frequency: "BD", duration: "", instructions: "", override: { reason: "OVERRIDE-SECRET", author: "Dr", timestamp: "x", rules: ["r"] } }],
        lifestyle: ["Walk daily"], followUpTests: [], nextReviewDate: "2025-06-01", doctorNotes: "DOCTOR-NOTE-SECRET",
      },
    });
    return { patient, reports: [...older.slice(0, 2), approvedOlder, unapproved], plans };
  }

  it("the record behind both views holds approved content only", () => {
    const s = secretState();
    const record = buildPatientRecord({ ...s, episode: urgent });
    const json = JSON.stringify(record);
    expect(json).not.toMatch(/SECRET|DRAFT-|z-?score/i);
    expect(record.plan?.medications[0].name).toBe("Metformin");
    expect(record.reports.map((r) => r.date)).toEqual(["2025-03-15", "2024-03-15", "2023-03-15"]);
    expect(record.reports.every((r) => r.results.length > 0)).toBe(true);
  });

  it("the print view holds approved content only, with the disclaimer", () => {
    const s = secretState();
    const p = printableReport(s.patient, buildPatientRecord(s));
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/SECRET|DRAFT-/);
    expect(p.footer).toBe("Prototype · Synthetic data · Clinical decision support, not a diagnosis.");
    expect(p.sections.map((x) => x.heading)).toEqual(expect.arrayContaining(["Your medicines", "Lifestyle", "Earlier reports"]));
    expect(json).toContain("Metformin");
  });

  it("another patient's reports never appear", () => {
    const ravi = seedPatients().find((p) => p.id === "ravi")!;
    const priyaReports = patientData("priya").reports;
    expect(buildPatientRecord({ patient: ravi, reports: priyaReports, plans: [] }).reports).toEqual([]);
  });
});
