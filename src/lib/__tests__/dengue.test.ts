// Part 3b-1: wearable alert → lab order → dengue lab findings.
import { beforeEach, describe, expect, it } from "vitest";
import { useInaraStore } from "@/store/useInaraStore";
import { runAnalysis } from "../analysis";
import { alertOrderPrefill, findingsContextFor, suggestedPanels, wearableContext } from "../caseContext";
import { getFindings } from "../findings";
import { normaliseName } from "../normalise";
import { parseOcrText } from "../ocr";
import { assessHaematocrit, DENGUE, dengueMarkers, isLowPlatelets, isLowWbc } from "../rules";
import { seedCases, seedPatients, seedReports } from "../seed";
import { formatValue, PLAUSIBLE, rangeText, TESTS } from "../tests";
import { suggestPlanItems } from "../treatment";
import type { LabValue, Patient, Report, TestKey } from "../types";
import { evaluateRow, importedValues, orderedTestKeys, parseQualitative, parseValue, reviewUpload, type UploadRow } from "../upload";
import { activeCase, ALL_PANELS, isAlertOnly, orderFromAlert, PANELS, patientStepLabel } from "../workflow";
import { karthikAlert, karthikDengue, karthikReview, patientData } from "./helpers";

const row = (rawName: string, rawValue: string, rawUnit = ""): UploadRow => ({
  id: "r1",
  line: 1,
  rawName,
  rawValue,
  rawUnit,
  rawDate: "",
  rawReference: "",
});

const karthik = seedPatients().find((p) => p.id === "karthik")!;

/** A one-off report with the given values (flags from the dictionary). */
function reportOf(patient: Patient, date: string, values: Partial<Record<TestKey, number>>, id = `${patient.id}-${date}`): Report {
  return {
    id,
    patientId: patient.id,
    date,
    labName: "Test lab",
    values: Object.entries(values).map(([k, v]) => ({ testKey: k as TestKey, value: v!, unit: TESTS[k as TestKey].unit, flag: "normal" }) as LabValue),
    versions: [],
  };
}

