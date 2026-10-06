// The layered lab analysis, computed in one pure pass. The UI reveals the
// layers one by one; nothing here is random or time-based.
//   L0 normalise → L1 range check → L2 guideline scores → L2.5 personal
//   targets → L3 personal trends → L4 risk model (planned)
import { baselineValues, getFindings, isDengueContext } from "./findings";
import { medicationNotes, type MedNote } from "./medContext";
import { normalise } from "./normalise";
import { activeMedications } from "./record";
import { formatRange, slopeLabel, trendLabel, trendName, trendRange, trendUnit, trendDecimals } from "./review";
import {
  adaCategory,
  ageAtDate,
  assessHaematocrit,
  dengueMarkers,
  anaemiaThreshold,
  egfrCkdEpi2021,
  fib4,
  isHdlLow,
  isTriglyceridesHigh,
  kdigoAStage,
  kdigoGStage,
  ldlCategory,
  mentzer,
} from "./rules";
import {
  egfrDeclineComparison,
  getTargets,
  meetsTarget,
  type EgfrDeclineComparison,
  type PatientTarget,
} from "./targets";
import { formatValue, rangeText, TESTS } from "./tests";
import { computeTrends, findTrend } from "./trends";
import type {
  Finding,
  FindingsContext,
  Flag,
  Patient,
  RawLabValue,
  Report,
  Severity,
  TargetOverride,
  TestKey,
  Trend,
  TrendKey,
} from "./types";

export interface NormaliseRow {
  rawName: string;
  rawValue: string | number;
  rawUnit: string;
  testKey: TestKey | null;
  name?: string;
  loinc?: string;
  value: number | null;
  unit: string | null;
  converted: boolean;
}

export interface NormaliseLayer {
  total: number;
  mapped: number;
  renamed: number;
  converted: number;
  unknown: number;
  rows: NormaliseRow[];
}

export interface RangeRow {
  testKey: TestKey;
  name: string;
  value: string;
  range: string;
  flag: Flag;
}

export interface ScoreRow {
  label: string;
  value: string;
  interpretation: string;
  source: string;
  tone: Severity;
}

export interface TrendRow {
  key: TrendKey;
  name: string;
  slope: string;
  label: string;
  secondary?: string;
  baseline: string;
  tone: Severity;
}

export interface AbnormalBiomarker {
  key: TrendKey;
  name: string;
  value: string;
  range: string;
  reason: "Out of range" | "Drifting within range" | "Above personal target" | "Below personal target";
  direction: "rising" | "falling" | "stable";
  slope?: string;
  tone: Severity;
}

export interface AnalysisResult {
  reportId: string;
  normalise: NormaliseLayer;
  range: RangeRow[];
  scores: ScoreRow[];
  targets: PatientTarget[];
  egfrDecline: EgfrDeclineComparison | null;
  trends: TrendRow[];
  stableTrendCount: number;
  findings: Finding[];
  allTrends: Trend[];
  medNotes: MedNote[];
  abnormal: AbnormalBiomarker[];
  previousReportCount: number;
}

export const LAYERS = [
  { id: "normalise", num: "0", label: "Layer 0 — Normalise", hint: "Map test names to LOINC codes and convert units" },
  { id: "range", num: "1", label: "Layer 1 — Range check", hint: "Compare with population reference ranges" },
  { id: "scores", num: "2", label: "Layer 2 — Guideline scores", hint: "ADA, CKD-EPI 2021 + KDIGO, WHO, Mentzer, FIB-4, lipids, dengue (WHO 2009)" },
  { id: "targets", num: "2.5", label: "Layer 2.5 — Personalised targets", hint: "Targets for this patient's age, conditions and medicines" },
  { id: "trends", num: "3", label: "Layer 3 — Personal trends", hint: "Compare with this patient's previous reports" },
  { id: "model", num: "4", label: "Layer 4 — Risk model", hint: "Coming soon — trained model" },
] as const;

