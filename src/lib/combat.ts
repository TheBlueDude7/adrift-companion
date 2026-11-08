import { conditionPenalty } from "./conditions";
import { d, rollPool, sixes, uid } from "./dice";
import { attributeValue, rollBreakdown } from "./derive";
import { applyDamage, damageSteps } from "./mechanics";
import { zoneDistance } from "./expedition";
import { borderTransparent, COVER_POINTS, PRESSURE_STATES, SKILL_BY_KEY, WEAPON_RANGES, scaleDamage, threatBand, type Cover, type DamageType, type WeaponProfile } from "./rules";
import type { Character, GameState, Item, KnownDefense, Line, Threat, ThreatStats } from "./types";

/** Unarmed: Close Combat needs no weapon, so a fist is 1 Physical in your own zone. */
export const UNARMED: WeaponProfile = { damage: 1, damageType: "Physical", range: "melee", skill: "closeCombat" };

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
  const stats: ThreatStats = { hp, maxHp: hp, armor, resist: [], vulnerable: [], immune: [], notes: "" };
  return { id: uid(), name, band: threatBand(hp, hp), conditions: [], known: { defenses: [], facts: [] }, stats };
}

/** What a threat's own numbers say about a damage type, for the GM to hand over after an Analyze. */
export function defenseOf(s: ThreatStats, type: DamageType): KnownDefense["effect"] {
  if (s.immune.includes(type)) return "immune";
  if (s.resist.includes(type)) return "resists";
  if (s.vulnerable.includes(type)) return "vulnerable";
  return "normal";
}

export type AttackShot = {
  /** Zones between attacker and target. 0 is the same zone. */
  zones: number;
  cover: Cover;
  /** The Fast Action: +1d6 on this attack. */
  aim: boolean;
  /** Burst Fire: +2d6, and the extra ammunition is the GM's to track. */
  burst: boolean;
  /** Answers to the condition penalties the rules leave to a ruling, keyed as `conditionPenalty` asks. */
  answers?: Record<string, boolean>;
};

/**
 * What the site says about a shot: how far the target is, and what they have to hide behind.
 *
 * Null when the map can't say — no expedition, or one of them isn't standing anywhere on it — and
 * then the numbers in the dialog stand. Distance is counted along borders you can see through, so a
 * closed door between two zones is a reason you can't shoot rather than a zone of distance.
 */
export function sightline(g: GameState, attackerId: string, targetId: string): { zones: number; cover: Cover } | { blocked: string } | null {
  const e = g.expedition;
  if (!e?.zones.length) return null;
  const threat = threatOf(g, targetId);
  const here = e.zones.find((z) => z.id === e.at[attackerId]);
  const there = e.zones.find((z) => z.id === (threat ? threat.zone : e.at[targetId]));
  if (!here || !there) return null;
  const zones = zoneDistance(e, here.id, there.id, borderTransparent);
  if (zones === null) return { blocked: `There's no seeing ${there.seen ? `the ${there.name}` : "where that is"} from the ${here.name}.` };
  return { zones, cover: there.cover };
}

/** How this character's conditions bear on this particular attack. */
export const attackConditions = (c: Character, weapon: WeaponProfile, shot: AttackShot) =>
  conditionPenalty(c, { skill: weapon.skill, attr: SKILL_BY_KEY[weapon.skill].attr, attack: true, damageType: weapon.damageType }, shot.answers);

/** Why an attack can't be made at all, or null when it can. */
export function attackBlocker(weapon: WeaponProfile, shot: AttackShot, c?: Character): string | null {
  const reach = WEAPON_RANGES[weapon.range];
  const cond = c ? attackConditions(c, weapon, shot) : null;
  if (cond?.blocked) return `${c!.name} ${cond.blocked}`;
  if (shot.zones < 0) return "That target isn't anywhere.";
  if (shot.burst && !weapon.auto) return "That weapon isn't automatic, so it can't Burst Fire.";
  if (shot.aim && weapon.range === "melee") return "Aim helps a ranged attack, not a melee one.";
  if (shot.aim && cond?.noAim) return `${c!.name} has no Fast Action to Aim with.`;
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
  if (c.encouraged) {
    extra += 1;
    extras.push("Encouraged +1");
  }
  const cond = attackConditions(c, weapon, shot);
  extra += cond.dice;
  const b = rollBreakdown(c, skill, attr, extra);
  const parts = [`${SKILL_BY_KEY[skill].name} ${b.level} + ${attr} ${b.attrVal}`];
  if (b.pressure) parts.push(`${PRESSURE_STATES[c.pressure].name} ${b.pressure}`);
  return { dice: b.dice, parts: [...parts, ...b.hurt.sources, ...cond.sources, ...extras], asks: cond.asks };
}

