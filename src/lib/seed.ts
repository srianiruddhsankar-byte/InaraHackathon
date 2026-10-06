// Synthetic demo patients and reports. Synthetic data only — never real
// patients. IDs and timestamps are fixed so "Reset demo" is repeatable.
import { AI_AUTHOR, aiDraftVersion } from "./labReport";
import { flagValue } from "./rules";
import { TEST_KEYS, TESTS } from "./tests";
import type { Case, CaseStage, LabValue, Patient, RawLabValue, Report, Sex, StageEvent, TestKey } from "./types";
import { ALL_PANELS } from "./workflow";

export { AI_AUTHOR };

export const REPORT_DATES = ["2023-03-15", "2024-03-15", "2025-03-15", "2026-03-15"] as const;

export const LAB_NAME = "CityCare Diagnostics";
export const DOCTOR_NAME = "Dr. Meera Nair";

/**
 * Ravi's Mar 2026 results are not seeded: his open case waits at "ordered" and
 * the lab uploads them in the demo (public/samples/ravi_report.csv). His
 * VALUES column for 2026 documents what that sample file contains.
 */
const SEEDED_REPORTS: Record<string, number> = { ravi: 3, priya: 4, arjun: 4, karthik: 0 };

/** Patients in the lab-report demo (Karthik is the wearable demo and has no lab history). */
const LAB_PATIENTS = ["ravi", "priya", "arjun"];

/** Ravi's open order for the Mar 2026 panel. */
export const RAVI_OPEN_ORDER_AT = "2026-03-10T10:00:00.000Z";