describe("qualitative results (NS1, IgM)", () => {
  it("reads the usual spellings", () => {
    for (const s of ["Pos", "POSITIVE", "positive", "Reactive", "Detected", "POS*", "Positive (Reactive)"]) expect(parseQualitative(s), s).toBe("Positive");
    for (const s of ["Neg", "NEGATIVE", "Non-reactive", "Non reactive", "NON-REACTIVE", "Not detected"]) expect(parseQualitative(s), s).toBe("Negative");
    for (const s of ["Equivocal", "Borderline", "Indeterminate"]) expect(parseQualitative(s), s).toBe("Equivocal");
    expect(parseQualitative("6.1")).toBeNull();
    expect(parseValue("Pos")).toEqual({ kind: "qualitative", result: "Positive" });
  });

  it("maps NS1 / IgM aliases and stores a code with the result word", () => {
    for (const n of ["NS1", "Dengue NS1 Ag", "NS1 Antigen"]) expect(normaliseName(n)).toBe("ns1");
    for (const n of ["Dengue IgM", "IgM", "Dengue IgM Ab"]) expect(normaliseName(n)).toBe("dengue_igm");
    expect(evaluateRow(row("Dengue NS1 Ag", "Pos"), "M")).toMatchObject({ testKey: "ns1", value: 1, unit: "", flag: "high", result: "Positive", status: "mapped", blocking: false });
    expect(evaluateRow(row("Dengue IgM", "Non-reactive"), "M")).toMatchObject({ value: 0, flag: "normal", result: "Negative", status: "mapped" });
    const eq = evaluateRow(row("IgM", "Equivocal"), "M");
    expect(eq).toMatchObject({ value: 0.5, flag: "high", result: "Equivocal" });
    expect(eq.message).toMatch(/repeat/);
  });

  it("no unit is needed; a unit in the file is ignored", () => {
    expect(evaluateRow(row("NS1", "Positive", "Index"), "M")).toMatchObject({ status: "mapped", unit: "", result: "Positive" });
  });

  it("'NR' means non-reactive for serology; NA means not reported", () => {
    expect(evaluateRow(row("Dengue IgM", "NR"), "M")).toMatchObject({ result: "Negative", status: "mapped" });
    expect(evaluateRow(row("Dengue IgM", "NA"), "M")).toMatchObject({ status: "not_reported", value: null });
    // For a numeric test NR still means "not reported".
    expect(evaluateRow(row("Hb", "NR", "g/dL"), "M")).toMatchObject({ status: "not_reported" });
  });

  it("a number for a qualitative test, or a word for a numeric test, blocks submit", () => {
    const n = evaluateRow(row("NS1", "1.8"), "M");
    expect(n).toMatchObject({ status: "needs_fixing", blocking: true });
    expect(n.message).toMatch(/Positive, Negative or Equivocal/);
    expect(evaluateRow(row("Platelet Count", "Positive", "10^3/µL"), "M")).toMatchObject({ status: "needs_fixing", blocking: true });
  });

  it("the review error says what is expected", () => {
    const review = reviewUpload({
      parsed: { rows: [row("NS1", "2.4")], delimiter: ",", hasDateColumn: false, errors: [], warnings: [] },
      sex: "M",
      fallbackDate: { date: "2026-10-05", source: "today" },
    });
    expect(review.errors).toEqual([`Row 1 (Dengue NS1 antigen): "2.4" is not Positive, Negative or Equivocal.`]);
  });

  it("imported values keep the result word; display and range read 'Positive' / 'Negative'", () => {
    const values = importedValues([evaluateRow(row("NS1", "Pos"), "M")]);
    expect(values).toEqual([{ testKey: "ns1", value: 1, unit: "", flag: "high", result: "Positive" }]);
    expect(formatValue("ns1", 1)).toBe("Positive");
    expect(formatValue("dengue_igm", 0)).toBe("Negative");
    expect(rangeText("ns1", "M")).toBe("Negative");
    expect(rangeText("wbc", "M")).toBe("4–11");
  });

  it("OCR lines with a result word become rows", () => {
    const parsed = parseOcrText("Dengue NS1 Ag Positive Negative\nDengue IgM Non reactive Negative\nPlatelet Count 85 10^3/µL 150-400");
    expect(parsed.rows.map((r) => [r.rawName, r.rawValue, r.rawUnit])).toEqual([
      ["Dengue NS1 Ag", "Positive", ""],
      ["Dengue IgM", "Non reactive", ""],
      ["Platelet Count", "85", "10^3/µL"],
    ]);
    expect(evaluateRow(parsed.rows[1], "M")).toMatchObject({ testKey: "dengue_igm", result: "Negative" });
  });
});

describe("WBC", () => {
  it("is in the dictionary: 10³/µL, 4.0–11.0, aliases TLC / WBC / Total WBC", () => {
    expect(TESTS.wbc).toMatchObject({ unit: "10^3/µL", range: { low: 4.0, high: 11.0 }, loinc: "6690-2" });
    expect(PLAUSIBLE.wbc).toEqual([0.1, 200]);
    for (const n of ["TLC", "WBC", "Total WBC", "Total Leukocyte Count", "Total Leucocyte Count"]) expect(normaliseName(n), n).toBe("wbc");
  });

  it("converts absolute counts (/cumm) and flags low below 4.0", () => {
    expect(evaluateRow(row("TLC", "3,100", "/cumm"), "M")).toMatchObject({ value: 3.1, flag: "low", status: "converted" });
    expect(evaluateRow(row("WBC", "6.8", "10^3/µL"), "M")).toMatchObject({ value: 6.8, flag: "normal", status: "mapped" });
    expect(evaluateRow(row("Platelet Count", "85,000", "/cumm"), "M")).toMatchObject({ value: 85, flag: "low" });
  });
});

