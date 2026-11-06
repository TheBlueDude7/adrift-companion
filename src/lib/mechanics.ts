import { AFFLICTIONS } from "@/data/compendium";
import { INJURY_BY_CODE } from "@/data/injuries";
import { moduleLevel } from "./crafting";
import { growCrops } from "./crops";
import { d, rollPool, sixes, uid } from "./dice";
import { attributeValue, maxEnergy, maxHp, maxWillpower, skillLevel } from "./derive";
import { addInjuryFromRoll, canHealNaturally, effectiveSeverity, type InjuryRoll } from "./injuries";
import { runSolarPanels } from "./modules";
import { burnDailyPower } from "./power";
import {
  MIND_BREAK_BY_NAME,
  MIND_BREAKS,
  PANICKED,
  PRESSURE_STATES,
  SEGMENTS,
  pressureFloor,
  scaleDamage,
  SKILL_BY_KEY,
  xpForNextLevel,
  type ConditionDuration,
  type SkillKey,
} from "./rules";
import type { Character, FoodIntake, GameState, Injury } from "./types";

/** Add 1 XP, levelling the skill up when it reaches the next level's cost. Returns the log line. */
export function gainXp(c: Character, key: SkillKey) {
  const name = SKILL_BY_KEY[key].name;
  c.skillXp[key] += 1;
  const cost = xpForNextLevel(skillLevel(c, key));
  if (c.skillXp[key] >= cost) {
    c.skillXp[key] -= cost;
    c.skills[key] += 1;
    return `${c.name} reaches ${name} ${skillLevel(c, key)}!`;
  }
  return `${c.name} gains 1 XP in ${name} (${c.skillXp[key]}/${cost}).`;
}

