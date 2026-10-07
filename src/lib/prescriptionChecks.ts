// Prescription safety checks for the Treatment step. Decision support only:
// alerts explain a concern and name their source; the doctor decides.
// A "block" can only be saved with a doctor override and reason.
import { findFormulary, type DrugTag, type FormularyEntry } from "./formulary";
import { matchSuspectedScreen } from "./findings";
import { ageAtDate, dengueMarkers, egfrCkdEpi2021, isRapidEgfrDecline, mentzer } from "./rules";
import { getRange } from "./tests";
import { computeTrends, findTrend } from "./trends";
import type { Medication, Patient, Report, TestKey } from "./types";

export type AlertLevel = "block" | "warning" | "info";

export interface PrescriptionAlert {
  level: AlertLevel;
  message: string;
  /** Stable rule id, e.g. "metformin_egfr_lt30". */
  rule: string;
  source: string;
}

/** The lab facts the checks need, taken from the latest report and the trend engine. */
export interface CheckContext {
  egfr?: number;
  egfrSlopePerYear?: number;
  rapidEgfrDecline: boolean;
  acr?: number;
  mcv?: number;
  mentzerIndex?: number;
  ferritin?: number;
  ferritinNormal: boolean;
  alt?: number;
  altUpperLimit?: number;
  /** Why dengue applies (e.g. "NS1 positive", "dengue suspected"); undefined when it doesn't. */
  dengue?: string;
  /** Latest platelets (10³/µL). */
  platelets?: number;
}

/** A medicine as the checks see it: a free-text name, optionally linked to the formulary. */
export type MedLike = Pick<Medication, "name"> & { formularyId?: string; custom?: boolean };

const SRC = {
  fda: "FDA label",
  kdigo: "KDIGO",
  ada: "ADA",
  mentzer: "Mentzer index",
  pharm: "General pharmacology",
  who: "WHO 2009 dengue guidelines",
} as const;

/** Platelets below this (10³/µL) → no NSAIDs or antiplatelets, with or without dengue. */
export const BLEEDING_PLATELETS = 100;

/**
 * `suspectedDisease` is the case's (e.g. "Dengue (from wearable alert)"); it
 * overrides the patient's own field, like the findings do.
 */
export function buildCheckContext(patient: Patient, reports: Report[], opts: { suspectedDisease?: string } = {}): CheckContext {
  const history = reports.filter((r) => r.patientId === patient.id).sort((a, b) => a.date.localeCompare(b.date));
  const latest = history.at(-1);
  const v = Object.fromEntries((latest?.values ?? []).map((x) => [x.testKey, x.value])) as Partial<Record<TestKey, number>>;
  const egfr =
    latest && v.creatinine !== undefined
      ? egfrCkdEpi2021(v.creatinine, ageAtDate(patient.age, latest.date), patient.sex)
      : undefined;
  const egfrTrend = history.length >= 2 ? findTrend(computeTrends(patient, history), "egfr") : undefined;
  const ferritinRange = getRange("ferritin", patient.sex);
  return {
    egfr,
    egfrSlopePerYear: egfrTrend?.slopePerYear,
    rapidEgfrDecline: egfrTrend ? isRapidEgfrDecline(egfrTrend.slopePerYear) : false,
    acr: v.urine_acr,
    mcv: v.mcv,
    mentzerIndex: v.mcv !== undefined && v.rbc !== undefined ? mentzer(v.mcv, v.rbc).index : undefined,
    ferritin: v.ferritin,
    ferritinNormal:
      v.ferritin !== undefined &&
      (ferritinRange.low === undefined || v.ferritin >= ferritinRange.low) &&
      (ferritinRange.high === undefined || v.ferritin <= ferritinRange.high),
    alt: v.alt,
    altUpperLimit: getRange("alt", patient.sex).high,
    dengue: dengueReason(opts.suspectedDisease?.trim() || patient.suspectedDisease, v),
    platelets: v.platelets,
  };
}

/** Dengue applies when it is suspected (case or patient) or NS1 / IgM is positive on the latest report. */
function dengueReason(suspected: string, v: Partial<Record<TestKey, number>>): string | undefined {
  const markers = dengueMarkers(v.ns1, v.dengue_igm);
  const positive = [markers?.ns1 === "Positive" && "NS1 positive", markers?.igm === "Positive" && "IgM positive"].filter(Boolean);
  if (positive.length) return positive.join(", ");
  if (matchSuspectedScreen(suspected) === "dengue") return "dengue suspected";
  return undefined;
}

