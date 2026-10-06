import { describe, expect, it } from "vitest";
import { FORMULARY, findFormulary, frequencyMeaning, searchFormulary } from "../formulary";
import {
  blockRules,
  buildCheckContext,
  checkPlan,
  checkPrescription,
  isMedicationSavable,
  type CheckContext,
  type MedLike,
} from "../prescriptionChecks";
import type { Patient } from "../types";
import { patientData } from "./helpers";

const med = (id: string): MedLike => ({ name: findFormulary(id)!.genericName, formularyId: id });

const NORMAL: CheckContext = {
  egfr: 95,
  egfrSlopePerYear: -1,
  rapidEgfrDecline: false,
  acr: 10,
  mcv: 88,
  mentzerIndex: 17.6,
  ferritin: 120,
  ferritinNormal: true,
  alt: 25,
  altUpperLimit: 40,
};

const base: Patient = {
  id: "test",
  name: "Test Patient",
  age: 50,
  sex: "M",
  bloodGroup: "O+",
  phone: "9000000099",
  allergies: [],
  chronicConditions: [],
  currentMedications: [],
  visitHistory: [],
  suspectedDisease: "",
};

function check(id: string, opts: { patient?: Partial<Patient>; ctx?: Partial<CheckContext>; current?: string[]; plan?: string[] } = {}) {
  return checkPrescription(
    med(id),
    { ...base, ...opts.patient },
    { ...NORMAL, ...opts.ctx },
    (opts.current ?? []).map(med),
    (opts.plan ?? []).map(med),
  );
}
const rules = (alerts: { rule: string }[]) => alerts.map((a) => a.rule);
const levelOf = (alerts: { rule: string; level: string }[], rule: string) => alerts.find((a) => a.rule === rule)?.level;

function seeded(id: string) {
  const { patient, reports } = patientData(id);
  return { patient, ctx: buildCheckContext(patient, reports) };
}

describe("formulary", () => {
  it("has about 40 generic medicines with unique ids", () => {
    expect(FORMULARY.length).toBeGreaterThanOrEqual(38);
    expect(new Set(FORMULARY.map((e) => e.id)).size).toBe(FORMULARY.length);
  });

  it("includes the required strengths", () => {
    expect(findFormulary("metformin")!.strengths).toEqual(["500 mg", "850 mg", "1000 mg"]);
    expect(findFormulary("cholecalciferol")!.defaultFrequencies).toEqual(["Weekly"]);
    expect(findFormulary("Ibuprofen")!.tags).toContain("nsaid");
  });

  it("searches by generic name and by class", () => {
    expect(searchFormulary("metf")[0].id).toBe("metformin");
    expect(searchFormulary("statin").map((e) => e.id)).toEqual(expect.arrayContaining(["atorvastatin", "rosuvastatin"]));
    expect(searchFormulary("nsaid").map((e) => e.id)).toEqual(expect.arrayContaining(["ibuprofen", "diclofenac"]));
    expect(searchFormulary("")).toEqual([]);
  });

  it("explains frequency codes in plain words", () => {
    expect(frequencyMeaning("BD")).toBe("Twice daily");
    expect(frequencyMeaning("HS")).toBe("At bedtime");
    expect(frequencyMeaning("after lunch")).toBe("after lunch");
  });
});

describe("buildCheckContext", () => {
  it("reads Ravi's latest kidney values", () => {
    const { ctx } = seeded("ravi");
    expect(ctx.egfr).toBeGreaterThan(60);
    expect(ctx.egfr).toBeLessThan(68);
    expect(ctx.rapidEgfrDecline).toBe(true);
    expect(ctx.acr).toBe(45);
  });

  it("reads Priya's Mentzer index and normal ferritin", () => {
    const { ctx } = seeded("priya");
    expect(ctx.mentzerIndex).toBeCloseTo(11.4, 1);
    expect(ctx.ferritinNormal).toBe(true);
  });
});

describe("allergy", () => {
  const sulfa = { patient: { allergies: ["Sulfa drugs"] } };
  it("blocks a sulfonamide antibiotic with sulfa allergy", () => {
    expect(levelOf(check("cotrimoxazole", sulfa), "sulfa_allergy_antibiotic")).toBe("block");
  });
  it("only informs for a non-antibiotic sulfonamide", () => {
    const a = check("hydrochlorothiazide", sulfa);
    expect(levelOf(a, "sulfa_allergy_nonantibiotic")).toBe("info");
    expect(blockRules(a)).toEqual([]);
  });
  it("no allergy alert without a sulfa allergy", () => {
    expect(check("cotrimoxazole")).toEqual([]);
  });
});