describe("dengue rules (pure)", () => {
  it("markers: NS1 and/or IgM positive", () => {
    expect(dengueMarkers()).toBeNull();
    expect(dengueMarkers(1, 0)).toMatchObject({ ns1: "Positive", igm: "Negative", positive: true });
    expect(dengueMarkers(undefined, 1)).toMatchObject({ igm: "Positive", positive: true });
    expect(dengueMarkers(0, 0.5)).toMatchObject({ positive: false, equivocal: true, negative: false });
    expect(dengueMarkers(0, 0)).toMatchObject({ positive: false, equivocal: false, negative: true });
  });

  it("platelets < 100 and WBC < 4.0", () => {
    expect(DENGUE.lowPlatelets.value).toBe(100);
    expect(isLowPlatelets(99)).toBe(true);
    expect(isLowPlatelets(100)).toBe(false);
    expect(isLowWbc(3.9)).toBe(true);
    expect(isLowWbc(4.0)).toBe(false);
  });

  it("haematocrit ≥ 20% above baseline = haemoconcentration (WHO 1997)", () => {
    expect(assessHaematocrit({ hct: 50.4, baselineHct: 42 })).toMatchObject({ kind: "haemoconcentration" });
    expect(assessHaematocrit({ hct: 50.3, baselineHct: 42 }).kind).not.toBe("haemoconcentration");
  });

  it("≥ 10% rise with platelets fallen ≥ 50% = WHO 2009 warning sign", () => {
    const a = assessHaematocrit({ hct: 49, platelets: 85, baselineHct: 42, baselinePlatelets: 260 });
    expect(a.kind).toBe("warning");
    expect(a.warningSign).toBe(true);
    expect(a.hctChange).toBeCloseTo(16.67, 1);
    expect(a.plateletChange).toBeCloseTo(-67.3, 1);
    // A rise without the platelet fall is only "rising".
    expect(assessHaematocrit({ hct: 47, platelets: 200, baselineHct: 42, baselinePlatelets: 260 })).toMatchObject({ kind: "rise", warningSign: false });
    // Exactly 50% fall counts; 49% doesn't.
    expect(assessHaematocrit({ hct: 46.2, platelets: 130, baselineHct: 42, baselinePlatelets: 260 }).kind).toBe("warning");
    expect(assessHaematocrit({ hct: 46.2, platelets: 133, baselineHct: 42, baselinePlatelets: 260 }).kind).toBe("rise");
    // No platelet baseline → the combined sign can't be judged.
    expect(assessHaematocrit({ hct: 47, platelets: 85, baselineHct: 42 })).toMatchObject({ kind: "rise", warningSign: false });
  });

  it("without an earlier haematocrit there is no baseline", () => {
    expect(assessHaematocrit({ hct: 49, platelets: 85 })).toEqual({ kind: "no_baseline", warningSign: false });
    expect(assessHaematocrit({ hct: 43, baselineHct: 42 }).kind).toBe("no_rise");
  });
});

