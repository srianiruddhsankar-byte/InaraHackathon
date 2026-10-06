import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { alertOrderPrefill, findingsContextFor } from "../caseContext";
import { buildLabReport } from "../labReport";
import { seedPatients, seedReports } from "../seed";
import type { Case, Patient, Report } from "../types";
import { analyseWearable } from "../wearable/analyse";
import {
  answerQuestion,
  buildSnapshot,
  deriveEpisode,
  SIM_START,
  startEpisode,
  type Answer,
  type Ctx,
  type EpisodeSnapshot,
  type Outcome,
  type WearableEvent,
} from "../wearable/checkin";
import type { QuestionId } from "../wearable/conditions";
import { seedPatientSettings } from "../wearable/consent";
import { detectPatterns } from "../wearable/detect";
import { POPULATION_FILE } from "../wearable/population";
import { WEATHER_FILE } from "../wearable/weather";
import { ALL_PANELS, orderFromAlert } from "../workflow";
import { orderedTestKeys, parseLabCsv, reviewUpload, type UploadReview } from "../upload";

/** A file from public/samples. */
export function sampleFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../public/samples/${name}`, import.meta.url)), "utf8");
}

/** Ravi's sample upload, read and reviewed like the lab screen does. */
export function sampleReview(name = "ravi_report.csv", fallbackDate = "2026-03-15"): UploadReview {
  const ravi = seedPatients().find((p) => p.id === "ravi")!;
  return reviewUpload({
    parsed: parseLabCsv(sampleFile(name)),
    sex: ravi.sex,
    ordered: orderedTestKeys(ALL_PANELS),
    fallbackDate: { date: fallbackDate, source: "sample_received" },
  });
}

/** Ravi's Mar 2026 report as the lab would submit it from a sample file. */
export function uploadedRaviReport(name = "ravi_report.csv", fallbackDate?: string): Report {
  const ravi = seedPatients().find((p) => p.id === "ravi")!;
  const review = sampleReview(name, fallbackDate);
  return buildLabReport({
    id: `ravi-${review.reportDate.slice(0, 7)}`,
    patient: ravi,
    previous: seedReports().filter((r) => r.patientId === "ravi"),
    date: review.reportDate,
    labName: "Inara Diagnostics",
    source: "csv",
    rows: review.rows,
    verifiedBy: "A. Technician",
    at: `${review.reportDate}T09:00:00.000Z`,
  });
}

/**
 * A seed patient and their reports. Ravi's Mar 2026 report isn't seeded, so it
 * is built from the sample CSV upload — the same path the lab uses in the demo.
 */
export function patientData(id: string): { patient: Patient; reports: Report[] } {
  const patient = seedPatients().find((p) => p.id === id);
  if (!patient) throw new Error(`No seed patient ${id}`);
  const reports = seedReports().filter((r) => r.patientId === id);
  if (id === "ravi") reports.push(uploadedRaviReport());
  return { patient, reports };
}

// ---- Karthik: wearable alert → dengue lab order → dengue panel upload -----------

type KarthikAlert = { log: WearableEvent[]; alertCase: Case; snapshot: EpisodeSnapshot };
let cachedAlert: KarthikAlert | null = null;

/**
 * Karthik's Day 30 check-in (fever yes, body pain a little, belly pain yes → urgent) and the alert case it raised.
 * Cached: the 30-day wearable pipeline is slow. Returns fresh copies.
 */
export function karthikAlert(): KarthikAlert {
  cachedAlert ??= buildKarthikAlert();
  return structuredClone(cachedAlert);
}

function buildKarthikAlert(): KarthikAlert {
  const karthik = seedPatients().find((p) => p.id === "karthik")!;
  const settings = seedPatientSettings();
  const publicFile = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../public${path}`, import.meta.url)), "utf8"));
  const weather = publicFile(WEATHER_FILE);
  const population = publicFile(POPULATION_FILE);
  const a = analyseWearable("karthik", settings.find((s) => s.patientId === "karthik"), weather);
  if (a.status !== "ok") throw new Error(a.status);
  const detection = detectPatterns({ person: karthik, nights: a.nights, amplitude: a.amplitude, weather: a.weatherDays, population, record: karthik, settings, day: 30 });
  const snapshot = buildSnapshot({ patient: karthik, detection, nights: a.nights, weather: a.weatherDays, day: 30 })!;
  const ctx: Ctx = { patient: { id: "karthik", name: "Karthik R" }, settings: settings.find((s) => s.patientId === "karthik"), doctorName: "Dr. Meera Nair", cases: [] };
  let n = 0;
  let log: WearableEvent[] = [];
  let alertCase: Case | null = null;
  const apply = (o: Outcome) => {
    log = [...log, ...o.events.map((e) => ({ ...e, id: `e${n++}` }) as WearableEvent)];
    alertCase ??= o.newCase;
  };
  apply(startEpisode([], snapshot, SIM_START, ctx));
  const answers: Partial<Record<QuestionId, Answer>> = { fever: "yes", body_pain: "a_little", belly_pain: "yes" };
  for (const q of snapshot.questions) {
    const state = deriveEpisode(log, snapshot.episodeId)!;
    if (!state.checkInDue) break;
    apply(answerQuestion(state, q, answers[q] ?? "no", SIM_START, ctx));
  }
  if (!alertCase) throw new Error("no alert case");
  return { log, alertCase, snapshot };
}

/** Karthik's dengue sample, reviewed like the lab screen does (Dengue panel ordered). */
export function karthikReview(): UploadReview {
  return reviewUpload({
    parsed: parseLabCsv(sampleFile("karthik_dengue.csv")),
    sex: "M",
    ordered: orderedTestKeys(["dengue"]),
    fallbackDate: { date: "2026-10-05", source: "demo_sample" },
  });
}

/**
 * The full Karthik story: the alert case ordered as a Dengue panel, then the lab
 * uploads karthik_dengue.csv. `withBaseline: false` drops his Mar 2026 routine report.
 */
export function karthikDengue({ withBaseline = true } = {}) {
  const patient = seedPatients().find((p) => p.id === "karthik")!;
  const { log, alertCase, snapshot } = karthikAlert();
  const prefill = alertOrderPrefill(snapshot, ["belly pain"]);
  const ordered = orderFromAlert(alertCase, { ...prefill, orderedBy: "Dr. Meera Nair", at: "2026-10-05T03:00:00.000Z" });
  const context = findingsContextFor(ordered, log);
  const review = karthikReview();
  const previous = withBaseline ? seedReports().filter((r) => r.patientId === "karthik") : [];
  const report = buildLabReport({
    id: "karthik-2026-10",
    patient,
    previous,
    date: review.reportDate,
    labName: "CityCare Diagnostics",
    source: "csv",
    rows: review.rows,
    verifiedBy: "A. Technician",
    at: "2026-10-05T09:00:00.000Z",
    context,
  });
  return { patient, log, alertCase, ordered, context, review, report, reports: [...previous, report] };
}
