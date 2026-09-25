import {
  CYBER_BY_KEY,
  CYBER_LOAD,
  CYBER_LOCATIONS,
  CYBER_SYSTEM_BY_KEY,
  dampeningForLoad,
  type CyberDef,
  type CyberReq,
  type MechTag,
} from "@/data/cybernetics";
import type { Attribute } from "./rules";
import type { Character, GameState, InstalledCyber } from "./types";

export type Installed = { inst: InstalledCyber; def: CyberDef };

export function installed(c: Character): Installed[] {
  return (c.cybernetics ?? []).flatMap((inst) => (CYBER_BY_KEY[inst.key] ? [{ inst, def: CYBER_BY_KEY[inst.key] }] : []));
}

const enhanced = (x: Installed) => !x.inst.replacement;
const working = (x: Installed) => enhanced(x) && !x.inst.damaged;

/** Load is counted per body system; each damage branch is its own system. */
const loadGroup = (def: CyberDef) => (def.system === "damage" ? `damage:${def.damage}` : def.system);

export function cyberLoad(c: Character) {
  const top = new Map<string, number>();
  for (const x of installed(c).filter(enhanced)) top.set(loadGroup(x.def), Math.max(top.get(loadGroup(x.def)) ?? 0, CYBER_LOAD[x.def.tier]));
  return [...top.values()].reduce((s, n) => s + n, 0);
}

export function dampening(c: Character) {
  const bonus = installed(c).filter(working).reduce((s, x) => s + (x.def.bonus?.dampening ?? 0), 0);
  return dampeningForLoad(cyberLoad(c)) + bonus;
}

export function cyberAttr(c: Character, attr: Attribute) {
  const list = installed(c).filter(working);
  let total = list.reduce((s, x) => s + (x.def.bonus?.attr?.[attr] ?? 0), 0);
  for (const sys of Object.values(CYBER_SYSTEM_BY_KEY)) {
    if (sys.attr !== attr) continue;
    const tier = Math.max(0, ...list.filter((x) => x.def.system === sys.key).map((x) => x.def.tier));
    total += tier >= 3 ? 2 : tier === 2 ? 1 : 0;
  }
  return total;
}

export const cyberMaxHp = (c: Character) => installed(c).filter(working).reduce((s, x) => s + (x.def.bonus?.maxHp ?? 0), 0);
export const cyberMaxEnergy = (c: Character) => installed(c).filter(working).reduce((s, x) => s + (x.def.bonus?.maxEnergy ?? 0), 0);

/** Whether an implant keeps working while its owner pilots a mech. */
export function mechTag(x: Installed): MechTag | "Replacement" {
  if (x.inst.replacement) return "Replacement";
  return CYBER_SYSTEM_BY_KEY[x.def.system].mech;
}

function matches(x: Installed, req: CyberReq) {
  if (x.inst.replacement) return false;
  const keys = [x.inst.key, ...x.inst.lineage];
  if (!req.keys.some((k) => keys.includes(k))) return false;
  if (req.limb) return x.inst.location.toLowerCase().includes(req.limb);
  return true;
}

/** Installed implants that satisfy a prerequisite, most specific first. */
export function satisfiers(c: Character, req: CyberReq) {
  return installed(c)
    .filter((x) => matches(x, req))
    .sort((a, b) => Number(req.keys.includes(b.inst.key)) - Number(req.keys.includes(a.inst.key)));
}

export function missingReqs(c: Character, def: CyberDef) {
  const used = new Set<string>();
  const missing: string[] = [];
  for (const req of def.requires ?? []) {
    const found = satisfiers(c, req).filter((x) => !used.has(x.inst.id)).slice(0, req.count ?? 1);
    if (found.length < (req.count ?? 1)) missing.push(req.label);
    for (const x of found) used.add(x.inst.id);
  }
  return missing;
}

export const isUnlocked = (g: GameState, def: CyberDef) => def.tier === 1 || g.research.cybernetics.includes(def.key);

/** Every Tier I location for a definition, taken or not. Sided locations list each side. */
export function bodyLocations(def: CyberDef) {
  if (!def.location) return [];
  const loc = CYBER_LOCATIONS[def.location];
  return loc.sides ?? [loc.name];
}

