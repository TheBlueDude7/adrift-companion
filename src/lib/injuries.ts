import { INJURY_BY_CODE, INJURY_LOCATIONS, INJURY_PENALTY, INJURY_TABLE, type InjuryDef } from "@/data/injuries";
import { uid } from "./dice";
import { applyCondition } from "./mechanics";
import { SEGMENTS, SKILL_BY_KEY, type Attribute, type InjurySeverity, type SkillKey } from "./rules";
import type { Character, GameState, Injury } from "./types";

/** The two d6 rolled at the table: Severity, then Location. */
export type InjuryRoll = { severity: number; location: number };

export const injuryFor = (roll: InjuryRoll): InjuryDef | undefined => INJURY_BY_CODE[`${roll.severity}-${roll.location}`];

/** How bad an injury counts as now: Surgery turns Major and Deadly injuries into Minor ones. */
export const effectiveSeverity = (i: Injury): InjurySeverity => (i.operated ? "Minor" : i.severity);

export const MAX_MINOR = 2;
export const MAX_MAJOR = 1;

/**
 * What a roll actually gives this character. Rolling an injury they already have, or going over the cap
 * (2 Minor, 1 Major), makes it one step worse in the same location.
 */
export function resolveInjuryRoll(c: Character, roll: InjuryRoll) {
  const rolled = injuryFor(roll);
  if (!rolled) return null;
  const count = (s: InjurySeverity) => c.injuries.filter((i) => effectiveSeverity(i) === s).length;
  const reasons: string[] = [];
  let severityDie = roll.severity;
  const at = (die: number) => INJURY_BY_CODE[`${die}-${roll.location}`];
  const worsen = (why: string) => {
    severityDie = severityDie <= 3 ? 4 + ((severityDie - 1) % 2) : 6;
    reasons.push(why);
  };
  if (c.injuries.some((i) => !i.legacy && i.code === rolled.code) && severityDie < 6) worsen(`already has ${rolled.name}`);
  if (at(severityDie).severity === "Minor" && count("Minor") >= MAX_MINOR) worsen(`already carries ${MAX_MINOR} Minor injuries`);
  if (at(severityDie).severity === "Major" && count("Major") >= MAX_MAJOR) worsen(`already carries a Major injury`);
  return { rolled, entry: at(severityDie), reasons };
}

export function addInjuryFromRoll(g: GameState, c: Character, roll: InjuryRoll, out: string[]) {
  const r = resolveInjuryRoll(c, roll);
  if (!r) return;
  const { entry } = r;
  out.push(`${c.name} suffers a ${entry.severity} Injury (rolled ${roll.severity}, ${roll.location}: ${INJURY_LOCATIONS[roll.location - 1]}): ${entry.name}.`);
  if (r.reasons.length) out.push(`${r.rolled.name} becomes ${entry.name} because ${c.name} ${r.reasons.join(" and ")}.`);
  addInjury(g, c, entry, out);
}

/** Give a character an injury from the table, with its Bleeding, conditions, and Surgery deadline. */
export function addInjury(g: GameState, c: Character, entry: InjuryDef, out: string[]) {
  const injury: Injury = {
    id: uid(),
    code: entry.code,
    name: entry.name,
    effect: entry.effect,
    severity: entry.severity,
    state: "Untreated",
    dayReceived: g.day,
    notes: "",
    location: entry.location,
  };
  if (entry.deadline) {
    injury.deadline = { day: g.day, segment: Math.min(g.segment + 1, SEGMENTS.length - 1) };
    out.push(`☠ ${c.name} needs Surgery by the end of ${SEGMENTS[injury.deadline.segment]}, or they die.`);
  }
  c.injuries.push(injury);
  if (entry.severity !== "Minor") applyCondition(g, c, "Bleeding", "Ongoing", out, `From ${entry.name}`);
  for (const name of entry.conditions ?? []) applyCondition(g, c, name, "Persistent", out, untilSurgery(entry.name));
}

const untilSurgery = (name: string) => `Until ${name} has Surgery`;

