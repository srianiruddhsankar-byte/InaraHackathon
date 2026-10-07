// What a patient may see: only doctor-approved report text and approved
// treatment plans. AI drafts, doctor edits, clinical summaries and plan
// drafts never pass through here.
import { format, parseISO } from "date-fns";
import { getFindings } from "./findings";
import { foodTimingLabel, frequencyMeaning } from "./formulary";
import { planSchedule, type ScheduleGroup } from "./medSchedule";
import { applyFindingEdits, chartKeysFor, trendDecimals, trendLabel, trendRange, trendUnit } from "./review";
import { getTargets, meetsTarget, personalisedTargets, targetFor, type PatientTarget } from "./targets";
import { presentingFor, presentingLine } from "./presenting";
import {
  formatNumber,
  getRange,
  isQualitative,
  qualResultOf,
  rangeText,
  refText,
  reportSpecimenTitle,
  SPECIMEN_LABEL,
  TESTS,
} from "./tests";
import { approvedPlan, DENGUE_WARNING_SIGNS, followUpWhen } from "./treatment";
import { computeTrend, seriesFor } from "./trends";
import type {
  Case,
  Finding,
  Flag,
  LabValue,
  Patient,
  Report,
  Sex,
  TargetOverride,
  TestKey,
  TreatmentPlan,
  Trend,
  TrendKey,
} from "./types";
import { approvedVersion } from "./versions";
import { caseForReport } from "./workflow";

export interface PatientReportView {
  reportId: string;
  date: string;
  labName: string;
  approvedBy: string;
  approvedAt: string;
  /** The approved plain-language explanation, verbatim. */
  explanation?: string;
  /** The doctor's approved prescription text, verbatim (older reports). */
  prescription?: string;
  /** The approved treatment plan for this report, verbatim. */
  plan?: TreatmentPlan;
}

/** The approved plan without doctor-only content (safety overrides, doctor notes). */
export function patientSafePlan(plan: TreatmentPlan): TreatmentPlan {
  return {
    ...plan,
    medications: plan.medications.map((m) => {
      const rest = { ...m };
      delete rest.override;
      return rest;
    }),
    doctorNotes: "",
  };
}

/** The patient's approved reports, newest first. */
export function patientVisibleReports(
  patientId: string,
  reports: Report[],
  plans: TreatmentPlan[],
): PatientReportView[] {
  return reports
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((r) => {
      const v = approvedVersion(r);
      if (!v) return [];
      const plan = approvedPlan(plans, r.id);
      return [
        {
          reportId: r.id,
          date: r.date,
          labName: r.labName,
          approvedBy: v.author,
          approvedAt: v.timestamp,
          explanation: v.patientText,
          prescription: v.prescription,
          plan: plan?.patientId === patientId ? patientSafePlan(plan) : undefined,
        },
      ];
    });
}

// ---- The patient's record: everything the Simple and Detailed views show ------
// Built only from approved reports and approved plans (via patientVisibleReports).
// No AI drafts, z-scores, overrides, doctor notes or doctor-only alert details.

/** A plain-language patient-facing section label for each test. */
const RESULT_GROUPS: { id: string; name: string; tests: TestKey[] }[] = [
  { id: "sugar", name: "Blood sugar", tests: ["hba1c", "fasting_glucose"] },
  { id: "kidney", name: "Kidney", tests: ["creatinine", "urine_acr", "bun", "sodium", "potassium"] },
  { id: "cholesterol", name: "Cholesterol (blood fats)", tests: ["total_chol", "ldl", "hdl", "triglycerides"] },
  { id: "blood", name: "Blood count", tests: ["hb", "wbc", "rbc", "mcv", "hct", "platelets"] },
  { id: "iron", name: "Iron and vitamins", tests: ["ferritin", "vitamin_b12", "vitamin_d"] },
  { id: "liver", name: "Liver", tests: ["ast", "alt", "ggt"] },
  { id: "thyroid", name: "Thyroid", tests: ["tsh"] },
  { id: "infection", name: "Infection tests", tests: ["ns1", "dengue_igm", "crp"] },
  { id: "other", name: "Other tests", tests: ["uric_acid"] },
];

