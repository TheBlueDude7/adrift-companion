import {
  CYBERNETICS,
  CYBER_BY_KEY,
  CYBER_LOAD,
  CYBER_LOCATIONS,
  CYBER_SYSTEMS,
  CYBER_SYSTEM_BY_KEY,
  INTERFACE_MECH_HP,
  SYSTEM_ATTR_BONUS,
  TIER_LABEL,
  dampeningForLoad,
  implantName,
  type CyberDef,
  type CyberReq,
  type CyberTier,
  type MechTag,
} from "@/data/cybernetics";
import type { Attribute, DamageType } from "./rules";
import { haveInStorage } from "./stock";
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

/**
 * Dampening left to spend this Scene.
 *
 * Dampening is a pool now rather than a single big discount used once. It is spent a point at a time
 * as fear and noise arrive, which is what makes the cybernetic path the one that removes variance:
 * a wired crew member doesn't get a better outcome, they get a narrower range of them. It refreshes
 * when the Scene ends, and nothing refills it sooner.
 */
export const dampeningLeft = (c: Character) => Math.max(0, dampening(c) - (c.dampeningUsed ?? 0));

/**
 * Spend Dampening to hold something off, returning how much of it was absorbed.
 *
 * Pressure costs a point a level. Stress costs two a point, because quieting the mind is harder than
 * quieting the body — which also means deep Load is what it takes to filter Stress at all.
 */
export function spendDampening(c: Character, want: number, costEach: number) {
  const affordable = Math.floor(dampeningLeft(c) / costEach);
  const absorbed = Math.min(want, affordable);
  if (absorbed > 0) c.dampeningUsed = (c.dampeningUsed ?? 0) + absorbed * costEach;
  return absorbed;
}

export function cyberAttr(c: Character, attr: Attribute) {
  const list = installed(c).filter(working);
  let total = list.reduce((s, x) => s + (x.def.bonus?.attr?.[attr] ?? 0), 0);
  for (const sys of Object.values(CYBER_SYSTEM_BY_KEY)) {
    if (sys.attr !== attr) continue;
    const tier = Math.max(0, ...list.filter((x) => x.def.system === sys.key).map((x) => x.def.tier));
    total += SYSTEM_ATTR_BONUS[tier as CyberTier] ?? 0;
  }
  return total;
}

export const cyberMaxHp = (c: Character) => installed(c).filter(working).reduce((s, x) => s + (x.def.bonus?.maxHp ?? 0), 0);

/**
 * Maximum Mech HP a pilot's Interface system lends the frame they're plugged into. Only the highest
 * tier counts, the way the Attribute ladder does: a Tier III integrates the Tier II beneath it.
 */
export function cyberMechHp(c: Character | undefined) {
  if (!c) return 0;
  const tier = Math.max(0, ...installed(c).filter(working).filter((x) => x.def.system === "interface").map((x) => x.def.tier));
  return INTERFACE_MECH_HP[tier as CyberTier] ?? 0;
}
export const cyberMaxEnergy = (c: Character) => installed(c).filter(working).reduce((s, x) => s + (x.def.bonus?.maxEnergy ?? 0), 0);

/**
 * Implants doing their work. A mech suppresses the Structural and Damage systems, so a pilot in a
 * frame fights with the frame's numbers and not their own plating — except for the ones the frame's
 * own Cybernetic Integration Ports keep connected, which are passed in by key.
 */
const live = (inMech: boolean, ported: string[] = []) => (x: Installed) =>
  working(x) && (!inMech || ported.includes(x.inst.key) || CYBER_SYSTEM_BY_KEY[x.def.system].mech !== "Suppressed");

/** Implants halving this damage type, named so the log can say which one did it. */
export const cyberResists = (c: Character, type: DamageType, inMech = false, ported: string[] = []) =>
  installed(c).filter(live(inMech, ported)).filter((x) => (x.def.resist ?? []).includes(type)).map((x) => x.def.name);

/**
 * What a character's Damage systems do to their own attack of this type. Resistance doesn't stack
 * and neither does this: a Tier III integrates its Tier II, so only the strongest of them counts.
 */
export function cyberAttack(c: Character, type: DamageType, inMech = false, ported: string[] = []) {
  const mine = installed(c).filter(live(inMech, ported)).filter((x) => x.def.damage === type && x.def.attack);
  const best = mine.sort((a, b) => b.def.attack!.boost - a.def.attack!.boost)[0];
  if (!best) return { boost: 0, cover: 0, armor: 0, source: null as string | null };
  return { boost: best.def.attack!.boost, cover: best.def.attack!.cover ?? 0, armor: best.def.attack!.armor ?? 0, source: best.def.name };
}