describe("panels and ordering from the alert", () => {
  it("the Dengue panel: Hb, WBC, platelets, haematocrit, NS1, IgM, AST, ALT — not part of 'all panels'", () => {
    expect(orderedTestKeys(["dengue"])).toEqual(["hb", "wbc", "hct", "platelets", "ast", "alt", "ns1", "dengue_igm"]);
    expect(PANELS.find((p) => p.id === "dengue")?.name).toBe("Dengue panel");
    expect(ALL_PANELS).not.toContain("dengue");
    expect(orderedTestKeys(ALL_PANELS)).not.toContain("wbc");
  });

  it("the dengue-like pattern suggests the Dengue panel; early infection suggests CBC + Others (CRP)", () => {
    expect(suggestedPanels("dengue_like")).toEqual(["dengue"]);
    expect(suggestedPanels("early_infection")).toEqual(["cbc", "others"]);
  });

  it("the order is pre-filled: Dengue panel, 'Dengue (from wearable alert)', Urgent, a clinical note", () => {
    const { snapshot } = karthikAlert();
    const p = alertOrderPrefill(snapshot, ["belly pain"]);
    expect(p).toMatchObject({ panels: ["dengue"], suspectedDisease: "Dengue (from wearable alert)", urgency: "urgent" });
    expect(p.clinicalNote).toMatch(/^Wearable alert: Dengue-like pattern \(concerning\), 2026-10-05\./);
    expect(p.clinicalNote).toMatch(/Check-in red flag: belly pain\./);
    expect(p.clinicalNote).toMatch(/Past: Dengue fever/);
  });

  it("ordering moves the same case alert_raised → ordered (origin wearable, same episode)", () => {
    const { alertCase, ordered } = karthikDengue();
    expect(alertCase.stage).toBe("alert_raised");
    expect(ordered).toMatchObject({
      id: alertCase.id,
      origin: "wearable",
      episodeId: "karthik-2026-10-05",
      stage: "ordered",
      panels: ["dengue"],
      urgency: "urgent",
      suspectedDisease: "Dengue (from wearable alert)",
      orderedBy: "Dr. Meera Nair",
    });
    expect(ordered.stageHistory.map((e) => e.stage)).toEqual(["alert_raised", "ordered"]);
    expect(ordered.stageHistory[1]).toMatchObject({ by: "Dr. Meera Nair", at: "2026-10-05T03:00:00.000Z" });
    // Now a real lab order: the lab and the case screens see it; the patient sees "Test ordered".
    expect(isAlertOnly(ordered)).toBe(false);
    expect(activeCase([...seedCases(), ordered], "karthik")?.id).toBe(alertCase.id);
    expect(patientStepLabel(ordered.stage)).toBe("Test ordered");
  });

  it("only an alert_raised case with at least one panel can be ordered", () => {
    const { ordered, alertCase } = karthikDengue();
    const input = { orderedBy: "Dr. Meera Nair", suspectedDisease: "x", panels: ["cbc" as const], urgency: "routine" as const, clinicalNote: "", at: "2026-10-06T00:00:00.000Z" };
    expect(orderFromAlert(ordered, input)).toBe(ordered);
    expect(orderFromAlert(alertCase, { ...input, panels: [] })).toBe(alertCase);
    const ravi = seedCases().find((c) => c.patientId === "ravi" && c.stage === "ordered")!;
    expect(orderFromAlert(ravi, input)).toBe(ravi);
  });
});

describe("wearable context", () => {
  it("collects the pattern, key evidence, answers and red flags", () => {
    const { ordered, log } = karthikDengue();
    const w = wearableContext(ordered, log)!;
    expect(w).toMatchObject({ episodeId: "karthik-2026-10-05", patternName: "Dengue-like pattern", patternLevel: "concerning", date: "2026-10-05", redFlags: ["belly pain"] });
    expect(w.evidence).toContain("Night HR still rising: 74 → 78 (usual 56)");
    expect(w.answers).toEqual([
      { question: "Fever or chills", answer: "Yes", redFlag: false },
      { question: "Body or joint pain", answer: "A little", redFlag: false },
      { question: "Belly pain", answer: "Yes", redFlag: true },
    ]);
    expect(w.recommendation).toMatch(/^Please see a doctor now/);
  });

  it("doctor orders have no wearable context; the case's suspected disease is passed on", () => {
    const ravi = seedCases().find((c) => c.patientId === "ravi" && c.stage === "ordered")!;
    expect(findingsContextFor(ravi, [])).toEqual({ suspectedDisease: "Type 2 diabetes" });
    expect(findingsContextFor(undefined, [])).toEqual({});
    expect(wearableContext(ravi, [])).toBeUndefined();
  });
});

