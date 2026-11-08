import { CONDITION_RULES, type ConditionEffect } from "@/data/conditions";
import { SKILL_BY_KEY, type Attribute, type DamageType, type SkillKey } from "./rules";
import type { Character, Threat } from "./types";

/** What is being rolled, which is what decides whether a condition's effect is in scope. */
export type RollContext = {
  skill: SkillKey | null;
  /** Null for a task that rolls no attribute at all, which narrows what can be judged in scope. */
  attr: Attribute | null;
  /** An attack rather than a Task, which several conditions treat differently. */
  attack?: boolean;
  /** The damage type of the attack, for Enraged. */
  damageType?: DamageType;
};

/** A penalty the rules won't commit to, put as a question to whoever is rolling. */
export type ConditionAsk = { key: string; condition: string; question: string; dice: number; once?: boolean };

export type ConditionPenalty = {
  /** Signed total of everything that applies without asking, plus every ask answered yes. */
  dice: number;
  sources: string[];
  /** Still unanswered, so the caller can offer them rather than quietly deciding. */
  asks: ConditionAsk[];
  /** Why this character can't act at all, if they can't. */
  blocked: string | null;
  noAim: boolean;
  noCover: boolean;
  /** Added to the damage of every hit they land. Negative, in practice. */
  damage: number;
};

const key = (name: string, i: number) => `${name}:${i}`;

/** Whether an effect's scope covers this roll, leaving aside anything it wants asked. */
function inScope(e: ConditionEffect, ctx: RollContext) {
  if (e.attack !== undefined && e.attack !== !!ctx.attack) return false;
  if (e.damageType !== undefined && e.damageType !== ctx.damageType) return false;
  const attr = ctx.skill ? SKILL_BY_KEY[ctx.skill].attr : ctx.attr;
  if (e.skills && !(ctx.skill && e.skills.includes(ctx.skill))) return false;
  // With no attribute to judge by, a penalty aimed at particular ones can't be confirmed and is
  // dropped, while one that spares particular ones is kept — in both cases the reading that doesn't
  // invent a penalty out of an unknown.
  if (e.attrs && !(attr && e.attrs.includes(attr))) return false;
  if (e.except && attr && e.except.includes(attr)) return false;
  return true;
}

const sign = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/**
 * What a character's conditions do to one roll.
 *
 * Mirrors `injuryPenalty`, with one addition: where the rules describe a scope they don't define —
 * "sight-dependent Tasks", "Tasks involving physical force" — the effect comes back in `asks`
 * instead of being applied, and stays out of the pool until someone says it belongs there. Guessing
 * would be worse than asking, because the guess would be invisible.
 */
export function conditionPenalty(c: Pick<Character, "conditions">, ctx: RollContext, answers: Record<string, boolean> = {}): ConditionPenalty {
  const out: ConditionPenalty = { dice: 0, sources: [], asks: [], blocked: null, noAim: false, noCover: false, damage: 0 };
  for (const active of c.conditions) {
    const def = CONDITION_RULES[active.name];
    if (!def) continue;
    if (def.blocks && !out.blocked) out.blocked = `${active.name}: ${def.blocks}`;
    if (def.noAim) out.noAim = true;
    if (def.noCover) out.noCover = true;
    if (def.damage) out.damage += def.damage;
    (def.effects ?? []).forEach((e, i) => {
      if (!inScope(e, ctx)) return;
      const k = key(active.name, i);
      if (e.asks && answers[k] !== true) {
        out.asks.push({ key: k, condition: active.name, question: e.asks, dice: e.dice, ...(e.once ? { once: true } : {}) });
        return;
      }
      out.dice += e.dice;
      out.sources.push(`${active.name} ${sign(e.dice)}${e.once ? " (spent)" : ""}`);
    });
  }
  return out;
}

/** The same for a threat, which carries conditions but has no skills of its own to roll. */
export const threatConditions = (t: Pick<Threat, "conditions">) => conditionPenalty({ conditions: t.conditions }, { skill: null, attr: "STR" });