export function resolveMed(m: MedLike): FormularyEntry | undefined {
  return findFormulary(m.formularyId) ?? findFormulary(m.name);
}

const has = (e: FormularyEntry | undefined, tag: DrugTag) => !!e?.tags.includes(tag);
const SULFA_ALLERGY = /sulf|sulph/i;

/**
 * Safety alerts for one medicine in the context of this patient.
 * `currentMeds` = what the patient keeps taking (excluding medicines being stopped);
 * `otherNewMeds` = the other medicines in this plan. Custom medicines get no checks.
 */
export function checkPrescription(
  med: MedLike,
  patient: Patient,
  ctx: CheckContext,
  currentMeds: MedLike[],
  otherNewMeds: MedLike[],
): PrescriptionAlert[] {
  const drug = med.custom ? undefined : resolveMed(med);
  if (!drug) return [];
  const alerts: PrescriptionAlert[] = [];
  const add = (level: AlertLevel, rule: string, source: string, message: string) =>
    alerts.push({ level, rule, source, message });
  const others = [...currentMeds, ...otherNewMeds].map((m) => ({ m, e: resolveMed(m) }));
  const albuminuria = ctx.acr !== undefined && ctx.acr >= 30;
  const egfrText = ctx.egfr !== undefined ? `eGFR ${ctx.egfr.toFixed(0)}` : "";

  // Allergy
  if (patient.allergies.some((a) => SULFA_ALLERGY.test(a))) {
    if (has(drug, "sulfonamide_antibiotic")) {
      add("block", "sulfa_allergy_antibiotic", SRC.pharm, "Sulfa allergy recorded — sulfonamide antibiotic is contraindicated.");
    } else if (has(drug, "sulfonamide_nonantibiotic")) {
      add("info", "sulfa_allergy_nonantibiotic", SRC.pharm, "Sulfa allergy recorded — cross-reactivity with non-antibiotic sulfonamides is low; monitor.");
    }
  }

  // Kidney-dependent dosing
  if (ctx.egfr !== undefined) {
    if (has(drug, "biguanide")) {
      if (ctx.egfr < 30) {
        add("block", "metformin_egfr_lt30", SRC.fda, `${egfrText} — metformin is contraindicated below eGFR 30.`);
      } else if (ctx.egfr < 45) {
        add("warning", "metformin_egfr_30_45", SRC.fda, `${egfrText} — do not initiate metformin; reassess if already taking.`);
      }
    }
    if (has(drug, "sglt2") && ctx.egfr < 25) {
      add("warning", "sglt2_egfr_lt25", SRC.fda, `${egfrText} — do not initiate an SGLT2 inhibitor below eGFR 25.`);
    }
    if (drug.id === "nitrofurantoin" && ctx.egfr < 30) {
      add("warning", "nitrofurantoin_egfr_lt30", SRC.fda, `${egfrText} — avoid nitrofurantoin below eGFR 30.`);
    }
  }

  // NSAIDs and the kidney
  if (has(drug, "nsaid")) {
    const reasons = [
      ctx.egfr !== undefined && ctx.egfr < 60 && egfrText,
      albuminuria && `albuminuria (ACR ${ctx.acr} mg/g)`,
      ctx.rapidEgfrDecline && `rapid eGFR decline (${Math.abs(ctx.egfrSlopePerYear ?? 0).toFixed(1)}/yr)`,
    ].filter(Boolean);
    if (reasons.length) {
      add("warning", "nsaid_kidney", SRC.kdigo, `NSAID may worsen kidney function — ${reasons.join(", ")}.`);
    }
  }

  // Dengue or low platelets: NSAIDs and antiplatelets raise the bleeding risk (WHO 2009).
  const lowPlatelets = ctx.platelets !== undefined && ctx.platelets < BLEEDING_PLATELETS;
  if (ctx.dengue || lowPlatelets) {
    const why = [ctx.dengue, lowPlatelets && `platelets ${ctx.platelets} ×10³/µL`].filter(Boolean).join(" · ");
    if (has(drug, "nsaid") || has(drug, "antiplatelet")) {
      add(
        "block",
        "dengue_bleeding",
        SRC.who,
        `Bleeding risk in ${ctx.dengue ? "dengue" : "low platelets"} (${why}) — avoid ${drug.genericName.toLowerCase()}; use paracetamol for fever.`,
      );
    }
    if (drug.id === "paracetamol") {
      const liver = ctx.alt !== undefined && ctx.altUpperLimit !== undefined && ctx.alt > ctx.altUpperLimit;
      add(
        "info",
        "paracetamol_dengue",
        SRC.who,
        `Paracetamol is the fever medicine of choice here (${why}) — max 4 g/day${liver ? `; ALT ${ctx.alt} U/L is raised, so check the dose` : "; check the dose if liver enzymes are raised"}.`,
      );
    }
  }

  // "Triple whammy": NSAID + ACE inhibitor/ARB + diuretic
  const all = [drug, ...others.map((o) => o.e)];
  const isRaas = (e?: FormularyEntry) => has(e, "ace_inhibitor") || has(e, "arb");
  const inTriad = has(drug, "nsaid") || isRaas(drug) || has(drug, "diuretic");
  if (inTriad && all.some((e) => has(e, "nsaid")) && all.some(isRaas) && all.some((e) => has(e, "diuretic"))) {
    add("block", "triple_whammy", SRC.pharm, "NSAID + ACE inhibitor/ARB + diuretic together (\"triple whammy\") — high risk of acute kidney injury.");
  }

  // Dual RAAS blockade
  if (
    (has(drug, "ace_inhibitor") && others.some((o) => has(o.e, "arb"))) ||
    (has(drug, "arb") && others.some((o) => has(o.e, "ace_inhibitor")))
  ) {
    add("block", "dual_raas", SRC.kdigo, "ACE inhibitor + ARB together — dual RAAS blockade is not recommended.");
  }

  if (isRaas(drug)) {
    add("info", "raas_monitoring", SRC.kdigo, "Check creatinine and potassium in 1–2 weeks after starting.");
    if (albuminuria) {
      add("info", "raas_albuminuria", SRC.kdigo, `Recommended for albuminuria (ACR ${ctx.acr} mg/g).`);
    }
  }

  // Iron when the CBC suggests thalassaemia trait (Mentzer applies to microcytosis only)
  if (
    has(drug, "iron") &&
    ctx.mentzerIndex !== undefined &&
    ctx.mentzerIndex < 13 &&
    (ctx.mcv === undefined || ctx.mcv < 80) &&
    ctx.ferritinNormal
  ) {
    add(
      "warning",
      "iron_thal_trait",
      SRC.mentzer,
      `Mentzer ${ctx.mentzerIndex.toFixed(1)} with normal ferritin (${ctx.ferritin} ng/mL) — iron not indicated unless iron deficiency is confirmed (risk of iron overload in thalassaemia trait).`,
    );
  }

  // Statins and the liver
  if (has(drug, "statin") && ctx.alt !== undefined && ctx.altUpperLimit !== undefined && ctx.alt > 3 * ctx.altUpperLimit) {
    add("warning", "statin_alt_3x", SRC.fda, `ALT ${ctx.alt} U/L is more than 3× the upper limit — review before starting a statin.`);
  }

  // Pregnancy
  if (patient.pregnant && (has(drug, "statin") || isRaas(drug))) {
    add("block", "pregnancy_contraindicated", SRC.fda, `${drug.drugClass} is contraindicated in pregnancy.`);
  }

  // Duplicates
  const same = others.find((o) => o.e?.id === drug.id);
  if (same) {
    add("warning", "duplicate_medicine", SRC.pharm, `${drug.genericName} is already in the current medicines or this plan.`);
  } else {
    const sameClass = others.find((o) => o.e && o.e.drugClass === drug.drugClass);
    if (sameClass) {
      add("warning", "duplicate_class", SRC.pharm, `Two ${drug.drugClass} medicines (${sameClass.e!.genericName} and ${drug.genericName}).`);
    }
  }

  const order: Record<AlertLevel, number> = { block: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

/** Alerts for every medicine in a plan; each is checked against the current medicines and the rest of the plan. */
export function checkPlan(
  meds: MedLike[],
  patient: Patient,
  ctx: CheckContext,
  currentMeds: MedLike[],
): PrescriptionAlert[][] {
  return meds.map((m, i) =>
    checkPrescription(m, patient, ctx, currentMeds, meds.filter((_, j) => j !== i)),
  );
}

export function blockRules(alerts: PrescriptionAlert[]): string[] {
  return alerts.filter((a) => a.level === "block").map((a) => a.rule);
}

/** A medicine can be saved when it has no block, or the doctor overrode it with a reason. */
export function isMedicationSavable(med: Pick<Medication, "override">, alerts: PrescriptionAlert[]): boolean {
  return blockRules(alerts).length === 0 || !!med.override?.reason.trim();
}
