import { d, rollPool, sixes, uid } from "./dice";
import { attributeValue, rollBreakdown } from "./derive";
import { applyDamage, damageSteps } from "./mechanics";
import { PRESSURE_STATES, SKILL_BY_KEY, WEAPON_RANGES, scaleDamage, type WeaponProfile } from "./rules";
import type { Character, GameState, Item, Threat } from "./types";

/** Unarmed: Close Combat needs no weapon, so a fist is 1 Physical in your own zone. */
export const UNARMED: WeaponProfile = { damage: 1, damageType: "Physical", range: "melee", skill: "closeCombat" };

/** Cover Armor, which only counts against Ballistic damage and doesn't wear down. */
export const COVER_POINTS = { none: 0, partial: 1, strong: 2 } as const;
export type Cover = keyof typeof COVER_POINTS;

const BURST_DICE = 2;
const AIM_DICE = 1;
/** Reaching one zone past a weapon's range. */
const OVERREACH_PENALTY = 3;
/** A single hit taking this much, or dropping someone, calls for an Injury roll. */
const INJURY_THRESHOLD = 3;

export const weaponOf = (item: Item | null | undefined): WeaponProfile => item?.weapon ?? UNARMED;

/** Weapons a survivor could attack with: what they carry that has a profile, plus their fists. */
export function armed(g: GameState, characterId: string): { item: Item | null; weapon: WeaponProfile }[] {
  const carried = g.items.filter((i) => i.location === characterId && i.weapon && !i.broken && i.charges !== 0);
  return [{ item: null, weapon: UNARMED }, ...carried.map((i) => ({ item: i, weapon: i.weapon! }))];
}

export const threatOf = (g: GameState, id: string) => g.threats.find((t) => t.id === id);

export function newThreat(name: string, hp: number, armor = 0): Threat {
  return { id: uid(), name, hp, maxHp: hp, armor, resist: [], vulnerable: [], immune: [], conditions: [], downed: false, notes: "" };
}

export type AttackShot = {
  /** Zones between attacker and target. 0 is the same zone. */
  zones: number;
  cover: Cover;
  /** The Fast Action: +1d6 on this attack. */
  aim: boolean;
  /** Burst Fire: +2d6, and the extra ammunition is the GM's to track. */
  burst: boolean;
};

/** Why an attack can't be made at all, or null when it can. */
export function attackBlocker(weapon: WeaponProfile, shot: AttackShot): string | null {
  const reach = WEAPON_RANGES[weapon.range];
  if (shot.zones < 0) return "That target isn't anywhere.";
  if (shot.burst && !weapon.auto) return "That weapon isn't automatic, so it can't Burst Fire.";
  if (shot.aim && weapon.range === "melee") return "Aim helps a ranged attack, not a melee one.";
  if (shot.zones > reach + 1) return `That's ${shot.zones} zones away and the weapon reaches ${reach === 0 ? "only its own zone" : `${reach}`}.`;
  return null;
}

/**
 * The dice for an attack: Attribute + Skill + Pressure dice − injuries, then Aim, Burst Fire, and the
 * −3d6 for reaching one zone past the weapon's range.
 */
export function attackPool(c: Character, weapon: WeaponProfile, shot: AttackShot) {
  const skill = weapon.skill;
  const attr = SKILL_BY_KEY[skill].attr;
  const extras: string[] = [];
  let extra = 0;
  if (shot.aim) {
    extra += AIM_DICE;
    extras.push(`Aim +${AIM_DICE}`);
  }
  if (shot.burst) {
    extra += BURST_DICE;
    extras.push(`Burst Fire +${BURST_DICE}`);
  }
  if (shot.zones > WEAPON_RANGES[weapon.range]) {
    extra -= OVERREACH_PENALTY;
    extras.push(`beyond its range −${OVERREACH_PENALTY}`);
  }
  const b = rollBreakdown(c, skill, attr, extra);
  const parts = [`${SKILL_BY_KEY[skill].name} ${b.level} + ${attr} ${b.attrVal}`];
  if (b.pressure) parts.push(`${PRESSURE_STATES[c.pressure].name} ${b.pressure}`);
  return { dice: b.dice, parts: [...parts, ...b.hurt.sources, ...extras] };
}