export interface PatientResult {
  testKey: TestKey;
  name: string;
  /** Plain-English description of the test. */
  description: string;
  /** "6.1", "<5.0" or "Positive". */
  display: string;
  value: number;
  unit: string;
  qualitative: boolean;
  flag: Flag;
  /** The flag in words, e.g. "Higher than the healthy range". */
  flagText: string;
  range: { low?: number; high?: number };
  rangeText: string;
  /** "Ref: 4.0–5.6 %" (sex-specific), plus " · Target: …" when a personal target applies. */
  ref: string;
  /** "Blood · whole blood", "Urine". */
  specimen: string;
  /** A personal target set for this patient (guideline or doctor), when one applies. */
  target?: { label: string; low?: number; high?: number; met: boolean };
  /** Change since the previous approved report, in the test's unit. */
  delta?: number;
  /** "+0.2" / "−4" */
  deltaText?: string;
}

export interface ResultGroup {
  id: string;
  name: string;
  results: PatientResult[];
}

export interface PatientTrendView {
  key: TrendKey;
  title: string;
  unit: string;
  decimals: number;
  points: { date: string; value: number }[];
  range: { low?: number; high?: number };
  /** Plain sentence, e.g. "Your HbA1c has risen slowly since 2023." */
  sentence: string;
}

export type StatusLevel = "none" | "green" | "amber" | "red";

export interface OverallStatus {
  level: StatusLevel;
  title: string;
  message: string;
}

export interface NextStep {
  kind: "test" | "review";
  text: string;
}

export interface PatientReportDetail extends PatientReportView {
  results: PatientResult[];
  groups: ResultGroup[];
  /** "Blood + Urine report". */
  specimenTitle: string;
  /** "Symptoms: Fatigue · Suspected disease: Iron-deficiency anaemia" — why the doctor ordered it. */
  presenting: string;
}

export interface PatientRecord {
  /** Approved reports, newest first. */
  reports: PatientReportDetail[];
  latest?: PatientReportDetail;
  status: OverallStatus;
  /** The latest approved explanation as 3–5 short points. */
  points: string[];
  /** Latest approved results, grouped. */
  groups: ResultGroup[];
  trends: PatientTrendView[];
  /** The latest approved plan (patient-safe), if any. */
  plan?: TreatmentPlan;
  schedule: ScheduleGroup[];
  nextSteps: NextStep[];
  /** The approved plan includes the dengue warning signs. */
  warningSigns: boolean;
}

export const STATUS_TEXT: Record<StatusLevel, { title: string; message: string }> = {
  none: {
    title: "No results to show yet",
    message: "You will see your results here once your doctor has reviewed them.",
  },
  green: {
    title: "All looks good",
    message: "Your doctor has reviewed your latest results. Nothing needs action right now.",
  },
  amber: {
    title: "A few things to keep an eye on",
    message: "Your doctor has reviewed your results and noted a few things to keep an eye on. This is not an emergency.",
  },
  red: {
    title: "Please follow your doctor's advice now",
    message: "Follow your doctor's plan closely. If you notice any warning sign, go to a hospital or call 108 straight away.",
  },
};

/** The parts of a wearable episode the status needs (what the patient was told). */
export interface EpisodeStatusInput {
  closed: boolean;
  dismissed: boolean;
  checkInDue?: boolean;
  latest: { recommendation: { level: "monitor" | "see_doctor" | "urgent" } } | null;
}

function openEpisode(e: EpisodeStatusInput | null | undefined): EpisodeStatusInput | null {
  return e && !e.closed && !e.dismissed ? e : null;
}

/**
 * Traffic light. Red only for urgent situations: an open urgent wearable
 * episode, or an approved plan with warning signs. Approved findings that need
 * attention (high or watch) are amber with calm wording; otherwise green.
 */
export function overallStatus(input: {
  hasApproved: boolean;
  findings: Pick<Finding, "severity">[];
  plan?: Pick<TreatmentPlan, "lifestyle">;
  episode?: EpisodeStatusInput | null;
}): OverallStatus {
  const ep = openEpisode(input.episode);
  const epLevel = ep?.latest?.recommendation.level;
  let level: StatusLevel;
  if (epLevel === "urgent" || input.plan?.lifestyle.includes(DENGUE_WARNING_SIGNS)) level = "red";
  else if (epLevel === "see_doctor" || input.findings.some((f) => f.severity !== "normal")) level = "amber";
  else level = input.hasApproved || ep ? "green" : "none";
  return { level, ...STATUS_TEXT[level] };
}

