// Condition library: the wearable patterns Inara looks for, as DATA. Every
// threshold lives here with the reason it was chosen; detect.ts reads these
// numbers and never hard-codes its own. Every condition is a "possible
// pattern" for a doctor to review — never a diagnosis.
//
// Shared conventions (see also BASELINE in baseline.ts):
// - z = (tonight − personal median) ÷ personal robust SD, from the previous
//   14–28 valid nights. z ≥ 2 ≈ "about 2 SD above his usual": by chance on a
//   given night for roughly 1 in 40 nights, so one night alone is only "watch".
// - Supporting signs (skin temp, HRV) use ±1.5: they only count alongside the
//   main heart-rate signal, so they can have a lower bar.
// - Levels: "watch" = early or partial signs; "concerning" = the full pattern.
// - Weather is removed first: daytime heart rate only counts as the residual
//   after the personal heat model, so a hot day can never trigger anything.
import type { PanelId, TestKey } from "../types";
import type { NightMetric } from "./types";

export type ConditionId = "early_infection" | "dengue_like" | "respiratory" | "heat_dehydration" | "high_resting_hr" | "poor_recovery";

export type PatternLevel = "none" | "watch" | "concerning";

/** A number the rules use, with why it has that value. */
export interface Threshold {
  value: number;
  reason: string;
}

/** What a rule looks at (for the doctor-facing description and grouping). */
export type SignalSource = "night_z" | "trend" | "weather_residual" | "spo2" | "circadian" | "absolute";

export interface SignalRule {
  id: string;
  source: SignalSource;
  metric?: NightMetric | "afternoonHr" | "hrAmplitude";
  /** Plain description shown to the doctor. */
  text: string;
  /** "core" rules are required; "support" rules only add weight. */
  role: "core" | "support";
}

export type SupportingFactorId = "past_dengue" | "past_infection" | "local_prevalence" | "circadian_flattening";

export interface SupportingFactor {
  id: SupportingFactorId;
  text: string;
}

/** A test the doctor might order: a dictionary test, a panel, or free text (e.g. NS1 antigen). */
export interface LabSuggestion {
  label: string;
  testKey?: TestKey;
  panelId?: PanelId;
}

/** A check-in question (part 3a). Simple wording; red flags mean "see a doctor now". */
export type QuestionId =
  | "fever"
  | "body_pain"
  | "belly_pain"
  | "vomiting"
  | "bleeding"
  | "dizzy"
  | "less_urine"
  | "breathless"
  | "chest_pain"
  | "confusion"
  | "cough"
  | "tired"
  | "drank_less"
  | "outdoors"
  | "palpitations"
  | "new_meds"
  | "sleep"
  | "stress";

export interface CheckInQuestion {
  id: QuestionId;
  text: string;
  /** Short plain label for summaries: "belly pain". */
  short: string;
  /** Any "yes" → urgent, straight away (no scoring). */
  redFlag: boolean;
  /** Offer "A little / A lot" instead of a plain "Yes". */
  severity: boolean;
}

const q = (id: QuestionId, text: string, short: string, redFlag = false, severity = false): CheckInQuestion => ({ id, text, short, redFlag, severity });

/**
 * The shared question bank. Red flags (any yes → urgent): belly pain, repeated
 * vomiting, any bleeding, fainting/dizzy on standing, much less urine,
 * breathlessness, chest pain, confusion — WHO dengue warning signs plus
 * general emergency signs.
 */