function normaliseLayer(report: Report): NormaliseLayer {
  const raw: RawLabValue[] = report.raw ?? report.values.map((v) => ({ name: TESTS[v.testKey].name, value: v.value, unit: v.unit }));
  const rows = raw.map((r): NormaliseRow => {
    // Uploaded rows were already read and verified by the lab — reuse that result.
    const n = r.status
      ? {
          testKey: r.testKey ?? null,
          value: r.normalised ?? null,
          unit: r.testKey && r.normalised != null ? TESTS[r.testKey].unit : null,
          converted: r.status === "converted",
        }
      : normalise(r.name, r.value, r.unit);
    const def = n.testKey ? TESTS[n.testKey] : undefined;
    return {
      rawName: r.name,
      rawValue: r.value,
      rawUnit: r.unit,
      testKey: n.testKey,
      name: def?.name,
      loinc: def?.loinc,
      value: n.value,
      unit: n.unit,
      converted: n.converted,
    };
  });
  return {
    total: rows.length,
    mapped: rows.filter((r) => r.testKey).length,
    renamed: rows.filter((r) => r.name && r.name.toLowerCase() !== r.rawName.toLowerCase()).length,
    converted: rows.filter((r) => r.converted).length,
    unknown: rows.filter((r) => !r.testKey).length,
    rows,
  };
}

function rangeLayer(report: Report, patient: Patient): RangeRow[] {
  return report.values
    .filter((v) => v.flag !== "normal")
    .map((v) => ({
      testKey: v.testKey,
      name: TESTS[v.testKey].name,
      value: formatValue(v.testKey, v.value, v.qualifier),
      range: `${rangeText(v.testKey, patient.sex)} ${v.unit}`.trim(),
      flag: v.flag,
    }));
}