/** The approved explanation split into short points (paragraphs, list items, sentences), at most `max`. */
export function explanationPoints(text: string | undefined, max = 5): string[] {
  if (!text) return [];
  const points: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[-•*]\s+/.test(l));
    if (bullets.length) {
      // Keep the list's heading with each item so it reads on its own.
      const heading = lines.find((l) => !/^[-•*]\s+/.test(l))?.replace(/:$/, "");
      points.push(...bullets.map((b) => (heading ? `${heading} — ` : "") + b.replace(/^[-•*]\s+/, "")));
      continue;
    }
    const sentences = lines.join(" ").match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [];
    points.push(...sentences.map((s) => s.trim()).filter(Boolean));
  }
  return points.slice(0, max);
}

/** "Higher than the healthy range" etc. Qualitative: "Not detected" / "Detected". */
export function flagText(v: Pick<LabValue, "testKey" | "flag" | "value">): string {
  if (isQualitative(v.testKey)) {
    const r = qualResultOf(v.value);
    return r === "Positive" ? "Detected (positive)" : r === "Equivocal" ? "Unclear — needs a repeat" : "Not detected (negative)";
  }
  if (v.flag === "high") return "Higher than the healthy range";
  if (v.flag === "low") return "Lower than the healthy range";
  return "In the healthy range";
}

function signedText(n: number, decimals: number): string {
  const s = Math.abs(n).toFixed(decimals);
  if (Number(s) === 0) return "no change";
  return n < 0 ? `−${s}` : `+${s}`;
}

function resultsFor(report: Report, previous: Report | undefined, sex: Sex, targets: PatientTarget[]): PatientResult[] {
  return report.values.map((v) => {
    const def = TESTS[v.testKey];
    const qualitative = isQualitative(v.testKey);
    const prev = previous?.values.find((p) => p.testKey === v.testKey);
    const delta = prev && !qualitative ? v.value - prev.value : undefined;
    const t = qualitative ? undefined : targetFor(targets, v.testKey);
    return {
      testKey: v.testKey,
      name: def.name,
      description: def.description,
      display: formatNumber(v.testKey, v.value, v.qualifier),
      value: v.value,
      unit: qualitative ? "" : v.unit,
      qualitative,
      flag: v.flag,
      flagText: flagText(v),
      range: qualitative ? {} : getRange(v.testKey, sex),
      rangeText: rangeText(v.testKey, sex),
      ref: refText(v.testKey, sex, t?.label),
      specimen: SPECIMEN_LABEL[def.specimen],
      ...(t ? { target: { label: t.label, low: t.low, high: t.high, met: meetsTarget(t, v.value) } } : {}),
      ...(delta !== undefined ? { delta, deltaText: signedText(delta, def.decimals) } : {}),
    };
  });
}

/** Results grouped into patient-friendly sections, in a fixed order. */
export function groupResults(results: PatientResult[]): ResultGroup[] {
  return RESULT_GROUPS.flatMap((g) => {
    const rs = g.tests.flatMap((k) => results.filter((r) => r.testKey === k));
    return rs.length ? [{ id: g.id, name: g.name, results: rs }] : [];
  });
}

const TREND_NAME: Partial<Record<TrendKey, string>> = {
  egfr: "kidney function (eGFR)",
  hb: "haemoglobin (Hb)",
  rbc: "red blood cell count",
  mcv: "red cell size (MCV)",
};

/** "Fasting glucose" → "fasting glucose"; acronyms ("HbA1c", "LDL cholesterol") stay as they are. */
function inSentence(name: string): string {
  return /^[A-Z][a-z]+(\s|$)/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;
}

