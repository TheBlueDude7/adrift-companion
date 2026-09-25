import { EXPERT_MARGIN, PRACTICED_MARGIN, PROJECT_MARGIN, SHIPBOARD_TASKS, TASK_BY_NAME, type ShipboardTask, type TaskFacility, type TaskMode } from "@/data/tasks";
import { TRAINING, trainingBand } from "@/data/training";
import { fabricate, moduleLevel, RECIPE_BY_NAME, recipeSkills } from "./crafting";
import { attributeValue, skillLevel } from "./derive";
import { d, rollPool, sixes, uid } from "./dice";
import { cellKey, tileDistance, tileLabel } from "./maps";
import { changePressure, changeStress, gainXp, rest } from "./mechanics";
import { moveShip } from "./power";
import { haveInStorage, spend, stockItem } from "./stock";
import { HULL_TIERS, MAX_SKILL_LEVEL, MODULE_CONDITIONS, PRESSURE_STATES, SEGMENTS, SKILL_BY_KEY, SKILLS, type SkillKey } from "./rules";
import { roomFromPreset } from "./seed";
import type { ActionStatus, Character, GameState, SegmentAction, SpaceTile, StarMap } from "./types";

export const taskFor = (a: Pick<SegmentAction, "task">): ShipboardTask => TASK_BY_NAME[a.task] ?? SHIPBOARD_TASKS.at(-1)!;

/** Players roll and resolve their own planned tasks, except the ones the GM keeps. */
export const playerResolves = (a: SegmentAction, characterId: string | null) => a.status === "planned" && a.characterId === characterId && !taskFor(a).gmResolves;

export const actionsNow = (g: GameState) => g.actions.filter((a) => a.day === g.day && a.segment === g.segment);

/** Planned tasks from segments that have already passed. */
export const overdueActions = (g: GameState) => g.actions.filter((a) => a.status === "planned" && (a.day < g.day || (a.day === g.day && a.segment < g.segment)));

export function targetName(g: GameState, t: SegmentAction["target"]) {
  if (!t) return null;
  const map = g.maps.find((m): m is StarMap => m.id === t.mapId && m.kind === "star");
  if (!map) return "a tile";
  const node = map.nodes.find((n) => n.x === t.x && n.y === t.y);
  return node ? node.name : `tile ${tileLabel(map, t)}`;
}

export const whenLabel = (a: Pick<SegmentAction, "day" | "segment">) => `Day ${a.day} ${SEGMENTS[a.segment]}`;

export type TaskTerms = {
  energy: number;
  skill: SkillKey | null;
  threshold: number;
  mode: TaskMode;
  /** Meets the Routine Threshold, so it succeeds without a roll when tools, facilities, and safety allow. */
  routine: boolean;
  /** Attribute + Skill dice for a roll. */
  dice: number;
  poolLabel: string;
  /** Skill level minus the threshold, or null when no skill applies. */
  margin: number | null;
  /** Earns the Strong Result without rolling. */
  expert: boolean;
  /** Progress a successful project segment adds. */
  progress: number;
  /** A missing facility or out-of-range target. The task can't be Routine until it's fixed. */
  blocker: string | null;
  /** Mastery perks that apply, for display. */
  perks: string[];
};

const skillKeyByName = (name: string) => SKILLS.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())?.key ?? null;

export function facilityBlocker(g: GameState, f: TaskFacility | undefined): string | null {
  if (!f) return null;
  const level = Math.max(...f.modules.map((m) => moduleLevel(g, m)));
  return level >= (f.level ?? 0) ? null : `Needs ${f.label}`;
}

/** Tiles a Navigation & Sensor Suite can scan: adjacent when working, 2 when Enhanced, 3 from Biometric. */
export function scanRadius(g: GameState) {
  const level = moduleLevel(g, "Navigation & Sensor Suite");
  return level >= 4 ? 3 : level >= 3 ? 2 : level >= 1 ? 1 : 0;
}