/** Free Tier I locations for a definition. Sided locations list each free side. */
export function freeLocations(c: Character, def: CyberDef) {
  const taken = new Set((c.cybernetics ?? []).map((i) => i.location));
  return bodyLocations(def).filter((s) => !taken.has(s));
}

/** Why this implant can't be installed on this character right now, or null. */
export function installBlocker(g: GameState, c: Character, def: CyberDef): string | null {
  if (!isUnlocked(g, def)) return "Not researched yet";
  const mine = installed(c);
  const perSide = def.tier === 2 && (def.system === "sensory" || def.system === "structural");
  if (def.tier > 1 && !perSide && mine.some((x) => x.inst.key === def.key)) return "Already installed";
  if (perSide && upgradeTargets(c, def).length === 0 && mine.some((x) => x.inst.key === def.key)) return "No other implant to upgrade";
  if (def.system === "damage" && mine.some((x) => x.def.damage === def.damage && x.def.tier >= def.tier)) return `Already has a ${def.damage} system`;
  if (def.tier === 1 && freeLocations(c, def).length === 0) return "No free body location";
  const missing = missingReqs(c, def);
  if (missing.length) return `Requires ${missing.join(" and ")}`;
  return null;
}

/** Implants a Tier II upgrade could replace: installed Tier I prerequisites themselves, not later upgrades of them. */
export function upgradeTargets(c: Character, def: CyberDef) {
  const req = def.requires?.[0];
  if (def.tier !== 2 || !req) return [];
  return satisfiers(c, req).filter((x) => req.keys.includes(x.inst.key) && x.def.tier === 1);
}

export type InstallPlan = { location: string; removes: string[]; lineage: string[] };

/**
 * Where a new implant goes and what it absorbs.
 * Tier I takes a free location. Tier II replaces a Tier I prerequisite when one is chosen,
 * otherwise sits beside whatever satisfied it. Tier III integrates all of its prerequisites.
 */
export function planInstall(c: Character, def: CyberDef, opts: { location?: string; replaceId?: string }): InstallPlan {
  if (def.tier === 1) return { location: opts.location ?? freeLocations(c, def)[0] ?? def.name, removes: [], lineage: [] };
  if (def.system === "damage") {
    const prior = installed(c).find((x) => x.def.damage === def.damage);
    return { location: `${def.damage} system`, removes: prior ? [prior.inst.id] : [], lineage: prior ? [prior.inst.key, ...prior.inst.lineage] : [] };
  }
  if (def.tier === 2) {
    const target = installed(c).find((x) => x.inst.id === opts.replaceId);
    if (target) return { location: target.inst.location, removes: [target.inst.id], lineage: [target.inst.key, ...target.inst.lineage] };
    const via = def.requires?.[0] ? satisfiers(c, def.requires[0])[0] : undefined;
    return { location: via?.inst.location ?? def.name, removes: [], lineage: [] };
  }
  const used = new Set<string>();
  const parts: Installed[] = [];
  for (const req of def.requires ?? []) {
    const found = satisfiers(c, req).filter((x) => !used.has(x.inst.id)).slice(0, req.count ?? 1);
    for (const x of found) {
      used.add(x.inst.id);
      parts.push(x);
    }
  }
  return {
    location: `${CYBER_SYSTEM_BY_KEY[def.system].name} core`,
    removes: parts.map((x) => x.inst.id),
    lineage: [...new Set(parts.flatMap((x) => [x.inst.key, ...x.inst.lineage]))],
  };
}

/** Research candidates in a category and tier, in a stable order so the table can roll for them. */
export function researchCandidates(g: GameState, system: CyberDef["system"], tier: 2 | 3, all: CyberDef[]) {
  const unlocked = new Set(g.research.cybernetics);
  return all.filter((d) => {
    if (d.system !== system || d.tier !== tier || unlocked.has(d.key)) return false;
    if (tier === 3 && system === "damage") return (d.requires ?? []).every((r) => r.keys.some((k) => unlocked.has(k)));
    return true;
  });
}

/** Tier III research needs two Tier II technologies in the category; Damage needs at least one Tier II system. */
export function tier3Ready(g: GameState, system: CyberDef["system"], all: CyberDef[]) {
  const count = all.filter((d) => d.system === system && d.tier === 2 && g.research.cybernetics.includes(d.key)).length;
  return system === "damage" ? count >= 1 : count >= 2;
}