/** A nonlethal weapon can't take the last point, so it stops at 1 HP. */
const capped = (hp: number, amount: number, weapon: WeaponProfile) => (weapon.nonlethal ? Math.min(amount, Math.max(0, hp - 1)) : amount);

/**
 * What the crew can see of a hit landing. Players are told how well it worked, never by how much,
 * so they infer armor and Resistance from the fiction the way the rulebook assumes — and so the GM
 * keeps the room to describe a reaction wrongly when something says they should.
 */
function visibleEffect(t: Threat, raw: number, lost: number, dropped: boolean): string {
  if (dropped) return `${t.name} goes down.`;
  if (raw === 0) return `It catches ${t.name} squarely.`;
  if (lost === 0) return `The hit lands on ${t.name} and does nothing at all.`;
  if (lost >= raw) return `It tells on ${t.name}.`;
  return lost * 2 <= raw ? `${t.name} barely flinches.` : `${t.name} takes it, though less of it than you'd hoped.`;
}

/** A threat takes damage in the same order as a survivor, and its plating is ablative the same way. */
function hurtThreat(t: Threat, weapon: WeaponProfile, damage: number, coverPoints: number, out: Line[]) {
  const s = t.stats;
  // Only ever called on the server or the GM's own device, both of which hold the numbers.
  if (!s) return;
  const type = weapon.damageType;
  const raw = capped(s.hp, damage, weapon);
  const gm: string[] = [];
  let lost = 0;
  if (s.immune.includes(type)) {
    gm.push(`${t.name} is immune to ${type} damage.`);
  } else {
    const scaled = scaleDamage(raw, s.resist.includes(type), s.vulnerable.includes(type));
    if (scaled !== raw) gm.push(`${t.name} ${scaled < raw ? "resists" : "is vulnerable to"} ${type}: ${raw} becomes ${scaled}.`);
    const ap = weapon.ap ?? 0;
    const points = type === "Ballistic" ? coverPoints : 0;
    const cover = Math.min(scaled, Math.max(0, points - ap));
    const armored = s.armor > 0 && scaled - cover > 0 && ap <= points ? 1 : 0;
    if (cover) gm.push(`Cover stops ${cover}.`);
    if (armored) {
      s.armor -= armored;
      gm.push(`${t.name}'s plating absorbs 1 (now ${s.armor}).`);
    } else if (s.armor > 0 && ap > points) gm.push(`The attack pierces ${t.name}'s plating.`);
    lost = Math.min(s.hp, Math.max(0, scaled - cover - armored));
    s.hp -= lost;
    gm.push(`${t.name} takes ${lost} ${type} damage (HP ${s.hp}/${s.maxHp}).`);
  }
  const was = t.band;
  t.band = threatBand(s.hp, s.maxHp);
  out.push({ text: visibleEffect(t, raw, lost, t.band === "down" && was !== "down") });
  for (const text of gm) out.push({ text, gm: true });
}

/**
 * A survivor takes the hit through the ordinary damage path, so Vulnerability, Resistance, Cover and
 * ablative Armor all apply in their usual order. None of it is hidden: a crew sees its own wounds.
 * The Injury roll is worked out first, because `applyDamage` needs the 2d6 up front and only an
 * Injury-worthy hit should carry one.
 */
function hurtCharacter(g: GameState, c: Character, weapon: WeaponProfile, damage: number, coverPoints: number, out: Line[]) {
  const amount = capped(c.hp, damage, weapon);
  const said: string[] = [];
  if (amount < damage) said.push(`Nonlethal: ${c.name} can't be dropped by this, so it deals ${amount}.`);
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
  applyDamage(g, c, { ...opts, gainPressure: true, injury: hurts ? { severity: d(6), location: d(6) } : null }, said);
  for (const text of said) out.push({ text });
}

export type AttackResult = { dice: number[]; hits: number; lines: Line[] };

/**
 * One attack, start to finish, against a draft of the state. The pool, the roll and the damage are
 * all worked out here, so a caller can never decide whether it hit. Extra successes are reported
 * rather than spent: the rulebook leaves what a stunt buys to the fiction, so that stays the GM's.
 */
