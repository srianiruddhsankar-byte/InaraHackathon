// Combines flags, screens and trends into ordered findings: the suspected
// disease first, then "Also detected from the same panel" (high before
// watch), then a "no other concerns" finding when nothing else was found.
// The dengue screen gives a small group of findings (markers, platelets,
// haematocrit vs the person's baseline, WBC); a wearable alert behind the case
// is added to the markers finding as supporting evidence.
// Wording is decision support: "suggests", "consider" — never "you have".
import {
  adaCategory,
  ageAtDate,
  assessHaematocrit,
  DENGUE,
  dengueMarkers,
  isLowPlatelets,
  isLowWbc,
  anaemiaThreshold,
  egfrCkdEpi2021,
  fib4,
  flagValue,
  isAnaemic,
  isHdlLow,
  isRapidEgfrDecline,
  isTriglyceridesHigh,
  kdigoAStage,
  kdigoGStage,
  ldlCategory,
  mentzer,
} from "./rules";
import { formatValue, TESTS } from "./tests";
import { computeTrends, findTrend } from "./trends";
import type {
  Finding,
  FindingsContext,
  Patient,
  Report,
  ScreenId,
  Severity,
  Sex,
  TestKey,
  Trend,
  TrendKey,
  WearableContext,
} from "./types";

type Values = Partial<Record<TestKey, number>>;

interface ScreenContext {
  patient: Patient;
  sex: Sex;
  /** Age at the latest report date. */
  age: number;
  values: Values;
  trends: Trend[];
  reportCount: number;
  /** Most recent earlier value of each test (the personal baseline). */
  baseline: Values;
  /** Dengue is suspected or dengue markers were tested: FIB-4 is not interpreted in acute illness. */
  dengueContext: boolean;
  wearable?: WearableContext;
}

/** Screen output before it is placed in the ordered list. */
type ScreenResult = Omit<Finding, "id" | "category" | "screen" | "disease">;

const SCREEN_DISEASE: Record<ScreenId, string> = {
  diabetes: "Diabetes",
  kidney: "Kidney health",
  anaemia: "Anaemia",
  liver: "Liver fibrosis risk",
  lipids: "Lipids",
  dengue: "Dengue",
};

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, watch: 1, normal: 2 };

/** Tests (and derived series) each screen looks at, most important first. */
export const SCREEN_TESTS: Record<ScreenId, TrendKey[]> = {
  diabetes: ["hba1c", "fasting_glucose"],
  kidney: ["egfr", "urine_acr", "creatinine"],
  anaemia: ["hb", "mcv", "rbc", "ferritin"],
  liver: ["ast", "alt", "platelets"],
  lipids: ["ldl", "triglycerides", "hdl", "total_chol"],
  dengue: ["platelets", "hct", "wbc", "hb"],
};

/** Free-text suspected disease → screen, by keyword. */
export function matchSuspectedScreen(suspected: string): ScreenId | null {
  const s = suspected.toLowerCase();
  if (/dengue|ns1/.test(s)) return "dengue";
  if (/diabet|glucose|sugar|hba1c/.test(s)) return "diabetes";
  if (/kidney|renal|ckd|nephro/.test(s)) return "kidney";
  if (/anaem|anem|iron|thalass|haemoglobin|hemoglobin/.test(s)) return "anaemia";
  if (/liver|hepat|fatty|nafld|masld|fibrosis/.test(s)) return "liver";
  if (/lipid|cholesterol|triglycer/.test(s)) return "lipids";
  return null;
}

// --- formatting helpers ---------------------------------------------------

function signed(n: number, decimals: number): string {
  const s = Math.abs(n).toFixed(decimals);
  return n < 0 ? `−${s}` : `+${s}`;
}

function trendUnit(key: TrendKey): string {
  return key === "egfr" ? "mL/min/1.73m²" : TESTS[key].unit;
}

function trendDecimals(key: TrendKey): number {
  return key === "egfr" ? 1 : Math.max(TESTS[key].decimals, 1);
}

function trendName(key: TrendKey): string {
  return key === "egfr" ? "eGFR" : TESTS[key].name;
}

