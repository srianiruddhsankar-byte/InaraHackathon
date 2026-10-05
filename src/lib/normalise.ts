// Maps messy lab test names to canonical keys (via aliases) and converts
// units (glucose mmol/L × 18, creatinine µmol/L ÷ 88.4). Never throws:
// problems come back as warnings for the lab to review.
import { TEST_KEYS, TESTS } from "./tests";
import type { TestKey } from "./types";

export interface NormalisedValue {
  rawName: string;
  rawValue: string | number;
  rawUnit: string;
  testKey: TestKey | null;
  /** Value in the canonical unit, rounded to the test's precision. */
  value: number | null;
  unit: string | null;
  converted: boolean;
  warnings: string[];
}

/** Lowercase and strip everything except letters and digits. */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercase, drop spaces, and unify the micro sign (µ, μ, mc → u). */
function unitKey(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[µμ]/g, "u")
    .replace(/^mc(?=[a-z])/, "u")
    .replace(/×/g, "x");
}

const NAME_INDEX: Map<string, TestKey> = (() => {
  const index = new Map<string, TestKey>();
  for (const key of TEST_KEYS) {
    const def = TESTS[key];
    for (const alias of [key, def.name, ...def.aliases]) {
      index.set(nameKey(alias), key);
    }
  }
  return index;
})();

/** Canonical key for a raw test name, or null if unknown. */
export function normaliseName(rawName: string): TestKey | null {
  return NAME_INDEX.get(nameKey(rawName)) ?? null;
}

/** Conversion factor from a raw unit to the test's canonical unit, or null if unsupported. */
export function unitFactor(key: TestKey, rawUnit: string): number | null {
  const def = TESTS[key];
  const u = unitKey(rawUnit);
  if ([def.unit, ...def.unitAliases].some((alias) => unitKey(alias) === u)) return 1;
  for (const [unit, factor] of Object.entries(def.conversions)) {
    if (unitKey(unit) === u) return factor;
  }
  return null;
}

function round(value: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

export function normalise(
  rawName: string,
  rawValue: string | number,
  rawUnit = "",
): NormalisedValue {
  const result: NormalisedValue = {
    rawName,
    rawValue,
    rawUnit,
    testKey: null,
    value: null,
    unit: null,
    converted: false,
    warnings: [],
  };

  const key = normaliseName(rawName);
  if (!key) {
    result.warnings.push(`Unknown test name "${rawName}" — not imported.`);
    return result;
  }
  result.testKey = key;
  const def = TESTS[key];

  const num = typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim().replace(/,/g, ""));
  if (String(rawValue).trim() === "" || !Number.isFinite(num)) {
    result.warnings.push(`${def.name}: value "${rawValue}" is not a number.`);
    return result;
  }

  let factor = 1;
  if (rawUnit.trim() === "") {
    result.warnings.push(`${def.name}: no unit given — assumed ${def.unit}.`);
  } else {
    const f = unitFactor(key, rawUnit);
    if (f === null) {
      result.warnings.push(`${def.name}: unknown unit "${rawUnit}" (expected ${def.unit}).`);
      return result;
    }
    factor = f;
  }

  result.value = round(num * factor, def.decimals);
  result.unit = def.unit;
  if (factor !== 1) {
    result.converted = true;
    result.warnings.push(`${def.name}: converted ${num} ${rawUnit} → ${result.value} ${def.unit}.`);
  }
  return result;
}
