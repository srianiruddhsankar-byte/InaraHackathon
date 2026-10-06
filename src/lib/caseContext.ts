// Links a case to what started it. For a case raised by a wearable alert:
// the order the alert suggests (panels, suspected disease, urgency, note) and
// the wearable context the lab findings show as supporting evidence.
// Pure functions only; doctor screens only (never shown to patients).
import { ANSWER_LABEL, deriveEpisode, formatIst, isYes, type EpisodeSnapshot, type WearableEvent } from "./wearable/checkin";
import { conditionById, QUESTION_BANK, type ConditionId } from "./wearable/conditions";
import type { Case, FindingsContext, PanelId, Urgency, WearableContext } from "./types";
import { PANELS } from "./workflow";

/** What the suspected disease is called on a lab order raised from each pattern. */
const ORDER_AS: Record<ConditionId, string> = {
  dengue_like: "Dengue",
  early_infection: "Infection",
  respiratory: "Respiratory infection",
  heat_dehydration: "Heat strain / dehydration",
  high_resting_hr: "High resting heart rate",
  poor_recovery: "Poor recovery",
};

export interface AlertOrderPrefill {
  panels: PanelId[];
  suspectedDisease: string;
  urgency: Urgency;
  clinicalNote: string;
}

/** Panels that cover the pattern's suggested tests: the named panel, else the first panel with the test. */
export function suggestedPanels(patternId: ConditionId): PanelId[] {
  const ids = new Set<PanelId>();
  for (const s of conditionById(patternId).suggestedLabTests) {
    const panel = s.panelId ?? PANELS.find((p) => !p.targeted && p.tests.some((t) => t.key === s.testKey))?.id;
    if (panel) ids.add(panel);
  }
  return PANELS.map((p) => p.id).filter((id) => ids.has(id));
}

/** The order dialog pre-filled from the alert: suggested panels, "Dengue (from wearable alert)", Urgent. */
export function alertOrderPrefill(snapshot: EpisodeSnapshot, redFlags: string[] = []): AlertOrderPrefill {
  const note = [
    `Wearable alert: ${snapshot.patternName} (${snapshot.patternLevel}), ${snapshot.date}.`,
    ...snapshot.evidence.slice(0, 2).map((e) => `${e}.`),
    ...(redFlags.length ? [`Check-in red flag: ${redFlags.join(", ")}.`] : []),
    ...(snapshot.pastIllnesses.length ? [`Past: ${snapshot.pastIllnesses.join("; ")}.`] : []),
  ].join(" ");
  return {
    panels: suggestedPanels(snapshot.patternId),
    suspectedDisease: `${ORDER_AS[snapshot.patternId]} (from wearable alert)`,
    urgency: "urgent",
    clinicalNote: note,
  };
}

/** The wearable alert behind a case, for the analysis and the dengue finding. Undefined for doctor orders. */
export function wearableContext(c: Case | undefined, events: WearableEvent[]): WearableContext | undefined {
  if (!c || c.origin !== "wearable" || !c.episodeId) return undefined;
  const ep = deriveEpisode(events, c.episodeId);
  if (!ep) return undefined;
  const { snapshot } = ep;
  const answers = snapshot.questions.flatMap((id) => {
    const a = ep.answers[id];
    if (a === undefined) return [];
    const q = QUESTION_BANK[id];
    return [{ question: q.short.charAt(0).toUpperCase() + q.short.slice(1), answer: ANSWER_LABEL[a], redFlag: q.redFlag && isYes(a) }];
  });
  const rec = ep.latest?.recommendation;
  const out: WearableContext = {
    episodeId: c.episodeId,
    patternName: snapshot.patternName,
    patternLevel: snapshot.patternLevel,
    date: snapshot.date,
    evidence: snapshot.evidence,
    supportingFactors: snapshot.supportingFactors,
    answers,
    redFlags: (rec?.redFlags ?? snapshot.sensorFlags).map((f) => f.replace(/^your /, "")),
  };
  if (rec) out.recommendation = `${rec.headline} (${formatIst(ep.latest!.at)})`;
  return out;
}

/** Findings context for a case: its suspected disease and any wearable alert behind it. */
export function findingsContextFor(c: Case | undefined, events: WearableEvent[]): FindingsContext {
  if (!c) return {};
  const ctx: FindingsContext = { suspectedDisease: c.suspectedDisease };
  const w = wearableContext(c, events);
  if (w) ctx.wearable = w;
  return ctx;
}