/** Whether an implant keeps working while its owner pilots a mech, given what that mech has ported. */
export function mechTag(x: Installed, ported: string[] = []): MechTag | "Replacement" | "Ported" {
  if (x.inst.replacement) return "Replacement";
  if (ported.includes(x.inst.key)) return "Ported";
  return CYBER_SYSTEM_BY_KEY[x.def.system].mech;
}

/** Implants a frame would suppress, which is what a Cybernetic Integration Port is there to choose from. */
export const suppressedImplants = (c: Character | undefined) =>
  c ? installed(c).filter((x) => mechTag(x) === "Suppressed" || mechTag(x) === "GM decides") : [];

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

/**
 * Why a technology isn't available to the crew yet, or null when it is. Where `installBlocker` answers
 * for one survivor's body, this answers for the whole crew's research: Tier I is always theirs, and
 * everything above it waits on a project, which in turn waits on what the project can even roll for.
 */
export function researchBlocker(g: GameState, def: CyberDef, all: CyberDef[] = CYBERNETICS): string | null {
  if (isUnlocked(g, def)) return null;
  const sys = CYBER_SYSTEM_BY_KEY[def.system].name;
  const project = `Needs a ${TIER_LABEL[def.tier]} ${sys} research project`;
  if (def.tier === 2) return project;
  // A Tier III can't even come up on the research table until the table has something to offer.
  if (def.system === "damage") {
    const req = def.requires?.[0];
    if (req && !req.keys.some((k) => g.research.cybernetics.includes(k))) return `Needs ${req.label} researched first`;
    return project;
  }
  if (!tier3Ready(g, def.system, all)) return `Needs two Tier II ${sys} technologies researched first`;
  return project;
}

/** One technology, with the crew's own standing in it. */
export type TechState = {
  def: CyberDef;
  /** Available to install: Tier I always, anything above it once the crew has researched it. */
  unlocked: boolean;
  /** Why not, when it isn't. */
  locked: string | null;
  /** Survivors carrying it right now, by name. */
  carriers: string[];
  /** Finished implants of it waiting in the hold. */
  spare: number;
  /** Keys it builds on, and the keys that build on it. */
  needs: string[];
  leadsTo: string[];
};

export type TechTier = { tier: CyberTier; attrBonus: number; load: number; techs: TechState[] };
export type TechBranch = { system: (typeof CYBER_SYSTEMS)[number]; tiers: TechTier[]; unlocked: number; total: number };

const TIERS: CyberTier[] = [1, 2, 3];

/**
 * The whole research tree with the crew's progress written into it: what's unlocked, why the rest
 * isn't, who is carrying each technology, what's spare in the hold, and what builds on what.
 *
 * Grouped the way the crew's own reference sheet is — a column per body system, three Tier bands
 * down it — so a Damage branch with no Tier I simply has no Tier I band.
 */
export function researchTree(g: GameState, all: CyberDef[] = CYBERNETICS): TechBranch[] {
  const dependents = new Map<string, string[]>();
  for (const d of all) {
    for (const req of d.requires ?? []) {
      for (const k of req.keys) dependents.set(k, [...(dependents.get(k) ?? []), d.key]);
    }
  }
  return CYBER_SYSTEMS.map((system) => {
    const mine = all.filter((d) => d.system === system.key);
    const tiers = TIERS.map((tier) => ({
      tier,
      attrBonus: SYSTEM_ATTR_BONUS[tier],
      load: CYBER_LOAD[tier],
      techs: mine
        .filter((d) => d.tier === tier)
        .map((def) => ({
          def,
          unlocked: isUnlocked(g, def),
          locked: researchBlocker(g, def, all),
          carriers: g.characters.filter((c) => installed(c).some((x) => x.inst.key === def.key)).map((c) => c.name),
          spare: haveInStorage(g, implantName(def)),
          needs: (def.requires ?? []).flatMap((r) => r.keys),
          leadsTo: dependents.get(def.key) ?? [],
        })),
    })).filter((t) => t.techs.length > 0);
    const techs = tiers.flatMap((t) => t.techs);
    return { system, tiers, unlocked: techs.filter((t) => t.unlocked).length, total: techs.length };
  });
}