const byDistance = (dist: number) => (dist <= 1 ? 4 : dist === 2 ? 6 : 8);

/** Thresholds that rise with the job: distance for courses and scans, module level for crops and the reactor. */
function situational(g: GameState, a: SegmentAction, def: ShipboardTask): { threshold: number; blocker: string | null } {
  const map = a.target ? g.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star") : undefined;
  const dist = map?.shipAt && a.target ? tileDistance(map.shipAt, a.target) : 1;
  switch (def.name) {
    case "Plot Safe Course":
      return { threshold: byDistance(dist), blocker: null };
    case "Scan Nearby Tile": {
      const radius = scanRadius(g);
      return { threshold: byDistance(dist), blocker: radius && dist > radius ? `The sensors reach ${radius} tile${radius > 1 ? "s" : ""}` : null };
    }
    case "Maintain Crops": {
      const level = moduleLevel(g, "Hydroponics");
      return { threshold: level >= 4 ? 7 : level >= 3 ? 5 : 2, blocker: null };
    }
    case "Tune the Reactor":
      return { threshold: moduleLevel(g, "Fusion Reactor") >= 4 ? 8 : 6, blocker: null };
    default:
      return { threshold: def.threshold, blocker: null };
  }
}

function withMastery(base: Omit<TaskTerms, "margin" | "expert" | "progress" | "perks">, def: ShipboardTask, margin: number | null, project: boolean): TaskTerms {
  const perks: string[] = [];
  let { energy } = base;
  const routine = base.routine && !base.blocker;
  if (routine && margin !== null && margin >= PRACTICED_MARGIN && energy > 0) {
    energy -= 1;
    perks.push(`Practiced: −1 Energy`);
  }
  const expert = routine && margin !== null && !!def.strong && margin >= (def.expertAt ?? EXPERT_MARGIN);
  if (expert) perks.push("Expert: automatic Strong Result");
  const progress = project && routine && margin !== null && margin >= PROJECT_MARGIN ? 2 : 1;
  if (progress > 1) perks.push("2 Progress");
  return { ...base, energy, routine, margin, expert, progress, perks };
}

export function taskTerms(g: GameState, a: SegmentAction): TaskTerms {
  const c = g.characters.find((x) => x.id === a.characterId);
  const def = taskFor(a);
  let skills = def.skills;
  let { threshold, blocker } = situational(g, a, def);
  let energy = def.energy;
  let mode = def.mode;
  let mastery = def.effect !== "assist";
  blocker ??= facilityBlocker(g, def.facility);
  const project = a.projectId ? g.ship.projects.find((p) => p.id === a.projectId) : undefined;
  if (def.effect === "project" && project) {
    const key = skillKeyByName(project.skill);
    if (key) skills = [key];
    threshold = project.threshold;
    energy = project.energy;
  }
  if (def.effect === "assist") {
    const target = g.actions.find((x) => x.id === a.assists);
    if (target) {
      const t = taskTerms(g, target);
      skills = t.skill ? [t.skill] : [];
      energy = t.energy;
      mode = t.mode === "crisis" ? "crisis" : "routine";
      threshold = 1;
    }
    mastery = false;
  }
  if (def.effect === "train") {
    mastery = false;
    if (a.trainSkill) {
      skills = [a.trainSkill];
      blocker ??= c ? trainingBlocker(c, a.trainSkill) : null;
    }
  }
  if (def.effect === "craft" && c && a.crafts?.length) return craftTerms(c, a.crafts, energy);
  const best = c && skills.length ? skills.reduce((b, k) => (skillLevel(c, k) > skillLevel(c, b) ? k : b)) : null;
  const level = c && best ? skillLevel(c, best) : 0;
  const routine = mode === "routine" && (!best || level >= threshold);
  const attr = best ? SKILL_BY_KEY[best].attr : null;
  const attrValue = c && attr ? attributeValue(c, attr) : 0;
  return withMastery(
    {
      energy,
      skill: best,
      threshold,
      mode,
      routine,
      dice: attrValue + level,
      poolLabel: best && attr ? `${attr} ${attrValue} + ${SKILL_BY_KEY[best].name} ${level}` : "No skill",
      blocker,
    },
    def,
    mastery && best ? level - threshold : null,
    def.effect === "project",
  );
}