/** e.g. "HbA1c trend: rising +0.24 %/yr over 4 reports (baseline 5.6 %)". */
export function describeTrend(trend: Trend, reportCount: number): string {
  const d = trendDecimals(trend.testKey);
  const unit = trendUnit(trend.testKey);
  const drift = trend.driftingWithinRange ? ", drifting within range" : "";
  return `${trendName(trend.testKey)} trend: ${trend.direction} ${signed(trend.slopePerYear, d + 1)} ${unit}/yr over ${reportCount} reports (baseline ${trend.baselineMean.toFixed(d)} ${unit})${drift}`;
}

function trendEvidence(ctx: ScreenContext, key: TrendKey): string[] {
  const t = findTrend(ctx.trends, key);
  return t && ctx.reportCount >= 2 ? [describeTrend(t, ctx.reportCount)] : [];
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// --- screens --------------------------------------------------------------

function diabetesScreen(ctx: ScreenContext): ScreenResult | null {
  const { hba1c, fasting_glucose: fg } = ctx.values;
  if (hba1c === undefined && fg === undefined) return null;
  const category = adaCategory({ hba1c, fastingGlucose: fg });
  const hba1cTrend = findTrend(ctx.trends, "hba1c");
  const fgTrend = findTrend(ctx.trends, "fasting_glucose");
  const rising = hba1cTrend?.direction === "rising" || fgTrend?.direction === "rising";
  const drifting = !!(hba1cTrend?.driftingWithinRange || fgTrend?.driftingWithinRange);

  const markers: string[] = [];
  if (hba1c !== undefined) markers.push(`HbA1c ${formatValue("hba1c", hba1c)}`);
  if (fg !== undefined) markers.push(`fasting glucose ${formatValue("fasting_glucose", fg)}`);
  const markerText = joinList(markers);
  const risingText = rising ? ", with a rising trend over the patient's own history" : "";

  const evidence = [
    ...(hba1c !== undefined ? [`HbA1c ${formatValue("hba1c", hba1c)} (ADA: <5.7 normal, 5.7–6.4 prediabetes, ≥6.5 diabetes range)`] : []),
    ...(fg !== undefined ? [`Fasting glucose ${formatValue("fasting_glucose", fg)} (ADA: 100–125 prediabetes, ≥126 diabetes range)`] : []),
    ...trendEvidence(ctx, "hba1c"),
    ...trendEvidence(ctx, "fasting_glucose"),
  ];

  if (category === "diabetes") {
    return {
      severity: "high",
      title: "Values in the diabetes range",
      summary: `${capitalise(markerText)} fall in the ADA diabetes range${risingText}.`,
      evidence,
      recommendation: "Consider confirming with a repeat test and a clinical review.",
      guideline: "ADA",
      pattern: "diabetes_range",
    };
  }
  if (category === "prediabetes") {
    return {
      severity: "watch",
      title: "Values suggest prediabetes",
      summary: `${capitalise(markerText)} fall in the ADA prediabetes range${risingText}.`,
      evidence,
      recommendation: "Consider lifestyle counselling and a repeat HbA1c in 3–6 months.",
      guideline: "ADA",
      pattern: "prediabetes",
    };
  }
  if (drifting) {
    return {
      severity: "watch",
      title: "Glucose markers drifting upward within range",
      summary: `${capitalise(markerText)} are still in the normal range but rising steadily. Flag for review.`,
      evidence,
      recommendation: "Consider repeating HbA1c in 12 months.",
      guideline: "ADA",
    };
  }
  return {
    severity: "normal",
    title: "No diabetes signal on this panel",
    summary: `${capitalise(markerText)} are within the ADA normal range.`,
    evidence,
    guideline: "ADA",
  };
}

function kidneyScreen(ctx: ScreenContext): ScreenResult | null {
  const scr = ctx.values.creatinine;
  if (scr === undefined) return null;
  const acr = ctx.values.urine_acr;
  const egfr = egfrCkdEpi2021(scr, ctx.age, ctx.sex);
  const g = kdigoGStage(egfr);
  const a = acr !== undefined ? kdigoAStage(acr) : undefined;
  const egfrTrend = findTrend(ctx.trends, "egfr");
  const rapid =
    !!egfrTrend && ctx.reportCount >= 2 && isRapidEgfrDecline(egfrTrend.slopePerYear);

  const evidence = [
    `eGFR ${egfr.toFixed(0)} mL/min/1.73m² (CKD-EPI 2021, age ${ctx.age}) → KDIGO ${g}`,
    ...trendEvidence(ctx, "egfr"),
    `Creatinine ${formatValue("creatinine", scr)}`,
    ...trendEvidence(ctx, "creatinine"),
    ...(acr !== undefined ? [`Urine ACR ${formatValue("urine_acr", acr)} → KDIGO ${a} (≥30 albuminuria, ≥300 A3)`] : []),
    ...trendEvidence(ctx, "urine_acr"),
  ];
  const stage = a ? `${g} ${a}` : g;

  const concerns: string[] = [];
  if (rapid && egfrTrend) {
    concerns.push(
      `eGFR has fallen to ${egfr.toFixed(0)} at ${signed(egfrTrend.slopePerYear, 1)} per year (KDIGO rapid decline: >5/yr)`,
    );
  }
  if (["G3a", "G3b", "G4", "G5"].includes(g)) concerns.push(`eGFR ${egfr.toFixed(0)} is in stage ${g}`);
  if (a === "A2") concerns.push(`urine ACR ${acr} mg/g suggests moderately increased albuminuria (A2)`);
  if (a === "A3") concerns.push(`urine ACR ${acr} mg/g suggests severely increased albuminuria (A3)`);

  const high = rapid || ["G3b", "G4", "G5"].includes(g) || a === "A3";
  const watch = g === "G3a" || a === "A2" || (g === "G2" && !!egfrTrend?.driftingWithinRange);

  if (!high && !watch) {
    return {
      severity: "normal",
      title: "Kidney markers within expected range",
      summary: `eGFR ${egfr.toFixed(0)} (${stage}) with no sign of rapid decline or albuminuria.`,
      evidence,
      guideline: "KDIGO 2012 · CKD-EPI 2021",
    };
  }
  if (concerns.length === 0 && egfrTrend) {
    concerns.push(`eGFR ${egfr.toFixed(0)} is drifting down (${signed(egfrTrend.slopePerYear, 1)} per year)`);
  }
  return {
    severity: high ? "high" : "watch",
    title: rapid ? "Rapid eGFR decline" : a === "A2" || a === "A3" ? "Albuminuria detected" : "Reduced kidney function",
    summary: `${capitalise(joinList(concerns))}. Current stage ${stage}.`,
    evidence,
    recommendation:
      "Consider repeating creatinine and urine ACR within 3 months, and reviewing blood pressure and nephrotoxic medicines.",
    guideline: "KDIGO 2012 · CKD-EPI 2021",
  };
}

function anaemiaScreen(ctx: ScreenContext): ScreenResult | null {
  const { hb, mcv, rbc, ferritin } = ctx.values;
  if (hb === undefined) return null;
  const pregnant = !!ctx.patient.pregnant;
  const threshold = anaemiaThreshold(ctx.sex, pregnant);
  const sexWord = pregnant ? "pregnancy" : ctx.sex === "F" ? "women" : "men";
  const evidence = [
    `Haemoglobin ${formatValue("hb", hb)} (WHO anaemia threshold <${threshold} g/dL for ${sexWord})`,
    ...trendEvidence(ctx, "hb"),
    ...(mcv !== undefined ? [`MCV ${formatValue("mcv", mcv)}${mcv < 80 ? " (microcytic)" : ""}`] : []),
    ...(rbc !== undefined ? [`RBC ${formatValue("rbc", rbc)}`] : []),
    ...(ferritin !== undefined ? [`Ferritin ${formatValue("ferritin", ferritin)} (${flagValue("ferritin", ferritin, ctx.sex)})`] : []),
  ];

  if (!isAnaemic(hb, ctx.sex, pregnant)) {
    return {
      severity: "normal",
      title: "Haemoglobin within normal range",
      summary: `Haemoglobin ${formatValue("hb", hb)} is above the WHO anaemia threshold.`,
      evidence,
      guideline: "WHO",
    };
  }

  const severity: Severity = hb < 8 ? "high" : "watch";
  const lowHb = `Haemoglobin ${formatValue("hb", hb)} is below the WHO threshold (${threshold} g/dL for ${sexWord})`;

  if (mcv !== undefined && rbc !== undefined && mcv < 80) {
    const m = mentzer(mcv, rbc);
    evidence.push(`Mentzer index ${m.index.toFixed(1)} = MCV ÷ RBC (<13 suggests thalassaemia trait, >13 iron deficiency)`);
    const ferritinNormal = ferritin !== undefined && flagValue("ferritin", ferritin, ctx.sex) === "normal";
    if (m.suggests === "thalassaemia_trait") {
      return {
        severity,
        title: "Low haemoglobin — pattern suggests thalassaemia trait",
        summary: `${lowHb}. The Mentzer index is ${m.index.toFixed(1)} (<13)${ferritinNormal ? " and ferritin is normal" : ""}, which suggests thalassaemia trait rather than iron deficiency.`,
        evidence,
        recommendation: "Consider Hb electrophoresis before starting iron therapy.",
        guideline: "WHO · Mentzer index",
        pattern: "thalassaemia_trait",
      };
    }
    if (m.suggests === "iron_deficiency") {
      return {
        severity,
        title: "Low haemoglobin — pattern suggests iron deficiency",
        summary: `${lowHb}. The Mentzer index is ${m.index.toFixed(1)} (>13), which suggests iron deficiency.`,
        evidence,
        recommendation: "Consider confirming with ferritin and iron studies before starting iron therapy.",
        guideline: "WHO · Mentzer index",
        pattern: "iron_deficiency",
      };
    }
  }
  return {
    severity,
    title: "Low haemoglobin",
    summary: `${lowHb}.`,
    evidence,
    recommendation: "Consider further evaluation of the cause of anaemia.",
    guideline: "WHO",
  };
}

function liverScreen(ctx: ScreenContext): ScreenResult | null {
  const { ast, alt, platelets } = ctx.values;
  if (ast === undefined || alt === undefined || platelets === undefined) return null;
  const f = fib4(ctx.age, ast, alt, platelets);
  const enzymesHigh = flagValue("ast", ast, ctx.sex) === "high" || flagValue("alt", alt, ctx.sex) === "high";
  if (ctx.dengueContext) {
    // FIB-4 is validated for chronic liver disease; acute illness (raised AST,
    // low platelets) would make it falsely high, so it is not interpreted here.
    const evidence = [
      `AST ${formatValue("ast", ast)}, ALT ${formatValue("alt", alt)}${ast > alt ? " (AST > ALT)" : ""}`,
      ...(ctx.baseline.ast !== undefined && ctx.baseline.alt !== undefined
        ? [`Personal baseline AST ${formatValue("ast", ctx.baseline.ast)}, ALT ${formatValue("alt", ctx.baseline.alt)}`]
        : []),
      "FIB-4 not interpreted during acute illness (low platelets and raised AST make it unreliable)",
    ];
    if (!enzymesHigh) {
      return { severity: "normal", title: "Liver enzymes within range", summary: `AST and ALT are within range.`, evidence, guideline: "WHO 2009" };
    }
    return {
      severity: "watch",
      title: ast > alt ? "Liver enzymes raised (AST > ALT, common in dengue)" : "Liver enzymes raised",
      summary: `AST ${ast} U/L and ALT ${alt} U/L are above range${ast > alt ? ", with AST higher than ALT — a pattern common in dengue" : ""}.`,
      evidence,
      recommendation: "Consider repeating liver enzymes with the next blood count and avoiding medicines that strain the liver.",
      guideline: "WHO 2009",
      pattern: "dengue_liver",
    };
  }
  const evidence = [
    `FIB-4 ${f.score.toFixed(2)} = (age ${ctx.age} × AST ${ast}) ÷ (platelets ${platelets} × √ALT ${alt}) (<1.3 low, 1.3–2.67 indeterminate, >2.67 high)`,
    `AST ${formatValue("ast", ast)}, ALT ${formatValue("alt", alt)}`,
  ];
  if (f.risk === "high") {
    return {
      severity: "high",
      title: "FIB-4 suggests high fibrosis risk",
      summary: `FIB-4 is ${f.score.toFixed(2)} (>2.67), which suggests advanced liver fibrosis is possible.`,
      evidence,
      recommendation: "Consider hepatology referral.",
      guideline: "FIB-4",
    };
  }
  if (f.risk === "indeterminate") {
    return {
      severity: "watch",
      title: "FIB-4 indeterminate",
      summary: `FIB-4 is ${f.score.toFixed(2)} (1.3–2.67); fibrosis risk cannot be ruled out from bloods alone.`,
      evidence,
      recommendation: "Consider elastography (e.g. FibroScan) to clarify fibrosis risk.",
      guideline: "FIB-4",
      pattern: "fib4_indeterminate",
    };
  }
  if (enzymesHigh) {
    return {
      severity: "watch",
      title: "Liver enzymes raised",
      summary: `AST or ALT is above range, although FIB-4 (${f.score.toFixed(2)}) suggests low fibrosis risk.`,
      evidence,
      recommendation: "Consider repeating liver function tests and reviewing alcohol and medicines.",
      guideline: "FIB-4",
    };
  }
  return {
    severity: "normal",
    title: "Low liver fibrosis risk",
    summary: `FIB-4 is ${f.score.toFixed(2)} (<1.3), which suggests low fibrosis risk.`,
    evidence,
    guideline: "FIB-4",
  };
}

function lipidsScreen(ctx: ScreenContext): ScreenResult | null {
  const { ldl, hdl, triglycerides: tg } = ctx.values;
  if (ldl === undefined && hdl === undefined && tg === undefined) return null;
  const problems: string[] = [];
  const evidence: string[] = [];
  if (ldl !== undefined) {
    const cat = ldlCategory(ldl);
    evidence.push(`LDL ${formatValue("ldl", ldl)} (130–159 borderline, ≥160 high)`, ...trendEvidence(ctx, "ldl"));
    if (cat === "high") problems.push(`LDL ${ldl} mg/dL is high`);
    if (cat === "borderline") problems.push(`LDL ${ldl} mg/dL is borderline high`);
  }
  if (hdl !== undefined) {
    evidence.push(`HDL ${formatValue("hdl", hdl)} (low if <${ctx.sex === "F" ? 50 : 40})`);
    if (isHdlLow(hdl, ctx.sex)) problems.push(`HDL ${hdl} mg/dL is low`);
  }
  if (tg !== undefined) {
    evidence.push(`Triglycerides ${formatValue("triglycerides", tg)} (≥150 high)`, ...trendEvidence(ctx, "triglycerides"));
    if (isTriglyceridesHigh(tg)) problems.push(`triglycerides are high at ${tg} mg/dL`);
  }
  if (problems.length === 0) {
    return {
      severity: "normal",
      title: "Lipids within target",
      summary: "LDL, HDL and triglycerides are within target ranges.",
      evidence,
      guideline: "NCEP ATP III",
    };
  }
  return {
    severity: "watch",
    title: "Lipid profile outside target",
    summary: `${capitalise(joinList(problems))}.`,
    evidence,
    recommendation: "Consider lifestyle advice and a cardiovascular risk assessment.",
    guideline: "NCEP ATP III",
  };
}

/** "+16.7%" / "−67.3%" */
function pct(n: number): string {
  return `${signed(n, 1)}%`;
}

/** The wearable alert as evidence lines for the dengue finding. */
export function wearableEvidence(w: WearableContext): string[] {
  const lines = [`Supporting (wearable): ${w.patternName} (${w.patternLevel}) on ${w.date}`];
  for (const e of w.evidence.slice(0, 3)) lines.push(`Supporting (wearable): ${e}`);
  if (w.redFlags.length) lines.push(`Supporting (check-in): red flag — ${w.redFlags.join(", ")}`);
  const yes = w.answers.filter((a) => a.answer !== "No" && !a.redFlag).map((a) => `${a.question.replace(/\?$/, "")}: ${a.answer}`);
  if (yes.length) lines.push(`Supporting (check-in): ${yes.join("; ")}`);
  return lines;
}

/** Dengue group: markers (main), then platelets, haematocrit vs baseline and WBC. */
function dengueScreen(ctx: ScreenContext): ScreenResult[] {
  const { ns1, dengue_igm: igm, platelets, hct, wbc } = ctx.values;
  const markers = dengueMarkers(ns1, igm);
  const out: ScreenResult[] = [];
  const guideline = "WHO 2009";

  // Evidence shared by the main finding.
  const evidence: string[] = [];
  if (markers?.ns1) evidence.push(`NS1 antigen: ${markers.ns1}`);
  if (markers?.igm) evidence.push(`Dengue IgM: ${markers.igm}`);
  if (platelets !== undefined) {
    const base = ctx.baseline.platelets;
    evidence.push(
      `Platelets ${formatValue("platelets", platelets)}${base !== undefined ? ` (baseline ${base}, ${pct(((platelets - base) / base) * 100)})` : ""}`,
    );
  }
  if (hct !== undefined) {
    const base = ctx.baseline.hct;
    evidence.push(`Haematocrit ${formatValue("hct", hct)}${base !== undefined ? ` (baseline ${base}%, ${pct(((hct - base) / base) * 100)})` : " (no personal baseline)"}`);
  }
  if (wbc !== undefined) evidence.push(`WBC ${formatValue("wbc", wbc)} (normal 4.0–11.0)`);
  if (ctx.wearable) evidence.push(...wearableEvidence(ctx.wearable));

  if (markers?.positive) {
    const pos = [markers.ns1 === "Positive" && "NS1 antigen", markers.igm === "Positive" && "dengue IgM"].filter(Boolean) as string[];
    const neg = [markers.ns1 === "Negative" && "NS1", markers.igm === "Negative" && "IgM"].filter(Boolean) as string[];
    const timing =
      markers.ns1 === "Positive" && markers.igm !== "Positive"
        ? " NS1 is found in the first days of illness and IgM usually from about day 5, so this pattern suggests early infection."
        : "";
    out.push({
      severity: "high",
      title: "Dengue markers positive — consistent with dengue infection",
      summary: `${capitalise(joinList(pos))} positive${neg.length ? ` (${neg.join(", ")} negative)` : ""} — lab-confirmed markers consistent with dengue infection; the doctor confirms the diagnosis.${timing}`,
      evidence,
      recommendation:
        "Consider daily platelets and haematocrit through the critical phase (around the time the fever settles), watching for warning signs, oral fluids, and paracetamol rather than NSAIDs.",
      guideline: "WHO 2009 · NCVBDC 2023",
      pattern: "dengue_markers_positive",
    });
  } else if (markers?.equivocal) {
    out.push({
      severity: "watch",
      title: "Dengue markers equivocal",
      summary: "A dengue marker is equivocal — it neither confirms nor rules out infection.",
      evidence,
      recommendation: "Consider repeating dengue IgM in 2–3 days.",
      guideline,
      pattern: "dengue_markers_equivocal",
    });
  } else if (markers?.negative) {
    out.push({
      severity: "normal",
      title: "Dengue markers negative",
      summary: "NS1 and IgM are negative on this sample. An early IgM or a late NS1 can be negative in dengue, so this does not rule it out.",
      evidence,
      recommendation: "If dengue is still suspected, consider repeating IgM after day 5 of illness.",
      guideline,
      pattern: "dengue_markers_negative",
    });
  } else if (ctx.dengueContext) {
    out.push({
      severity: "normal",
      title: "No dengue markers in this panel",
      summary: "NS1 antigen and dengue IgM were not reported.",
      evidence,
      recommendation: "Consider NS1 antigen (first 5 days of fever) or IgM (from day 5).",
      guideline,
    });
  }

  if (platelets !== undefined && isLowPlatelets(platelets)) {
    out.push({
      severity: "high",
      title: "Low platelets",
      summary: `Platelets ${formatValue("platelets", platelets)} are below ${DENGUE.lowPlatelets.value} ×10³/µL${ctx.dengueContext ? " — a WHO marker of more severe dengue" : ""}.`,
      evidence: [
        `Platelets ${formatValue("platelets", platelets)} (WHO: <${DENGUE.lowPlatelets.value} ×10³/µL)`,
        ...(ctx.baseline.platelets !== undefined ? [`Personal baseline ${formatValue("platelets", ctx.baseline.platelets)}`] : []),
      ],
      recommendation: "Consider repeating platelets within 24 hours and checking for bleeding.",
      guideline,
      pattern: "low_platelets",
    });
  }

  if (ctx.dengueContext && hct !== undefined) {
    const a = assessHaematocrit({ hct, platelets, baselineHct: ctx.baseline.hct, baselinePlatelets: ctx.baseline.platelets });
    const hctLine = (base: number) => `Haematocrit ${formatValue("hct", hct)} vs personal baseline ${base}% (${pct(a.hctChange!)})`;
    const pltLine =
      a.plateletChange !== undefined && platelets !== undefined
        ? [`Platelets ${platelets} vs personal baseline ${ctx.baseline.platelets} (${pct(a.plateletChange)})`]
        : [];
    if (a.kind === "no_baseline") {
      out.push({
        severity: "watch",
        title: "Haematocrit — no personal baseline",
        summary: `Haematocrit is ${formatValue("hct", hct)}. There is no earlier haematocrit for this person — compare with a repeat test.`,
        evidence: [`Haematocrit ${formatValue("hct", hct)}`, "No earlier haematocrit in the record"],
        recommendation: "Consider repeating haematocrit in 24 hours: a rise of 20% or more suggests plasma leakage.",
        guideline: "WHO 1997 · WHO 2009",
        pattern: "hct_no_baseline",
      });
    } else if (a.kind === "haemoconcentration") {
      out.push({
        severity: "high",
        title: "Haemoconcentration — evidence of plasma leakage",
        summary: `Haematocrit has risen ${pct(a.hctChange!)} above this person's baseline (≥${DENGUE.haemoconcentration.value}%: WHO evidence of plasma leakage)${a.warningSign ? ", while platelets have fallen rapidly" : ""}.`,
        evidence: [hctLine(ctx.baseline.hct!), ...pltLine],
        recommendation: "Consider urgent clinical review for plasma leakage (fluids, admission criteria).",
        guideline: "WHO 1997 · WHO 2009",
        pattern: "haemoconcentration",
      });
    } else if (a.kind === "warning") {
      out.push({
        severity: "high",
        title: "Warning sign: rising haematocrit with rapid platelet fall",
        summary: `Haematocrit is up ${pct(a.hctChange!)} from this person's baseline while platelets have fallen ${pct(a.plateletChange!)} — a WHO 2009 dengue warning sign.`,
        evidence: [hctLine(ctx.baseline.hct!), ...pltLine],
        recommendation: "Consider close monitoring (daily or more often) and assessing for admission.",
        guideline: "WHO 2009",
        pattern: "hct_warning_sign",
      });
    } else if (a.kind === "rise") {
      out.push({
        severity: "watch",
        title: "Haematocrit rising",
        summary: `Haematocrit is up ${pct(a.hctChange!)} from this person's baseline, without a rapid platelet fall.`,
        evidence: [hctLine(ctx.baseline.hct!), ...pltLine],
        recommendation: "Consider repeating haematocrit and platelets in 24 hours.",
        guideline: "WHO 2009",
        pattern: "hct_rise",
      });
    }
  }

  if (wbc !== undefined && isLowWbc(wbc)) {
    out.push({
      severity: "watch",
      title: ctx.dengueContext ? "Low white cell count (common in dengue)" : "Low white cell count",
      summary: `WBC ${formatValue("wbc", wbc)} is below ${DENGUE.lowWbc.value}${ctx.dengueContext ? " — common in dengue and other viral infections" : ""}.`,
      evidence: [`WBC ${formatValue("wbc", wbc)} (normal 4.0–11.0)`, ...(ctx.baseline.wbc !== undefined ? [`Personal baseline ${formatValue("wbc", ctx.baseline.wbc)}`] : [])],
      recommendation: "Consider repeating the blood count with the next platelet check.",
      guideline,
      pattern: "low_wbc",
    });
  }
  return out;
}

const SCREENS: Record<ScreenId, (ctx: ScreenContext) => ScreenResult | null> = {
  diabetes: diabetesScreen,
  kidney: kidneyScreen,
  anaemia: anaemiaScreen,
  liver: liverScreen,
  lipids: lipidsScreen,
  // The dengue screen gives a group of findings; the main (markers) one comes first.
  dengue: (ctx) => dengueScreen(ctx)[0] ?? null,
};

const SCREEN_ORDER: ScreenId[] = ["dengue", "diabetes", "kidney", "anaemia", "liver", "lipids"];

/** All findings a screen gives (several for dengue, otherwise at most one). */
function runScreen(screen: ScreenId, ctx: ScreenContext): ScreenResult[] {
  if (screen === "dengue") return dengueScreen(ctx);
  const r = SCREENS[screen](ctx);
  return r ? [r] : [];
}

function findingId(patientId: string, screen: ScreenId, r: ScreenResult, i: number): string {
  return i === 0 ? `${patientId}-${screen}` : `${patientId}-${screen}-${r.pattern ?? i}`;
}

/** Capitalise a sentence start, leaving mixed-case terms like "eGFR" alone. */
function capitalise(s: string): string {
  if (/^[a-z][A-Z]/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- public API -----------------------------------------------------------

/** Values of a report as a key → value map. */
export function valuesOf(report: Report): Values {
  return Object.fromEntries(report.values.map((v) => [v.testKey, v.value]));
}

/** Most recent earlier value of each test (reports sorted oldest first; the last is the current one). */
export function baselineValues(history: Report[]): Values {
  const out: Values = {};
  for (const r of history.slice(0, -1)) for (const v of r.values) out[v.testKey] = v.value;
  return out;
}

/** Dengue is suspected, or the panel tested for dengue markers. */
export function isDengueContext(suspected: string, values: Values): boolean {
  return matchSuspectedScreen(suspected) === "dengue" || values.ns1 !== undefined || values.dengue_igm !== undefined;
}

/**
 * Ordered findings for the patient's latest report, using all reports up to
 * and including it as history. `context` comes from the case: its suspected
 * disease (overrides the patient's) and the wearable alert that raised it.
 */
export function getFindings(patient: Patient, reports: Report[], context: FindingsContext = {}): Finding[] {
  const history = reports
    .filter((r) => r.patientId === patient.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = history[history.length - 1];
  if (!latest) return [];

  const suspected = context.suspectedDisease?.trim() || patient.suspectedDisease;
  const values = valuesOf(latest);
  const ctx: ScreenContext = {
    patient,
    sex: patient.sex,
    age: ageAtDate(patient.age, latest.date),
    values,
    trends: computeTrends(patient, history),
    reportCount: history.length,
    baseline: baselineValues(history),
    dengueContext: isDengueContext(suspected, values),
    wearable: context.wearable,
  };

  const suspectedScreen = matchSuspectedScreen(suspected);
  const findings: Finding[] = [];

  if (suspectedScreen) {
    runScreen(suspectedScreen, ctx).forEach((result, i) => {
      findings.push({
        ...result,
        id: findingId(patient.id, suspectedScreen, result, i),
        category: "suspected",
        screen: suspectedScreen,
        disease: SCREEN_DISEASE[suspectedScreen],
      });
    });
  }

  const incidental: Finding[] = [];
  for (const screen of SCREEN_ORDER) {
    if (screen === suspectedScreen) continue;
    runScreen(screen, ctx).forEach((result, i) => {
      if (result.severity === "normal") return;
      incidental.push({
        ...result,
        id: findingId(patient.id, screen, result, i),
        category: "incidental",
        screen,
        disease: SCREEN_DISEASE[screen],
      });
    });
  }
  incidental.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  findings.push(...incidental);

  if (incidental.length === 0) {
    findings.push({
      id: `${patient.id}-no-concerns`,
      category: "normal",
      disease: "Other screens",
      severity: "normal",
      title: suspectedScreen ? "No other concerns from this panel" : "No concerns flagged from this panel",
      summary: `Diabetes, kidney, anaemia, liver and lipid screens${suspectedScreen ? " (other than the suspected condition)" : ""} show no values needing review.`,
      evidence: [],
      guideline: "ADA · KDIGO 2012 · WHO · FIB-4 · NCEP ATP III",
    });
  }

  return findings;
}