export function resolveAttack(g: GameState, attackerId: string, targetId: string, itemId: string | null, asked: AttackShot): AttackResult | { error: string } {
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

  const victim = g.characters.find((x) => x.id === targetId);
  const threat = victim ? undefined : threatOf(g, targetId);
  const target = victim ?? threat;
  if (!target) return { error: "There's nothing there to attack." };
  if (victim?.dead) return { error: `${victim.name} is already dead.` };
  if (threat && !threat.stats) return { error: "Only the GM's copy of the campaign can resolve that." };

  // Where the site puts the two of them settles the range and the cover. Only when it can't say
  // does the attacker's own account of the distance stand.
  const seen = sightline(g, attackerId, targetId);
  if (seen && "blocked" in seen) return { error: seen.blocked };
  const shot = seen ? { ...asked, zones: seen.zones, cover: seen.cover } : asked;

  const blocked = attackBlocker(weapon, shot, c);
  if (blocked) return { error: blocked };

  const pool = attackPool(c, weapon, shot);
  const dice = rollPool(pool.dice);
  const hits = sixes(dice);
  const what = item ? `the ${item.name}` : "their fists";
  const result = hits === 0 ? "a miss" : hits === 1 ? "a hit" : `a hit with ${hits - 1} success${hits === 2 ? "" : "es"} to spare`;
  const lines: Line[] = [{ text: `${c.name} attacks ${target.name} with ${what} (${pool.dice}d6: ${pool.parts.join(", ")}): [${dice.join(", ")}] — ${result}.` }];

  if (item?.charges !== undefined) {
    item.charges = Math.max(0, item.charges - 1);
    lines.push({ text: `${item.name}: ${item.charges} use${item.charges === 1 ? "" : "s"} left.` });
  }
  if (c.encouraged) {
    delete c.encouraged;
    lines.push({ text: `${c.name}'s encouragement is spent.` });
  }
  if (hits === 0) return { dice, hits, lines };

  // Weakened takes a point off everything the attacker lands; Exposed stops the target's Cover counting.
  const hurt = attackConditions(c, weapon, shot).damage;
  const damage = Math.max(0, weapon.damage + hurt);
  if (hurt) lines.push({ text: `${c.name} is weakened, so it lands for ${damage} rather than ${weapon.damage}.` });
  const exposed = conditionPenalty(target, { skill: null, attr: "STR" }).noCover;
  const coverPoints = exposed ? 0 : COVER_POINTS[shot.cover];
  if (exposed && shot.cover !== "none") lines.push({ text: `${target.name} is Exposed, so cover doesn't help it.` });
  if (threat) hurtThreat(threat, weapon, damage, coverPoints, lines);
  else hurtCharacter(g, victim!, weapon, damage, coverPoints, lines);

  for (const cond of weapon.applies ?? []) {
    lines.push({ text: weapon.zone ? `Everything in that zone is ${cond.name} (${cond.duration}).` : `${target.name} is ${cond.name} (${cond.duration}) — apply it.` });
  }
  if (weapon.blast) lines.push({ text: `Everything else in that zone takes ${weapon.blast} ${weapon.damageType} damage — apply it to each.` });
  if (hits > 1) lines.push({ text: `${hits - 1} extra success${hits === 2 ? "" : "es"} to spend on combat stunts.` });
  return { dice, hits, lines };
}

/**
 * The end-of-round death check: a flat Constitution roll, and any 6 keeps them alive. Spending
 * Willpower on a reroll is the player's call, so it's asked for rather than assumed.
 */
export function deathCheck(c: Character, spendWillpower: boolean): Line[] {
  if (c.dead) return [{ text: `${c.name} is already dead.` }];
  if (c.hp > 0) return [{ text: `${c.name} isn't down.` }];
  if (c.stabilized) return [{ text: `${c.name} is stabilized — no more death checks.` }];
  const out: Line[] = [];
  const held = (why: string) => {
    const dice = rollPool(attributeValue(c, "CON"));
    const ok = sixes(dice) > 0;
    out.push({ text: `${c.name}'s death check${why} [${dice.join(", ")}]: ${ok ? "they hold on" : "no 6"}.` });
    return ok;
  };
  if (held("")) return out;
  if (spendWillpower && c.willpower > 0) {
    c.willpower -= 1;
    out.push({ text: `${c.name} spends 1 Willpower to reroll (${c.willpower} left).` });
    if (held(" again")) return out;
  }
  c.dead = true;
  out.push({ text: `☠ ${c.name} dies.` });
  return out;
}

/** Everyone who owes a death check right now, so remembering isn't the GM's job. */
export const owesDeathCheck = (g: GameState) => g.characters.filter((c) => !c.dead && c.hp === 0 && !c.stabilized);
