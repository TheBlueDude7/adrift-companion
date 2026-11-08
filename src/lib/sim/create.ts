import "server-only";

import { allAttributes, maxEnergy, maxHp, maxWillpower, skillLevel } from "../derive";
import {
  ATTRIBUTES,
  BACKGROUNDS,
  CREATION_ATTRIBUTE_POINTS,
  CREATION_SKILL_XP,
  SKILLS,
  SKILL_BY_KEY,
  totalXpForLevel,
  type Attribute,
  type Background,
  type SkillKey,
} from "../rules";
import { newCharacter } from "../seed";
import type { Character } from "../types";

/**
 * Character creation is the one place the app doesn't referee. `denyReason` lets a player who holds
 * no character insert exactly one, but never checks what they spent on it — the Crew tab just turns
 * the counter amber. So a model asked to allocate 6 attribute points and 45 skill XP itself would
 * quietly overspend, and nothing downstream would catch it.
 *
 * Instead a survivor is assembled from fixed, pre-costed pieces: every spread below costs exactly
 * the 6 points and every shape costs 45 XP or less. A simulated player chooses a spread, a shape,
 * and which skills fill the shape's levels — never a number — so whatever it picks is legal by
 * construction and there is nothing to reject afterwards.
 */
export type Spread = { key: string; label: string; note: string; points: Partial<Record<Attribute, number>> };

export const SPREADS: Spread[] = [
  { key: "hardy", label: "Hardy", note: "Takes a beating and keeps standing.", points: { CON: 3, STR: 2, WIT: 1 } },
  { key: "powerful", label: "Powerful", note: "Carries more, hits harder, breaks what needs breaking.", points: { STR: 4, CON: 2 } },
  { key: "balanced", label: "Balanced", note: "No weak side and no standout one.", points: { CON: 2, INT: 2, STR: 1, WIT: 1 } },
  { key: "brilliant", label: "Brilliant", note: "Built for trained work: medicine, engineering, the sciences.", points: { INT: 4, CON: 2 } },
  { key: "sharp", label: "Sharp", note: "Notices things first and keeps their nerve.", points: { WIT: 3, INT: 2, CON: 1 } },
];

/** Skill levels this build buys, highest first. The survivor picks which skills land on them. */
export type Shape = { key: string; label: string; note: string; levels: number[] };

export const SHAPES: Shape[] = [
  { key: "expert", label: "Expert", note: "One skill mastered, two touched on.", levels: [8, 3, 2] },
  { key: "specialist", label: "Specialist", note: "A strong trade with real support under it.", levels: [7, 4, 3, 1] },
  { key: "pair", label: "Two trades", note: "Good at two things and nothing else.", levels: [6, 6, 1, 1] },
  { key: "broad", label: "Broad", note: "Competent across four jobs, master of none.", levels: [5, 4, 4, 4] },
  { key: "generalist", label: "Generalist", note: "A hand in five jobs, thin in all of them.", levels: [5, 4, 4, 3, 2] },
];

export const shapeXp = (shape: Shape) => shape.levels.reduce((n, lv) => n + totalXpForLevel(lv), 0);
const spreadPoints = (spread: Spread) => ATTRIBUTES.reduce((n, a) => n + (spread.points[a] ?? 0), 0);

// Loud at import rather than silently overspending if the creation budget is ever retuned.
for (const s of SPREADS) {
  if (spreadPoints(s) !== CREATION_ATTRIBUTE_POINTS) throw new Error(`The ${s.label} spread costs ${spreadPoints(s)} of ${CREATION_ATTRIBUTE_POINTS} attribute points.`);
}
for (const s of SHAPES) {
  if (shapeXp(s) > CREATION_SKILL_XP) throw new Error(`The ${s.label} shape costs ${shapeXp(s)} of ${CREATION_SKILL_XP} skill XP.`);
}

/** The attribute behind a background's strongest granted skill — what its builds should lean on. */
function primaryAttr(bg: Background): Attribute {
  let best: { key: SkillKey; n: number } | null = null;
  for (const s of SKILLS) {
    const n = bg.skills[s.key] ?? 0;
    if (n > 0 && (!best || n > best.n)) best = { key: s.key, n };
  }
  return best ? SKILL_BY_KEY[best.key].attr : "INT";
}