describe("Karthik's dengue panel (sample upload → findings)", () => {
  const story = karthikDengue();
  const findings = getFindings(story.patient, story.reports, story.context);
  const titles = findings.map((f) => f.title);

  it("the sample reads cleanly: dengue panel present, warnings only", () => {
    const review = karthikReview();
    expect(review.errors).toEqual([]);
    expect(review.reportDate).toBe("2026-10-05");
    expect(review.warnings).toEqual(expect.arrayContaining(["Unknown — skipped: Dengue IgG Ab", "Duplicate rows — kept the first: Platelets"]));
    expect(review.warnings.some((w) => w.startsWith("Ordered but not in file"))).toBe(false);
    const v = Object.fromEntries(story.report.values.map((x) => [x.testKey, x]));
    expect(v.platelets).toMatchObject({ value: 85, flag: "low" });
    expect(v.hct).toMatchObject({ value: 49 });
    expect(v.wbc).toMatchObject({ value: 3.1, flag: "low" });
    expect(v.hb).toMatchObject({ value: 16.2 });
    expect(v.ns1).toMatchObject({ value: 1, result: "Positive", flag: "high" });
    expect(v.dengue_igm).toMatchObject({ value: 0, result: "Negative", flag: "normal" });
    expect(v.ast).toMatchObject({ value: 92, flag: "high" });
    expect(v.alt).toMatchObject({ value: 64, flag: "high" });
    expect(v.sodium).toMatchObject({ value: 134, flag: "low" });
    expect(v.crp).toMatchObject({ value: 6, flag: "high" });
  });

  it("the dengue finding comes first, with the wearable context as supporting evidence", () => {
    const first = findings[0];
    expect(first).toMatchObject({
      category: "suspected",
      screen: "dengue",
      disease: "Dengue",
      severity: "high",
      title: "Dengue markers positive — consistent with dengue infection",
      pattern: "dengue_markers_positive",
    });
    expect(first.summary).toMatch(/NS1 antigen positive \(IgM negative\)/);
    expect(first.summary).toMatch(/the doctor confirms/);
    expect(first.evidence).toEqual(
      expect.arrayContaining([
        "NS1 antigen: Positive",
        "Dengue IgM: Negative",
        "Supporting (wearable): Dengue-like pattern (concerning) on 2026-10-05",
        "Supporting (check-in): red flag — belly pain",
      ]),
    );
    expect(first.evidence).toContain("Supporting (wearable): Night HR still rising: 74 → 78 (usual 56)");
  });

  it("the dengue group follows: low platelets, the WHO 2009 warning sign, low WBC", () => {
    const dengue = findings.filter((f) => f.screen === "dengue");
    expect(dengue.every((f) => f.category === "suspected")).toBe(true);
    expect(dengue.map((f) => f.title)).toEqual([
      "Dengue markers positive — consistent with dengue infection",
      "Low platelets",
      "Warning sign: rising haematocrit with rapid platelet fall",
      "Low white cell count (common in dengue)",
    ]);
    expect(dengue[1].severity).toBe("high");
    expect(dengue[2]).toMatchObject({ severity: "high", guideline: "WHO 2009" });
    expect(dengue[2].evidence).toEqual(["Haematocrit 49.0 % vs personal baseline 42% (+16.7%)", "Platelets 85 vs personal baseline 260 (−67.3%)"]);
    expect(titles).not.toContain("Haemoconcentration — evidence of plasma leakage");
  });

  it("liver: AST > ALT is noted and FIB-4 is not interpreted in acute illness", () => {
    const liver = findings.find((f) => f.screen === "liver")!;
    expect(liver).toMatchObject({ category: "incidental", severity: "watch", title: "Liver enzymes raised (AST > ALT, common in dengue)" });
    expect(liver.evidence).toContain("FIB-4 not interpreted during acute illness (low platelets and raised AST make it unreliable)");
    expect(titles.some((t) => /FIB-4/.test(t))).toBe(false);
    const fib4 = runAnalysis(story.patient, story.reports, [], story.context)!.scores.find((s) => s.label === "FIB-4")!;
    expect(fib4).toMatchObject({ value: "—", interpretation: "Not interpreted during acute illness" });
  });

  it("the analysis shows dengue markers and haematocrit vs baseline as guideline scores", () => {
    const scores = runAnalysis(story.patient, story.reports, [], story.context)!.scores;
    expect(scores.find((s) => s.label === "Dengue markers")).toMatchObject({ value: "NS1 Positive · IgM Negative", tone: "high" });
    expect(scores.find((s) => s.label === "Haematocrit vs baseline")).toMatchObject({ interpretation: "WHO 2009 warning sign", tone: "high" });
  });

  it("the AI draft lists the wearable evidence for the doctor; the patient text stays plain and has none of it", () => {
    const draft = story.report.versions[0];
    expect(draft.status).toBe("ai_draft");
    expect(draft.text.split("\n")[1]).toMatch(/^- \[HIGH\] Dengue markers positive/);
    expect(draft.text).toMatch(/Supporting \(wearable\): Dengue-like pattern/);
    expect(draft.patientText).not.toMatch(/Supporting|you have|diagnos|NS1|FIB-4|z-score/i);
    expect(draft.patientText).toMatch(/seen in dengue and similar infections/);
  });

  it("plan suggestions: rest + fluids, avoid NSAIDs, warning signs, repeat platelets + haematocrit within 1–2 days", () => {
    const plan = suggestPlanItems(findings.filter((f) => f.screen === "dengue"));
    expect(plan.lifestyle.join(" ")).toMatch(/fluids/);
    expect(plan.lifestyle.join(" ")).toMatch(/ibuprofen/);
    expect(plan.followUpTests).toEqual([
      { testKey: "platelets", name: "Platelets", inWeeks: 0 },
      { testKey: "hct", name: "Haematocrit", inWeeks: 0 },
    ]);
  });

  it("without a personal baseline: 'no personal baseline — compare with a repeat test'", () => {
    const s = karthikDengue({ withBaseline: false });
    const f = getFindings(s.patient, s.reports, s.context);
    const hct = f.find((x) => x.pattern === "hct_no_baseline")!;
    expect(hct).toMatchObject({ category: "suspected", severity: "watch", title: "Haematocrit — no personal baseline" });
    expect(hct.summary).toMatch(/compare with a repeat test/);
    expect(f.some((x) => x.pattern === "hct_warning_sign")).toBe(false);
    expect(f[0].title).toBe("Dengue markers positive — consistent with dengue infection");
  });

  it("without the case context the dengue group is still found (as 'Also detected')", () => {
    const f = getFindings(story.patient, story.reports);
    expect(f[0]).toMatchObject({ category: "incidental", title: "Dengue markers positive — consistent with dengue infection" });
    expect(f[0].evidence.some((e) => e.startsWith("Supporting"))).toBe(false);
  });
});

