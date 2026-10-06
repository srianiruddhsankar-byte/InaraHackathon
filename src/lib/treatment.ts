// Treatment plans: non-drug suggestions from findings, and append-only plan
// versions (draft → approved). Suggestions NEVER include medicines or doses —
// medications are typed by the doctor only.
import { addDays, format, parseISO } from "date-fns";
import { hasUnconfirmedDefaults } from "./medEntry";
import { TESTS } from "./tests";
import type { Finding, FollowUpTest, Medication, TestKey, TreatmentPlan } from "./types";

export interface PlanSuggestions {
  lifestyle: string[];
  followUpTests: FollowUpTest[];
}

const LIFESTYLE = {
  carbs: "Reduce refined carbohydrates, sweets and sugary drinks",
  walk: "Brisk walking for 30 minutes, at least 5 days a week",
  weight: "Aim for gradual weight loss if overweight",
  salt: "Limit salt to under 5 g a day (avoid pickles, papad and packaged snacks)",
  nsaids: "Avoid over-the-counter painkillers such as ibuprofen (NSAIDs) — ask your doctor first",
  water: "Drink enough water through the day",
  bp: "Check blood pressure regularly",
  ironFood: "Eat iron- and folate-rich foods: green leafy vegetables, lentils, dates",
  noSelfIron: "Do not start any supplements on your own until the follow-up test is reviewed",
  alcohol: "Avoid or limit alcohol",
  rest: "Rest at home and drink plenty of fluids (water, ORS, coconut water, soups)",
  noNsaids: "Avoid painkillers such as ibuprofen, diclofenac and aspirin — ask your doctor which medicine to take for fever",
  warningSigns: "Go to hospital at once with belly pain, repeated vomiting, any bleeding, dizziness, or passing much less urine",
  fats: "Cut down on fried food, ghee and red meat",
  fibre: "Add fibre: whole grains, vegetables, fruit",
} as const;

function test(key: TestKey, inWeeks: number): FollowUpTest {
  return { testKey: key, name: TESTS[key].name, inWeeks };
}

function freeText(name: string, inWeeks: number): FollowUpTest {
  return { name, inWeeks };
}

function itemsFor(f: Finding): PlanSuggestions {
  if (!f.screen || f.severity === "normal") return { lifestyle: [], followUpTests: [] };
  switch (f.screen) {
    case "diabetes":
      return {
        lifestyle: [LIFESTYLE.carbs, LIFESTYLE.walk, LIFESTYLE.weight],
        followUpTests: [test("hba1c", 12), test("fasting_glucose", 12)],
      };
    case "kidney":
      return {
        lifestyle: [LIFESTYLE.salt, LIFESTYLE.nsaids, LIFESTYLE.water, LIFESTYLE.bp],
        followUpTests: [test("creatinine", 12), test("urine_acr", 12)],
      };
    case "anaemia":
      if (f.pattern === "thalassaemia_trait") {
        return {
          lifestyle: [LIFESTYLE.ironFood, LIFESTYLE.noSelfIron],
          followUpTests: [freeText("Hb electrophoresis", 2), freeText("Complete blood count (CBC)", 8)],
        };
      }
      return {
        lifestyle: [LIFESTYLE.ironFood],
        followUpTests: [freeText("Iron studies (serum iron, TIBC)", 4), freeText("Complete blood count (CBC)", 8)],
      };
    case "liver":
      return {
        lifestyle: [LIFESTYLE.alcohol, LIFESTYLE.weight],
        followUpTests:
          f.pattern === "fib4_indeterminate"
            ? [freeText("Liver elastography (FibroScan)", 4)]
            : [test("ast", 12), test("alt", 12)],
      };
    case "lipids":
      return {
        lifestyle: [LIFESTYLE.fats, LIFESTYLE.fibre, LIFESTYLE.walk],
        followUpTests: [freeText("Lipid profile", 12)],
      };
    case "dengue":
      // Dengue: daily blood counts through the critical phase (inWeeks 0 = within 1–2 days).
      return {
        lifestyle: [LIFESTYLE.rest, LIFESTYLE.noNsaids, LIFESTYLE.warningSigns],
        followUpTests: [test("platelets", 0), test("hct", 0)],
      };
  }
}

