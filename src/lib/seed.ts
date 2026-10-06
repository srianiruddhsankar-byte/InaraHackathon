// Synthetic demo patients and reports. Synthetic data only — never real
// patients. IDs and timestamps are fixed so "Reset demo" is repeatable.
import { getFindings } from "./findings";
import { buildDrafts } from "./review";
import { flagValue } from "./rules";
import { TEST_KEYS, TESTS } from "./tests";
import { computeTrends } from "./trends";
import type { LabValue, Patient, Report, ReportVersion, Sex, TestKey } from "./types";

export const REPORT_DATES = ["2023-03-15", "2024-03-15", "2025-03-15", "2026-03-15"] as const;

export const LAB_NAME = "CityCare Diagnostics";
export const AI_AUTHOR = "Inara AI (template draft)";
export const DOCTOR_NAME = "Dr. Meera Nair";

const PATIENTS: Patient[] = [
  {
    id: "ravi",
    name: "Ravi Kumar",
    age: 52,
    sex: "M",
    bloodGroup: "B+",
    allergies: [],
    chronicConditions: [],
    suspectedDisease: "Type 2 diabetes",
  },
  {
    id: "priya",
    name: "Priya S",
    age: 28,
    sex: "F",
    bloodGroup: "O+",
    allergies: ["Sulfa drugs"],
    chronicConditions: [],
    suspectedDisease: "Iron-deficiency anaemia (fatigue)",
  },
  {
    id: "arjun",
    name: "Arjun M",
    age: 35,
    sex: "M",
    bloodGroup: "A+",
    allergies: [],
    chronicConditions: [],
    suspectedDisease: "Routine checkup",
  },
];

/** One value per report date (Mar 2023 → Mar 2026). */
type Series = Record<TestKey, [number, number, number, number]>;

const VALUES: Record<string, Series> = {
  ravi: {
    hba1c: [5.4, 5.6, 5.9, 6.1],
    fasting_glucose: [95, 102, 110, 118],
    total_chol: [212, 218, 222, 228],
    ldl: [138, 142, 146, 150],
    hdl: [42, 42, 42, 42],
    triglycerides: [160, 172, 168, 180],
    creatinine: [1.0, 1.14, 1.23, 1.34],
    urine_acr: [12, 18, 28, 45],
    hb: [14.5, 14.5, 14.5, 14.5],
    mcv: [88, 88, 88, 88],
    rbc: [5.0, 5.0, 5.0, 5.0],
    platelets: [250, 250, 250, 250],
    ferritin: [120, 120, 120, 120],
    ast: [24, 24, 24, 24],
    alt: [28, 28, 28, 28],
  },
  priya: {
    hba1c: [5.1, 5.0, 5.2, 5.1],
    fasting_glucose: [86, 84, 88, 85],
    total_chol: [168, 172, 165, 170],
    ldl: [92, 95, 90, 94],
    hdl: [58, 60, 57, 59],
    triglycerides: [88, 85, 92, 86],
    creatinine: [0.72, 0.7, 0.74, 0.71],
    urine_acr: [6, 5, 7, 6],
    hb: [11.0, 10.9, 11.1, 10.8],
    mcv: [65, 64, 65, 64],
    rbc: [5.5, 5.6, 5.5, 5.6],
    platelets: [255, 262, 250, 260],
    ferritin: [48, 42, 50, 45],
    ast: [19, 21, 18, 20],
    alt: [16, 18, 15, 17],
  },
  arjun: {
    hba1c: [5.2, 5.1, 5.2, 5.2],
    fasting_glucose: [88, 90, 87, 89],
    total_chol: [182, 178, 185, 180],
    ldl: [108, 104, 110, 106],
    hdl: [52, 54, 51, 53],
    triglycerides: [110, 104, 115, 108],
    creatinine: [0.92, 0.94, 0.91, 0.93],
    urine_acr: [8, 7, 9, 8],
    hb: [15.1, 15.3, 15.0, 15.2],
    mcv: [89, 90, 88, 89],
    rbc: [5.1, 5.2, 5.0, 5.1],
    platelets: [240, 252, 236, 245],
    ferritin: [110, 118, 105, 112],
    ast: [22, 24, 21, 23],
    alt: [26, 28, 25, 27],
  },
};

/** Doctor-approved text (and optional prescription) for the first 3 reports. */
const APPROVED: Record<string, { text: string; prescription?: string }[]> = {
  ravi: [
    { text: "Panel reviewed. LDL and triglycerides mildly raised. Advised diet changes and regular exercise. Repeat panel in 12 months." },
    { text: "Fasting glucose slightly above normal (102 mg/dL). Continue lifestyle changes. Repeat panel in 12 months." },
    {
      text: "HbA1c 5.9% is in the prediabetes range. Discussed diet and daily walking. Repeat panel in 12 months.",
      prescription: "Brisk walk 30 minutes daily. Reduce refined carbohydrates and sugary drinks. No medication at this stage.",
    },
  ],
  priya: [
    {
      text: "Haemoglobin mildly low (11.0 g/dL). Advised iron-rich diet. Recheck next year.",
      prescription: "Iron-rich diet: green leafy vegetables, lentils, jaggery. Review in 12 months.",
    },
    { text: "Haemoglobin 10.9 g/dL, unchanged. Continue diet advice. Recheck next year." },
    { text: "Haemoglobin stable at 11.1 g/dL. Patient reports occasional fatigue. Review with next annual panel." },
  ],
  arjun: [
    { text: "All values within normal range. Routine annual check advised." },
    { text: "All values within normal range. No action needed." },
    { text: "All values within normal range and stable. Continue healthy lifestyle." },
  ],
};

function makeValues(series: Series, index: number, sex: Sex): LabValue[] {
  return TEST_KEYS.map((key) => {
    const value = series[key][index];
    return { testKey: key, value, unit: TESTS[key].unit, flag: flagValue(key, value, sex) };
  });
}

export function seedPatients(): Patient[] {
  return structuredClone(PATIENTS);
}

export function seedReports(): Report[] {
  const reports: Report[] = [];
  for (const patient of PATIENTS) {
    const series = VALUES[patient.id];
    const history: Report[] = [];
    REPORT_DATES.forEach((date, i) => {
      const id = `${patient.id}-${date.slice(0, 7)}`;
      const report: Report = {
        id,
        patientId: patient.id,
        date,
        labName: LAB_NAME,
        values: makeValues(series, i, patient.sex),
        versions: [],
      };
      history.push(report);

      // The AI draft is generated from all reports up to and including this one.
      const drafts = buildDrafts(
        getFindings(patient, history),
        undefined,
        computeTrends(patient, history),
        report.values,
        history.length,
      );
      const draft: ReportVersion = {
        id: `${id}-v1`,
        status: "ai_draft",
        text: drafts.clinical,
        patientText: drafts.patient,
        author: AI_AUTHOR,
        timestamp: `${date}T09:00:00.000Z`,
      };
      report.versions.push(draft);

      const approved = APPROVED[patient.id][i];
      if (approved) {
        report.versions.push({
          id: `${id}-v2`,
          status: "approved",
          text: approved.text,
          // Plain-language explanation the doctor approved alongside their note.
          patientText: drafts.patient,
          prescription: approved.prescription,
          author: DOCTOR_NAME,
          timestamp: `${date}T15:30:00.000Z`,
        });
      }
      reports.push(report);
    });
  }
  return reports;
}