/** Skills in the order they suit a background: its own first, then its primary attribute's, then the rest. */
function skillPreference(bg: Background): SkillKey[] {
  const own = SKILLS.filter((s) => (bg.skills[s.key] ?? 0) > 0)
    .sort((a, b) => (bg.skills[b.key] ?? 0) - (bg.skills[a.key] ?? 0))
    .map((s) => s.key);
  const primary = primaryAttr(bg);
  const near = SKILLS.filter((s) => s.attr === primary && !own.includes(s.key)).map((s) => s.key);
  const rest = SKILLS.filter((s) => !own.includes(s.key) && !near.includes(s.key)).map((s) => s.key);
  return [...own, ...near, ...rest];
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");

/** What a simulated player sends back. Every field is matched loosely and nothing here is trusted. */
export type SimBuildPick = {
  name: string;
  background: string;
  specialty: string;
  spread: string;
  shape: string;
  skills: string[];
  pitch: string;
  reason: string;
  unclear?: string;
};

export type ResolvedBuild = {
  name: string;
  background: Background;
  specialty: string;
  spread: Spread;
  shape: Shape;
  skills: SkillKey[];
  /** Where the pick had to be corrected, so a test run can report the model's misreadings. */
  corrections: string[];
};

const findSkill = (v: unknown): SkillKey | null => SKILLS.find((s) => norm(s.key) === norm(v) || norm(s.name) === norm(v))?.key ?? null;

/**
 * Turn a reply into a legal build. Anything unrecognised falls back to the first entry and is
 * recorded: a simulated player naming a skill that doesn't exist is a finding, not an error.
 */
export function resolveBuild(pick: SimBuildPick): ResolvedBuild {
  const corrections: string[] = [];
  const background = BACKGROUNDS.find((b) => norm(b.key) === norm(pick.background) || norm(b.name) === norm(pick.background)) ?? BACKGROUNDS[0];
  if (norm(pick.background) && background.key !== norm(pick.background) && norm(background.name) !== norm(pick.background)) {
    corrections.push(`asked for the background "${pick.background}", which doesn't exist; made a ${background.name}`);
  }
  const specialty = background.specialties.find((s) => norm(s.name) === norm(pick.specialty))?.name ?? background.specialties[0].name;
  if (norm(pick.specialty) && norm(specialty) !== norm(pick.specialty)) {
    corrections.push(`asked for the specialty "${pick.specialty}", which a ${background.name} can't take; took ${specialty}`);
  }
  const spread = SPREADS.find((s) => norm(s.key) === norm(pick.spread) || norm(s.label) === norm(pick.spread)) ?? SPREADS[0];
  const shape = SHAPES.find((s) => norm(s.key) === norm(pick.shape) || norm(s.label) === norm(pick.shape)) ?? SHAPES[0];

  const skills: SkillKey[] = [];
  for (const raw of Array.isArray(pick.skills) ? pick.skills : []) {
    const key = findSkill(raw);
    if (!key) {
      corrections.push(`named "${String(raw)}", which isn't a skill`);
      continue;
    }
    if (skills.includes(key)) {
      corrections.push(`named ${SKILL_BY_KEY[key].name} twice`);
      continue;
    }
    skills.push(key);
  }
  if (skills.length > shape.levels.length) {
    corrections.push(`named ${skills.length} skills for a shape with ${shape.levels.length} slots; dropped the last ${skills.length - shape.levels.length}`);
    skills.length = shape.levels.length;
  }
  for (const key of skillPreference(background)) {
    if (skills.length >= shape.levels.length) break;
    if (!skills.includes(key)) skills.push(key);
  }
  const name = typeof pick.name === "string" && pick.name.trim() ? pick.name.trim().slice(0, 60) : `${background.name}`;
  return { name, background, specialty, spread, shape, skills, corrections };
}

/** The character the build describes, ready to insert into the campaign. */
export function buildCharacter(b: ResolvedBuild, player: string): Character {
  const c = newCharacter(b.name, b.background.key, b.specialty, player);
  for (const a of ATTRIBUTES) c.attributes[a] = 1 + (b.spread.points[a] ?? 0);
  b.shape.levels.forEach((level, i) => {
    const key = b.skills[i];
    if (key) c.skills[key] = level;
  });
  c.hp = maxHp(c);
  c.energy = maxEnergy(c);
  c.willpower = maxWillpower(c);
  return c;
}

/** One line of what a finished survivor actually looks like, at the levels the sheet will show. */
export function buildLine(c: Character): string {
  const attrs = allAttributes(c);
  const trained = SKILLS.filter((s) => skillLevel(c, s.key) > 0)
    .map((s) => `${s.name} ${skillLevel(c, s.key)}`)
    .join(", ");
  return [
    ATTRIBUTES.map((a) => `${a} ${attrs[a]}`).join(" · "),
    `HP ${maxHp(c)} · Energy ${maxEnergy(c)} · Willpower ${maxWillpower(c)}`,
    trained || "no trained skills",
  ].join(" — ");
}

/** Everything a survivor can be made from. Long, but it is the whole decision in one place. */
export function creationMenu(): string {
  const backgrounds = BACKGROUNDS.map((b) => {
    const attrs = ATTRIBUTES.filter((a) => b.attributes[a]).map((a) => `+${b.attributes[a]} ${a}`).join(", ");
    const skills = SKILLS.filter((s) => b.skills[s.key]).map((s) => `${s.name} +${b.skills[s.key]}`).join(", ");
    const specialties = b.specialties.map((s) => `    · ${s.name} — ${s.summary}`).join("\n");
    return [
      `- ${b.name} (key: ${b.key}) — ${b.tagline}`,
      `    Free grants: ${attrs || "no attributes"}; ${skills || "no skills"}`,
      `    ${b.signature.name} (always on): ${b.signature.summary}`,
      `    Pick one specialty:\n${specialties}`,
    ].join("\n");
  }).join("\n\n");

  const spreads = SPREADS.map((s) => {
    const final = ATTRIBUTES.map((a) => `${a} ${1 + (s.points[a] ?? 0)}`).join(" · ");
    return `- ${s.label} (key: ${s.key}) — ${final}. ${s.note}`;
  }).join("\n");

  const shapes = SHAPES.map((s) => `- ${s.label} (key: ${s.key}) — skills at ${s.levels.join(", ")}. ${s.note}`).join("\n");

  const skills = SKILLS.map((s) => `- ${s.name} (${s.attr}) — ${s.what}`).join("\n");

  return [
    `BACKGROUNDS — pick one, and one of its specialties:\n\n${backgrounds}`,
    `ATTRIBUTE SPREADS — pick one. Each spends the whole creation budget, so these are the final values before your background's grants are added on top:\n\n${spreads}`,
    `SKILL SHAPES — pick one. The numbers are fixed; you choose which skill goes on each, strongest first:\n\n${shapes}`,
    `THE SKILLS, what each covers, and the attribute it rolls with:\n\n${skills}`,
    `Your background's skill grants stack on what you buy, up to 10. Putting your highest level into a skill your background already boosts is how you get a true expert; spreading elsewhere is how you cover a job nobody else can do.`,
  ].join("\n\n");
}

/** The crew already made, and which jobs still have nobody in them. This is what makes going in order matter. */
export function crewContext(crew: Character[]): string {
  if (!crew.length) return "You are the first aboard. Nobody else has been made yet, so you are choosing what this crew is built around — and the survivors made after you will see your sheet and build around it.";
  const who = crew
    .map((c) => `- ${c.name}${c.player ? ` (played by ${c.player})` : ""} — ${c.background ?? "no background"}${c.specialty ? `, ${c.specialty}` : ""}\n    ${buildLine(c)}`)
    .join("\n");
  const best = (key: SkillKey) => Math.max(0, ...crew.map((c) => skillLevel(c, key)));
  const gaps = SKILLS.filter((s) => best(s.key) === 0).map((s) => s.name);
  const covered = SKILLS.filter((s) => best(s.key) > 0)
    .sort((a, b) => best(b.key) - best(a.key))
    .map((s) => `${s.name} ${best(s.key)}`)
    .join(", ");
  return [
    `THE CREW SO FAR, in the order they were made:\n${who}`,
    `Between them they cover: ${covered}.`,
    gaps.length ? `Nobody aboard has any level in: ${gaps.join(", ")}.` : "Every skill has someone with at least a level in it.",
  ].join("\n\n");
}