/** A plain sentence about a trend, no slopes or statistics. */
export function trendSentence(key: TrendKey, trend: Trend | null, points: { date: string }[]): string {
  const name = TREND_NAME[key] ?? inSentence(key === "egfr" ? "eGFR" : TESTS[key].name);
  if (!trend || points.length < 3) {
    return `Only ${points.length} result${points.length === 1 ? "" : "s"} so far — not enough to see a pattern yet.`;
  }
  const since = points[0].date.slice(0, 4);
  if (trend.direction === "stable") return `Your ${name} has stayed about the same since ${since}.`;
  const relative = Math.abs(trend.slopePerYear) / Math.max(Math.abs(trend.baselineMean), 1e-9);
  const speed = key === "egfr" && trendLabel(trend).main === "Rapid decline" ? "faster than usual" : relative < 0.05 ? "slowly" : "steadily";
  const verb = trend.direction === "rising" ? "gone up" : "gone down";
  const tail = trend.driftingWithinRange ? " It is still in the healthy range, and your doctor is keeping an eye on it." : "";
  return `Your ${name} has ${verb} ${speed} since ${since}.${tail}`;
}

/** "HbA1c in 12 weeks", "See Dr. Meera Nair on Mon 12 Oct". */
export function nextSteps(plan: TreatmentPlan | undefined): NextStep[] {
  if (!plan) return [];
  const steps: NextStep[] = plan.followUpTests.map((t) => ({ kind: "test", text: `${t.name} ${followUpWhen(t.inWeeks)}` }));
  if (plan.nextReviewDate) {
    steps.push({ kind: "review", text: `See ${plan.author} on ${format(parseISO(plan.nextReviewDate), "EEE d MMM")}` });
  }
  return steps;
}

const DEFAULT_TREND_KEYS: TrendKey[] = ["hba1c", "ldl", "hb", "creatinine"];

/**
 * Everything the patient's Simple and Detailed views show. Inputs are the raw
 * store data; only approved reports and approved plans come out.
 */
export function buildPatientRecord(input: {
  patient: Patient;
  reports: Report[];
  plans: TreatmentPlan[];
  cases?: Case[];
  targetOverrides?: TargetOverride[];
  episode?: EpisodeStatusInput | null;
}): PatientRecord {
  const { patient, plans, cases = [], targetOverrides = [] } = input;
  const views = patientVisibleReports(patient.id, input.reports, plans);
  const approved = input.reports
    .filter((r) => r.patientId === patient.id && approvedVersion(r))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestReport = approved.at(-1);
  const latest = views[0];

  // Severity only (never shown): the findings the doctor kept in the approved version.
  const findings = latestReport
    ? applyFindingEdits(
        getFindings(patient, approved, { suspectedDisease: caseForReport(cases, latestReport.id)?.suspectedDisease }),
        approvedVersion(latestReport)?.findingEdits,
      )
    : [];
  const targets = latestReport
    ? personalisedTargets(getTargets(patient, findings, targetOverrides.filter((o) => o.patientId === patient.id), latestReport.date))
    : [];

  const reports = views.map((v) => {
    const i = approved.findIndex((r) => r.id === v.reportId);
    const results = resultsFor(approved[i], approved[i - 1], patient.sex, targets);
    return {
      ...v,
      results,
      groups: groupResults(results),
      specimenTitle: reportSpecimenTitle(approved[i].values.map((x) => x.testKey)),
      presenting: presentingLine(presentingFor(patient, caseForReport(cases, v.reportId))),
    };
  });

  const trendKeys = [...chartKeysFor(findings), ...DEFAULT_TREND_KEYS]
    .filter((k, i, all) => all.indexOf(k) === i)
    .filter((k) => seriesFor(patient, approved, k).length >= 2)
    .slice(0, 4);
  const trends = trendKeys.map((key) => {
    const points = seriesFor(patient, approved, key);
    const trend = computeTrend(key, points, patient.sex);
    return {
      key,
      title: key === "egfr" ? "Kidney function (eGFR)" : TESTS[key].name,
      unit: trendUnit(key),
      decimals: trendDecimals(key),
      points,
      range: trendRange(key, patient.sex),
      sentence: trendSentence(key, trend, points),
    };
  });

  const plan = latest?.plan;
  return {
    reports,
    latest: reports[0],
    status: overallStatus({ hasApproved: views.length > 0, findings, plan, episode: input.episode }),
    points: explanationPoints(latest?.explanation),
    groups: reports[0]?.groups ?? [],
    trends,
    plan,
    schedule: planSchedule(plan),
    nextSteps: nextSteps(plan),
    warningSigns: !!plan?.lifestyle.includes(DENGUE_WARNING_SIGNS),
  };
}

