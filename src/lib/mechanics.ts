import { AFFLICTIONS, INJURIES } from "@/data/compendium";
import { growCrops } from "./crops";
import { d, rollPool, sixes, uid } from "./dice";
import { attributeValue, maxEnergy, maxHp, maxWillpower, skillLevel } from "./derive";
import {
  MIND_BREAK_BY_NAME,
  MIND_BREAKS,
  PANICKED,
  PRESSURE_STATES,
  SEGMENTS,
  pressureFloor,
  severityFromRoll,
  SKILL_BY_KEY,
  xpForNextLevel,
  type ConditionDuration,
  type SkillKey,
} from "./rules";
import type { Character, FoodIntake, GameState } from "./types";

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
  if (!c.survival.pressureGainedToday && c.stress >= 3 && c.stress <= 4) {
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

export type InjuryRoll = { severity: number; injury: number };
export type DamageOptions = { amount: number; useArmor: boolean; pierce: number; gainPressure: boolean; injury: InjuryRoll | null };

export function applyDamage(g: GameState, c: Character, o: DamageOptions, out: string[]) {
  let dmg = o.amount;
  if (o.useArmor && c.armor > 0 && dmg > 0) {
    const effective = Math.max(0, c.armor - o.pierce);
    if (effective > 0) {
      dmg -= 1;
      c.armor -= 1;
      out.push(`${c.name}'s Armor absorbs 1 (Armor now ${c.armor}).`);
    }
  }
  const before = c.hp;
  c.hp = Math.max(0, c.hp - dmg);
  out.push(`${c.name} takes ${before - c.hp} damage (HP ${c.hp}/${maxHp(c)}).`);
  if (o.gainPressure && before - c.hp > 0) changePressure(g, c, 1, out);
  if (o.injury && before - c.hp > 0) addInjuryFromRoll(g, c, o.injury, out);
  if (c.hp === 0 && before > 0) out.push(`${c.name} is down at 0 HP — make a flat Constitution death check each round.`);
}

/** The Injury table entry for a 1d6 Severity roll and a 1d10 Injury roll made at the table. */
export function injuryFor(roll: InjuryRoll) {
  return INJURIES.find((i) => i.code === `${roll.severity}-${roll.injury}`);
}

export function addInjuryFromRoll(g: GameState, c: Character, roll: InjuryRoll, out: string[]) {
  const entry = injuryFor(roll);
  if (!entry) return;
  const severity = severityFromRoll(roll.severity);
  const dup = c.injuries.find((i) => i.code === entry.code);
  c.injuries.push({
    id: uid(),
    code: entry.code,
    name: entry.name,
    effect: entry.effect,
    severity,
    state: "Untreated",
    dayReceived: g.day,
    notes: dup ? "Duplicate — increase severity or reroll." : "",
  });
  out.push(`${c.name} suffers a ${severity} Injury (rolled ${roll.severity}, ${roll.injury}): ${entry.name}.`);
  if (severity !== "Minor") out.push(`Major/Deadly Injury — ${c.name} may start Bleeding.`);
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

export function rest(g: GameState, c: Character, out: string[]) {
  c.survival.rests += 1;
  c.hp = Math.min(maxHp(c), c.hp + 1);
  const restores = !c.survival.restBlocked && !c.afflictions.some((a) => a.name === "Sleep Disruption");
  if (restores) c.energy = maxEnergy(c);
  out.push(`${c.name} Rests (${c.survival.rests} today): +1 HP${restores ? ", Energy restored" : ""}.`);
  if (c.pressure > pressureFloor(c.stress)) changePressure(g, c, -1, out);
  naturalRecovery(g, c, out);
}

/** Roll Constitution + days since the injury for the oldest Treated Minor injury. Any 6 heals it. */
function naturalRecovery(g: GameState, c: Character, out: string[]) {
  const treated = c.injuries.filter((x) => x.state === "Treated" && x.severity === "Minor");
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

export type EndOfDayInput = Record<string, { food: FoodIntake; water: boolean; slept: boolean }>;

export function endOfDay(g: GameState, input: EndOfDayInput): string[] {
  const out: string[] = [`— End of Day ${g.day} —`];
  const rationDiscipline = g.characters.some((c) => !c.dead && c.specialty === "Ration Discipline");
  for (const c of g.characters) {
    if (c.dead) continue;
    const i = input[c.id] ?? { food: c.survival.food, water: c.survival.water, slept: c.survival.rests > 0 };
    const s = c.survival;
    let penalty = 0;
    let restBlocked = false;

    // Food
    if (i.food === "full") {
      s.foodMissStreak = 0;
      s.rationStreak = 0;
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
        if (s.foodMissStreak >= 3) changeStress(c, 1, out);
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
        changeStress(c, 1, out);
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
    for (const key of Object.keys(c.abilityUsed)) if (key.startsWith("day:") || key.startsWith("expedition:")) delete c.abilityUsed[key];
    clampVitals(c);
  }
  growCrops(g, out);
  if (g.ship.tuned) out.push("The reactor settles back to its normal output.");
  delete g.ship.tuned;
  delete g.ship.rationsStretched;
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

/** Resolve per-round condition effects and expire Brief conditions. */
export function endRound(g: GameState): string[] {
  const out = ["— End of round —"];
  for (const c of g.characters) {
    if (c.dead) continue;
    const has = (n: string) => c.conditions.some((x) => x.name === n);
    if (has("Burning")) {
      c.hp = Math.max(0, c.hp - 1);
      out.push(`${c.name} burns for 1 Fire Damage (HP ${c.hp}).`);
    }
    if (has("Bleeding")) {
      const dmg = c.injuries.some((i) => i.name === "Severed Artery" && i.state === "Untreated") ? 3 : c.injuries.some((i) => (i.name === "Massive Hemorrhage" || i.name === "Traumatic Amputation") && i.state === "Untreated") ? 2 : 1;
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
  }
  const ongoing = g.characters.flatMap((c) => c.conditions.filter((x) => x.duration !== "Persistent").map((x) => `${c.name} (${x.name})`));
  if (ongoing.length) out.push(`Still active until resolved: ${ongoing.join(", ")}.`);
  return out;
}

export function completeAct(g: GameState): string[] {
  g.act += 1;
  for (const c of g.characters) c.willpower = maxWillpower(c);
  return [`Act ${g.act - 1} complete. All Willpower restored.`];
}
