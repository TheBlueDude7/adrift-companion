import type { DamageType } from "./cybernetics";

export type BioTier = 1 | 2 | 3;

/** The two things a biological upgrade can be built for. They are separate trees a character draws from. */
export type BioTree = "adaptive" | "utility";

export type BioCategory =
  | "Regenerative"
  | "Defensive"
  | "Sensory"
  | "Physical"
  | "Ballistic"
  | "Chemical"
  | "Fire"
  | "Electric"
  | "Control"
  | "Symbiotic"
  | "Environmental"
  | "Movement"
  | "Reactive"
  | "Utility";

/**
 * One biological upgrade.
 *
 * Unlike a cybernetic, an augmentation has no body location and no Load: it is grown into whoever
 * takes it. What it costs instead is written into the upgrade itself, as a Backlash paid when its
 * Stress Expression is used and, for a good many of them, a standing increase in what the body needs
 * to be fed.
 */
export type BioDef = {
  key: string;
  name: string;
  tree: BioTree;
  tier: BioTier;
  /** Every category it reads as, which is how the document labels them ("Chemical/Control"). */
  categories: BioCategory[];
  effects: string[];
  /** Active while its owner carries 3 or more Stress. Absent on the few that have none. */
  expression?: string;
  /** Paid when the Stress Expression is used and the flat Constitution roll fails. */
  backlash?: string;
  /** Flat bonuses it always gives, which the app applies rather than leaving on the page. */
  bonus?: { maxHp?: number; maxEnergy?: number };
  /** An integrated attack it grants: damage before Surge Dice, and its type. */
  attack?: { damage: number; type: DamageType; range: "melee" | "close" | "long" };
  /** Set where the document leaves something to the table. */
  note?: string;
};

/**
 * Biological Surge Dice by Pressure. The path is built the other way round from every other: it pays
 * out when its owner is in the worst state, which is why a biological crew member is at their most
 * dangerous on the day you would least like to be standing near them.
 */
export const SURGE_BY_PRESSURE = [0, 1, 2, 4, 6];

/**
 * Stress thresholds the path turns on.
 *
 * `expression` is where every augmentation's Stress Expression becomes available — at the price of a
 * flat Constitution roll, failing which its Backlash lands. `tierThree` is where each Tier III
 * augmentation adds two more Surge Dice. `certainty` is where one Surge Die a Scene may be turned
 * into a 6 after rolling, which triggers the Backlash without a roll to avoid it.
 */
export const STRESS_GATE = { expression: 3, tierThree: 5, certainty: 6 };

/**
 * What a Tier III augmentation adds to the pool at 5+ Stress, and the most that bonus may reach.
 *
 * The cap is where the path's depth is rewarded, so it is set at six Tier III augmentations rather
 * than three. Everything else a grown body gets for breadth is bounded — Temporary HP by the body it
 * is poured into, Maximum Energy by a flat ceiling — and this is the one term meant to keep climbing
 * for a crew who committed to the trees. Six Tier IIIs is a campaign's worth of cultivation.
 */
export const TIER_THREE_SURGE = { each: 2, cap: 12 };

/** Temporary HP each augmentation is worth at the start of a combat. */
export const BIO_TEMP_HP = 2;

/**
 * The most Temporary HP a grown body can put up, as a share of its own Maximum HP.
 *
 * Two points per augmentation with nothing stopping it meant a deep build walked into a fight with
 * more borrowed flesh than it had body — forty-eight points of it on a twenty-two point frame, back
 * again free at the start of the next fight. The ceiling keeps the grafts worth taking while leaving
 * the damage tables something to bite.
 */
export const TEMP_HP_CEILING = 0.5;

/**
 * Every this many augmentations is worth +1 Maximum Energy, and lets its owner regrow a part of the
 * body that could not otherwise be regrown.
 */
export const BIO_MILESTONE = 3;

/**
 * The most Maximum Energy the every-third-augmentation milestone may add.
 *
 * Energy is the day's currency, so an uncapped milestone bought a third again as many tasks as the
 * rest of the crew could take, which is a bigger advantage than anything the combat tables hand out.
 * The regrowth the milestone also grants is not capped: that one is fiction, not economy.
 */
export const BIO_MILESTONE_CAP = 4;

/** Combat regeneration stops here, whatever grants it. */
export const REGEN_CEILING = 0.5;

/**
 * How much of the Surge pool Cybernetic Dampening takes away: one die for every two points of it.
 * Dampening is what cybernetics hand out for carrying Load, so the two paths genuinely pull against
 * each other — a heavily chromed body feels less, and feeling is what biology runs on.
 */
export const dampenSurge = (dampening: number) => Math.floor(dampening / 2);

export const BIO_TIER_LABEL: Record<BioTier, string> = { 1: "Tier I", 2: "Tier II", 3: "Tier III" };

/** What it takes to find an augmentation at all, and then to grow one into somebody. */
export const CULTIVATE_TASK = "Nothing biological is known until the lab grows it. Biological Cultivation is a Ship Project at every tier: Wits + Biology in a Biological Lab, committing Scrapped Biomass and Chemical Mixture at the start, and an extracted Research Trait from Tier II up. Two cultivations in a tree open the tier above it.";
export const GRAFT_TASK = "Growing one into a survivor is a Surgery Task in a Medical Bay, as an implant would be. It takes hold over a full Rest, and a failed graft costs the committed biomass.";

export const BIO_TREES: { key: BioTree; name: string; focus: string }[] = [
  { key: "adaptive", name: "Adaptive", focus: "Surviving a fight, and ending one: regeneration, armour, integrated weapons, and control of a zone" },
  { key: "utility", name: "Utility", focus: "Surviving the voyage: Energy, Food and Water, Rest, Projects, and working where nobody should be able to" },
];