export const QUESTION_BANK: Record<QuestionId, CheckInQuestion> = {
  fever: q("fever", "Have you had a fever or chills?", "fever or chills"),
  body_pain: q("body_pain", "Any body or joint pain?", "body or joint pain", false, true),
  belly_pain: q("belly_pain", "Any pain in your belly (tummy)?", "belly pain", true),
  vomiting: q("vomiting", "Have you vomited more than once today?", "vomiting more than once", true),
  bleeding: q("bleeding", "Any bleeding gums, nosebleed or unusual bruising?", "bleeding or unusual bruising", true),
  dizzy: q("dizzy", "Do you feel dizzy or faint when you stand up?", "feeling dizzy or faint on standing", true),
  less_urine: q("less_urine", "Are you passing much less urine than usual?", "passing much less urine", true),
  breathless: q("breathless", "Are you short of breath?", "breathlessness", true),
  chest_pain: q("chest_pain", "Any chest pain?", "chest pain", true),
  confusion: q("confusion", "Do you feel confused, or has anyone said you seem very drowsy or confused?", "confusion or drowsiness", true),
  cough: q("cough", "Do you have a cough or sore throat?", "cough or sore throat", false, true),
  tired: q("tired", "Are you feeling more tired than usual?", "tiredness", false, true),
  drank_less: q("drank_less", "Have you drunk less water than usual today?", "drinking less water"),
  outdoors: q("outdoors", "Were you working or exercising outdoors in the heat?", "time outdoors in the heat"),
  palpitations: q("palpitations", "Have you noticed your heart racing or pounding?", "heart racing", false, true),
  new_meds: q("new_meds", "Any new medicines, more coffee or energy drinks lately?", "new medicines or more caffeine"),
  sleep: q("sleep", "Have you been sleeping badly?", "poor sleep", false, true),
  stress: q("stress", "Have you been under more stress or training harder than usual?", "more stress or training"),
};

export interface ConditionDef {
  id: ConditionId;
  name: string;
  /** Wording a patient would understand. */
  plainName: string;
  summary: string;
  signalRules: SignalRule[];
  thresholds: Record<string, Threshold>;
  /** Nights the core rule must hold before the pattern counts as established. */
  minNights: number;
  supportingFactors: SupportingFactor[];
  suggestedLabTests: LabSuggestion[];
  /** Check-in questions, most useful first (from QUESTION_BANK; red flags are marked there). */
  questionIds: QuestionId[];
  /** Plain-language "what this can mean" for the patient — never a diagnosis. */
  patientExplanation: string;
  references: string[];
  /** Key into the population prevalence tables (ranking only, never a trigger). */
  prevalenceKey?: PrevalenceKey;
  /** When both are at the same level, this more specific pattern ranks above these. */
  moreSpecificThan?: ConditionId[];
}

export type PrevalenceKey = "dengue" | "febrile_illness" | "respiratory" | "heat_illness";

export const PREVALENCE_LABEL: Record<PrevalenceKey, string> = {
  dengue: "Dengue",
  febrile_illness: "Fever illnesses",
  respiratory: "Respiratory infections",
  heat_illness: "Heat illness",
};

// ---- Shared thresholds ---------------------------------------------------------

export const SHARED = {
  hrZ: { value: 2, reason: "About 2 SD above his usual night HR; by chance only ~1 night in 40." },
  supportZ: { value: 1.5, reason: "Supporting signs only count alongside the HR signal, so they get a lower bar." },
  nights: { value: 2, reason: "One night can be a bad night (late meal, alcohol, poor sleep); two in a row is a pattern." },
  meaningfulHrRise: {
    value: 10,
    reason: "A rise of +10 bpm is clinically meaningful whatever the person's spread (roughly what 1 °C of fever adds).",
  },
  flattening: { value: 0.7, reason: "Day–night HR difference below 70% of usual = rhythm clearly flattened." },
  feverRecent: { value: 3, reason: "Nights to look back for a raised skin temperature ('recent fever')." },
} satisfies Record<string, Threshold>;

/** Detection gates: below these we say "insufficient data" instead of judging. */
export const GATES = {
  baselineNights: { value: 7, reason: "Fewer than 7 valid nights is too little to know what is normal for this person." },
  nightQuality: { value: 60, reason: "Under 60% usable samples the night's medians are unreliable." },
} satisfies Record<string, Threshold>;