/**
 * Non-drug plan suggestions (lifestyle + follow-up tests) from the findings
 * the doctor kept. Deduplicated; for repeated tests the earliest timing wins.
 */
export function suggestPlanItems(findings: Finding[]): PlanSuggestions {
  const lifestyle: string[] = [];
  const tests = new Map<string, FollowUpTest>();
  for (const f of findings) {
    const items = itemsFor(f);
    for (const l of items.lifestyle) if (!lifestyle.includes(l)) lifestyle.push(l);
    for (const t of items.followUpTests) {
      const existing = tests.get(t.name);
      if (!existing || t.inWeeks < existing.inWeeks) tests.set(t.name, t);
    }
  }
  return { lifestyle, followUpTests: [...tests.values()] };
}

/** "in 12 weeks", or "within 1–2 days" for an urgent repeat (0 weeks). */
export function followUpWhen(inWeeks: number): string {
  return inWeeks <= 0 ? "within 1–2 days" : `in ${inWeeks} week${inWeeks === 1 ? "" : "s"}`;
}

/** Next review date: after the latest follow-up test (default 12 weeks) from `from`. */
export function suggestReviewDate(from: string, followUpTests: FollowUpTest[]): string {
  const weeks = followUpTests.length ? Math.max(...followUpTests.map((t) => t.inWeeks)) : 12;
  return format(addDays(parseISO(from), weeks * 7 + 7), "yyyy-MM-dd");
}

// --- versions -------------------------------------------------------------

export type PlanContent = Pick<
  TreatmentPlan,
  "medications" | "lifestyle" | "followUpTests" | "nextReviewDate" | "doctorNotes"
> &
  Partial<Pick<TreatmentPlan, "stopMedications">>;

export function emptyMedication(): Medication {
  return { name: "", dose: "", frequency: "", duration: "", instructions: "" };
}

/** Drop blank rows and trim text so saved plans are tidy. */
export function cleanPlanContent(c: PlanContent): PlanContent {
  return {
    medications: c.medications
      .map((m) => ({
        ...m,
        name: m.name.trim(),
        dose: m.dose.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        instructions: m.instructions.trim(),
      }))
      .filter((m) => m.name),
    stopMedications: (c.stopMedications ?? []).map((s) => ({ ...s, reason: s.reason.trim() })),
    lifestyle: c.lifestyle.map((l) => l.trim()).filter(Boolean),
    followUpTests: c.followUpTests
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name && t.inWeeks > 0),
    nextReviewDate: c.nextReviewDate,
    doctorNotes: c.doctorNotes.trim(),
  };
}

/** All versions of the plan for a report, oldest first. */
export function planVersions(plans: TreatmentPlan[], reportId: string): TreatmentPlan[] {
  return plans
    .filter((p) => p.reportId === reportId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function latestPlan(plans: TreatmentPlan[], reportId: string): TreatmentPlan | undefined {
  return planVersions(plans, reportId).at(-1);
}

export function approvedPlan(plans: TreatmentPlan[], reportId: string): TreatmentPlan | undefined {
  return plans.find((p) => p.reportId === reportId && p.status === "approved");
}

interface PlanVersionInput {
  id: string;
  patientId: string;
  reportId: string;
  author: string;
  timestamp: string;
  content: PlanContent;
}

function appendPlan(plans: TreatmentPlan[], input: PlanVersionInput, status: TreatmentPlan["status"]): TreatmentPlan[] {
  if (approvedPlan(plans, input.reportId)) return plans; // locked once approved
  const plan: TreatmentPlan = {
    id: input.id,
    patientId: input.patientId,
    reportId: input.reportId,
    ...cleanPlanContent(input.content),
    status,
    author: input.author,
    timestamp: input.timestamp,
  };
  return [...plans, plan];
}

/** Append a draft plan version. No-op once the plan is approved. */
export function savePlanDraft(plans: TreatmentPlan[], input: PlanVersionInput): TreatmentPlan[] {
  return appendPlan(plans, input, "draft");
}

/**
 * Append the approved plan version. No-op if already approved, or while any
 * medicine still has formulary defaults the doctor hasn't confirmed.
 */
export function approvePlan(plans: TreatmentPlan[], input: PlanVersionInput): TreatmentPlan[] {
  if (hasUnconfirmedDefaults(input.content.medications)) return plans;
  return appendPlan(plans, input, "approved");
}