/**
 * One check covers every item. Its terms come from the hardest item: Routine when the crafter meets
 * every recipe's threshold, −1 Energy when they clear them all by 3, otherwise −1d6 per level short.
 */
function craftTerms(c: Character, crafts: string[], energy: number): TaskTerms {
  let worst: { skill: SkillKey; threshold: number; margin: number } | null = null;
  for (const name of crafts) {
    const r = RECIPE_BY_NAME[name];
    if (!r) continue;
    const pick = recipeSkills(r)
      .map((s) => ({ ...s, margin: skillLevel(c, s.skill) - s.threshold }))
      .reduce((b, s) => (s.margin > b.margin ? s : b));
    if (!worst || pick.margin < worst.margin) worst = pick;
  }
  const def = TASK_BY_NAME["Fabricate Common Item"];
  if (!worst) return withMastery({ energy, skill: null, threshold: 0, mode: "routine", routine: true, dice: 0, poolLabel: "No skill", blocker: null }, def, null, false);
  const level = skillLevel(c, worst.skill);
  const attr = SKILL_BY_KEY[worst.skill].attr;
  const attrValue = attributeValue(c, attr);
  const short = Math.max(0, -worst.margin);
  return withMastery(
    {
      energy,
      skill: worst.skill,
      threshold: worst.threshold,
      mode: short ? "skilled" : "routine",
      routine: short === 0,
      dice: Math.max(0, attrValue + level - short),
      poolLabel: `${attr} ${attrValue} + ${SKILL_BY_KEY[worst.skill].name} ${level}${short ? ` − ${short}d6 below ${worst.threshold}` : ""}`,
      blocker: null,
    },
    def,
    worst.margin,
    false,
  );
}

function restore(g: GameState, roomId: string | null) {
  const r = g.ship.rooms.find((x) => x.id === roomId);
  if (!r || r.condition === "Destroyed") return null;
  r.condition = MODULE_CONDITIONS[Math.max(0, MODULE_CONDITIONS.indexOf(r.condition) - 1)];
  return `${r.name} restored to ${r.condition}.`;
}

/** Add Progress to a Project and apply what completing it does. */
export function advanceProject(g: GameState, projectId: string, amount = 1): string[] {
  const x = g.ship.projects.find((p) => p.id === projectId);
  if (!x || x.done) return [];
  x.progress = Math.min(x.required, x.progress + amount);
  const out = [`${x.name} advances to ${x.progress}/${x.required}.`];
  if (x.name === "Hull Repair") {
    g.ship.hullHp = Math.min(HULL_TIERS[g.ship.hullTier].maxHp, g.ship.hullHp + amount);
    if (g.ship.hullHp > 0) g.ship.catastrophicEvents = 0;
    out.push(`Hull restored to ${g.ship.hullHp}.`);
  }
  if (x.progress >= x.required) {
    x.done = true;
    out.push(`✔ Project complete: ${x.name}.`);
    if (x.name.startsWith("Repair")) {
      const line = restore(g, x.roomId);
      if (line) out.push(line);
    }
    const patient = x.patientId ? g.characters.find((c) => c.id === x.patientId) : undefined;
    if (x.patientId && patient) {
      const roll = d(4);
      out.push(`Stress Recovery rolls 1d4 + 2 = ${roll + 2}.`);
      changeStress(patient, -(roll + 2), out);
    } else if (x.patientId) {
      out.push("The patient is no longer aboard, so no Stress is recovered.");
    }
    if (x.name === "Expand Ship") {
      g.ship.rooms.push(roomFromPreset(null, "New Room"));
      out.push("A new empty room is sealed and pressurized.");
    }
  }
  return out;
}