function scoreLayer(history: Report[], patient: Patient, suspected: string): ScoreRow[] {
  const report = history.at(-1)!;
  const v = Object.fromEntries(report.values.map((x) => [x.testKey, x.value])) as Partial<Record<TestKey, number>>;
  const dengue = isDengueContext(suspected, v);
  const base = baselineValues(history);
  const age = ageAtDate(patient.age, report.date);
  const rows: ScoreRow[] = [];

  if (v.hba1c !== undefined || v.fasting_glucose !== undefined) {
    const cat = adaCategory({ hba1c: v.hba1c, fastingGlucose: v.fasting_glucose });
    rows.push({
      label: "ADA glucose category",
      value: [v.hba1c !== undefined && `HbA1c ${v.hba1c}%`, v.fasting_glucose !== undefined && `FPG ${v.fasting_glucose}`]
        .filter(Boolean)
        .join(" · "),
      interpretation: cat === "diabetes" ? "Diabetes range" : cat === "prediabetes" ? "Prediabetes range" : "Normal",
      source: "ADA",
      tone: cat === "diabetes" ? "high" : cat === "prediabetes" ? "watch" : "normal",
    });
  }
  if (v.creatinine !== undefined) {
    const egfr = egfrCkdEpi2021(v.creatinine, age, patient.sex);
    const g = kdigoGStage(egfr);
    rows.push({
      label: "eGFR (CKD-EPI 2021)",
      value: `${egfr.toFixed(0)} mL/min/1.73m²`,
      interpretation: `KDIGO ${g}`,
      source: "CKD-EPI 2021 · KDIGO",
      tone: ["G1", "G2"].includes(g) ? "normal" : ["G3a"].includes(g) ? "watch" : "high",
    });
  }
  if (v.urine_acr !== undefined) {
    const a = kdigoAStage(v.urine_acr);
    rows.push({
      label: "Albuminuria (ACR)",
      value: `${v.urine_acr} mg/g`,
      interpretation: a === "A1" ? "A1 — normal" : a === "A2" ? "A2 — moderately increased" : "A3 — severely increased",
      source: "KDIGO",
      tone: a === "A1" ? "normal" : a === "A2" ? "watch" : "high",
    });
  }
  if (v.hb !== undefined) {
    const t = anaemiaThreshold(patient.sex, patient.pregnant);
    const anaemic = v.hb < t;
    rows.push({
      label: "WHO anaemia",
      value: `Hb ${v.hb} g/dL`,
      interpretation: anaemic ? `Anaemia (below ${t})` : `No anaemia (threshold ${t})`,
      source: "WHO",
      tone: anaemic ? (v.hb < 8 ? "high" : "watch") : "normal",
    });
  }
  if (v.mcv !== undefined && v.rbc !== undefined) {
    const m = mentzer(v.mcv, v.rbc);
    const micro = v.mcv < 80;
    rows.push({
      label: "Mentzer index",
      value: m.index.toFixed(1),
      interpretation: !micro
        ? "Not applicable — MCV normal"
        : m.suggests === "thalassaemia_trait"
          ? "<13 suggests thalassaemia trait"
          : m.suggests === "iron_deficiency"
            ? ">13 suggests iron deficiency"
            : "Indeterminate",
      source: "Mentzer",
      tone: micro ? "watch" : "normal",
    });
  }
  const markers = dengueMarkers(v.ns1, v.dengue_igm);
  if (markers) {
    rows.push({
      label: "Dengue markers",
      value: [markers.ns1 && `NS1 ${markers.ns1}`, markers.igm && `IgM ${markers.igm}`].filter(Boolean).join(" · "),
      interpretation: markers.positive ? "Consistent with dengue infection" : markers.equivocal ? "Equivocal — repeat" : "Negative on this sample",
      source: "WHO 2009",
      tone: markers.positive ? "high" : markers.equivocal ? "watch" : "normal",
    });
  }
  if (dengue && v.hct !== undefined) {
    const a = assessHaematocrit({ hct: v.hct, platelets: v.platelets, baselineHct: base.hct, baselinePlatelets: base.platelets });
    const change = (n?: number) => (n === undefined ? "" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(0)}%`);
    rows.push({
      label: "Haematocrit vs baseline",
      value:
        a.kind === "no_baseline"
          ? `HCT ${v.hct}% · no baseline`
          : [`HCT ${change(a.hctChange)}`, a.plateletChange !== undefined && `platelets ${change(a.plateletChange)}`].filter(Boolean).join(" · "),
      interpretation: {
        haemoconcentration: "≥20% rise — plasma leakage",
        warning: "WHO 2009 warning sign",
        rise: "Rising",
        no_rise: "No significant rise",
        no_baseline: "Compare with a repeat test",
      }[a.kind],
      source: "WHO 1997 · WHO 2009",
      tone: a.kind === "haemoconcentration" || a.kind === "warning" ? "high" : a.kind === "no_rise" ? "normal" : "watch",
    });
  }
  if (v.ast !== undefined && v.alt !== undefined && v.platelets !== undefined && dengue) {
    rows.push({
      label: "FIB-4",
      value: "—",
      interpretation: "Not interpreted during acute illness",
      source: "FIB-4",
      tone: "normal",
    });
  } else if (v.ast !== undefined && v.alt !== undefined && v.platelets !== undefined) {
    const f = fib4(age, v.ast, v.alt, v.platelets);
    rows.push({
      label: "FIB-4",
      value: f.score.toFixed(2),
      interpretation: f.risk === "low" ? "Low fibrosis risk" : f.risk === "high" ? "High fibrosis risk" : "Indeterminate",
      source: "FIB-4",
      tone: f.risk === "low" ? "normal" : f.risk === "high" ? "high" : "watch",
    });
  }
  const lipidFlags: string[] = [];
  if (v.ldl !== undefined && ldlCategory(v.ldl) !== "normal") lipidFlags.push(`LDL ${ldlCategory(v.ldl)}`);
  if (v.hdl !== undefined && isHdlLow(v.hdl, patient.sex)) lipidFlags.push("HDL low");
  if (v.triglycerides !== undefined && isTriglyceridesHigh(v.triglycerides)) lipidFlags.push("TG high");
  if (v.ldl !== undefined || v.hdl !== undefined || v.triglycerides !== undefined) {
    rows.push({
      label: "Lipid flags",
      value: [v.ldl !== undefined && `LDL ${v.ldl}`, v.hdl !== undefined && `HDL ${v.hdl}`, v.triglycerides !== undefined && `TG ${v.triglycerides}`]
        .filter(Boolean)
        .join(" · "),
      interpretation: lipidFlags.length ? lipidFlags.join(", ") : "Within target",
      source: "NCEP ATP III",
      tone: lipidFlags.length ? "watch" : "normal",
    });
  }
  return rows;
}

function fmtTrendValue(key: TrendKey, n: number): string {
  return key === "egfr" ? `${n.toFixed(0)} ${trendUnit(key)}` : formatValue(key, n);
}

/** Run every layer for the patient's latest report (earlier reports are the baseline). */
export function runAnalysis(
  patient: Patient,
  reports: Report[],
  overrides: TargetOverride[] = [],
  context: FindingsContext = {},
): AnalysisResult | null {
  const history = reports.filter((r) => r.patientId === patient.id).sort((a, b) => a.date.localeCompare(b.date));
  const report = history.at(-1);
  if (!report) return null;

  const findings = getFindings(patient, history, context);
  const allTrends = history.length >= 2 ? computeTrends(patient, history) : [];
  const targets = getTargets(patient, findings, overrides, report.date);
  const age = ageAtDate(patient.age, report.date);

  const moving = allTrends.filter((t) => t.direction !== "stable" || trendLabel(t).main === "Rapid decline");
  const trends: TrendRow[] = moving.map((t) => {
    const l = trendLabel(t);
    return {
      key: t.testKey,
      name: trendName(t.testKey),
      slope: slopeLabel(t),
      label: l.main,
      secondary: l.secondary,
      baseline: `baseline ${t.baselineMean.toFixed(trendDecimals(t.testKey))} → now ${t.latest.toFixed(trendDecimals(t.testKey))}`,
      tone: l.tone,
    };
  });

  // Abnormal biomarkers: out of range, drifting within range, or missing a personal target.
  const abnormal: AbnormalBiomarker[] = [];
  const dirOf = (key: TrendKey) => findTrend(allTrends, key)?.direction ?? "stable";
  const slopeOf = (key: TrendKey) => {
    const t = findTrend(allTrends, key);
    return t && history.length >= 2 ? slopeLabel(t) : undefined;
  };
  for (const v of report.values) {
    const t = targets.find((x) => x.testKey === v.testKey)!;
    if (v.flag !== "normal") {
      abnormal.push({
        key: v.testKey,
        name: TESTS[v.testKey].name,
        value: formatValue(v.testKey, v.value),
        range: `${rangeText(v.testKey, patient.sex)} ${v.unit}`.trim(),
        reason: "Out of range",
        direction: dirOf(v.testKey),
        slope: slopeOf(v.testKey),
        tone: "high",
      });
    } else if (t.kind !== "reference" && !meetsTarget(t, v.value)) {
      abnormal.push({
        key: v.testKey,
        name: TESTS[v.testKey].name,
        value: formatValue(v.testKey, v.value),
        range: `target ${t.label}`,
        reason: t.low !== undefined && v.value < t.low ? "Below personal target" : "Above personal target",
        direction: dirOf(v.testKey),
        slope: slopeOf(v.testKey),
        tone: "watch",
      });
    }
  }
  for (const t of allTrends) {
    if (!t.driftingWithinRange || abnormal.some((a) => a.key === t.testKey)) continue;
    abnormal.push({
      key: t.testKey,
      name: trendName(t.testKey),
      value: fmtTrendValue(t.testKey, t.latest),
      range: `${formatRange(trendRange(t.testKey, patient.sex))} ${trendUnit(t.testKey)}`,
      reason: "Drifting within range",
      direction: t.direction,
      slope: slopeLabel(t),
      tone: trendLabel(t).tone,
    });
  }

  return {
    reportId: report.id,
    normalise: normaliseLayer(report),
    range: rangeLayer(report, patient),
    scores: scoreLayer(history, patient, context.suspectedDisease?.trim() || patient.suspectedDisease),
    targets,
    egfrDecline: egfrDeclineComparison(age, findTrend(allTrends, "egfr")),
    trends,
    stableTrendCount: allTrends.length - moving.length,
    findings,
    allTrends,
    medNotes: medicationNotes(findings, activeMedications(patient.currentMedications)),
    abnormal,
    previousReportCount: history.length - 1,
  };
}