describe("metformin", () => {
  it("blocks below eGFR 30", () => {
    expect(levelOf(check("metformin", { ctx: { egfr: 28 } }), "metformin_egfr_lt30")).toBe("block");
  });
  it("warns at eGFR 30–45", () => {
    const a = check("metformin", { ctx: { egfr: 40 } });
    expect(levelOf(a, "metformin_egfr_30_45")).toBe("warning");
    expect(blockRules(a)).toEqual([]);
  });
  it("no alert at eGFR 45 or above", () => {
    expect(check("metformin", { ctx: { egfr: 45 } })).toEqual([]);
  });
});

describe("SGLT2 inhibitors", () => {
  it("warns below eGFR 25", () => {
    expect(levelOf(check("dapagliflozin", { ctx: { egfr: 22 } }), "sglt2_egfr_lt25")).toBe("warning");
    expect(levelOf(check("empagliflozin", { ctx: { egfr: 22 } }), "sglt2_egfr_lt25")).toBe("warning");
  });
  it("no alert at eGFR 25+", () => {
    expect(check("dapagliflozin", { ctx: { egfr: 30 } })).toEqual([]);
  });
});

describe("NSAIDs", () => {
  it.each([
    ["eGFR < 60", { egfr: 55 }],
    ["albuminuria", { acr: 30 }],
    ["rapid decline", { rapidEgfrDecline: true, egfrSlopePerYear: -9 }],
  ])("warn with %s", (_, ctx) => {
    expect(levelOf(check("ibuprofen", { ctx }), "nsaid_kidney")).toBe("warning");
    expect(levelOf(check("diclofenac", { ctx }), "nsaid_kidney")).toBe("warning");
  });
  it("no kidney alert with healthy kidneys", () => {
    expect(check("ibuprofen")).toEqual([]);
  });
  it("blocks the triple whammy (NSAID + ACE inhibitor/ARB + diuretic)", () => {
    expect(levelOf(check("ibuprofen", { current: ["telmisartan", "hydrochlorothiazide"] }), "triple_whammy")).toBe("block");
    expect(levelOf(check("ramipril", { current: ["diclofenac"], plan: ["hydrochlorothiazide"] }), "triple_whammy")).toBe("block");
  });
  it("no triple whammy with only two of the three", () => {
    expect(rules(check("ibuprofen", { current: ["telmisartan"] }))).not.toContain("triple_whammy");
  });
});

describe("ACE inhibitors and ARBs", () => {
  it("blocks dual RAAS blockade", () => {
    expect(levelOf(check("telmisartan", { plan: ["ramipril"] }), "dual_raas")).toBe("block");
    expect(levelOf(check("enalapril", { current: ["losartan"] }), "dual_raas")).toBe("block");
  });
  it("reminds to check creatinine and potassium", () => {
    expect(levelOf(check("ramipril"), "raas_monitoring")).toBe("info");
    expect(rules(check("ramipril"))).not.toContain("raas_albuminuria");
  });
  it("notes the albuminuria indication", () => {
    expect(levelOf(check("telmisartan", { ctx: { acr: 45 } }), "raas_albuminuria")).toBe("info");
  });
});

describe("iron", () => {
  it("warns when Mentzer < 13 with normal ferritin", () => {
    const a = check("ferrous_ascorbate", { ctx: { mcv: 64, mentzerIndex: 11.4, ferritin: 45, ferritinNormal: true } });
    expect(levelOf(a, "iron_thal_trait")).toBe("warning");
  });
  it("no warning when ferritin is low (iron deficiency)", () => {
    expect(check("ferrous_ascorbate", { ctx: { mcv: 64, mentzerIndex: 11.4, ferritin: 8, ferritinNormal: false } })).toEqual([]);
  });
  it("no warning when Mentzer > 13", () => {
    expect(check("ferrous_ascorbate", { ctx: { mcv: 70, mentzerIndex: 15, ferritinNormal: true } })).toEqual([]);
  });
});

describe("statins", () => {
  it("warns when ALT > 3× upper limit", () => {
    expect(levelOf(check("atorvastatin", { ctx: { alt: 130 } }), "statin_alt_3x")).toBe("warning");
  });
  it("no warning at 3× or below", () => {
    expect(check("rosuvastatin", { ctx: { alt: 120 } })).toEqual([]);
  });
});

describe("nitrofurantoin", () => {
  it("warns below eGFR 30", () => {
    expect(levelOf(check("nitrofurantoin", { ctx: { egfr: 25 } }), "nitrofurantoin_egfr_lt30")).toBe("warning");
    expect(check("nitrofurantoin")).toEqual([]);
  });
});