export type Resolution = {
  status: Exclude<ActionStatus, "planned">;
  energy: number;
  outcome: string;
  scan?: SpaceTile | null;
  /** Per-item result for Fabricate, in the order of `crafts`. Defaults to the task's overall result. */
  crafted?: boolean[];
};

const STATUS_WORD: Record<Resolution["status"], string> = { success: "succeeds", strong: "strong success", failed: "fails", cancelled: "called off" };

/** "2× Medkit" or "Medkit, Toolkit". */
export function craftList(crafts: string[]) {
  const counts = new Map<string, number>();
  for (const n of crafts) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, k]) => (k > 1 ? `${k}× ${n}` : n)).join(", ");
}

function describe(g: GameState, a: SegmentAction) {
  const project = a.projectId ? g.ship.projects.find((p) => p.id === a.projectId) : undefined;
  const map = a.target ? g.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star") : undefined;
  const node = map && a.target ? map.nodes.find((n) => n.x === a.target!.x && n.y === a.target!.y) : undefined;
  const bits = [a.task];
  if (project) bits.push(`on ${project.name}`);
  if (a.target) bits.push(`toward ${node?.name ?? "a tile"}`);
  if (a.crafts?.length) bits.push(`(${craftList(a.crafts)})`);
  if (a.trainSkill) bits.push(`(${SKILL_BY_KEY[a.trainSkill].name})`);
  return bits.join(" ");
}

/** The resource one training segment consumes, for the level the character is working toward. */
export function trainingCost(c: Character, key: SkillKey) {
  const next = skillLevel(c, key) + 1;
  if (next > MAX_SKILL_LEVEL) return null;
  const band = trainingBand(next);
  return { name: TRAINING[key][band], band, next };
}

function trainingBlocker(c: Character, key: SkillKey) {
  if (c.afflictions.some((x) => x.name === "Fragmented Memory")) return "Fragmented Memory: can't train";
  if (!trainingCost(c, key)) return `${SKILL_BY_KEY[key].name} is already at ${MAX_SKILL_LEVEL}`;
  return null;
}

export const MASTER_PILOT = 8;

/** Piloting 8 lets a pilot make one move a day without burning a Power Cell. */
export function masterPilotReady(g: GameState, c: Character, a: SegmentAction) {
  return skillLevel(c, "piloting") >= MASTER_PILOT && !g.actions.some((x) => x.id !== a.id && x.characterId === c.id && x.day === a.day && x.freeCell);
}