const PATIENTS: Patient[] = [
  {
    id: "ravi",
    name: "Ravi Kumar",
    age: 52,
    sex: "M",
    bloodGroup: "B+",
    phone: "+91 90000 00001",
    allergies: [],
    chronicConditions: ["Hypertension (since 2021)"],
    currentMedications: [
      { name: "Amlodipine", dose: "5 mg", frequency: "Once daily", since: "2021", prescribedBy: DOCTOR_NAME },
      {
        name: "Ibuprofen",
        dose: "400 mg",
        frequency: "As needed for knee pain",
        since: "2024",
        prescribedBy: "Self-reported (over the counter)",
        note: "Self-reported, OTC",
      },
    ],
    visitHistory: [
      {
        date: "2023-03-20",
        doctor: DOCTOR_NAME,
        reason: "Annual check-up · blood pressure review",
        note: "BP 138/88 on amlodipine. Lipids mildly raised — diet and exercise advised.",
      },
      {
        date: "2024-03-20",
        doctor: DOCTOR_NAME,
        reason: "Annual check-up · knee pain",
        note: "Fasting glucose 102. Mentions taking ibuprofen for knee pain now and then.",
      },
      {
        date: "2025-03-20",
        doctor: DOCTOR_NAME,
        reason: "Annual check-up · raised HbA1c",
        note: "HbA1c 5.9% (prediabetes). Counselled on diet and daily walking.",
      },
    ],
    suspectedDisease: "Type 2 diabetes",
  },
  {
    id: "priya",
    name: "Priya S",
    age: 28,
    sex: "F",
    bloodGroup: "O+",
    phone: "+91 90000 00002",
    allergies: ["Sulfa drugs"],
    chronicConditions: [],
    currentMedications: [],
    visitHistory: [
      {
        date: "2023-03-22",
        doctor: DOCTOR_NAME,
        reason: "Tiredness",
        note: "Mild fatigue. Hb 11.0. Iron-rich diet advised.",
      },
      {
        date: "2024-03-22",
        doctor: DOCTOR_NAME,
        reason: "Follow-up · fatigue",
        note: "Hb unchanged at 10.9 despite diet changes.",
      },
      {
        date: "2025-03-22",
        doctor: DOCTOR_NAME,
        reason: "Follow-up · ongoing fatigue",
        note: "Still tired on most days. Hb 11.1. Review with next panel.",
      },
    ],
    suspectedDisease: "Iron-deficiency anaemia (fatigue)",
  },
  {
    id: "arjun",
    name: "Arjun M",
    age: 35,
    sex: "M",
    bloodGroup: "A+",
    phone: "+91 90000 00003",
    allergies: [],
    chronicConditions: [],
    currentMedications: [],
    visitHistory: [
      { date: "2023-03-25", doctor: DOCTOR_NAME, reason: "Routine yearly check-up", note: "All well." },
      { date: "2024-03-25", doctor: DOCTOR_NAME, reason: "Routine yearly check-up", note: "All well." },
      { date: "2025-03-25", doctor: DOCTOR_NAME, reason: "Routine yearly check-up", note: "All well. Keeps active." },
    ],
    suspectedDisease: "Routine checkup",
  },
  {
    // Wearable early-warning demo patient: no lab reports yet, monitored 24/7.
    id: "karthik",
    name: "Karthik R",
    age: 26,
    sex: "M",
    bloodGroup: "O+",
    phone: "+91 90000 00004",
    city: "Chennai",
    area: "Velachery",
    allergies: [],
    chronicConditions: [],
    currentMedications: [],
    pastIllnesses: ["Dengue fever (Oct 2023, admitted 3 days, recovered)"],
    visitHistory: [
      {
        date: "2023-10-14",
        doctor: DOCTOR_NAME,
        reason: "Fever, body ache, headache for 3 days",
        note: "NS1 positive — dengue. Platelets fell to 68,000. Admitted 3 days for fluids and monitoring; recovered fully.",
      },
      {
        date: "2026-08-30",
        doctor: DOCTOR_NAME,
        reason: "Wellness check · smartwatch set up",
        note: "Fit, plays football twice a week. Agreed to continuous wearable monitoring. Past dengue noted.",
      },
    ],
    suspectedDisease: "None — wearable monitoring",
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
    ggt: [43, 44, 46, 45],
    tsh: [2.1, 2.3, 2.0, 2.2],
    vitamin_d: [32, 34, 31, 33],
    vitamin_b12: [420, 435, 410, 425],
    uric_acid: [6.2, 6.4, 6.1, 6.3],
    sodium: [139, 140, 138, 139],
    potassium: [4.4, 4.5, 4.3, 4.6],
    bun: [14, 15, 14, 15],
    crp: [1.8, 2.1, 1.6, 1.9],
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
    ggt: [20, 22, 19, 21],
    tsh: [1.8, 2.0, 1.7, 1.9],
    vitamin_d: [36, 38, 35, 37],
    vitamin_b12: [380, 395, 370, 390],
    uric_acid: [4.1, 4.3, 4.0, 4.2],
    sodium: [138, 139, 137, 138],
    potassium: [4.1, 4.2, 4.0, 4.1],
    bun: [10, 11, 10, 11],
    crp: [1.2, 1.4, 1.0, 1.2],
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
    ggt: [24, 25, 23, 24],
    tsh: [1.6, 1.7, 1.5, 1.6],
    vitamin_d: [40, 42, 39, 41],
    vitamin_b12: [510, 525, 500, 515],
    uric_acid: [5.2, 5.4, 5.1, 5.3],
    sodium: [140, 141, 139, 140],
    potassium: [4.2, 4.3, 4.1, 4.2],
    bun: [13, 14, 12, 13],
    crp: [0.8, 0.9, 0.7, 0.8],
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

/** How the lab writes each test in its export: name, unit and value = canonical ÷ factor. */
const RAW_FORMAT: Record<TestKey, { name: string; unit: string; factor: number; decimals: number }> = {
  hba1c: { name: "Glycated Hb", unit: "%", factor: 1, decimals: 1 },
  fasting_glucose: { name: "FBS", unit: "mmol/L", factor: 18, decimals: 2 },
  total_chol: { name: "Total Chol", unit: "mg/dL", factor: 1, decimals: 0 },
  ldl: { name: "LDL-C", unit: "mg/dL", factor: 1, decimals: 0 },
  hdl: { name: "HDL-C", unit: "mg/dL", factor: 1, decimals: 0 },
  triglycerides: { name: "TG", unit: "mg/dL", factor: 1, decimals: 0 },
  creatinine: { name: "S. Creatinine", unit: "µmol/L", factor: 1 / 88.4, decimals: 1 },
  urine_acr: { name: "Urine ACR", unit: "mg/mmol", factor: 8.84, decimals: 2 },
  hb: { name: "HGB", unit: "g/L", factor: 0.1, decimals: 0 },
  mcv: { name: "MCV", unit: "fl", factor: 1, decimals: 0 },
  rbc: { name: "RBC Count", unit: "x10^6/µL", factor: 1, decimals: 1 },
  platelets: { name: "Platelet Count", unit: "lakh/cmm", factor: 100, decimals: 2 },
  ferritin: { name: "S. Ferritin", unit: "µg/L", factor: 1, decimals: 0 },
  ast: { name: "SGOT", unit: "IU/L", factor: 1, decimals: 0 },
  alt: { name: "SGPT", unit: "IU/L", factor: 1, decimals: 0 },
  ggt: { name: "Gamma GT", unit: "IU/L", factor: 1, decimals: 0 },
  tsh: { name: "TSH 3rd Gen", unit: "µIU/mL", factor: 1, decimals: 2 },
  vitamin_d: { name: "25 OH Vit D", unit: "nmol/L", factor: 0.4, decimals: 0 },
  vitamin_b12: { name: "Vit B12", unit: "pg/mL", factor: 1, decimals: 0 },
  uric_acid: { name: "S. Uric Acid", unit: "µmol/L", factor: 1 / 59.48, decimals: 0 },
  sodium: { name: "Na+", unit: "mEq/L", factor: 1, decimals: 0 },
  potassium: { name: "S. Potassium", unit: "mmol/L", factor: 1, decimals: 1 },
  bun: { name: "Serum Urea", unit: "mmol/L", factor: 2.8, decimals: 1 },
  crp: { name: "hs-CRP", unit: "mg/L", factor: 1, decimals: 1 },
};

/** The lab's raw export for a report: messy names and non-canonical units. */
function makeRaw(values: LabValue[]): RawLabValue[] {
  return values.map((v) => {
    const f = RAW_FORMAT[v.testKey];
    return { name: f.name, value: Number((v.value / f.factor).toFixed(f.decimals)), unit: f.unit };
  });
}

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
  for (const patient of PATIENTS.filter((p) => LAB_PATIENTS.includes(p.id))) {
    const series = VALUES[patient.id];
    const history: Report[] = [];
    REPORT_DATES.slice(0, SEEDED_REPORTS[patient.id]).forEach((date, i) => {
      const id = `${patient.id}-${date.slice(0, 7)}`;
      const report: Report = {
        id,
        patientId: patient.id,
        date,
        labName: LAB_NAME,
        receivedAt: `${date}T07:40:00.000Z`,
        values: makeValues(series, i, patient.sex),
        versions: [],
      };
      report.raw = makeRaw(report.values);
      history.push(report);

      // The AI draft is generated from all reports up to and including this one.
      report.versions.push(aiDraftVersion(patient, history, `${id}-v1`, `${date}T09:00:00.000Z`));

      const approved = APPROVED[patient.id][i];
      if (approved) {
        report.versions.push({
          id: `${id}-v2`,
          status: "approved",
          text: approved.text,
          // Plain-language explanation the doctor approved alongside their note.
          patientText: report.versions[0].patientText,
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

/** Clinical note on each seeded order. */
const ORDER_NOTE: Record<string, string> = {
  ravi: "Annual review. Known hypertension on amlodipine; takes ibuprofen for knee pain. Check sugar trend and kidneys.",
  priya: "Fatigue for a few months. Mildly low Hb before — check for iron deficiency.",
  arjun: "Routine annual health check. No complaints.",
};

/**
 * One case per seeded report, ordered by Dr. Meera a week before the sample.
 * The first three reports are completed cases (follow-up booked); the latest
 * (Mar 2026) is open at "results_uploaded", waiting for the doctor — except
 * Ravi's, which is still at "ordered" until the lab uploads his results.
 */
export function seedCases(): Case[] {
  const cases: Case[] = [];
  for (const patient of PATIENTS.filter((p) => LAB_PATIENTS.includes(p.id))) {
    REPORT_DATES.forEach((date, i) => {
      const reportId = `${patient.id}-${date.slice(0, 7)}`;
      if (i >= SEEDED_REPORTS[patient.id]) {
        cases.push({
          id: `case-${reportId}`,
          patientId: patient.id,
          orderedBy: DOCTOR_NAME,
          suspectedDisease: patient.suspectedDisease,
          panels: [...ALL_PANELS],
          urgency: "routine",
          clinicalNote: ORDER_NOTE[patient.id],
          stage: "ordered",
          stageHistory: [{ stage: "ordered", by: DOCTOR_NAME, at: RAVI_OPEN_ORDER_AT, note: ORDER_NOTE[patient.id] }],
        });
        return;
      }
      const ordered = new Date(`${date}T10:00:00.000Z`);
      ordered.setUTCDate(ordered.getUTCDate() - 7);
      const at = (time: string) => `${date}T${time}:00.000Z`;
      const ev = (stage: CaseStage, by: string, when: string, note?: string): StageEvent =>
        note ? { stage, by, at: when, note } : { stage, by, at: when };

      const history: StageEvent[] = [
        ev("ordered", DOCTOR_NAME, ordered.toISOString(), ORDER_NOTE[patient.id]),
        ev("in_lab", LAB_NAME, at("06:30"), "Sample collected"),
        ev("results_uploaded", LAB_NAME, at("07:40")),
      ];
      const completed = !!APPROVED[patient.id][i];
      if (completed) {
        const nextYear = REPORT_DATES[i + 1];
        history.push(
          ev("analysis_done", DOCTOR_NAME, at("14:00")),
          ev("under_review", DOCTOR_NAME, at("14:10")),
          ev("approved", DOCTOR_NAME, at("15:30")),
          ev("treatment_planned", DOCTOR_NAME, at("15:40"), "Advice recorded with the approved report"),
          ev("follow_up_scheduled", DOCTOR_NAME, at("15:40"), `Next review ${nextYear}`),
        );
      }
      cases.push({
        id: `case-${reportId}`,
        patientId: patient.id,
        orderedBy: DOCTOR_NAME,
        suspectedDisease: patient.suspectedDisease,
        panels: [...ALL_PANELS],
        urgency: "routine",
        clinicalNote: ORDER_NOTE[patient.id],
        reportId,
        stage: history.at(-1)!.stage,
        stageHistory: history,
      });
    });
  }
  return cases;
}