describe("pregnancy", () => {
  const pregnant = { patient: { sex: "F" as const, pregnant: true } };
  it.each(["atorvastatin", "ramipril", "telmisartan"])("blocks %s", (id) => {
    expect(levelOf(check(id, pregnant), "pregnancy_contraindicated")).toBe("block");
  });
  it("does not block when not pregnant", () => {
    expect(rules(check("atorvastatin", { patient: { sex: "F" } }))).not.toContain("pregnancy_contraindicated");
  });
});

describe("duplicates", () => {
  it("warns when the same medicine is already taken or planned", () => {
    expect(levelOf(check("amlodipine", { current: ["amlodipine"] }), "duplicate_medicine")).toBe("warning");
    expect(levelOf(check("paracetamol", { plan: ["paracetamol"] }), "duplicate_medicine")).toBe("warning");
  });
  it("warns for two drugs of the same class", () => {
    expect(levelOf(check("rosuvastatin", { current: ["atorvastatin"] }), "duplicate_class")).toBe("warning");
    expect(levelOf(check("diclofenac", { plan: ["ibuprofen"] }), "duplicate_class")).toBe("warning");
  });
  it("matches free-text current medicines by name", () => {
    const a = checkPrescription(med("ibuprofen"), base, NORMAL, [{ name: "Ibuprofen" }], []);
    expect(rules(a)).toContain("duplicate_medicine");
  });
});

describe("every alert names a source", () => {
  it("has a source on every alert", () => {
    const a = [
      ...check("cotrimoxazole", { patient: { allergies: ["Sulpha"] } }),
      ...check("metformin", { ctx: { egfr: 20 } }),
      ...check("ibuprofen", { ctx: { egfr: 40 }, current: ["ramipril", "furosemide", "diclofenac"] }),
      ...check("telmisartan", { ctx: { acr: 300 }, plan: ["enalapril"] }),
    ];
    expect(a.length).toBeGreaterThan(5);
    for (const x of a) expect(x.source).toMatch(/FDA label|KDIGO|ADA|Mentzer|General pharmacology/);
  });
});

describe("custom medicines", () => {
  it("get no safety checks", () => {
    expect(checkPrescription({ name: "Ibuprofen", custom: true }, base, { ...NORMAL, egfr: 20 }, [], [])).toEqual([]);
  });
});

describe("demo scenarios", () => {
  it("Ravi + ibuprofen → kidney warning", () => {
    const { patient, ctx } = seeded("ravi");
    const a = checkPrescription(med("ibuprofen"), patient, ctx, [], []);
    expect(levelOf(a, "nsaid_kidney")).toBe("warning");
    expect(blockRules(a)).toEqual([]);
  });

  it("Ravi + metformin → no block (eGFR ~64)", () => {
    const { patient, ctx } = seeded("ravi");
    expect(blockRules(checkPrescription(med("metformin"), patient, ctx, [], []))).toEqual([]);
  });

  it("eGFR 28 patient + metformin → block", () => {
    const a = checkPrescription(med("metformin"), base, { ...NORMAL, egfr: 28 }, [], []);
    expect(blockRules(a)).toEqual(["metformin_egfr_lt30"]);
  });

  it("Priya + cotrimoxazole → block", () => {
    const { patient, ctx } = seeded("priya");
    expect(blockRules(checkPrescription(med("cotrimoxazole"), patient, ctx, [], []))).toContain("sulfa_allergy_antibiotic");
  });

  it("Priya + ferrous ascorbate → iron warning", () => {
    const { patient, ctx } = seeded("priya");
    expect(levelOf(checkPrescription(med("ferrous_ascorbate"), patient, ctx, [], []), "iron_thal_trait")).toBe("warning");
  });

  it("telmisartan + ramipril → block on both", () => {
    const alerts = checkPlan([med("telmisartan"), med("ramipril")], base, NORMAL, []);
    expect(blockRules(alerts[0])).toContain("dual_raas");
    expect(blockRules(alerts[1])).toContain("dual_raas");
  });
});

describe("isMedicationSavable", () => {
  const blocked = check("cotrimoxazole", { patient: { allergies: ["Sulfa drugs"] } });
  const override = (reason: string) => ({ reason, author: "Dr. X", timestamp: "2026-03-20T10:00:00Z", rules: [] });
  it("needs an override with a reason when blocked", () => {
    expect(isMedicationSavable({}, blocked)).toBe(false);
    expect(isMedicationSavable({ override: override("  ") }, blocked)).toBe(false);
    expect(isMedicationSavable({ override: override("Allergy history unclear; tolerated before") }, blocked)).toBe(true);
  });
  it("is always savable without a block", () => {
    expect(isMedicationSavable({}, check("paracetamol"))).toBe(true);
  });
});