/** Resolve a planned task: pay Energy, apply the task's normal result, and log it. */
export function resolveAction(g: GameState, id: string, r: Resolution): string[] {
  const a = g.actions.find((x) => x.id === id);
  if (!a) return [];
  const c = g.characters.find((x) => x.id === a.characterId);
  const def = taskFor(a);
  a.status = r.status;
  a.outcome = r.outcome.trim() || undefined;
  if (r.status === "cancelled") return [`${c?.name ?? "Someone"} calls off ${describe(g, a)}.`];
  const out: string[] = [];
  const ok = r.status === "success" || r.status === "strong";
  const strong = r.status === "strong";
  const terms = taskTerms(g, a);
  let head = `${c?.name ?? "Someone"}: ${describe(g, a)} ${STATUS_WORD[r.status]}`;
  if (c && r.energy > 0) {
    c.energy = Math.max(0, c.energy - r.energy);
    head += ` (−${r.energy} Energy, ${c.energy} left)`;
  }
  out.push(`${head}.${a.outcome ? ` ${a.outcome}` : ""}`);
  if (strong && def.strong) out.push(`Strong Result: ${def.strong}`);
  if (c && ok && def.effect === "rest") rest(g, c, out);
  if (ok && def.effect === "project" && a.projectId) out.push(...advanceProject(g, a.projectId, terms.progress));
  if (ok && def.effect === "harvest") {
    const bonus = Math.floor(Math.max(0, terms.margin ?? 0) / 3) + (strong ? 1 : 0);
    if (bonus > 0) {
      stockItem(g, "Raw Food", bonus, { category: "Supply" });
      out.push(`+${bonus} Raw Food from careful harvesting, added to ship storage.`);
    }
  }
  if (ok && def.effect === "yield" && def.yields) {
    const qty = def.yields.qty + (strong ? 1 : 0);
    stockItem(g, def.yields.name, qty, { category: "Material", tier: "Tier I" });
    out.push(`${qty}× ${def.yields.name} added to ship storage.`);
  }
  if (ok && def.effect === "convert") {
    const [food, fuel] = c && skillLevel(c, "botany") >= 7 ? [3, 2] : [2, 1];
    if (haveInStorage(g, "Food Unit") < food) out.push(`⚠ Nothing converted: the hold needs ${food} Food Units.`);
    else {
      spend(g, [{ name: "Food Unit", qty: food }]);
      stockItem(g, "Fuel Unit", fuel, { category: "Supply" });
      out.push(`${food} Food Units become ${fuel} Fuel Unit${fuel > 1 ? "s" : ""}.`);
    }
  }
  if (ok && def.effect === "morale") {
    const lifted = g.characters.filter((x) => !x.dead && x.pressure > 0);
    for (const x of lifted) x.pressure -= 1;
    out.push(lifted.length ? `Pressure eases for ${lifted.map((x) => x.name).join(", ")}.` : "Nobody was under Pressure, but spirits lift anyway.");
  }
  if (ok && def.effect === "tune") {
    g.ship.tuned = true;
    out.push("The reactor runs hot and clean: +1 Power Unit until the end of the day.");
  }
  if (def.effect === "train" && c && a.trainSkill) {
    const cost = trainingCost(c, a.trainSkill);
    if (!cost) out.push(`⚠ ${SKILL_BY_KEY[a.trainSkill].name} is already maxed out.`);
    else if (haveInStorage(g, cost.name) < 1) out.push(`⚠ No ${cost.name} in the hold, so the training earns no XP.`);
    else {
      spend(g, [{ name: cost.name, qty: 1 }]);
      out.push(ok ? `Used 1 ${cost.name}. ${gainXp(c, a.trainSkill)}` : `1 ${cost.name} is used up, but the session earns no XP.`);
    }
  }
  if (ok && def.effect === "rations") {
    g.ship.rationsStretched = true;
    out.push("Rations are stretched: tonight every 3 Food Units feed 4 survivors.");
  }
  if (ok && def.effect === "assist") {
    const target = g.actions.find((x) => x.id === a.assists);
    if (target?.projectId && taskFor(target).effect === "project") out.push(...advanceProject(g, target.projectId, 1));
  }
  if (def.effect === "course" && a.target) {
    const unsafe = a.task === "Plot Unsafe Course";
    if (ok) {
      const strongFree = strong && !unsafe;
      const master = !strongFree && !!c && masterPilotReady(g, c, a);
      const line = moveShip(g, a.target.mapId, a.target, true, strongFree || master);
      if (line && master) {
        a.freeCell = true;
        out.push(`${c?.name} flies it as a Master Pilot: no Power Cell consumed.`);
      }
      out.push(line ?? "⚠ The ship couldn't make the move: check the engines and power cells.");
    } else if (r.status === "failed") {
      out.push(`⚠ ${c?.name ?? "The pilot"} fails to plot the course to ${targetName(g, a.target) ?? "the destination"}. The ship stays where it is.`);
    }
  }
  if (def.effect === "craft") {
    (a.crafts ?? []).forEach((name, i) => {
      const recipe = RECIPE_BY_NAME[name];
      if (recipe) out.push(fabricate(g, recipe, r.crafted?.[i] ?? ok));
    });
  }
  if (def.effect === "scan" && a.target && r.scan !== undefined) {
    const map = g.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star");
    if (map) {
      if (r.scan) {
        map.tiles[cellKey(a.target.x, a.target.y)] = r.scan;
        out.push(`Scan result recorded on ${map.name}.`);
      }
    }
  }
  return out;
}

