import { describe, expect, it } from "vitest";
import { getFindings, matchSuspectedScreen } from "../findings";
import { patientData } from "./helpers";

const allText = (f: { title: string; summary: string; recommendation?: string; evidence: string[] }) =>
  [f.title, f.summary, f.recommendation ?? "", ...f.evidence].join(" ");

describe("matchSuspectedScreen", () => {
  it("maps free text to a screen", () => {
    expect(matchSuspectedScreen("Type 2 diabetes")).toBe("diabetes");
    expect(matchSuspectedScreen("Iron-deficiency anaemia (fatigue)")).toBe("anaemia");
    expect(matchSuspectedScreen("Routine checkup")).toBeNull();
  });
});

describe("Ravi", () => {
  const { patient, reports } = patientData("ravi");
  const findings = getFindings(patient, reports);

  it("puts the suspected diabetes finding first: prediabetes, rising", () => {
    const first = findings[0];
    expect(first.category).toBe("suspected");
    expect(first.screen).toBe("diabetes");
    expect(first.severity).toBe("watch");
    expect(first.title).toMatch(/prediabetes/i);
    expect(first.summary).toMatch(/rising/);
    expect(first.evidence.join(" ")).toMatch(/HbA1c 6\.1 %/);
    expect(first.guideline).toBe("ADA");
  });

  it("detects incidental rapid eGFR decline with A2 albuminuria", () => {
    const kidney = findings.find((f) => f.screen === "kidney")!;
    expect(kidney.category).toBe("incidental");
    expect(kidney.severity).toBe("high");
    expect(kidney.title).toBe("Rapid eGFR decline");
    expect(kidney.summary).toMatch(/A2/);
    expect(kidney.summary).toMatch(/^eGFR has fallen to 64 at −9\.3 per year/);
    expect(kidney.evidence.join(" ")).toMatch(/Urine ACR 45 mg\/g → KDIGO A2/);
    expect(kidney.guideline).toMatch(/KDIGO/);
  });

  it("orders incidental findings by severity", () => {
    expect(findings.map((f) => f.screen)).toEqual(["diabetes", "kidney", "lipids"]);
  });

  it("FIB-4 is low, so there is no liver finding", () => {
    expect(findings.find((f) => f.screen === "liver")).toBeUndefined();
  });
});

describe("Priya", () => {
  const { patient, reports } = patientData("priya");
  const findings = getFindings(patient, reports);

  it("suggests thalassaemia trait (Mentzer ≈ 11.4) and recommends Hb electrophoresis", () => {
    const first = findings[0];
    expect(first.category).toBe("suspected");
    expect(first.screen).toBe("anaemia");
    expect(first.title).toMatch(/thalassaemia trait/);
    expect(first.summary).toMatch(/Mentzer index is 11\.4/);
    expect(first.recommendation).toMatch(/[Cc]onsider Hb electrophoresis/);
    expect(first.guideline).toMatch(/Mentzer/);
  });

  it("finishes with a no-other-concerns finding", () => {
    expect(findings.at(-1)!.category).toBe("normal");
    expect(findings).toHaveLength(2);
  });
});

describe("Arjun", () => {
  it("has no high or watch findings", () => {
    const { patient, reports } = patientData("arjun");
    const findings = getFindings(patient, reports);
    expect(findings.filter((f) => f.severity !== "normal")).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe("No concerns flagged from this panel");
  });
});

describe("wording", () => {
  it("never says 'you have'", () => {
    for (const id of ["ravi", "priya", "arjun"]) {
      const { patient, reports } = patientData(id);
      for (const f of getFindings(patient, reports)) {
        expect(allText(f)).not.toMatch(/you have/i);
      }
    }
  });
});