/** Past dengue lowers the dengue-like z thresholds by 25%: a second infection carries higher risk of severe dengue. */
export const PAST_DENGUE_FACTOR = 0.75;

/** Ranking weight from local prevalence this month. Prevalence only re-orders patterns; it never creates one. */
export const PREVALENCE_WEIGHT = { low: 1, moderate: 1.1, high: 1.25 } as const;

export const CBC: LabSuggestion = { label: "CBC (complete blood count)", panelId: "cbc" };

// ---- The library -------------------------------------------------------------------

export const CONDITIONS: ConditionDef[] = [
  {
    id: "early_infection",
    name: "Early infection pattern",
    plainName: "Your body may be fighting an infection",
    summary: "Night resting HR clearly above usual for 2+ nights with a supporting sign (warmer skin or lower HRV).",
    signalRules: [
      { id: "hr", source: "night_z", metric: "restingHr", role: "core", text: "Night resting HR z ≥ 2 for ≥ 2 nights" },
      { id: "temp", source: "night_z", metric: "skinTemp", role: "core", text: "AND skin temp z ≥ 1.5 or HRV z ≤ −1.5 on those nights" },
      { id: "rise", source: "absolute", metric: "restingHr", role: "core", text: "Concerning when night HR is also ≥ 10 bpm above usual" },
      { id: "rhythm", source: "circadian", metric: "hrAmplitude", role: "support", text: "Day–night HR difference < 70% of usual (flattened rhythm)" },
    ],
    thresholds: {
      hrZ: SHARED.hrZ,
      skinZ: SHARED.supportZ,
      hrvZ: SHARED.supportZ,
      concerningRise: SHARED.meaningfulHrRise,
      flattening: SHARED.flattening,
    },
    minNights: SHARED.nights.value,
    supportingFactors: [{ id: "circadian_flattening", text: "Flattened day–night rhythm" }],
    suggestedLabTests: [CBC, { label: "CRP", testKey: "crp" }],
    questionIds: ["fever", "body_pain", "cough", "breathless", "tired"],
    patientExplanation: "These changes can happen when the body is fighting an infection.",
    references: [
      "Mishra T et al. Pre-symptomatic detection of COVID-19 from smartwatch data. Nat Biomed Eng 2020;4:1208–20.",
      "Radin JM et al. Harnessing wearable device data to improve state-level real-time surveillance of influenza-like illness. Lancet Digit Health 2020;2:e85–93.",
    ],
    prevalenceKey: "febrile_illness",
  },
  {
    id: "dengue_like",
    name: "Dengue-like pattern",
    plainName: "A pattern seen in some dengue infections",
    summary:
      "After ≥ 2 nights of raised skin temperature, temperature falls back to or below usual while night HR keeps rising — 'the fever drops but the heart rate climbs', which can mark the critical (plasma-leakage) phase.",
    signalRules: [
      { id: "fever", source: "night_z", metric: "skinTemp", role: "core", text: "Skin temp z ≥ 1.5 on ≥ 2 earlier nights (fever phase)" },
      { id: "defervescence", source: "trend", metric: "skinTemp", role: "core", text: "Then skin temp back to usual or lower (z < 1)" },
      { id: "hr", source: "trend", metric: "restingHr", role: "core", text: "While night HR is still raised (z ≥ 2) and higher than the night before" },
    ],
    thresholds: {
      feverZ: { value: 1.5, reason: SHARED.supportZ.reason },
      feverNights: SHARED.nights,
      feverLookback: { value: 7, reason: "WHO: the febrile phase of dengue usually lasts 2–7 days." },
      backToUsualZ: { value: 1, reason: "Within 1 SD of usual = the fever has come down (WHO: defervescence)." },
      hrZ: SHARED.hrZ,
    },
    minNights: SHARED.nights.value,
    supportingFactors: [
      { id: "past_dengue", text: "Past dengue infection in the record (thresholds lowered by 25%)" },
      { id: "local_prevalence", text: "Dengue is common locally this month" },
    ],
    suggestedLabTests: [
      { label: "CBC with platelets", panelId: "cbc", testKey: "platelets" },
      { label: "Haematocrit (HCT)", testKey: "hct" },
      { label: "Dengue NS1 antigen" },
      { label: "Dengue IgM" },
    ],
    questionIds: ["fever", "body_pain", "belly_pain", "vomiting", "bleeding", "dizzy", "less_urine"],
    patientExplanation: "These changes can happen in some infections, including dengue, when the fever settles but the body still needs care.",
    references: [
      "WHO. Dengue: guidelines for diagnosis, treatment, prevention and control (2009) — critical phase and warning signs around defervescence.",
      "National Center for Vector Borne Diseases Control (India). National guidelines for clinical management of dengue fever (2023).",
    ],
    prevalenceKey: "dengue",
    moreSpecificThan: ["early_infection"],
  },
  {
    id: "respiratory",
    name: "Respiratory pattern",
    plainName: "Your oxygen level has been lower than usual",
    summary: "Night SpO₂ ≥ 3 points below personal baseline or under 94% on ≥ 2 nights, with heart rate up.",
    signalRules: [
      { id: "spo2", source: "spo2", metric: "spo2", role: "core", text: "Night SpO₂ ≥ 3 points below usual, or < 94%" },
      { id: "hr", source: "night_z", metric: "restingHr", role: "core", text: "With night HR above usual (z ≥ 1)" },
    ],
    thresholds: {
      spo2Drop: { value: 3, reason: "A 3-point fall is beyond normal night-to-night variation (~0.5 points) and sensor noise." },
      spo2Floor: { value: 94, reason: "BTS guideline: below 94% is under the normal target range." },
      hrZ: { value: 1, reason: "Low oxygen usually comes with a faster heart; z ≥ 1 = clearly above usual." },
      nights: SHARED.nights,
    },
    minNights: SHARED.nights.value,
    supportingFactors: [{ id: "local_prevalence", text: "Respiratory infections are common locally this month" }],
    suggestedLabTests: [CBC, { label: "CRP", testKey: "crp" }],
    questionIds: ["breathless", "cough", "chest_pain", "fever"],
    patientExplanation: "These changes can happen with some chest or breathing infections.",
    references: ["O'Driscoll BR et al. BTS guideline for oxygen use in adults. Thorax 2017;72:i1–90."],
    prevalenceKey: "respiratory",
  },
  {
    id: "heat_dehydration",
    name: "Heat strain / dehydration pattern",
    plainName: "The heat may be taking more out of you than usual",
    summary: "On a very hot afternoon, daytime HR well above what the weather explains, then poor recovery the next night.",
    signalRules: [
      { id: "hot", source: "weather_residual", metric: "afternoonHr", role: "core", text: "Afternoon 'feels like' ≥ 40 °C" },
      { id: "residual", source: "weather_residual", metric: "afternoonHr", role: "core", text: "AND afternoon HR ≥ 5 bpm above the weather-expected value" },
      { id: "recovery", source: "night_z", metric: "restingHr", role: "core", text: "AND the next night: HR z ≥ 2 or HRV z ≤ −1.5" },
    ],
    thresholds: {
      hotDay: { value: 40, reason: "IMD heat-wave criterion for the plains is 40 °C; we apply it to 'feels like'." },
      residual: { value: 5, reason: "On his baseline days the residual stays within ±2 bpm; +5 is clearly beyond the weather." },
      recoveryHrZ: SHARED.hrZ,
      recoveryHrvZ: SHARED.supportZ,
    },
    minNights: 1,
    supportingFactors: [{ id: "local_prevalence", text: "Heat illness is common locally this month" }],
    suggestedLabTests: [
      { label: "Sodium", testKey: "sodium" },
      { label: "Potassium", testKey: "potassium" },
      { label: "Urea", testKey: "bun" },
      { label: "Creatinine", testKey: "creatinine" },
    ],
    questionIds: ["drank_less", "outdoors", "dizzy", "less_urine", "confusion"],
    patientExplanation: "These changes can happen when the heat and too little water take more out of the body than usual.",
    references: [
      "NDMA. Guidelines for preparation of action plan — prevention and management of heat wave (2019).",
      "India Meteorological Department. Heat wave criteria.",
    ],
    prevalenceKey: "heat_illness",
  },
  {
    id: "high_resting_hr",
    name: "High resting heart rate",
    plainName: "Your resting heart rate has been high",
    summary: "Night resting HR over 100 bpm, or z ≥ 4, without a recent fever to explain it.",
    signalRules: [
      { id: "abs", source: "absolute", metric: "restingHr", role: "core", text: "Night resting HR > 100 bpm (tachycardia)" },
      { id: "z", source: "night_z", metric: "restingHr", role: "core", text: "OR night resting HR z ≥ 4" },
      { id: "nofever", source: "night_z", metric: "skinTemp", role: "core", text: "AND no skin temp z ≥ 1.5 in the last 3 nights" },
    ],
    thresholds: {
      absHr: { value: 100, reason: "Resting HR above 100 bpm is the standard definition of tachycardia." },
      hrZ: { value: 4, reason: "Twice the usual 'unusual' bar: without fever, only a very large change is flagged." },
      feverZ: SHARED.supportZ,
      feverLookback: SHARED.feverRecent,
      nights: SHARED.nights,
    },
    minNights: SHARED.nights.value,
    supportingFactors: [],
    suggestedLabTests: [
      { label: "TSH", testKey: "tsh" },
      { label: "Haemoglobin", testKey: "hb" },
      { label: "Potassium", testKey: "potassium" },
    ],
    questionIds: ["palpitations", "chest_pain", "dizzy", "breathless", "new_meds"],
    patientExplanation: "A resting heart rate this high can have several causes, and some need a doctor to check.",
    references: ["Brugada J et al. 2019 ESC Guidelines for the management of patients with supraventricular tachycardia. Eur Heart J 2020;41:655–720."],
  },
  {
    id: "poor_recovery",
    name: "Poor recovery",
    plainName: "Your body hasn't been recovering well at night",
    summary: "HRV clearly below usual for 4+ nights while temperature and heart rate are normal (e.g. stress, poor sleep, overtraining).",
    signalRules: [
      { id: "hrv", source: "night_z", metric: "hrv", role: "core", text: "Night HRV z ≤ −1.5 for ≥ 4 nights" },
      { id: "normal", source: "night_z", metric: "restingHr", role: "core", text: "With skin temp |z| < 1.5 and HR z < 2" },
    ],
    thresholds: {
      hrvZ: SHARED.supportZ,
      nights: { value: 4, reason: "HRV is noisy night to night; 4+ nights shows a real trend rather than a bad night." },
      concerningNights: { value: 7, reason: "A full week of low HRV is worth a conversation." },
      normalSkinZ: SHARED.supportZ,
      normalHrZ: SHARED.hrZ,
    },
    minNights: 4,
    supportingFactors: [],
    suggestedLabTests: [],
    questionIds: ["sleep", "stress", "tired"],
    patientExplanation: "This can happen with poor sleep, stress or training hard without enough rest.",
    references: ["Plews DJ et al. Training adaptation and heart rate variability in elite endurance athletes. Int J Sports Physiol Perform 2013;8:688–94."],
  },
];

export function conditionById(id: ConditionId): ConditionDef {
  const c = CONDITIONS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown condition ${id}`);
  return c;
}

/** Threshold value by name (throws if the library is missing it, so typos fail loudly in tests). */
export function t(c: ConditionDef, name: string): number {
  const th = c.thresholds[name];
  if (!th) throw new Error(`${c.id}: missing threshold ${name}`);
  return th.value;
}