describe("dengue findings: other cases", () => {
  const base = reportOf(karthik, "2026-03-15", { hb: 15, platelets: 260, hct: 42, wbc: 6.8 });

  it("IgM positive alone is enough for the markers finding", () => {
    const f = getFindings(karthik, [base, reportOf(karthik, "2026-10-05", { platelets: 180, hct: 43, ns1: 0, dengue_igm: 1 })], { suspectedDisease: "Dengue" });
    expect(f[0]).toMatchObject({ title: "Dengue markers positive — consistent with dengue infection", severity: "high" });
    expect(f[0].summary).toMatch(/^Dengue IgM positive \(NS1 negative\)/);
  });

  it("haematocrit ≥ 20% above baseline → haemoconcentration (high)", () => {
    const f = getFindings(karthik, [base, reportOf(karthik, "2026-10-05", { platelets: 120, hct: 51, ns1: 1 })], { suspectedDisease: "Dengue" });
    expect(f.find((x) => x.pattern === "haemoconcentration")).toMatchObject({ severity: "high", title: "Haemoconcentration — evidence of plasma leakage" });
  });

  it("negative markers: a calm normal finding that doesn't rule dengue out", () => {
    const f = getFindings(karthik, [base, reportOf(karthik, "2026-10-05", { platelets: 240, hct: 42, wbc: 6, ns1: 0, dengue_igm: 0 })], { suspectedDisease: "Dengue" });
    expect(f[0]).toMatchObject({ severity: "normal", title: "Dengue markers negative" });
    expect(f[0].summary).toMatch(/does not rule it out/);
  });

  it("low platelets in someone not suspected of dengue → 'Also detected' (high); no haematocrit judgement", () => {
    const f = getFindings(karthik, [base, reportOf(karthik, "2026-10-05", { platelets: 85, hct: 49, wbc: 3.1 })]);
    expect(f.find((x) => x.title === "Low platelets")).toMatchObject({ category: "incidental", severity: "high" });
    expect(f.find((x) => x.pattern === "low_wbc")?.title).toBe("Low white cell count");
    expect(f.some((x) => x.pattern?.startsWith("hct"))).toBe(false);
  });
});