/** A nonlethal weapon can't take the last point, so it stops at 1 HP. */
const capped = (hp: number, amount: number, weapon: WeaponProfile) => (weapon.nonlethal ? Math.min(amount, Math.max(0, hp - 1)) : amount);

/** A threat takes damage in the same order as a survivor, and its plating is ablative the same way. */
function hurtThreat(t: Threat, weapon: WeaponProfile, coverPoints: number, out: string[]) {
  const type = weapon.damageType;
  if (t.immune.includes(type)) {
    out.push(`${t.name} is immune to ${type} damage.`);
    return;
  }
  const amount = capped(t.hp, weapon.damage, weapon);
  const scaled = scaleDamage(amount, t.resist.includes(type), t.vulnerable.includes(type));
  if (scaled !== amount) out.push(`${t.name} ${scaled < amount ? "resists" : "is vulnerable to"} ${type}: ${amount} becomes ${scaled}.`);
  const ap = weapon.ap ?? 0;
  const points = type === "Ballistic" ? coverPoints : 0;
  const cover = Math.min(scaled, Math.max(0, points - ap));
  const armored = t.armor > 0 && scaled - cover > 0 && ap <= points ? 1 : 0;
  if (cover) out.push(`Cover stops ${cover}.`);
  if (armored) {
    t.armor -= armored;
    out.push(`${t.name}'s plating absorbs 1 (now ${t.armor}).`);
  } else if (t.armor > 0 && ap > points) out.push(`The attack pierces ${t.name}'s plating.`);
  const lost = Math.min(t.hp, Math.max(0, scaled - cover - armored));
  t.hp -= lost;
  out.push(`${t.name} takes ${lost} ${type} damage (HP ${t.hp}/${t.maxHp}).`);
  if (t.hp === 0 && !t.downed) {
    t.downed = true;
    out.push(`${t.name} is down.`);
  }
}

/**
 * A survivor takes the hit through the ordinary damage path, so Vulnerability, Resistance, Cover and
 * ablative Armor all apply in their usual order. The Injury roll is worked out first, because
 * `applyDamage` needs the 2d6 up front and only an Injury-worthy hit should carry one.
 */
function hurtCharacter(g: GameState, c: Character, weapon: WeaponProfile, coverPoints: number, out: string[]) {
  const amount = capped(c.hp, weapon.damage, weapon);
  if (amount < weapon.damage) out.push(`Nonlethal: ${c.name} can't be dropped by this, so it deals ${amount}.`);
  const vulnerable = c.conditions.some((x) => x.name === `Vulnerable: ${weapon.damageType}`);
  const opts = {
    amount,
    useArmor: true,
    pierce: weapon.ap ?? 0,
    cover: weapon.damageType === "Ballistic" ? coverPoints : 0,
    resistant: false,
    vulnerable,
  };
  const { lost } = damageSteps(c, opts);
  const hurts = lost >= INJURY_THRESHOLD || (lost > 0 && lost >= c.hp);
  applyDamage(g, c, { ...opts, gainPressure: true, injury: hurts ? { severity: d(6), location: d(6) } : null }, out);
}

export type AttackResult = { dice: number[]; hits: number; lines: string[] };

/**
 * One attack, start to finish, against a draft of the state. The pool, the roll and the damage are
 * all worked out here, so a caller can never decide whether it hit. Extra successes are reported
 * rather than spent: the rulebook leaves what a stunt buys to the fiction, so that stays the GM's.
 */