/** Successful Surgery: a Major or Deadly injury becomes a Treated Minor one, and its conditions end. */
export function operate(c: Character, injuryId: string, out: string[]) {
  const injury = c.injuries.find((i) => i.id === injuryId);
  if (!injury || injury.legacy || effectiveSeverity(injury) === "Minor") return;
  injury.operated = true;
  injury.state = "Treated";
  delete injury.deadline;
  const ended = c.conditions.filter((x) => x.notes === untilSurgery(injury.name));
  c.conditions = c.conditions.filter((x) => x.notes !== untilSurgery(injury.name));
  const def = INJURY_BY_CODE[injury.code];
  out.push(`${c.name}'s Surgery succeeds: ${injury.name} is now a Treated Minor injury (−1d6).${ended.length ? ` ${ended.map((x) => x.name).join(" and ")} end${ended.length === 1 ? "s" : ""}.` : ""}`);
  if (def?.permanent) out.push(`The loss is permanent: it won't heal naturally until replaced by a cybernetic or graft.`);
  if (def?.name === "Organ Failure") out.push(`Organ Failure leaves ${c.name} with −2 Max HP; note it on their sheet.`);
}

/** Natural recovery and Life Support can heal it: Minor now, and not a permanent loss. */
export const canHealNaturally = (i: Injury) => effectiveSeverity(i) === "Minor" && !(i.location && INJURY_BY_CODE[i.code]?.permanent);

/** Dice the character's injuries take off a roll with this skill (or a flat roll of this attribute). */
export function injuryPenalty(c: Character, skill: SkillKey | null, attr: Attribute) {
  const sources: string[] = [];
  let dice = 0;
  for (const i of c.injuries) {
    const def = i.location ? INJURY_BY_CODE[i.code] : undefined;
    if (!def) continue;
    const hits = (skill && def.skills?.includes(skill)) || def.attrs?.includes(skill ? SKILL_BY_KEY[skill].attr : attr);
    if (!hits) continue;
    const n = INJURY_PENALTY[effectiveSeverity(i)];
    dice += n;
    sources.push(`${i.name} −${n}`);
  }
  return { dice, sources };
}

/** Deadly injuries whose Surgery deadline has arrived or passed. */
export function overdueInjuries(g: GameState, c: Character) {
  return c.injuries.filter((i) => i.deadline && (g.day > i.deadline.day || (g.day === i.deadline.day && g.segment >= i.deadline.segment)));
}

/** The closest new injury for each entry in the old 60-entry table. */
const LEGACY_SUGGESTIONS: Record<string, string> = {
  "1-1": "1-5", "1-2": "3-4", "1-3": "3-3", "1-4": "2-5", "1-5": "1-6", "1-6": "3-6", "1-7": "1-3", "1-8": "2-6", "1-9": "2-2", "1-10": "2-1",
  "2-1": "1-4", "2-2": "1-1", "2-3": "3-1", "2-4": "2-1", "2-5": "2-3", "2-6": "1-6", "2-7": "1-2", "2-8": "1-6", "2-9": "2-6", "2-10": "3-6",
  "3-1": "4-4", "3-2": "4-3", "3-3": "4-5", "3-4": "3-4", "3-5": "2-4", "3-6": "5-4", "3-7": "4-3", "3-8": "5-3", "3-9": "4-1", "3-10": "2-6",
  "4-1": "4-6", "4-2": "3-3", "4-3": "4-2", "4-4": "5-2", "4-5": "5-5", "4-6": "5-6", "4-7": "4-1", "4-8": "4-4", "4-9": "5-1", "4-10": "4-1",
  "5-1": "6-3", "5-2": "5-4", "5-3": "4-6", "5-4": "5-6", "5-5": "4-1", "5-6": "6-2", "5-7": "5-5", "5-8": "5-6", "5-9": "5-6", "5-10": "4-1",
  "6-1": "4-6", "6-2": "6-6", "6-3": "6-5", "6-4": "6-5", "6-5": "4-6", "6-6": "6-3", "6-7": "6-4", "6-8": "4-5", "6-9": "6-1", "6-10": "6-5",
};

export function suggestConversion(i: Injury): InjuryDef {
  return INJURY_BY_CODE[LEGACY_SUGGESTIONS[i.code] ?? ""] ?? INJURY_TABLE.find((e) => e.name === i.name) ?? INJURY_TABLE[0];
}

/**
 * Swap an old-table injury for a new one. It keeps its state, day received, and notes; nothing new is
 * applied (no fresh Bleeding or conditions), since the injury isn't new.
 */
export function convertLegacy(c: Character, injuryId: string, code: string, out: string[]) {
  const injury = c.injuries.find((i) => i.id === injuryId);
  const def = INJURY_BY_CODE[code];
  if (!injury || !injury.legacy || !def) return;
  const old = injury.name;
  Object.assign(injury, { code: def.code, name: def.name, effect: def.effect, severity: def.severity, location: def.location });
  delete injury.legacy;
  out.push(`${c.name}'s ${old} (old table) becomes ${def.name}, a ${def.severity} ${def.location} injury (${injury.state}).`);
}
