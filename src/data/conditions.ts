import type { Attribute, DamageType, SkillKey } from "@/lib/rules";

/**
 * One thing a condition does to a dice pool. The compendium states these in prose, which reads well
 * and computes not at all, so they are written out again here in a form the app can apply.
 *
 * A condition can have several: Disoriented costs everyone a die and Perception and Navigation four
 * more on top.
 */
export type ConditionEffect = {
  /** Signed, because Enraged is the one that gives dice rather than taking them. */
  dice: number;
  /** Narrowed to these skills, or these attributes. Hits every roll when neither is given. */
  skills?: SkillKey[];
  attrs?: Attribute[];
  /** Spares these attributes when it would otherwise hit everything. */
  except?: Attribute[];
  /** `true` for attacks only, `false` for everything but attacks. */
  attack?: boolean;
  /** Attacks of this damage type only, which the weapon already knows. */
  damageType?: DamageType;
  /**
   * The rules leave the scope to a ruling — "sight-dependent", "involving physical force", "Tasks
   * requiring that arm" — so the app asks instead of guessing. Phrased as a yes/no question put to
   * whoever is rolling, because a wrong guess here is worse than a question.
   */
  asks?: string;
  /** Spent on the next roll rather than lasting, so the app reminds rather than keeps charging. */
  once?: boolean;
};

export type ConditionRules = {
  effects?: ConditionEffect[];
  /** Weakened: every hit it deals lands for one less. */
  damage?: number;
  /** Exposed: Cover stops counting for it. */
  noCover?: boolean;
  /** No Fast Action to spend, so no Aim. */
  noAim?: boolean;
  /** Can't act at all. The text is the reason, shown where an attack is refused. */
  blocks?: string;
};

/**
 * Only the conditions that change a number. The other half of the list — Pinned, Grappled, Hidden,
 * Compelled and the rest — constrains what a character may do rather than how well, and belongs to
 * the table rather than the app.
 *
 * Deliberately absent: Marked, Brittle, Conductive, Corroded and Fortified all modify the *next hit
 * against* whoever carries them and are consumed by it, which is a different shape of rule from a
 * dice-pool entry. Those live in `lib/marks.ts` and are applied in the damage path.
 */
export const CONDITION_RULES: Record<string, ConditionRules> = {
  // "cannot take a Reaction or Fast Action", and Aim is a Fast Action.
  Surprised: { noAim: true },
  Prone: { effects: [{ dice: -2, skills: ["closeCombat"], attack: true }] },
  Exposed: { noCover: true },
  Blinded: { effects: [{ dice: -5, asks: "Does this depend on seeing?" }] },
  Deafened: { effects: [{ dice: -3, skills: ["perception"], asks: "Does this depend on hearing?" }] },
  Disoriented: {
    noAim: true,
    effects: [
      { dice: -4, skills: ["perception", "navigation"] },
      { dice: -1, except: ["CON"] },
    ],
  },
  // The rules give −2d6 to skill rolls and −1d6 to attack rolls against the source. An attack is a
  // skill roll, so the two are split here rather than stacked, which is the reading that doesn't
  // make an attack worse than a non-attack.
  Frightened: {
    effects: [
      { dice: -1, attack: true, asks: "Against the thing that frightened them?" },
      { dice: -2, attack: false, asks: "Against the thing that frightened them?" },
    ],
  },
  Weakened: { damage: -1, effects: [{ dice: -2, asks: "Does this take physical force?" }] },
  Crippled: { effects: [{ dice: -3, asks: "Does this need the crippled limb?" }] },
  Overheated: { effects: [{ dice: -2, asks: "Is this strenuous and physical?" }] },
  Overloaded: { effects: [{ dice: -2, once: true }] },
  Poisoned: { effects: [{ dice: -2, attrs: ["STR", "CON"] }] },
  Freezing: {
    effects: [
      { dice: -2, skills: ["acrobatics"] },
      { dice: -2, asks: "Is this fine-motor work?" },
    ],
  },
  Enraged: { effects: [{ dice: 2, attack: true, damageType: "Physical" }] },
  Confused: { effects: [{ dice: -3, asks: "Taking the −3d6 rather than losing the Fast Action?" }] },

  // Mind Breaks are kept as conditions too, and two of them stop a character acting outright.
  "Freeze Response": { blocks: "is frozen and can't act." },
  "Total Shutdown": { blocks: "is unconscious." },
  Dissociation: { effects: [{ dice: -6 }] },
  "Violent Outburst": { effects: [{ dice: -6 }] },
};