/** Dice for rolling a task: Attribute + Skill, Pressure dice, each assistant's skill (up to +4d6), and the unscanned-tile penalty. */
export function taskPool(g: GameState, a: SegmentAction): { dice: number; parts: string[] } {
  const c = g.characters.find((x) => x.id === a.characterId);
  const terms = taskTerms(g, a);
  let dice = terms.dice;
  const parts = [terms.poolLabel];
  const pressure = c ? PRESSURE_STATES[c.pressure] : null;
  if (pressure?.dice) {
    dice += pressure.dice;
    parts.push(`${pressure.name} ${pressure.dice}`);
  }
  for (const x of g.actions) {
    if (x.assists !== a.id || x.status === "cancelled") continue;
    const helper = g.characters.find((h) => h.id === x.characterId);
    const level = helper && terms.skill ? Math.min(4, skillLevel(helper, terms.skill)) : 0;
    if (level > 0) {
      dice += level;
      parts.push(`${helper!.name} assists ${level}`);
    }
  }
  const map = a.target ? g.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star") : undefined;
  if (a.task === "Plot Unsafe Course" && map && a.target && !map.tiles[cellKey(a.target.x, a.target.y)]) {
    dice -= 3;
    parts.push("unscanned −3");
  }
  return { dice: Math.max(0, dice), parts };
}

/** A Push rerolls failed dice once, and costs Energy an exhausted survivor doesn't have. */
export function canPush(g: GameState, a: SegmentAction) {
  const c = g.characters.find((x) => x.id === a.characterId);
  return !!a.roll && !a.roll.pushed && a.roll.dice.some((v) => v !== 6) && !!c && c.energy > 0;
}

/** The result a task roll earns. Routine work can't fail on the dice. */
export function rolledStatus(roll: NonNullable<SegmentAction["roll"]>, routine: boolean): "failed" | "success" | "strong" {
  const n = sixes(roll.dice);
  return n >= 2 ? "strong" : n === 1 || routine ? "success" : "failed";
}

const rollText = (dice: number[]) => {
  const n = sixes(dice);
  return `[${dice.join(", ")}] — ${n === 0 ? "failure" : n === 1 ? "success" : `${n} successes`}`;
};

export function rollTask(g: GameState, id: string): string[] {
  const a = g.actions.find((x) => x.id === id);
  const c = a && g.characters.find((x) => x.id === a.characterId);
  if (!a || !c) return [];
  const pool = taskPool(g, a);
  a.roll = { dice: rollPool(pool.dice), pushed: false };
  return [`${c.name} rolls for ${describe(g, a)} (${pool.dice}d6): ${rollText(a.roll.dice)}.`];
}

/** Push: −1 Energy and +1 Pressure, then reroll every die that isn't a 6, plus any new Pressure dice. */
export function pushTask(g: GameState, id: string): string[] {
  const a = g.actions.find((x) => x.id === id);
  const c = a && g.characters.find((x) => x.id === a.characterId);
  if (!a?.roll || !c || !canPush(g, a)) return [];
  const out: string[] = [];
  const before = PRESSURE_STATES[c.pressure].dice;
  c.energy = Math.max(0, c.energy - 1);
  changePressure(g, c, 1, out);
  const kept = a.roll.dice.filter((v) => v === 6);
  const extra = Math.max(0, PRESSURE_STATES[c.pressure].dice - before);
  a.roll = { dice: [...kept, ...rollPool(a.roll.dice.length - kept.length + extra)], pushed: true };
  return [`${c.name} Pushes (−1 Energy).`, ...out, `Reroll: ${rollText(a.roll.dice)}.`];
}

export function newAction(g: GameState, c: Character, task: string): SegmentAction {
  return { id: uid(), characterId: c.id, day: g.day, segment: g.segment, task, detail: "", projectId: null, target: null, assists: null, status: "planned" };
}
