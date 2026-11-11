import {
  BIO_MILESTONE,
  BIO_TEMP_HP,
  BIO_TIER_LABEL,
  STRESS_GATE,
  SURGE_BY_PRESSURE,
  TIER_THREE_SURGE,
  dampenSurge,
  type BioDef,
  type BioTier,
  type BioTree,
} from "@/data/biology";
import { bioDef, biologyCatalogue } from "./bio-catalogue";
import { dampening } from "./cyber";
import type { Character, GameState } from "./types";

export type Grown = { inst: NonNullable<Character["biology"]>[number]; def: BioDef };

/**
 * What a survivor is carrying, as far as this side of the wire can name it.
 *
 * Anything unnameable is dropped rather than guessed at. On the server that never happens; in a
 * player's browser it can only happen for a graft the GM forced of something the crew never
 * cultivated, which `biologyFor` sends along for exactly this reason.
 */
export function grown(c: Character | undefined): Grown[] {
  return (c?.biology ?? []).flatMap((inst) => (bioDef(inst.key) ? [{ inst, def: bioDef(inst.key) }] : []));
}

export const grownIn = (c: Character | undefined, tree: BioTree) => grown(c).filter((x) => x.def.tree === tree);

/**
 * Biological Surge Dice, added to any roll an augmentation applies to.
 *
 * The pool is built from how badly its owner is coping: Pressure pays the most, every Affliction they
 * carry adds one, and Cybernetic Dampening takes one away for every two points of it. That last term
 * is why the two paths pull against each other — Dampening is what cybernetics hand out for carrying
 * Load, and it buys calm, which is the one thing biology cannot use.
 */
export function surgeDice(c: Character) {
  const parts: string[] = [];
  const pressure = SURGE_BY_PRESSURE[Math.min(c.pressure, SURGE_BY_PRESSURE.length - 1)] ?? 0;
  if (pressure) parts.push(`Pressure ${pressure}`);
  const afflictions = c.afflictions.length;
  if (afflictions) parts.push(`${afflictions} Affliction${afflictions === 1 ? "" : "s"} ${afflictions}`);
  const damp = dampenSurge(dampening(c));
  if (damp) parts.push(`Dampening −${damp}`);
  return { dice: Math.max(0, pressure + afflictions - damp), parts, pressure, afflictions, dampened: damp };
}

/**
 * What Tier III augmentations add on top at five or more Stress: two dice each, and no more than six
 * from this source however many of them there are. The ceiling is on the bonus rather than the whole
 * pool, because the Pressure ladder already reaches six on its own at Panicked — a cap on everything
 * would mean a Tier III augmentation did nothing in exactly the state it is built for.
 */
export function tierThreeSurge(c: Character) {
  if (c.stress < STRESS_GATE.tierThree) return 0;
  const third = grown(c).filter((x) => x.def.tier === 3).length;
  return Math.min(third * TIER_THREE_SURGE.each, TIER_THREE_SURGE.cap);
}

/** The whole Surge pool for a roll an augmentation applies to, bonus included. */
export function surgePool(c: Character) {
  const base = surgeDice(c);
  const third = tierThreeSurge(c);
  return { dice: base.dice + third, parts: [...base.parts, ...(third ? [`Tier III ${third}`] : [])], third };
}

/** Stress Expressions are live from 3 Stress, at the price of a flat Constitution roll against the Backlash. */
export const expressionsLive = (c: Character) => c.stress >= STRESS_GATE.expression;

/** From 6 Stress, one Surge Die a Scene may be made a 6 after rolling — and the Backlash lands regardless. */
export const certaintyLive = (c: Character) => c.stress >= STRESS_GATE.certainty;

export const bioMaxHp = (c: Character) => grown(c).reduce((s, x) => s + (x.def.bonus?.maxHp ?? 0), 0);

/**
 * Maximum Energy from augmentations: what they each grant, plus one for every third augmentation
 * grown. The milestone is the path's reward for breadth rather than depth, and it comes with the
 * ability to regrow a part of the body that otherwise could not be regrown.
 */
export const bioMaxEnergy = (c: Character) => grown(c).reduce((s, x) => s + (x.def.bonus?.maxEnergy ?? 0), 0) + milestones(c);

/** How many times the every-third-augmentation milestone has been reached. */
export const milestones = (c: Character) => Math.floor(grown(c).length / BIO_MILESTONE);

/** Temporary HP every augmentation is worth at the start of a combat, which is where stacking tells. */
export const bioTempHp = (c: Character) => grown(c).length * BIO_TEMP_HP;

/** The integrated attacks an augmented body has of its own, needing no weapon in hand. */
export const bioAttacks = (c: Character) => grown(c).filter((x) => x.def.attack);

/**
 * Nothing biological is known until the lab grows it.
 *
 * This is where the path parts company with cybernetics, which hands every crew its Tier I from the
 * start. Human engineering is known technology somebody could have read about; what the dark can be
 * made to do is not. So the whole catalogue is dark until a Biological Cultivation project turns a
 * strain up, and a crew's own trees are the only map of the path they ever get.
 */
export const isBioUnlocked = (g: GameState, def: BioDef) => (g.research.biology ?? []).includes(def.key);

/** Two cultivations at the tier below open the next one, all the way up each tree. */
export function bioTierReady(g: GameState, tree: BioTree, tier: BioTier) {
  if (tier === 1) return true;
  return biologyCatalogue().filter((d) => d.tree === tree && d.tier === tier - 1 && isBioUnlocked(g, d)).length >= 2;
}

/** Why the crew hasn't got this augmentation to grow yet, or null. */
export function bioResearchBlocker(g: GameState, def: BioDef): string | null {
  if (isBioUnlocked(g, def)) return null;
  const tree = def.tree === "adaptive" ? "Adaptive" : "Utility";
  if (!bioTierReady(g, def.tree, def.tier)) return `Needs two ${BIO_TIER_LABEL[(def.tier - 1) as BioTier]} ${tree} augmentations cultivated first`;
  return `Needs a ${BIO_TIER_LABEL[def.tier]} ${tree} cultivation project`;
}

/**
 * Why this augmentation can't be grown into this survivor, or null.
 *
 * There is no cap on how many anyone carries — breadth is the point of the path, and the every-third
 * milestone says so outright. What stops a graft is only ever that they already have it, that the
 * crew hasn't found it, or that they're dead.
 */
export function growBlocker(g: GameState, c: Character, def: BioDef): string | null {
  if (c.dead) return "They're dead";
  if (grown(c).some((x) => x.def.key === def.key)) return "They already have it";
  return bioResearchBlocker(g, def);
}

/** Every augmentation this side knows about, by tree and tier, for the catalogue. */
export const biologyByTier = (tree: BioTree) =>
  ([1, 2, 3] as const).map((tier) => ({ tier, list: biologyCatalogue().filter((d) => d.tree === tree && d.tier === tier) }));
