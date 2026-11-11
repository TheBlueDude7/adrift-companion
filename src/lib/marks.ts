import { d } from "./dice";
import type { DamageType } from "./rules";
import type { ActiveCondition } from "./types";

/**
 * The five conditions that change one hit and are spent by it: Marked, Brittle, Conductive, Corroded
 * and Fortified. They belong to whoever is being hit rather than whoever is hitting, which is why
 * they sit here instead of in `CONDITION_RULES` with the dice-pool penalties.
 *
 * Nothing here is consumed on a hit that never reached the thing it was waiting for: Brittle waits
 * for a Physical or Ballistic hit, Conductive for an Electric one, and Corroded for Armor that would
 * actually have stopped something.
 */
export type Marks = {
  /** Named in the order they apply, for the log. */
  names: string[];
  /** Added to the hit before Resistance and Armor, from Brittle and Conductive. */
  bonus: number;
  /** Marked's dice. Rolled by `markDamage` when the hit lands rather than while it's previewed. */
  dice: number;
  /** Corroded: the Armor that would have stopped a point of this stops none of it. */
  armorDead: boolean;
  /** Points of Armor this hit strips beyond the usual one, from Corroded, Brittle, and a Physical system. */
  armorExtra: number;
  /** Fortified: a temporary point that absorbs before worn Armor and needs no repair. */
  temp: number;
  /** Conditions the hit itself applies, which for Conductive needs no stunt to pay for. */
  applies: string[];
  /** Spent however the hit turns out. */
  ids: string[];
  /** Fortified: spent only once its temporary point has actually absorbed something. */
  tempIds: string[];
  /** Corroded: spent only on a hit that worn Armor would otherwise have reduced. */
  armorIds: string[];
};

/** The five, for anywhere that needs to know whether a hit has one of them waiting for it. */
export const MARK_NAMES = ["Marked", "Brittle", "Conductive", "Corroded", "Fortified"] as const;
/** The three that want to know what kind of damage this was. The other two meet it the same either way. */
const TYPED: readonly string[] = ["Marked", "Brittle", "Conductive"];

export const marksWaiting = (target: { conditions: ActiveCondition[] }) => target.conditions.filter((x) => (MARK_NAMES as readonly string[]).includes(x.name)).map((x) => x.name);

/** Which of them turn on the damage type, so the type is only asked for when the answer matters. */
export const marksNeedingType = (target: { conditions: ActiveCondition[] }) => marksWaiting(target).filter((name) => TYPED.includes(name));

/** Nothing is marked, which is the ordinary case. */
export const noMarks = (): Marks => ({ names: [], bonus: 0, dice: 0, armorDead: false, armorExtra: 0, temp: 0, applies: [], ids: [], tempIds: [], armorIds: [] });

/**
 * What this hit triggers on its target. Pure: Marked's dice are counted here and rolled later, so a
 * damage preview can say what's coming without the number changing when the button is pressed.
 *
 * `type` is null when the damage has no type the app knows — the GM's own damage dialog, where they
 * may simply not have said. Marked still lands, at its lesser rate; Brittle and Conductive wait.
 */
export function marksOn(target: { conditions: ActiveCondition[] }, type: DamageType | null): Marks {
  const m = noMarks();
  const has = (name: string) => target.conditions.find((x) => x.name === name);
  const physical = type === "Physical" || type === "Ballistic";

  const marked = has("Marked");
  if (marked) {
    m.names.push("Marked");
    m.dice = physical ? 2 : 1;
    m.ids.push(marked.id);
  }
  const brittle = has("Brittle");
  if (brittle && physical) {
    m.names.push("Brittle");
    m.bonus += 1;
    m.armorExtra += 1;
    m.ids.push(brittle.id);
  }
  const conductive = has("Conductive");
  if (conductive && type === "Electric") {
    m.names.push("Conductive");
    m.bonus += 1;
    m.applies.push("Staggered");
    m.ids.push(conductive.id);
  }
  const fortified = has("Fortified");
  if (fortified) {
    m.names.push("Fortified");
    m.temp = 1;
    m.tempIds.push(fortified.id);
  }
  const corroded = has("Corroded");
  if (corroded) {
    m.names.push("Corroded");
    m.armorDead = true;
    m.armorExtra += 1;
    m.armorIds.push(corroded.id);
  }
  return m;
}

/**
 * Roll what Marked adds and total up the bonus. The rulebook writes Marked as "+2d4 if Ballistic or
 * Physical, 1d4 otherwise" against a target; since every pool in Adrift is d6 and counts 6s, dice
 * that cannot roll a 6 can only be damage, so that is what they are here.
 */
export function markDamage(m: Marks): { extra: number; lines: string[] } {
  const lines: string[] = [];
  let extra = m.bonus;
  if (m.dice) {
    const rolled = Array.from({ length: m.dice }, () => d(4));
    const sum = rolled.reduce((a, b) => a + b, 0);
    extra += sum;
    lines.push(`Marked: ${m.dice}d4 comes up [${rolled.join(", ")}], so +${sum} damage.`);
  }
  if (m.names.includes("Brittle")) lines.push("Brittle: +1 damage, and a point more of their Armor.");
  if (m.names.includes("Conductive")) lines.push("Conductive: +1 Electric damage, and Staggered with it.");
  return { extra, lines };
}

/**
 * Drop what the hit used up. The two waiting on Armor are settled by what the Armor actually did:
 * Fortified is lost "after reducing damage once" and Corroded applies "the next time Armor would
 * reduce damage", so a hit neither had a part in leaves both of them standing for the next one.
 */
export function spendMarks(target: { conditions: ActiveCondition[] }, m: Marks, used: { temp: boolean; armor: boolean }, out: string[]) {
  const spent = new Set([...m.ids, ...(used.temp ? m.tempIds : []), ...(used.armor ? m.armorIds : [])]);
  if (!spent.size) return;
  const gone = target.conditions.filter((x) => spent.has(x.id)).map((x) => x.name);
  target.conditions = target.conditions.filter((x) => !spent.has(x.id));
  out.push(`${gone.join(" and ")} ${gone.length === 1 ? "is" : "are"} spent on that hit.`);
}