// ---- Wearable one-liner (Simple view) -------------------------------------------

export type WearableLineKind = "off" | "loading" | "normal" | "watch" | "checkin";

export interface WearableLine {
  kind: WearableLineKind;
  text: string;
  href?: string;
}

export function wearableOneLiner(input: {
  streaming: boolean;
  /** Today's top pattern level; null while the analysis is loading. */
  topLevel: "none" | "watch" | "concerning" | null;
  episode?: EpisodeStatusInput | null;
}): WearableLine {
  if (!input.streaming) return { kind: "off", text: "Monitoring off" };
  const ep = openEpisode(input.episode);
  if (ep?.checkInDue) return { kind: "checkin", text: "Please answer a few quick questions", href: "/patient/checkin" };
  if (ep || input.topLevel === "watch" || input.topLevel === "concerning") {
    return { kind: "watch", text: "Prodrome is keeping a closer eye" };
  }
  if (input.topLevel === null) return { kind: "loading", text: "Checking your watch readings…" };
  return { kind: "normal", text: "Your watch readings look normal" };
}

// ---- Print ("Download / print my report") -----------------------------------------

export interface PrintSection {
  heading: string;
  lines: string[];
}

export interface PrintableReport {
  title: string;
  patientLine: string;
  sections: PrintSection[];
  footer: string;
}

export const DISCLAIMER = "Prototype · Synthetic data · Clinical decision support, not a diagnosis.";

/** The printable report: approved content only, plain text sections. */
export function printableReport(patient: Patient, record: PatientRecord): PrintableReport {
  const sections: PrintSection[] = [];
  const latest = record.latest;
  if (latest) {
    sections.push({
      heading: `Latest report · ${latest.specimenTitle} · ${format(parseISO(latest.date), "d MMMM yyyy")} · ${latest.labName}`,
      lines: [latest.presenting, `Approved by ${latest.approvedBy}`],
    });
    if (record.warningSigns) sections.push({ heading: "Warning signs — come back immediately (call 108)", lines: [`${DENGUE_WARNING_SIGNS}.`] });
    if (latest.explanation) sections.push({ heading: "What your results mean", lines: latest.explanation.split("\n").filter(Boolean) });
    for (const g of latest.groups) {
      sections.push({
        heading: g.name,
        lines: g.results.map(
          (r) =>
            `${r.name} (${r.specimen}): ${r.display}${r.unit ? ` ${r.unit}` : ""} (${r.ref}) — ${r.flagText}` +
            (r.deltaText ? ` · change since last report ${r.deltaText}` : ""),
        ),
      });
    }
    if (latest.prescription) sections.push({ heading: "Doctor's prescription", lines: [latest.prescription] });
  }
  const plan = record.plan;
  if (plan) {
    const stops = plan.stopMedications ?? [];
    if (stops.length) sections.push({ heading: "Stop taking", lines: stops.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.reason ? ` — ${m.reason}` : ""}`) });
    sections.push({
      heading: "Your medicines",
      lines: plan.medications.length
        ? plan.medications.map((m) =>
            [`${m.name}${m.dose ? ` ${m.dose}` : ""}`, frequencyMeaning(m.frequency), foodTimingLabel(m.foodTiming), m.duration && `for ${m.duration}`, m.instructions]
              .filter(Boolean)
              .join(" · "),
          )
        : ["No medicines prescribed."],
    });
    if (plan.lifestyle.length) sections.push({ heading: "Lifestyle", lines: plan.lifestyle });
    if (record.nextSteps.length) sections.push({ heading: "Next steps", lines: record.nextSteps.map((s) => s.text) });
  }
  const older = record.reports.slice(1);
  if (older.length) {
    sections.push({
      heading: "Earlier reports",
      lines: older.map((r) => `${format(parseISO(r.date), "d MMM yyyy")} · ${r.labName}${r.explanation ? ` — ${r.explanation.split("\n")[0]}` : ""}`),
    });
  }
  return {
    title: "My health report",
    patientLine: `${patient.name} · ${patient.age} years · ${patient.sex === "M" ? "Male" : "Female"} · Blood group ${patient.bloodGroup}`,
    sections,
    footer: DISCLAIMER,
  };
}
