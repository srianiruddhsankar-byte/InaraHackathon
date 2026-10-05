// Test dictionary: canonical name, LOINC code, unit, aliases and reference
// ranges (by sex where needed). Populated in a later task.
import type { Sex, TestKey } from "./types";

export interface ReferenceRange {
  low?: number;
  high?: number;
}

export interface TestDefinition {
  key: TestKey;
  name: string;
  loinc: string;
  unit: string;
  aliases: string[];
  range: ReferenceRange | Record<Sex, ReferenceRange>;
}

export const TESTS: Partial<Record<TestKey, TestDefinition>> = {};
