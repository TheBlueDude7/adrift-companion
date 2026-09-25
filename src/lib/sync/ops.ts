/**
 * Structural diff/patch for game state.
 *
 * Arrays whose elements all carry a string `id` are treated as keyed collections, so
 * concurrent edits from different players merge by element instead of by index
 * (two people adding log lines or items at once both survive). Every op is safe to
 * apply twice and silently skips targets that no longer exist.
 */

export type Seg = string | { id: string };

export type Op =
  | { op: "set"; path: Seg[]; value: unknown }
  | { op: "del"; path: Seg[] }
  | { op: "ins"; path: Seg[]; after: string | null; value: unknown }
  | { op: "rm"; path: Seg[]; id: string }
  | { op: "order"; path: Seg[]; ids: string[] };

type Obj = Record<string, unknown>;
type Keyed = { id: string } & Obj;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function isKeyed(a: unknown[]): a is Keyed[] {
  const seen = new Set<string>();
  for (const x of a) {
    if (!isObj(x) || typeof x.id !== "string" || seen.has(x.id)) return false;
    seen.add(x.id);
  }
  return true;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => k in b && equal(a[k], b[k]));
  }
  return false;
}

export function diff(a: unknown, b: unknown, path: Seg[] = [], out: Op[] = []): Op[] {
  if (a === b) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(b)) {
      if (b[k] === undefined) {
        if (k in a && a[k] !== undefined) out.push({ op: "del", path: [...path, k] });
      } else if (!(k in a) || a[k] === undefined) out.push({ op: "set", path: [...path, k], value: b[k] });
      else diff(a[k], b[k], [...path, k], out);
    }
    for (const k of Object.keys(a)) if (!(k in b) && a[k] !== undefined) out.push({ op: "del", path: [...path, k] });
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && isKeyed(a) && isKeyed(b) && (a.length > 0 || b.length > 0)) {
    const inB = new Set(b.map((x) => x.id));
    const byId = new Map(a.map((x) => [x.id, x]));
    for (const x of a) if (!inB.has(x.id)) out.push({ op: "rm", path, id: x.id });
    b.forEach((x, i) => {
      const old = byId.get(x.id);
      if (old) diff(old, x, [...path, { id: x.id }], out);
      else out.push({ op: "ins", path, after: i > 0 ? b[i - 1].id : null, value: x });
    });
    const keptA = a.filter((x) => inB.has(x.id)).map((x) => x.id);
    const keptB = b.filter((x) => byId.has(x.id)).map((x) => x.id);
    if (!equal(keptA, keptB)) out.push({ op: "order", path, ids: b.map((x) => x.id) });
    return out;
  }
  if (!equal(a, b)) out.push({ op: "set", path, value: b });
  return out;
}

function step(container: unknown, seg: Seg): unknown {
  if (typeof seg === "string") return isObj(container) ? container[seg] : undefined;
  return Array.isArray(container) ? container.find((x) => isObj(x) && x.id === seg.id) : undefined;
}

function resolve(root: unknown, path: Seg[]): unknown {
  let cur = root;
  for (const seg of path) {
    cur = step(cur, seg);
    if (cur === undefined) return undefined;
  }
  return cur;
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

/** Apply ops in place. A root-level `set` returns the replacement, so always use the return value. */
export function applyOps<T>(root: T, ops: Op[]): T {
  let doc: unknown = root;
  for (const o of ops) {
    if (o.op === "set" && o.path.length === 0) {
      doc = clone(o.value);
      continue;
    }
    if (o.op === "set" || o.op === "del") {
      const parent = resolve(doc, o.path.slice(0, -1));
      const last = o.path[o.path.length - 1];
      if (typeof last === "string") {
        if (!isObj(parent)) continue;
        if (o.op === "set") parent[last] = clone(o.value);
        else delete parent[last];
      } else if (Array.isArray(parent)) {
        const i = parent.findIndex((x) => isObj(x) && x.id === last.id);
        if (i < 0) continue;
        if (o.op === "set") parent[i] = clone(o.value);
        else parent.splice(i, 1);
      }
      continue;
    }
    const arr = resolve(doc, o.path);
    if (!Array.isArray(arr)) continue;
    if (o.op === "ins") {
      const value = clone(o.value) as Keyed;
      const existing = arr.findIndex((x) => isObj(x) && x.id === value.id);
      if (existing >= 0) {
        arr[existing] = value;
        continue;
      }
      const at = o.after === null ? 0 : arr.findIndex((x) => isObj(x) && x.id === o.after) + 1;
      arr.splice(at <= 0 && o.after !== null ? arr.length : at, 0, value);
    } else if (o.op === "rm") {
      const i = arr.findIndex((x) => isObj(x) && x.id === o.id);
      if (i >= 0) arr.splice(i, 1);
    } else if (o.op === "order") {
      const rank = new Map(o.ids.map((id, i) => [id, i]));
      const sorted = [...arr].sort((x, y) => (rank.get((x as Keyed).id) ?? Infinity) - (rank.get((y as Keyed).id) ?? Infinity));
      arr.splice(0, arr.length, ...sorted);
    }
  }
  return doc as T;
}

const isSeg = (s: unknown) => typeof s === "string" || (isObj(s) && typeof s.id === "string");

export function isOpList(v: unknown): v is Op[] {
  return (
    Array.isArray(v) &&
    v.every((o) => {
      if (!isObj(o) || !Array.isArray(o.path) || !o.path.every(isSeg)) return false;
      switch (o.op) {
        case "set":
          return "value" in o;
        case "del":
          return true;
        case "ins":
          return (o.after === null || typeof o.after === "string") && isObj(o.value) && typeof o.value.id === "string";
        case "rm":
          return typeof o.id === "string";
        case "order":
          return Array.isArray(o.ids) && o.ids.every((x) => typeof x === "string");
        default:
          return false;
      }
    })
  );
}
