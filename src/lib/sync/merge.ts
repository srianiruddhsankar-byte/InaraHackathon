/**
 * Three-way merge of the shared demo state (pure).
 *
 * `base` is the last state both sides agreed on (the last synced version),
 * `local` is this device's state and `remote` the other device's. A side that
 * didn't change a value takes the other side's change. When both changed it:
 * - arrays of objects with an `id` (reports, cases, events…) merge item by item,
 * - append-only logs without ids (access log, consent log) keep both tails,
 * - plain objects merge key by key,
 * - anything else: the local value wins (last write) and the path is reported
 *   as a conflict, so the UI can say so — nothing is dropped silently.
 */

type Json = unknown;
type Obj = Record<string, Json>;

/** JSON with sorted object keys, so equal data compares equal (Postgres jsonb reorders keys). */
export function stableStringify(value: Json): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Obj;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function deepEqual(a: Json, b: Json): boolean {
  return a === b || stableStringify(a) === stableStringify(b);
}

/** Top-level keys whose values differ between two states. */
export function changedKeys(a: Obj, b: Obj): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !deepEqual(a[k], b[k]));
}

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const hasIds = (v: Json): v is { id: string }[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === "string");

export interface MergeResult<T> {
  merged: T;
  /** Paths changed differently on both sides; the local value was kept. */
  conflicts: string[];
}

export function threeWayMerge<T extends Obj>(base: T, local: T, remote: T): MergeResult<T> {
  const conflicts: string[] = [];
  const merged = mergeValue(base, local, remote, "", conflicts) as T;
  return { merged, conflicts };
}

function mergeValue(base: Json, local: Json, remote: Json, path: string, conflicts: string[]): Json {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(base, local)) return remote;
  if (deepEqual(base, remote)) return local;

  // Both sides changed it, differently.
  if (hasIds(local) && hasIds(remote) && (base === undefined || hasIds(base))) {
    return mergeById(base ?? [], local, remote, path, conflicts);
  }
  if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base) && isPrefix(base, local) && isPrefix(base, remote)) {
    const seen = new Set(local.map(stableStringify));
    return [...local, ...remote.slice(base.length).filter((x) => !seen.has(stableStringify(x)))];
  }
  if (isObj(local) && isObj(remote) && (base === undefined || isObj(base))) {
    const b = (base ?? {}) as Obj;
    const out: Obj = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = mergeValue(b[k], local[k], remote[k], path ? `${path}.${k}` : k, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  conflicts.push(path || "(state)");
  return local;
}

function isPrefix(prefix: Json[], arr: Json[]): boolean {
  return prefix.length <= arr.length && prefix.every((x, i) => deepEqual(x, arr[i]));
}

function mergeById(
  base: { id: string }[],
  local: { id: string }[],
  remote: { id: string }[],
  path: string,
  conflicts: string[],
): { id: string }[] {
  const byId = (xs: { id: string }[]) => new Map(xs.map((x) => [x.id, x]));
  const b = byId(base);
  const r = byId(remote);
  const l = byId(local);
  const out: Json[] = [];
  for (const item of local) {
    const theirs = r.get(item.id);
    const orig = b.get(item.id);
    if (theirs) out.push(mergeValue(orig, item, theirs, `${path}[${item.id}]`, conflicts));
    // Deleted on the other device: drop it unless this device changed it.
    else if (!orig || !deepEqual(orig, item)) out.push(item);
  }
  for (const item of remote) {
    if (l.has(item.id)) continue;
    const orig = b.get(item.id);
    // Deleted on this device: drop it unless the other device changed it.
    if (!orig || !deepEqual(orig, item)) out.push(item);
  }
  return out as { id: string }[];
}