export const findChar = (g: GameState, id: string) => {
  const c = g.characters.find((x) => x.id === id);
  if (!c) throw new Error("Character not found");
  return c;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function clampVitals(c: Character) {
  c.hp = clamp(c.hp, 0, maxHp(c));
  c.energy = clamp(c.energy, 0, maxEnergy(c));
  c.willpower = clamp(c.willpower, 0, maxWillpower(c));
  c.stress = clamp(c.stress, 0, 10);
  c.pressure = clamp(c.pressure, pressureFloor(c.stress), PANICKED);
  if (c.hp > 0) delete c.stabilized;
}

export function mindBreak(c: Character): string {
  const r = d(6);
  const mb = MIND_BREAKS[r - 1];
  c.conditions = c.conditions.filter((x) => !MIND_BREAK_BY_NAME[x.name]);
  c.conditions.push({ id: uid(), name: mb.name, duration: "Scene", notes: `Mind Break: ${mb.effect}` });
  let text = `${c.name} suffers a Mind Break (d6 = ${r}): ${mb.name} — ${mb.effect}`;
  if (c.stress >= 9) text += " Stress 9+: this Mind Break also causes an Affliction.";
  else if (c.stress >= 7) text += " (Unstable: the first Mind Break each expedition also causes an Affliction.)";
  return text;
}

/** Gain or lose Stress, applying the Collapsed overflow rule. */
export function changeStress(c: Character, delta: number, out: string[]) {
  if (delta < 0) {
    c.stress = clamp(c.stress + delta, 0, 10);
    out.push(`${c.name} recovers ${-delta} Stress (now ${c.stress}).`);
    return;
  }
  let applied = 0;
  for (let i = 0; i < delta; i++) {
    if (c.stress >= 10) {
      out.push(`${c.name} is Collapsed — the Stress becomes a Mind Break instead.`);
      out.push(mindBreak(c));
      continue;
    }
    c.stress += 1;
    applied += 1;
  }
  if (applied) out.push(`${c.name} gains ${applied} Stress (now ${c.stress}).`);
  if (applied && c.stress === 10) out.push(`${c.name} reaches Stress 10 (Collapsed) and immediately gains an Affliction.`);
  const floor = pressureFloor(c.stress);
  if (c.pressure < floor) {
    c.pressure = floor;
    out.push(`At Stress ${c.stress}, ${c.name}'s Pressure can't be below ${PRESSURE_STATES[floor].name}.`);
  }
}

/** Gain or lose Pressure, applying Strained and Panicked overflow rules. */
export function changePressure(g: GameState, c: Character, delta: number, out: string[]) {
  if (delta < 0) {
    const floor = pressureFloor(c.stress);
    const next = clamp(c.pressure + delta, floor, PANICKED);
    if (next === c.pressure) out.push(`${c.name}'s Pressure can't drop below ${PRESSURE_STATES[floor].name} at Stress ${c.stress}.`);
    else out.push(`${c.name}'s Pressure drops to ${PRESSURE_STATES[next].name}${next > c.pressure + delta ? ` (held there by Stress ${c.stress})` : ""}.`);
    c.pressure = next;
    return;
  }
  let steps = delta;
  if (!c.survival.pressureGainedToday && c.stress >= 3) {
    steps += 1;
    out.push(`${c.name} is Strained: the first Pressure gain today adds an extra level.`);
  }
  c.survival.pressureGainedToday = true;
  for (let i = 0; i < steps; i++) {
    if (c.pressure >= PANICKED) {
      out.push(`${c.name} gains Pressure while Panicked.`);
      out.push(mindBreak(c));
      changeStress(c, 1, out);
      continue;
    }
    c.pressure += 1;
  }
  out.push(`${c.name}'s Pressure rises to ${PRESSURE_STATES[c.pressure].name}.`);
}

/** `cover` is Cover Armor (Partial 1, Strong 2), which only counts against Ballistic damage. */
export type DamageOptions = {
  amount: number;
  useArmor: boolean;
  pierce: number;
  cover?: number;
  resistant?: boolean;
  vulnerable?: boolean;
  gainPressure: boolean;
  injury: InjuryRoll | null;
};

/**
 * Vulnerability and Resistance scale the hit first. Cover Armor then applies and doesn't wear down;
 * worn Armor absorbs 1 and loses 1 point. Armor Piercing X ignores the first X points of protection, Cover first.
 */
export function damageSteps(c: Pick<Character, "armor" | "hp">, o: Pick<DamageOptions, "amount" | "useArmor" | "pierce" | "cover" | "resistant" | "vulnerable">) {
  const scaled = scaleDamage(o.amount, !!o.resistant, !!o.vulnerable);
  const coverPoints = o.cover ?? 0;
  const cover = Math.min(scaled, Math.max(0, coverPoints - o.pierce));
  const pierceLeft = Math.max(0, o.pierce - coverPoints);
  const armor = o.useArmor && c.armor > 0 && scaled - cover > 0 && pierceLeft === 0 ? 1 : 0;
  const lost = Math.min(c.hp, scaled - cover - armor);
  return { scaled, cover, armor, pierced: o.useArmor && c.armor > 0 && pierceLeft > 0, lost };
}

export function applyDamage(g: GameState, c: Character, o: DamageOptions, out: string[]) {
  const s = damageSteps(c, o);
  if (s.scaled > o.amount) out.push(`Vulnerability raises the hit to ${s.scaled}.`);
  else if (s.scaled < o.amount) out.push(`Resistance halves the hit to ${s.scaled}.`);
  if (s.cover) out.push(`Cover absorbs ${s.cover}.`);
  if (s.armor) {
    c.armor -= 1;
    out.push(`${c.name}'s Armor absorbs 1 (Armor now ${c.armor}).`);
  } else if (s.pierced) out.push(`The attack pierces ${c.name}'s Armor.`);
  const before = c.hp;
  c.hp -= s.lost;
  out.push(`${c.name} takes ${s.lost} damage (HP ${c.hp}/${maxHp(c)}).`);
  if (o.gainPressure && s.lost > 0 && c.damagePressureRound) out.push(`${c.name} already gained Pressure from damage this round.`);
  else if (o.gainPressure && s.lost > 0) {
    c.damagePressureRound = true;
    changePressure(g, c, 1, out);
  }
  if (o.injury && before - c.hp > 0) addInjuryFromRoll(g, c, o.injury, out);
  if (c.hp === 0 && before > 0) out.push(`${c.name} is down at 0 HP — make a flat Constitution death check each round.`);
  else if (c.hp === 0 && c.stabilized && o.amount > 0) {
    delete c.stabilized;
    out.push(`${c.name} is hurt again while down: no longer stabilized, death checks resume.`);
  }
}

/** A Push costs 1 Energy and 1 Pressure. At 0 Energy it costs an Affliction instead of the Energy. */
export function payPush(g: GameState, c: Character, out: string[]) {
  if (c.energy > 0) {
    c.energy -= 1;
    out.push(`${c.name} Pushes (−1 Energy, ${c.energy} left).`);
  } else {
    out.push(`${c.name} Pushes while Exhausted, at the cost of an Affliction.`);
    const r = rollAffliction(c);
    if (r && !r.entry.name.startsWith("No Affliction")) {
      c.afflictions.push({ id: uid(), code: r.entry.code, name: r.entry.name, effect: r.entry.effect, notes: "" });
      out.push(`${c.name} gains the Affliction ${r.entry.name} (${r.cat}, ${r.n}).`);
      if (r.entry.name === "Catastrophic Dissociation") out.push("Catastrophic Dissociation: roll two additional Afflictions.");
    } else if (r) out.push(`${c.name} rolls an Affliction (${r.cat}, ${r.n}): No Affliction Here! Scot-free.`);
  }
  changePressure(g, c, 1, out);
}

export function rollAffliction(c: Character) {
  for (let tries = 0; tries < 50; tries++) {
    const cat = d(6);
    const n = d(10);
    const entry = AFFLICTIONS.find((a) => a.code === `${cat}-${n}`)!;
    if (c.afflictions.some((a) => a.code === entry.code)) continue;
    return { cat, n, entry };
  }
  return null;
}

/** An old-table Internal Bleeding halves HP recovery, rounded down. */
export const recoveredHp = (c: Character, amount: number) => (c.injuries.some((x) => x.legacy && x.name === "Internal Bleeding" && x.state !== "Treated") ? Math.floor(amount / 2) : amount);

export function rest(g: GameState, c: Character, out: string[]) {
  const s = c.survival;
  s.rests += 1;
  const fed = (s.food !== "none" || s.foodMissStreak === 0) && (s.water || s.waterMissStreak === 0);
  if (!fed) {
    out.push(`${c.name} Rests (${s.rests} today), but without both Food and Water in the last day it only counts as sleep.`);
    return;
  }
  const disrupted = c.afflictions.some((a) => a.name === "Sleep Disruption");
  if (disrupted && s.rests > 1) {
    out.push(`${c.name} Rests again, but Sleep Disruption allows only one restful Rest a day.`);
    return;
  }
  const bonus = restBonus(g);
  const hp = Math.min(maxHp(c) - c.hp, recoveredHp(c, bonus.fullHeal ? maxHp(c) : 1 + bonus.hp));
  c.hp += hp;
  const gains = [hp ? `+${hp} HP${bonus.sources.length ? ` (${bonus.sources.join(", ")})` : ""}` : c.hp < maxHp(c) ? "no HP (Internal Bleeding)" : ""];
  const minor = c.injuries.filter(canHealNaturally);
  const cured = bonus.cureMinor === "all" ? minor : bonus.cureMinor === "one" && minor.length ? [minor[Math.floor(Math.random() * minor.length)]] : [];
  if (cured.length) {
    c.injuries = c.injuries.filter((x) => !cured.includes(x));
    gains.push(`Life Support cures ${cured.map((x) => x.name).join(", ")}`);
  }

  const shock = c.injuries.find((x) => x.legacy && x.name === "Minor Shock");
  let restores = !s.restBlocked;
  if (restores && c.afflictions.some((a) => a.name === "Compulsive Distraction")) {
    const dice = rollPool(attributeValue(c, "WIT"));
    restores = sixes(dice) > 0;
    gains.push(`Compulsive Distraction Wits roll [${dice.join(", ")}] ${restores ? "passed" : "failed: no Energy"}`);
  }
  const full = maxEnergy(c) - (disrupted ? 1 : 0);
  if (restores && shock) {
    c.energy += Math.max(0, Math.ceil((full - c.energy) / 2));
    c.injuries = c.injuries.filter((x) => x.id !== shock.id);
    gains.push("half Energy restored (Minor Shock, now healed)");
  } else if (restores) {
    c.energy = Math.max(c.energy, full);
    gains.push(disrupted ? "Energy restored to 1 below max (Sleep Disruption)" : "Energy restored");
  }
  out.push(`${c.name} Rests (${s.rests} today): ${gains.filter(Boolean).join(", ") || "nothing to recover"}.`);
  for (let i = 0; i < 1 + bonus.pressure && c.pressure > pressureFloor(c.stress); i++) changePressure(g, c, -1, out);
  naturalRecovery(g, c, out);
  if (bonus.hpLoss && c.hp > 0) {
    c.hp -= 1;
    out.push(`Broken Life Support: ${c.name} loses 1 HP (HP ${c.hp}/${maxHp(c)}).`);
  }
}

/** What the ship's Life Support and Crewmate Quarters add to every Rest. */
export function restBonus(g: GameState) {
  const levels = g.ship.rooms.filter((r) => r.module === "Life Support" && r.level !== undefined && r.condition !== "Offline" && r.condition !== "Destroyed").map((r) => r.level!);
  const life = levels.length ? Math.max(...levels) : 1;
  const expanded = moduleLevel(g, "Crewmate Quarters Expanded") >= 0 && moduleLevel(g, "Crewmate Quarters") >= 0;
  const quarters = expanded ? 5 : moduleLevel(g, "Crewmate Quarters") >= 0 ? 4 : 0;
  const lifeHp = [0, 0, 3, 6, 14][life] ?? 0;
  const sources = [lifeHp && "Life Support", quarters && (expanded ? "Crewmate Quarters Expanded" : "Crewmate Quarters")].filter((x): x is string => !!x);
  return {
    hp: lifeHp + quarters,
    fullHeal: life >= 5,
    cureMinor: life >= 5 ? ("all" as const) : life === 4 ? ("one" as const) : null,
    pressure: expanded ? 1 : 0,
    hpLoss: life === 0,
    sources: life >= 5 ? ["Regenerating Life Support"] : sources,
  };
}

/** Roll Constitution + days since the injury for the oldest Treated Minor injury. Any 6 heals it. */
function naturalRecovery(g: GameState, c: Character, out: string[]) {
  const treated = c.injuries.filter((x) => x.state === "Treated" && canHealNaturally(x));
  if (!treated.length) return;
  const oldest = treated.reduce((a, b) => (a.dayReceived <= b.dayReceived ? a : b));
  const dice = rollPool(attributeValue(c, "CON") + Math.max(0, g.day - oldest.dayReceived));
  if (sixes(dice) > 0) {
    c.injuries = c.injuries.filter((x) => x.id !== oldest.id);
    out.push(`${c.name} recovers while resting [${dice.join(", ")}]: ${oldest.name} heals.`);
  } else out.push(`${c.name}'s recovery roll for ${oldest.name} [${dice.join(", ")}] found no 6.`);
}

export function advanceSegment(g: GameState): string[] {
  if (g.segment < SEGMENTS.length - 1) {
    g.segment += 1;
    for (const c of g.characters) delete c.damagePressureRound;
    return [`${SEGMENTS[g.segment]} begins.`];
  }
  return ["Night is over — run the End of Day procedure."];
}

/** Step back one segment within the day. End of Day can't be reversed this way; use Undo. */
export function previousSegment(g: GameState): string[] {
  if (g.segment === 0) return [];
  g.segment -= 1;
  return [`Back to ${SEGMENTS[g.segment]}.`];
}

export type EndOfDayInput = Record<string, { food: FoodIntake; water: boolean; slept: boolean; meal?: string; mealSkill?: SkillKey }>;

/** What a cooked meal does for whoever eats it, beyond feeding them for the day. */
export const MEAL_EFFECTS: Record<string, { xp: number; stress: number }> = {
  "Delicious Meal": { xp: 1, stress: 0 },
  "Delectable Meal": { xp: 2, stress: -1 },
};

/** A good meal's XP goes into any skill the survivor chooses, and the best of them lifts Stress. */
function eatMeal(c: Character, meal: string | undefined, skill: SkillKey | undefined, out: string[]) {
  const effect = meal ? MEAL_EFFECTS[meal] : undefined;
  if (!effect) return;
  out.push(`${c.name} eats a ${meal}.`);
  if (effect.stress) changeStress(c, effect.stress, out);
  if (!effect.xp) return;
  if (!skill) out.push(`${c.name} has ${effect.xp} XP to spend in any skill from the meal.`);
  else for (let i = 0; i < effect.xp; i++) out.push(gainXp(c, skill));
}

export function endOfDay(g: GameState, input: EndOfDayInput): string[] {
  const out: string[] = [`— End of Day ${g.day} —`];
  const discipline = g.rationDiscipline ?? { covered: false, cooldown: 0 };
  const rationedToday = g.characters.some((c) => !c.dead && (input[c.id]?.food ?? c.survival.food) === "half");
  const rationDiscipline =
    g.characters.some((c) => !c.dead && c.specialty === "Ration Discipline") && (discipline.covered || discipline.cooldown === 0);
  if (rationedToday) {
    if (!rationDiscipline && discipline.cooldown > 0) out.push(`Ration Discipline is spent: the crew needs 3 days in a row without rationing first.`);
    g.rationDiscipline = { covered: rationDiscipline, cooldown: rationDiscipline ? 0 : 3 };
  } else if (discipline.covered) g.rationDiscipline = { covered: false, cooldown: 2 };
  else if (discipline.cooldown > 0) g.rationDiscipline = { covered: false, cooldown: discipline.cooldown - 1 };
  for (const c of g.characters) {
    if (c.dead) continue;
    const i = input[c.id] ?? { food: c.survival.food, water: c.survival.water, slept: c.survival.rests > 0 };
    const s = c.survival;
    delete c.damagePressureRound;
    let penalty = 0;
    let restBlocked = false;

    // Food
    if (i.food === "full") {
      s.foodMissStreak = 0;
      s.rationStreak = 0;
      eatMeal(c, i.meal, i.mealSkill, out);
    } else if (i.food === "half" && rationDiscipline) {
      s.foodMissStreak = 0;
      s.rationStreak += 1;
      out.push(`${c.name} rationed under Ration Discipline: no Constitution roll, no rationing Stress.`);
    } else if (i.food === "half") {
      s.foodMissStreak = 0;
      s.rationStreak += 1;
      const con = attributeValue(c, "CON");
      const dice = rollPool(con);
      if (sixes(dice) === 0) {
        penalty += 1;
        out.push(`${c.name} rationed: CON roll [${dice.join(", ")}] failed, −1 Max Energy tomorrow.`);
      } else out.push(`${c.name} rationed: CON roll [${dice.join(", ")}] succeeded.`);
      if (s.rationStreak >= 2 && s.rationStreak % 2 === 0) {
        out.push(`${c.name}: two consecutive days of rationing.`);
        changeStress(c, 1, out);
      }
    } else {
      s.rationStreak = 0;
      s.foodMissStreak += 1;
      if (s.foodMissStreak === 1) {
        penalty += 1;
        out.push(`${c.name} missed Food: −1 Max Energy tomorrow.`);
      } else {
        penalty += 2;
        restBlocked = true;
        out.push(`${c.name} missed Food ${s.foodMissStreak} days running: −2 Max Energy, Rest restores no Energy.`);
        if (s.foodMissStreak % 3 === 0) changeStress(c, 1, out);
      }
    }

    // Water
    if (i.water) s.waterMissStreak = 0;
    else {
      s.waterMissStreak += 1;
      if (s.waterMissStreak === 1) {
        penalty += 2;
        out.push(`${c.name} missed Water: −2 Max Energy tomorrow.`);
      } else if (s.waterMissStreak === 2) out.push(`⚠ ${c.name} has gone 2 days without Water — death without immediate intervention.`);
      else out.push(`☠ ${c.name} has gone ${s.waterMissStreak} days without Water — death.`);
    }

    // Sleep
    if (i.slept) s.sleepMissStreak = 0;
    else {
      s.sleepMissStreak += 1;
      if (s.sleepMissStreak === 1) {
        penalty += 1;
        out.push(`${c.name} did not sleep: −1 Max Energy tomorrow.`);
      } else if (s.sleepMissStreak === 2) {
        penalty += 3;
        out.push(`${c.name} missed sleep twice: −3 Max Energy tomorrow.`);
      } else {
        out.push(`${c.name} collapses from sleep deprivation and must Rest for the next 2 segments.`);
        if (s.sleepMissStreak % 3 === 0) changeStress(c, 1, out);
      }
    }

    // Untreated injuries
    const untreated = c.injuries.filter((x) => x.state === "Untreated").length;
    if (untreated) {
      c.hp = Math.max(0, c.hp - untreated);
      out.push(`${c.name} loses ${untreated} HP from untreated injuries (HP ${c.hp}).`);
    }

    // Energy, pressure and resets
    s.energyPenalty = penalty;
    s.restBlocked = restBlocked;
    c.energy = Math.min(c.energy, maxEnergy(c));
    c.pressure = pressureFloor(c.stress);
    s.food = "none";
    s.water = false;
    s.rests = 0;
    s.pressureGainedToday = false;
    for (const key of Object.keys(c.abilityUsed)) if (key.startsWith("day:")) delete c.abilityUsed[key];
    clampVitals(c);
  }
  growCrops(g, out);
  runSolarPanels(g, out);
  burnDailyPower(g, out);
  if (g.ship.tuned) out.push("The reactor settles back to its normal output.");
  delete g.ship.tuned;
  delete g.ship.rationsStretched;
  delete g.ship.reclaimed;
  g.day += 1;
  g.segment = 0;
  out.push(`Day ${g.day} begins. Morning.`);
  return out;
}

/** Apply a condition with its immediate effects. Reapplying refreshes duration. */
export function applyCondition(g: GameState, c: Character, name: string, duration: ConditionDuration, out: string[], notes = "") {
  if (c.dead) return;
  if (name === "Drained") {
    if (c.energy > 0) {
      c.energy -= 1;
      out.push(`${c.name} is Drained: −1 Energy (${c.energy} left).`);
    } else {
      out.push(`${c.name} is Drained at 0 Energy.`);
      changePressure(g, c, 1, out);
    }
    return;
  }
  if (name === "Disarmed") {
    out.push(`${c.name} is Disarmed and drops a held item in their zone.`);
    return;
  }
  if (name === "Surprised" && c.pressure < 1) {
    c.pressure = 1;
    out.push(`${c.name} is caught off guard and becomes ${PRESSURE_STATES[1].name}.`);
  }
  const existing = c.conditions.find((x) => x.name === name);
  if (existing) {
    existing.duration = duration;
    if (name === "Bleeding" || name === "Burning") {
      c.hp = Math.max(0, c.hp - 1);
      out.push(`${c.name} is ${name} again and takes 1 ${name === "Burning" ? "Fire" : "Physical"} Damage (HP ${c.hp}).`);
    } else out.push(`${c.name}'s ${name} is refreshed (${duration}).`);
    return;
  }
  c.conditions.push({ id: uid(), name, duration, notes });
  out.push(`${c.name} is now ${name} (${duration}).`);
  if (name === "Frightened") changePressure(g, c, 1, out);
}

const LEGACY_BLEED: Record<string, number> = { "Severed Artery": 3, "Massive Hemorrhage": 2, "Traumatic Amputation": 2 };

/** Bleeding damage per round an Untreated injury causes. */
function bleedDamage(i: Injury) {
  if (i.legacy) return LEGACY_BLEED[i.name] ?? 1;
  return effectiveSeverity(i) === "Minor" ? 1 : (INJURY_BY_CODE[i.code]?.bleed ?? 1);
}

/** Resolve per-round condition effects and expire Brief conditions. */
export function endRound(g: GameState): string[] {
  const out = ["— End of round —"];
  for (const c of g.characters) {
    delete c.damagePressureRound;
    if (c.dead) continue;
    const has = (n: string) => c.conditions.some((x) => x.name === n);
    if (has("Burning")) {
      c.hp = Math.max(0, c.hp - 1);
      out.push(`${c.name} burns for 1 Fire Damage (HP ${c.hp}).`);
    }
    if (has("Bleeding")) {
      const dmg = Math.max(1, ...c.injuries.filter((i) => i.state === "Untreated").map((i) => bleedDamage(i)));
      c.hp = Math.max(0, c.hp - dmg);
      out.push(`${c.name} bleeds for ${dmg} Damage (HP ${c.hp}).`);
    }
    if (has("Suffocating")) changePressure(g, c, 1, out);
    const brief = c.conditions.filter((x) => x.duration === "Brief");
    if (brief.length) {
      c.conditions = c.conditions.filter((x) => x.duration !== "Brief");
      out.push(`${c.name}: ${brief.map((b) => b.name).join(", ")} ended.`);
    }
    if (c.hp === 0) out.push(`${c.name} is down — make a flat Constitution death check.`);
  }
  if (out.length === 1) out.push("No lingering effects this round.");
  return out;
}

/** End the current scene: clear Brief and Scene conditions and reset once-per-combat abilities. */
export function endScene(g: GameState): string[] {
  const out = ["— Scene ends —"];
  for (const c of g.characters) {
    const cleared = c.conditions.filter((x) => x.duration === "Brief" || x.duration === "Scene");
    c.conditions = c.conditions.filter((x) => x.duration !== "Brief" && x.duration !== "Scene");
    if (cleared.length) out.push(`${c.name}: ${cleared.map((b) => b.name).join(", ")} ended.`);
    for (const key of Object.keys(c.abilityUsed)) if (key.startsWith("combat:")) delete c.abilityUsed[key];
    delete c.damagePressureRound;
    const reopened = c.injuries.find((i) => !i.legacy && i.name === "Internal Bleeding" && !i.operated);
    if (reopened && !c.dead) applyCondition(g, c, "Bleeding", "Ongoing", out, "From Internal Bleeding");
  }
  const ongoing = g.characters.flatMap((c) => c.conditions.filter((x) => x.duration !== "Persistent").map((x) => `${c.name} (${x.name})`));
  if (ongoing.length) out.push(`Still active until resolved: ${ongoing.join(", ")}.`);
  return out;
}

/** End an expedition: once-per-expedition abilities are ready again, and anyone who reached Panicked gains 1 Stress. */
export function endExpedition(g: GameState, panicked: string[] = []): string[] {
  const out = ["— Expedition ends —"];
  for (const c of g.characters) {
    for (const key of Object.keys(c.abilityUsed)) if (key.startsWith("expedition:")) delete c.abilityUsed[key];
    if (!c.dead && panicked.includes(c.id)) {
      out.push(`${c.name} reached Panicked during the expedition.`);
      changeStress(c, 1, out);
    }
  }
  out.push("Once-per-expedition abilities are ready again.");
  return out;
}

export function completeAct(g: GameState): string[] {
  g.act += 1;
  for (const c of g.characters) c.willpower = maxWillpower(c);
  return [`Act ${g.act - 1} complete. All Willpower restored.`];
}
