// Template-based draft text (an LLM can replace this later).
// doctorDraft() is always an AI draft that a doctor must review.
// patientExplanation() is only shown after the doctor approves.
import { describeTrend, SCREEN_TESTS } from "./findings";
import { TESTS } from "./tests";
import type { Finding, LabValue, ScreenId, Severity, Trend } from "./types";

/** Concise clinical summary for the reviewing doctor. */
export function doctorDraft(findings: Finding[], trends: Trend[], reportCount = 4, medNotes: string[] = []): string {
  const lines: string[] = [];
  const suspected = findings.filter((f) => f.category === "suspected");
  const incidental = findings.filter((f) => f.category === "incidental");
  const normal = findings.filter((f) => f.category === "normal");

  if (suspected.length) {
    lines.push("Suspected condition:");
    for (const f of suspected) lines.push(...findingLines(f));
  }
  if (incidental.length) {
    lines.push("", "Also detected from the same panel:");
    for (const f of incidental) lines.push(...findingLines(f));
  }
  for (const f of normal) lines.push("", `${f.title}.`);

  const moving = trends.filter((t) => t.direction !== "stable");
  if (moving.length) {
    lines.push("", "Significant trends:");
    for (const t of moving) lines.push(`- ${describeTrend(t, reportCount)}`);
  }

  if (medNotes.length) {
    lines.push("", "Medication considerations:");
    for (const n of medNotes) lines.push(`- ${n}`);
  }

  lines.push("", "Template-generated summary for clinician review. Not a diagnosis.");
  return lines.join("\n").trim();
}

function findingLines(f: Finding): string[] {
  const out = [`- [${f.severity.toUpperCase()}] ${f.title}. ${f.summary} (${f.guideline})`];
  // Wearable alert / check-in evidence behind the finding (e.g. dengue from a wearable case).
  for (const e of f.evidence.filter((x) => x.startsWith("Supporting ("))) out.push(`  ${e}`);
  if (f.recommendation) out.push(`  Consider: ${lowerFirst(f.recommendation.replace(/^Consider\s+/i, ""))}`);
  return out;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// --- patient-facing -------------------------------------------------------

const PATIENT_TEXT: Record<ScreenId, Partial<Record<Severity, string>>> = {
  diabetes: {
    high: "Your blood sugar results are higher than the healthy range. Your doctor will talk with you about the next steps.",
    watch:
      "Your blood sugar results are a little higher than the healthy range. They have been slowly going up over the past few years. Small changes in food and activity can help. Your doctor may suggest a repeat test.",
  },
  kidney: {
    high: "One of your kidney results has changed over the past few years. Your doctor wants to keep a close eye on this. A repeat test will show how your kidneys are doing.",
    watch:
      "One of your kidney results is slightly outside the usual range. Your doctor may suggest a repeat test to check on it.",
  },
  anaemia: {
    high: "Your haemoglobin is quite low. Haemoglobin carries oxygen around your body. Your doctor will talk with you about the next steps.",
    watch:
      "Your haemoglobin is a little low. Haemoglobin carries oxygen around your body, and low levels can make you feel tired. Your doctor may suggest another blood test to find the reason before choosing a treatment.",
  },
  liver: {
    high: "Your liver results suggest your doctor should take a closer look. They may suggest a scan or a specialist visit.",
    watch: "Some of your liver results are slightly outside the usual range. Your doctor may suggest a follow-up test.",
  },
  dengue: {
    high: "Some of your results are seen in dengue and similar infections, such as a positive dengue test or a low platelet count (platelets help your blood clot). Your doctor will guide you on rest, fluids and repeat blood tests over the next few days.",
    watch:
      "Some of your blood count results have changed from your usual levels. Your doctor may suggest a repeat test in the next day or two.",
  },
  lipids: {
    high: "Some of your blood fat (cholesterol) results are above the healthy range. Your doctor will talk with you about them.",
    watch:
      "Some of your blood fat (cholesterol) results are a little above the healthy range. Changes to food and activity often help.",
  },
};

/** Plain-English, calm explanation of the findings for the patient. */
export function patientExplanation(findings: Finding[], values: LabValue[]): string {
  const paragraphs: string[] = [];
  const inRange = values.filter((v) => v.flag === "normal").length;
  if (values.length) {
    paragraphs.push(`${inRange} of your ${values.length} results are in the healthy range.`);
  }

  const concerns = findings.filter((f) => f.screen && f.severity !== "normal");
  for (const f of concerns) {
    const text = PATIENT_TEXT[f.screen!][f.severity];
    if (text && !paragraphs.includes(text)) paragraphs.push(text);
  }

  if (concerns.length === 0) {
    paragraphs.push("Nothing in this report needs action right now.");
  } else {
    // Only tests behind the findings shown, so an excluded finding never leaks in.
    const related = new Set(concerns.flatMap((f) => SCREEN_TESTS[f.screen!]));
    const outside = values
      .filter((v) => v.flag !== "normal" && related.has(v.testKey))
      .map((v) => `- ${TESTS[v.testKey].name}: ${lowerFirst(TESTS[v.testKey].description)}`);
    if (outside.length) paragraphs.push(["Results outside the usual range:", ...outside].join("\n"));
  }

  paragraphs.push("Your doctor has reviewed these results. Please ask them about anything that is unclear.");
  return paragraphs.join("\n\n");
}