export function resolveAttack(g: GameState, attackerId: string, targetId: string, itemId: string | null, shot: AttackShot): AttackResult | { error: string } {
  const c = g.characters.find((x) => x.id === attackerId);
  if (!c) return { error: "That attacker isn't in the campaign." };
  if (c.dead) return { error: `${c.name} is dead.` };
  if (c.hp === 0) return { error: `${c.name} is down at 0 HP and can't act.` };
  const item = itemId ? g.items.find((i) => i.id === itemId) : null;
  if (itemId && !item) return { error: "That weapon isn't there." };
  if (item && item.location !== attackerId) return { error: `${c.name} isn't carrying the ${item.name}.` };
  if (item && item.broken) return { error: `The ${item.name} is broken.` };
  if (item && item.charges === 0) return { error: `The ${item.name} has no uses left.` };
  const weapon = weaponOf(item);
  const blocked = attackBlocker(weapon, shot);
  if (blocked) return { error: blocked };

  const victim = g.characters.find((x) => x.id === targetId);
  const threat = victim ? undefined : threatOf(g, targetId);
  const target = victim ?? threat;
  if (!target) return { error: "There's nothing there to attack." };
  if (victim?.dead) return { error: `${victim.name} is already dead.` };

  const pool = attackPool(c, weapon, shot);
  const dice = rollPool(pool.dice);
  const hits = sixes(dice);
  const what = item ? `the ${item.name}` : "their fists";
  const result = hits === 0 ? "a miss" : hits === 1 ? "a hit" : `a hit with ${hits - 1} success${hits === 2 ? "" : "es"} to spare`;
  const lines = [`${c.name} attacks ${target.name} with ${what} (${pool.dice}d6: ${pool.parts.join(", ")}): [${dice.join(", ")}] — ${result}.`];

  if (item?.charges !== undefined) {
    item.charges = Math.max(0, item.charges - 1);
    lines.push(`${item.name}: ${item.charges} use${item.charges === 1 ? "" : "s"} left.`);
  }
  if (c.encouraged) {
    delete c.encouraged;
    lines.push(`${c.name}'s encouragement is spent.`);
  }
  if (hits === 0) return { dice, hits, lines };

  const coverPoints = COVER_POINTS[shot.cover];
  if (threat) hurtThreat(threat, weapon, coverPoints, lines);
  else hurtCharacter(g, victim!, weapon, coverPoints, lines);

  for (const cond of weapon.applies ?? []) {
    lines.push(weapon.zone ? `Everything in that zone is ${cond.name} (${cond.duration}).` : `${target.name} is ${cond.name} (${cond.duration}) — apply it.`);
  }
  if (weapon.blast) lines.push(`Everything else in that zone takes ${weapon.blast} ${weapon.damageType} damage — apply it to each.`);
  if (hits > 1) lines.push(`${hits - 1} extra success${hits === 2 ? "" : "es"} to spend on combat stunts.`);
  return { dice, hits, lines };
}

/**
 * The end-of-round death check: a flat Constitution roll, and any 6 keeps them alive. Spending
 * Willpower on a reroll is the player's call, so it's asked for rather than assumed.
 */
export function deathCheck(c: Character, spendWillpower: boolean): string[] {
  if (c.dead) return [`${c.name} is already dead.`];
  if (c.hp > 0) return [`${c.name} isn't down.`];
  if (c.stabilized) return [`${c.name} is stabilized — no more death checks.`];
  const out: string[] = [];
  const held = (why: string) => {
    const dice = rollPool(attributeValue(c, "CON"));
    const ok = sixes(dice) > 0;
    out.push(`${c.name}'s death check${why} [${dice.join(", ")}]: ${ok ? "they hold on" : "no 6"}.`);
    return ok;
  };
  if (held("")) return out;
  if (spendWillpower && c.willpower > 0) {
    c.willpower -= 1;
    out.push(`${c.name} spends 1 Willpower to reroll (${c.willpower} left).`);
    if (held(" again")) return out;
  }
  c.dead = true;
  out.push(`☠ ${c.name} dies.`);
  return out;
}

/** Everyone who owes a death check right now, so remembering isn't the GM's job. */
export const owesDeathCheck = (g: GameState) => g.characters.filter((c) => !c.dead && c.hp === 0 && !c.stabilized);