describe("existing stories are unchanged", () => {
  it("Ravi: prediabetes first, then the incidental rapid eGFR decline", () => {
    const { patient, reports } = patientData("ravi");
    const f = getFindings(patient, reports);
    expect(f.map((x) => [x.category, x.title])).toEqual([
      ["suspected", "Values suggest prediabetes"],
      ["incidental", "Rapid eGFR decline"],
      ["incidental", "Lipid profile outside target"],
    ]);
  });

  it("Priya: thalassaemia trait suggested, no other concerns", () => {
    const { patient, reports } = patientData("priya");
    expect(getFindings(patient, reports).map((x) => x.title)).toEqual([
      "Low haemoglobin — pattern suggests thalassaemia trait",
      "No other concerns from this panel",
    ]);
  });

  it("Arjun: nothing flagged", () => {
    const { patient, reports } = patientData("arjun");
    expect(getFindings(patient, reports).map((x) => [x.severity, x.title])).toEqual([["normal", "No concerns flagged from this panel"]]);
  });

  it("the seeded haematocrit is in range for Ravi and Arjun and low for Priya", () => {
    for (const r of seedReports().filter((x) => x.patientId !== "karthik")) {
      const hct = r.values.find((v) => v.testKey === "hct")!;
      expect(hct.flag, r.id).toBe(r.patientId === "priya" ? "low" : "normal");
    }
  });
});

describe("store: order from the alert, then upload", () => {
  beforeEach(() => useInaraStore.getState().resetDemo());

  it("orderFromAlert moves the alert case to ordered; the upload's AI draft carries the wearable context", () => {
    const { log, alertCase, snapshot } = karthikAlert();
    useInaraStore.setState((s) => ({ wearableEvents: log, cases: [...s.cases, alertCase] }));
    const s = useInaraStore.getState();
    s.orderFromAlert(alertCase.id, alertOrderPrefill(snapshot, ["belly pain"]), "Dr. Meera Nair");
    const ordered = useInaraStore.getState().cases.find((c) => c.id === alertCase.id)!;
    expect(ordered).toMatchObject({ stage: "ordered", panels: ["dengue"], urgency: "urgent", origin: "wearable" });

    const review = karthikReview();
    const id = s.submitLabResults(alertCase.id, { rows: review.rows, date: review.reportDate, source: "csv", verifiedBy: "A. Technician" })!;
    const after = useInaraStore.getState();
    expect(after.cases.find((c) => c.id === alertCase.id)).toMatchObject({ stage: "results_uploaded", reportId: id });
    const report = after.reports.find((r) => r.id === id)!;
    expect(report.versions[0].text).toMatch(/Supporting \(check-in\): red flag — belly pain/);
  });
});
