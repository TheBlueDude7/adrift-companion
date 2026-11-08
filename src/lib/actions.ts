import { EXPERT_MARGIN, FABRICATE_ITEMS, LABOR_ASSIST_THRESHOLD, LABOR_EXPERT_MARGIN, LABOR_PRACTICED_MARGIN, LABOR_PROJECT_MARGIN, PRACTICED_MARGIN, PROJECT_MARGIN, SHIPBOARD_TASKS, TASK_BY_NAME, THOROUGH_DICE, type ShipboardTask, type TaskFacility, type TaskMode } from "@/data/tasks";
import { TRAINING, trainingBand } from "@/data/training";
import { cook, craftBlocker, fabricate, fabricateCost, galleyPenalty, moduleLevel, RECIPE_BY_NAME, recipeSkills, salvageParts, stationLevel, stationLevelName } from "./crafting";
import { harvestCrops, tendCrops } from "./crops";
import { attributeValue, maxHp, maxWillpower, skillLevel } from "./derive";
import { d, rollPool, sixes, uid } from "./dice";
import { recordSearch } from "./expedition";
import { cellKey, tileDistance, tileLabel } from "./maps";
import { conditionPenalty, type ConditionAsk } from "./conditions";
import { injuryPenalty } from "./injuries";
import { changeStress, gainXp, payPush, recoveredHp, rest } from "./mechanics";
import { completeModuleWork } from "./modules";
import { moveShip } from "./power";
import { haveInStorage, recipeText, shortfalls, spend, spendUse, stockItem, takeOne } from "./stock";
import { ATTRIBUTE_NAMES, ATTRIBUTES, HULL_TIERS, MAX_SKILL_LEVEL, MODULE_CONDITIONS, PRESSURE_STATES, pressureFloor, SEGMENTS, SKILL_BY_KEY, SKILLS, type Attribute, type SkillKey } from "./rules";
import { roomFromPreset } from "./seed";
import type { CraftRecipe } from "@/data/crafting";
import type { ActionStatus, Character, GameState, Line, Project, SegmentAction, SpaceTile, StarMap } from "./types";

export const taskFor = (a: Pick<SegmentAction, "task">): ShipboardTask => TASK_BY_NAME[a.task] ?? SHIPBOARD_TASKS.at(-1)!;

/** Both costs of a Thorough Search are the GM's to apply: the Turns aren't counted and the clocks aren't built. */
const THOROUGH_NOTE = "A Thorough Search takes two Expedition Turns, and it's loud either way: advance the site's Noise or Threat Clock.";

/** Players roll and resolve their own planned tasks, except the ones the GM keeps. */
export const playerResolves = (a: SegmentAction, characterId: string | null) =>
  a.status === "planned" && a.characterId === characterId && !taskFor(a).gmResolves && a.approval !== "pending";

/** How much Energy the survivor lacks for this task, after what their earlier planned tasks will cost. */
export function energyShort(g: GameState, a: SegmentAction) {
  const c = g.characters.find((x) => x.id === a.characterId);
  if (!c) return 0;
  const order = (x: SegmentAction) => {
    const i = g.actions.findIndex((y) => y.id === x.id);
    return [x.day, x.segment, i < 0 ? Infinity : i];
  };
  const before = (x: SegmentAction) => {
    const [p, q] = [order(x), order(a)];
    return p[0] - q[0] || p[1] - q[1] || p[2] - q[2];
  };
  const committed = g.actions
    .filter((x) => x.id !== a.id && x.characterId === c.id && x.status === "planned" && before(x) < 0)
    .reduce((sum, x) => sum + taskTerms(g, x).energy, 0);
  return Math.max(0, taskTerms(g, a).energy - Math.max(0, c.energy - committed));
}

/** What stops a Fabricate or Prepare Food task from working on its own: missing stations and a short hold. */
export function craftProblems(g: GameState, a: SegmentAction): string[] {
  const effect = taskFor(a).effect;
  if ((effect !== "craft" && effect !== "cook") || !a.crafts?.length) return [];
  const blockers = a.crafts.map((n) => RECIPE_BY_NAME[n] && craftBlocker(g, RECIPE_BY_NAME[n])).filter((b): b is string => !!b);
  const cost = fabricateCost(a.crafts);
  const short = shortfalls(g, cost.inputs, cost.toolkit).map((s) => `Hold is short ${s.need - s.have} ${s.name}`);
  const c = g.characters.find((x) => x.id === a.characterId);
  const limit = effect === "craft" ? (c ? fabricateLimit(c, a.crafts) : FABRICATE_ITEMS) : 1;
  const over =
    a.crafts.length > limit
      ? [effect === "cook" ? "More than one recipe in a cook" : `More than ${limit} item${limit > 1 ? "s" : ""} (a third needs ${EXPERT_MARGIN} levels above every recipe's threshold)`]
      : [];
  return [...new Set([...over, ...blockers, ...short])];
}

/** Water filters in the hold, best first. One charge purifies the units its own notes promise. */
export const WATER_FILTERS = [
  { name: "Water Filter", units: 6 },
  { name: "Crude Water Filter", units: 4 },
] as const;

export const bestWaterFilter = (g: GameState) =>
  WATER_FILTERS.find((f) => g.items.some((i) => i.location === "ship" && i.name === f.name && i.qty > 0 && !i.broken && (i.charges ?? 1) > 0)) ?? null;

/** Water Units one Filter Reclaimed Water task draws out of Life Support, once a day. */
export const RECLAIMED_WATER = 2;

/** Scavenging needed to take an item apart, by the tier of what it's made of. */
const SALVAGE_THRESHOLD: Record<string, number> = { "Tier I": 2, "Tier II": 4, "Tier III": 6 };

/** Craft Medicine works off either trade, each with its own threshold. */
const MEDICINE_SKILLS: { skill: SkillKey; threshold: number }[] = [
  { skill: "firstAid", threshold: 3 },
  { skill: "surgery", threshold: 5 },
];

/** The humblest medkit the medic can reach: Stop Bleeding doesn't care how good it is. */
const plainestKit = (g: GameState, healerId: string) => medkitsFor(g, healerId).sort((a, b) => a.dice - b.dice)[0] ?? null;

/** What a task needs out of the hold before it can work at all. */
export function supplyProblems(g: GameState, a: SegmentAction): string[] {
  const def = taskFor(a);
  const name = a.crafts?.[0];
  switch (def.effect) {
    case "purify":
      return bestWaterFilter(g) ? [] : ["No water filter in the hold"];
    case "reclaim":
      return g.ship.reclaimed ? ["Life Support's reclaimed water is already drawn today"] : [];
    case "bleed":
      return plainestKit(g, a.characterId) ? [] : ["No medkit to hand"];
    case "salvage":
      return !name || haveInStorage(g, name) > 0 ? [] : [`No ${name} in the hold`];
    case "medicine": {
      const r = name ? RECIPE_BY_NAME[name] : undefined;
      return r ? shortfalls(g, r.inputs, r.toolkit).map((s) => `Hold is short ${s.need - s.have} ${s.name}`) : [];
    }
    default:
      return [];
  }
}

/** The most bonus dice one assistant can add to a task. */
export const ASSIST_MAX_DICE = 4;

/** The task an Assist is helping, if it still stands. */
export const assistTarget = (g: GameState, a: SegmentAction) => g.actions.find((x) => x.id === a.assists && x.status !== "cancelled") ?? null;

/** Withdrawing a task leaves its assistants with nothing to help, so point them back at nothing. */
export function dropAction(g: GameState, id: string) {
  g.actions = g.actions.filter((x) => x.id !== id);
  for (const x of g.actions) if (x.assists === id) x.assists = null;
}

export type AssistEffect = {
  /** Bonus dice the helped task gains, once this Assist has succeeded. */
  dice: number;
  /** Progress this Assist adds to the helped Project. */
  progress: number;
  /** What the GM has to allow before a player can plan it. */
  problems: string[];
  /** What it won't do, worth saying before anyone spends a segment on it. */
  warnings: string[];
  /** What it is worth. */
  notes: string[];
};

/**
 * Projects where there is nothing to carry, lift, or hold steady, so a strong back is no use. Anything
 * else builds, moves, or repairs something physical and can take a Labor Assist.
 */
const DESK_WORK = ["Stress Recovery", "Affliction Treatment", "Cybernetic Research", "Xenoflora Cultivation"];

const physicalProject = (p: Project) => !DESK_WORK.some((n) => p.name.startsWith(n));

/**
 * What one Assist is worth. The assistant needs a level in the task's skill, or a useful method the GM
 * allows; their Skill Level becomes bonus dice (up to +4d6) once the Assist itself succeeds; and on a
 * Project they add 1 Progress if they meet its Routine Threshold.
 *
 * Labor is the other way in. On a Project that builds, moves, or repairs something physical, Strength
 * can stand in for the skill — but only alongside someone doing the work as Routine. Muscle multiplies
 * trained work and never replaces it, so a strong crew can't build a ship with nobody who can build.
 */
export function assistEffect(g: GameState, a: SegmentAction): AssistEffect {
  const c = g.characters.find((x) => x.id === a.characterId);
  const target = assistTarget(g, a);
  if (!target) return { dice: 0, progress: 0, problems: ["Nothing to assist: that task is gone"], warnings: [], notes: [] };
  const t = taskTerms(g, target);
  const who = g.characters.find((x) => x.id === target.characterId)?.name ?? "Someone";
  const level = c ? (t.labor ? attributeValue(c, "STR") : t.skill ? skillLevel(c, t.skill) : 0) : 0;
  const project = projectWorkedOn(g, target);
  const dice = Math.min(ASSIST_MAX_DICE, level);
  const strength = c ? attributeValue(c, "STR") : 0;
  const skilled = (t.skill || t.labor) && level >= t.threshold;
  const heavy = !!project && physicalProject(project);
  const lending = heavy && !t.labor && t.routine && strength >= LABOR_ASSIST_THRESHOLD;
  const progress = project && !project.done && (skilled || lending) ? 1 : 0;
  const problems: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  if (level === 0 && !lending) problems.push(`No level in ${t.skill ? SKILL_BY_KEY[t.skill].name : "a skill the task uses"}, so it takes a useful method the GM allows`);
  if (dice > 0) notes.push(`+${dice}d6 on ${who}'s roll, once this Assist succeeds`);
  if (project) {
    if (progress > 0) notes.push(`+1 Progress on ${project.name}, using one of its contributor slots${lending && !skilled ? `, lending a back at ${ATTRIBUTE_NAMES.STR} ${LABOR_ASSIST_THRESHOLD}` : ""}`);
    else if (heavy && !t.labor && !t.routine && strength >= LABOR_ASSIST_THRESHOLD) {
      warnings.push(`No Progress on ${project.name}: a back only helps someone working it as Routine, and ${who} isn't`);
    } else {
      const bar = t.skill ? `${SKILL_BY_KEY[t.skill].name} ${t.threshold}` : t.labor ? `${ATTRIBUTE_NAMES.STR} ${t.threshold}` : `its Routine ${t.threshold}`;
      warnings.push(`No Progress on ${project.name}: that needs ${bar}${heavy && !t.labor ? `, or ${ATTRIBUTE_NAMES.STR} ${LABOR_ASSIST_THRESHOLD} alongside someone working it as Routine` : ""}`);
    }
  } else if (t.routine) warnings.push(`${who}'s task is already Routine, so the dice only matter if they roll for a Strong Result`);
  if (target.roll) warnings.push(`${who} has already rolled, so the dice come too late`);
  return { dice, progress, problems, warnings, notes };
}

/** The Project a task adds Progress to: its own, or the one its Assist helps. */
function projectWorkedOn(g: GameState, a: SegmentAction): Project | null {
  const work = taskFor(a).effect === "assist" ? assistTarget(g, a) : a;
  if (!work?.projectId || taskFor(work).effect !== "project") return null;
  return g.ship.projects.find((p) => p.id === work.projectId) ?? null;
}

/** Everyone whose task adds Progress to this Project in one segment: contributors and assistants who qualify. */
export function projectContributors(g: GameState, projectId: string, day: number, segment: number, exceptId?: string) {
  const ids = new Set<string>();
  for (const x of g.actions) {
    if (x.id === exceptId || x.status === "cancelled" || x.day !== day || x.segment !== segment) continue;
    if (projectWorkedOn(g, x)?.id !== projectId) continue;
    if (taskFor(x).effect === "assist" && assistEffect(g, x).progress === 0) continue;
    ids.add(x.characterId);
  }
  return ids;
}

/** Most Projects take two contributors a segment. An assistant who adds Progress uses a slot too. */
export function contributorProblem(g: GameState, a: SegmentAction): string | null {
  const p = projectWorkedOn(g, a);
  if (!p || p.done) return null;
  if (taskFor(a).effect === "assist" && assistEffect(g, a).progress === 0) return null;
  const others = projectContributors(g, p.id, a.day, a.segment, a.id);
  if (others.has(a.characterId) || others.size < p.contributorLimit) return null;
  return `${p.name} already has ${p.contributorLimit} contributor${p.contributorLimit > 1 ? "s" : ""} this segment`;
}

/** Why a player needs the GM's permission for this task, if they do. */
export function permissionReasons(g: GameState, a: SegmentAction): string[] {
  const short = energyShort(g, a);
  const crowded = contributorProblem(g, a);
  return [
    ...(short > 0 ? [`${short} Energy short`] : []),
    ...craftProblems(g, a),
    ...supplyProblems(g, a),
    ...(taskFor(a).effect === "assist" ? assistEffect(g, a).problems : []),
    ...(crowded ? [crowded] : []),
  ];
}

/** A player may take on a task they can't afford, or can't craft on their own, only with the GM's permission. */
export const needsPermission = (g: GameState, a: SegmentAction) => a.approval !== "granted" && permissionReasons(g, a).length > 0;

/**
 * Tasks being taken right now. Off the ship that means this Expedition Turn, not the whole segment:
 * eight Turns share one segment, and a survivor can't Assist a task three Turns old.
 */
export const actionsNow = (g: GameState) => g.actions.filter((a) => a.day === g.day && a.segment === g.segment && a.turn === g.expedition?.turn);

/** A survivor's tasks in one segment — or in one Expedition Turn of it, which is the same rule. */
export const segmentTasks = (g: GameState, characterId: string, day = g.day, segment = g.segment, turn = g.expedition?.turn) =>
  g.actions.filter((a) => a.characterId === characterId && a.day === day && a.segment === segment && a.turn === turn && a.status !== "cancelled");

const REST_PUSH_CONFLICT = "Resting and Pushing for an extra task can't share a segment";

/** Each survivor takes one task per segment. Pushing (1 Energy, 1 Pressure) buys one extra. */
export function extraTaskBlocker(g: GameState, c: Character): string | null {
  const tasks = segmentTasks(g, c.id);
  if (tasks.length === 0) return "No task planned yet";
  if (tasks.length > 1 || tasks.some((a) => a.extra)) return "Already took the extra task this segment";
  if (tasks.some((a) => taskFor(a).effect === "rest")) return REST_PUSH_CONFLICT;
  return null;
}

/** You either take the segment off or you grind an extra task out of it. Never both, in either order. */
export function restPushConflict(g: GameState, a: SegmentAction): string | null {
  const others = segmentTasks(g, a.characterId, a.day, a.segment, a.turn).filter((x) => x.id !== a.id);
  const pushed = a.extra || others.some((x) => x.extra);
  const resting = taskFor(a).effect === "rest" || others.some((x) => taskFor(x).effect === "rest");
  return pushed && resting ? REST_PUSH_CONFLICT : null;
}

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
  /** Labor: Strength stands in for the Skill Level, so `skill` stays null and the roll is flat Strength. */
  labor: boolean;
  /** The attribute the pool rolls. Usually the skill's own, but Research rolls Wits instead. */
  attr: Attribute | null;
  threshold: number;
  mode: TaskMode;
  /** Meets the Routine Threshold, so it succeeds without a roll when tools, facilities, and safety allow. */
  routine: boolean;
  /** Attribute + Skill dice for a roll. */
  dice: number;
  poolLabel: string;
  /** Skill level minus the threshold, or Strength minus it on Labor. Null when neither applies. */
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

/** An attribute a Project's skill text names ahead of its skills, as in "Wits + Engineering". */
const ATTR_PREFIX = /^\s*(Strength|Constitution|Intelligence|Wits)\s*\+\s*/i;

/** The attribute a Project rolls, when its skill text overrides the skill's own. */
export function projectAttr(p: Pick<Project, "skill">): Attribute | null {
  const name = p.skill.match(ATTR_PREFIX)?.[1]?.toLowerCase();
  return ATTRIBUTES.find((a) => ATTRIBUTE_NAMES[a].toLowerCase() === name) ?? null;
}

/**
 * Skills a Project accepts, read from text like "Engineering", "Mechanical Technician or Engineering",
 * or "Mech. Technician 3 / Engineering 4". A number after a skill is its own threshold. A leading
 * "Wits +" names the attribute the roll uses instead of the skill's own, and isn't a skill itself.
 */
export function projectSkills(p: Pick<Project, "skill" | "threshold">): { skill: SkillKey; threshold: number }[] {
  const out: { skill: SkillKey; threshold: number }[] = [];
  for (const part of p.skill.replace(ATTR_PREFIX, "").replace(/\(.*?\)/g, "").split(/\s*(?:\/|,|\bor\b)\s*/i)) {
    const m = part.trim().match(/^(.+?)(?:\s+(\d+))?$/);
    if (!m) continue;
    const name = m[1].toLowerCase().replace(/^mech\.?\s+/, "mechanical ");
    const key = SKILLS.find((s) => s.name.toLowerCase() === name)?.key;
    if (key && !out.some((x) => x.skill === key)) out.push({ skill: key, threshold: m[2] ? Number(m[2]) : p.threshold });
  }
  return out;
}

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
  // An Expedition Task needs this survivor to be on the expedition. Aboard the ship there's no zone
  // to scout, search or seal, and someone who stayed behind can't do it from the galley either.
  if (def.group === "Expedition" && def.name !== "Embark Expedition" && !g.expedition?.crew.includes(a.characterId)) {
    return { threshold: def.threshold, blocker: g.expedition ? "They stayed aboard, so there's no site for them to work in" : "The crew isn't on an expedition" };
  }
  // And the other way about: a survivor inside a derelict can't tune the reactor they left behind.
  // A handful of tasks are marked as working anywhere, because a medkit works wherever it's opened.
  if (def.group !== "Expedition" && !def.anywhere && g.expedition?.crew.includes(a.characterId)) {
    return { threshold: def.threshold, blocker: `${def.name} needs the ship, and they're away on the expedition` };
  }
  switch (def.name) {
    // A room stands one ordinary Search. After that it takes new information, the right equipment,
    // a change in the room, or a Thorough Search — and the app can only check the last of those, so
    // the GM clears the room's Searched mark on the Site tab when one of the others applies.
    case "Search": {
      const zone = g.expedition?.zones.find((z) => z.id === g.expedition?.at[a.characterId]);
      return { threshold: def.threshold, blocker: zone?.searched && !a.thorough ? `The ${zone.name} has been searched — only a Thorough Search finds more` : null };
    }
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

function withMastery(base: Omit<TaskTerms, "margin" | "expert" | "progress" | "perks" | "labor">, def: ShipboardTask, margin: number | null, project: boolean, labor = !!def.labor): TaskTerms {
  const practicedAt = labor ? LABOR_PRACTICED_MARGIN : PRACTICED_MARGIN;
  const expertAt = def.expertAt ?? (labor ? LABOR_EXPERT_MARGIN : EXPERT_MARGIN);
  const projectAt = labor ? LABOR_PROJECT_MARGIN : PROJECT_MARGIN;
  const perks: string[] = [];
  let { energy } = base;
  const routine = base.routine && !base.blocker;
  if (routine && margin !== null && margin >= practicedAt && energy > 0) {
    energy -= 1;
    perks.push(`Practiced: −1 Energy`);
  }
  const expert = routine && margin !== null && !!def.strong && margin >= expertAt;
  if (expert) perks.push("Expert: automatic Strong Result");
  const progress = project && routine && margin !== null && margin >= projectAt ? 2 : 1;
  if (progress > 1) perks.push("2 Progress");
  return { ...base, labor, energy, routine, margin, expert, progress, perks };
}

export function taskTerms(g: GameState, a: SegmentAction): TaskTerms {
  const c = g.characters.find((x) => x.id === a.characterId);
  const def = taskFor(a);
  let skills = def.skills;
  let { threshold, blocker } = situational(g, a, def);
  let energy = def.energy;
  let mode = def.mode;
  let mastery = def.effect !== "assist";
  let labor = !!def.labor;
  let attrOverride = def.attr ?? null;
  blocker ??= facilityBlocker(g, def.facility);
  const project = a.projectId ? g.ship.projects.find((p) => p.id === a.projectId) : undefined;
  if (def.effect === "project" && project) {
    const options = projectSkills(project);
    const pick = c && options.length ? options.reduce((b, o) => (skillLevel(c, o.skill) - o.threshold > skillLevel(c, b.skill) - b.threshold ? o : b)) : options[0];
    if (pick) skills = [pick.skill];
    threshold = pick?.threshold ?? project.threshold;
    energy = project.energy;
    attrOverride = projectAttr(project);
  }
  if (def.effect === "assist") {
    const target = assistTarget(g, a);
    if (target) {
      const t = taskTerms(g, target);
      skills = t.skill ? [t.skill] : [];
      // Lending a hand with Labor is Labor too: the helper puts their own back into it.
      labor = t.labor;
      attrOverride = t.attr;
      mode = t.mode === "crisis" ? "crisis" : "routine";
      threshold = 1;
    } else blocker ??= "Nothing to assist: that task is gone";
    mastery = false;
  }
  if (def.effect === "salvage") {
    const recipe = a.crafts?.[0] ? RECIPE_BY_NAME[a.crafts[0]] : undefined;
    threshold = SALVAGE_THRESHOLD[recipe?.tier ?? ""] ?? threshold;
  }
  if (def.effect === "medicine" && c) {
    const pick = MEDICINE_SKILLS.reduce((b, o) => (skillLevel(c, o.skill) - o.threshold > skillLevel(c, b.skill) - b.threshold ? o : b));
    skills = [pick.skill];
    threshold = pick.threshold;
  }
  if (def.effect === "train") {
    mastery = false;
    if (a.trainSkill) {
      skills = [a.trainSkill];
      blocker ??= c ? trainingBlocker(c, a.trainSkill) : null;
    }
  }
  if (def.effect === "craft" && c && a.crafts?.length) return craftTerms(c, a.crafts, energy);
  if (def.effect === "cook" && c && a.crafts?.length) return cookTerms(g, c, a.crafts, energy);
  if (def.name === "Plot Unsafe Course" && unscannedTarget(g, a)) mode = "crisis";
  // Labor has no skill: Strength is both the dice pool and the level measured against the threshold.
  if (labor) {
    const str = c ? attributeValue(c, "STR") : 0;
    const shaken = !!c && c.pressure >= OVERTAXED;
    return withMastery(
      {
        energy,
        skill: null,
        attr: "STR",
        threshold,
        mode,
        routine: mode === "routine" && str >= threshold && !shaken,
        dice: str,
        poolLabel: `${ATTRIBUTE_NAMES.STR} ${str}`,
        blocker,
      },
      def,
      mastery && c ? str - threshold : null,
      def.effect === "project",
      true,
    );
  }
  const best = c && skills.length ? skills.reduce((b, k) => (skillLevel(c, k) > skillLevel(c, b) ? k : b)) : null;
  const level = c && best ? skillLevel(c, best) : 0;
  const shaken = !!c && c.pressure >= OVERTAXED && !!best;
  const routine = mode === "routine" && (!best || level >= threshold) && !shaken;
  const attr = best ? (attrOverride ?? SKILL_BY_KEY[best].attr) : null;
  const attrValue = c && attr ? attributeValue(c, attr) : 0;
  // A Thorough Search is the one task that buys its own dice, by spending a second Expedition Turn.
  // It belongs here rather than among the situational modifiers so that every pool shown agrees.
  const thorough = a.thorough && def.effect === "search" ? THOROUGH_DICE : 0;
  return withMastery(
    {
      energy,
      skill: best,
      attr,
      threshold,
      mode,
      routine,
      dice: attrValue + level + thorough,
      poolLabel: `${best && attr ? `${attr} ${attrValue} + ${SKILL_BY_KEY[best].name} ${level}` : "No skill"}${thorough ? ` + Thorough ${thorough}` : ""}`,
      blocker,
    },
    def,
    mastery && best ? level - threshold : null,
    def.effect === "project",
  );
}

/** Levels the crafter stands above a recipe's Routine Threshold, using their best listed skill. */
export function craftMargin(c: Character, r: CraftRecipe) {
  return Math.max(...recipeSkills(r).map((s) => skillLevel(c, s.skill) - s.threshold));
}

const REDLINE = "Redline Familiarity";

const REDLINE_KEY = `day:${REDLINE}`;

/** An Expert crafter stands 6 levels above every item's threshold, which earns one item beyond the usual two. */
function expertCrafter(c: Character, crafts: string[]) {
  const recipes = crafts.map((n) => RECIPE_BY_NAME[n]).filter(Boolean);
  return recipes.length > 0 && recipes.every((r) => craftMargin(c, r) >= EXPERT_MARGIN);
}

/** Items one Fabricate task normally makes: two, or three for an Expert. */
function normalFabricateLimit(c: Character, crafts: string[]) {
  return FABRICATE_ITEMS + (expertCrafter(c, crafts) ? 1 : 0);
}

/** Redline Familiarity's overdrive, once per day, adds one more item beyond the normal limit. */
export const redlineReady = (c: Character) => c.specialty === REDLINE && !c.abilityUsed[REDLINE_KEY];

export function fabricateLimit(c: Character, crafts: string[]) {
  return normalFabricateLimit(c, crafts) + (redlineReady(c) ? 1 : 0);
}

/**
 * The task's Energy covers every item the crafter is allowed: two normally, three for an Expert, and
 * one more again for a Redline overdrive. Only an item past that allowance pays the Energy again.
 */
function craftTerms(c: Character, crafts: string[], energy: number): TaskTerms {
  const terms = craftCheck(c, crafts, energy, TASK_BY_NAME["Fabricate Common Item"]);
  if (c.pressure >= OVERTAXED) terms.routine = false;
  if (crafts.length <= 1) return terms;
  const extra = Math.max(0, crafts.length - fabricateLimit(c, crafts));
  const perk = extra > 0 ? `${crafts.length} items: ${extra} past the limit, at full Energy each` : `${crafts.length} items for one Energy cost`;
  return { ...terms, energy: terms.energy * (1 + extra), perks: [...terms.perks, perk] };
}

/** Reaching past the normal limit spends Redline Familiarity for the day. The bench takes no harm. */
function redlineOverdrive(c: Character, crafts: string[], out: string[]) {
  if (c.specialty !== REDLINE || crafts.length <= normalFabricateLimit(c, crafts)) return;
  c.abilityUsed[REDLINE_KEY] = true;
  out.push(`${c.name} overdrives the bench with Redline Familiarity for one item past the usual limit.`);
}

/**
 * One check covers every item. Its terms come from the hardest item: Routine when the crafter meets
 * every recipe's threshold, −1 Energy when they clear them all by 3, otherwise −1d6 per level short.
 * `hindrance` is a station's own penalty, which costs dice and keeps the work off Routine.
 */
function craftCheck(c: Character, crafts: string[], energy: number, def: ShipboardTask, hindrance?: { dice: number; label: string }, blocker: string | null = null): TaskTerms {
  let worst: { skill: SkillKey; threshold: number; margin: number } | null = null;
  for (const name of crafts) {
    const r = RECIPE_BY_NAME[name];
    if (!r) continue;
    const pick = recipeSkills(r)
      .map((s) => ({ ...s, margin: skillLevel(c, s.skill) - s.threshold }))
      .reduce((b, s) => (s.margin > b.margin ? s : b));
    if (!worst || pick.margin < worst.margin) worst = pick;
  }
  if (!worst) return withMastery({ energy, skill: null, attr: null, threshold: 0, mode: "routine", routine: true, dice: 0, poolLabel: "No skill", blocker }, def, null, false);
  const level = skillLevel(c, worst.skill);
  const attr = SKILL_BY_KEY[worst.skill].attr;
  const attrValue = attributeValue(c, attr);
  const short = Math.max(0, -worst.margin);
  const rough = hindrance?.dice ?? 0;
  const against = short + rough;
  return withMastery(
    {
      energy,
      skill: worst.skill,
      attr,
      threshold: worst.threshold,
      mode: against ? "skilled" : "routine",
      routine: against === 0,
      dice: Math.max(0, attrValue + level - against),
      poolLabel: `${attr} ${attrValue} + ${SKILL_BY_KEY[worst.skill].name} ${level}${short ? ` − ${short}d6 below ${worst.threshold}` : ""}${rough ? ` − ${rough}d6 ${hindrance!.label}` : ""}`,
      blocker,
    },
    def,
    worst.margin,
    false,
  );
}

/**
 * Cooking one recipe: Cooking at the recipe's own threshold, and the galley's own penalty on every
 * roll made in it, which also keeps the work off Routine until the crew has a Processing Suite.
 */
function cookTerms(g: GameState, c: Character, crafts: string[], energy: number): TaskTerms {
  const level = stationLevel(g, "kitchen");
  const penalty = galleyPenalty(level);
  const recipe = RECIPE_BY_NAME[crafts[0]];
  const terms = craftCheck(
    c,
    crafts,
    energy,
    TASK_BY_NAME["Prepare Food"],
    penalty > 0 ? { dice: penalty, label: `${stationLevelName("kitchen", level)}` } : undefined,
    recipe ? craftBlocker(g, recipe) : null,
  );
  if (c.pressure >= OVERTAXED) terms.routine = false;
  return terms;
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
    const built = completeModuleWork(g, x);
    if (built) out.push(built);
    const patient = x.patientId ? g.characters.find((c) => c.id === x.patientId) : undefined;
    if (x.patientId && patient) {
      const roll = d(4);
      out.push(`Stress Recovery rolls 1d4 + 2 = ${roll + 2}.`);
      changeStress(patient, -(roll + 2), out);
      if (patient.willpower < maxWillpower(patient)) {
        patient.willpower = maxWillpower(patient);
        out.push(`${patient.name}'s Willpower is restored.`);
      }
    } else if (x.patientId) {
      out.push("The patient is no longer aboard, so no Stress is recovered.");
    }
    if (x.name === "Expand Ship") {
      g.ship.rooms.push(roomFromPreset(null, "New Room"));
      out.push("A new empty room is sealed and pressurized.");
    }
    if (x.name === "Xenoflora Cultivation" && !g.research.xenoflora) {
      g.research.xenoflora = true;
      out.push("☣ The strain takes to the nutrient bath. Hydroponics will now accept a Xenoflora sowing, tuned against one condition.");
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
  /**
   * What a Search came away with: one label from `SALVAGE_BUNDLES` per bundle. Each costs the site a
   * point of Salvage Capacity. An empty list means it found something that isn't ordinary salvage.
   */
  bundles?: string[];
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
  const bits = [a.thorough ? `a Thorough ${a.task}` : a.task];
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
export function resolveAction(g: GameState, id: string, r: Resolution): (string | Line)[] {
  const a = g.actions.find((x) => x.id === id);
  if (!a) return [];
  const c = g.characters.find((x) => x.id === a.characterId);
  const def = taskFor(a);
  a.status = r.status;
  a.outcome = r.outcome.trim() || undefined;
  if (r.status === "cancelled") return [`${c?.name ?? "Someone"} calls off ${describe(g, a)}.`];
  const out: string[] = [];
  /**
   * Lines only the GM reads, which so far means what a Search leaves of the site's Salvage Capacity.
   * They're kept apart because `out` is the sink every other effect writes into, and appended last,
   * which is where the log shows them: after the account of the task they came out of.
   */
  const hidden: Line[] = [];
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
  // Catching Your Breath buys the one Pressure level and nothing else Rest would give.
  if (c && ok && def.effect === "breath") {
    if (c.pressure > pressureFloor(c.stress)) {
      c.pressure -= 1;
      out.push(`${c.name} gets their breath back: Pressure eases to ${PRESSURE_STATES[c.pressure].name}.`);
    } else out.push(`${c.name} is already as settled as their Stress allows.`);
  }
  if (ok && def.effect === "project" && a.projectId) out.push(...advanceProject(g, a.projectId, terms.progress));
  if (ok && def.effect === "tend") tendCrops(g, out);
  if (ok && def.effect === "harvest") harvestCrops(g, out, Math.floor(Math.max(0, terms.margin ?? 0) / 3) + (strong ? 1 : 0));
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
  if (ok && def.effect === "purify") {
    const filter = bestWaterFilter(g);
    if (!filter) out.push("⚠ No water filter in the hold, so nothing is purified.");
    else {
      spendUse(g, filter.name);
      stockItem(g, "Water Unit", filter.units, { category: "Supply" });
      out.push(`One charge of a ${filter.name} purifies ${filter.units} Water Units into ship storage.`);
    }
  }
  if (ok && def.effect === "reclaim") {
    if (g.ship.reclaimed) out.push("⚠ Life Support's reclaimed water was already drawn today.");
    else {
      const units = RECLAIMED_WATER + (strong ? 1 : 0);
      g.ship.reclaimed = true;
      stockItem(g, "Water Unit", units, { category: "Supply" });
      out.push(`${units} Water Units come out of Life Support's reclamation tanks, all it holds today.`);
    }
  }
  if (ok && def.effect === "search") {
    for (const line of recordSearch(g, a.characterId, r.bundles ?? [])) {
      if (typeof line === "string") out.push(line);
      else hidden.push(line);
    }
    if (a.thorough) out.push(THOROUGH_NOTE);
  }
  // A failed Search still takes its two Turns and still makes a noise, but leaves the room searchable.
  if (!ok && def.effect === "search" && a.thorough) out.push(THOROUGH_NOTE);
  if (ok && def.effect === "salvage") {
    const recipe = a.crafts?.[0] ? RECIPE_BY_NAME[a.crafts[0]] : undefined;
    const allowed = a.approval === "granted";
    if (!recipe) out.push("⚠ Nothing came apart: no item was chosen.");
    else if (!takeOne(g, recipe.name) && !allowed) out.push(`⚠ No ${recipe.name} in the hold to take apart.`);
    else {
      const parts = salvageParts(recipe, strong);
      for (const p of parts) stockItem(g, p.name, p.qty, { category: "Material" });
      out.push(parts.length ? `${recipe.name} comes apart into ${recipeText(parts)}, added to ship storage.` : `${recipe.name} comes apart, but nothing usable survives.`);
    }
  }
  if (def.effect === "medicine") {
    for (const name of a.crafts ?? []) {
      const recipe = RECIPE_BY_NAME[name];
      if (recipe) out.push(fabricate(g, recipe, ok, a.approval === "granted"));
    }
  }
  if (ok && def.effect === "calm") {
    const subject = g.characters.find((x) => x.id === a.subjectId);
    if (!subject || subject.dead) out.push("⚠ Nobody was there to settle.");
    else {
      if (subject.pressure > pressureFloor(subject.stress)) {
        subject.pressure -= 1;
        out.push(`${subject.name}'s Pressure eases to ${PRESSURE_STATES[subject.pressure].name}.`);
      } else out.push(`${subject.name} is already as settled as their Stress allows.`);
      if (strong) {
        subject.encouraged = true;
        out.push(`${subject.name} takes heart: +1d6 on their next roll.`);
      }
    }
  }
  if (ok && def.effect === "bleed") {
    const subject = g.characters.find((x) => x.id === a.subjectId);
    const kit = plainestKit(g, a.characterId);
    if (!subject || subject.dead) out.push("⚠ Nobody was there to treat.");
    else if (!kit || !spendKit(g, kit)) out.push(`⚠ ${c?.name ?? "The medic"} has no medkit to hand, so the Bleeding goes on.`);
    else {
      const bleeding = subject.conditions.some((x) => x.name === "Bleeding");
      subject.conditions = subject.conditions.filter((x) => x.name !== "Bleeding");
      const used = kit.location === "ship" ? `the ship's ${kit.name}` : `their own ${kit.name}`;
      out.push(bleeding ? `${subject.name} stops Bleeding, using ${used}.` : `${subject.name} wasn't Bleeding, but ${used} is used up patching them anyway.`);
    }
  }
  if (ok && def.effect === "morale") {
    const lifted = g.characters.filter((x) => !x.dead && x.id !== c?.id && x.pressure > pressureFloor(x.stress));
    for (const x of lifted) x.pressure -= 1;
    out.push(lifted.length ? `Pressure eases for ${lifted.map((x) => x.name).join(", ")}.` : "Nobody was under Pressure, but spirits lift anyway.");
  }
  if (ok && def.effect === "tune") {
    g.ship.tuned = true;
    out.push("The reactor runs hot and clean: +1 Power Unit until the end of the day.");
  }
  if (ok && def.effect === "patch") {
    if (g.ship.hullHp > 0) out.push("⚠ The hull is still holding, so a brace adds nothing: temporary Hull HP can't take the ship above 1.");
    else if (g.ship.tempHull > 0) out.push("⚠ A patch is already wedged in place.");
    else {
      g.ship.tempHull = 1;
      out.push("Braced by hand: 1 temporary Hull HP, which the next Hit will take.");
    }
  }
  if (def.effect === "train" && c && a.trainSkill) {
    const cost = trainingCost(c, a.trainSkill);
    if (!cost) out.push(`⚠ ${SKILL_BY_KEY[a.trainSkill].name} is already maxed out.`);
    else if (haveInStorage(g, cost.name) < 1) out.push(`⚠ No ${cost.name} in the hold, so the training earns no XP.`);
    else {
      // A training resource with charges gives up one charge, not the whole unit.
      spendUse(g, cost.name);
      out.push(ok ? `Used 1 ${cost.name}. ${gainXp(c, a.trainSkill)}` : `1 ${cost.name} is used up, but the session earns no XP.`);
    }
  }
  if (ok && def.effect === "rations") {
    g.ship.rationsStretched = true;
    out.push("Rations are stretched: tonight every 3 Food Units feed 4 survivors.");
  }
  if (ok && def.effect === "assist" && c) {
    const target = assistTarget(g, a);
    const effect = assistEffect(g, a);
    const who = g.characters.find((x) => x.id === target?.characterId)?.name ?? "them";
    if (target && effect.progress > 0 && target.projectId) out.push(...advanceProject(g, target.projectId, effect.progress));
    else for (const warning of effect.warnings) out.push(`${c.name} helps, but ${warning.replace(/^[A-Z]/, (m) => m.toLowerCase())}.`);
    if (effect.dice > 0) out.push(`${c.name}'s help is ready: +${effect.dice}d6 on ${who}'s roll.`);
  }
  if (!ok && def.effect === "assist" && c) out.push(`${c.name}'s help comes to nothing: no bonus dice.`);
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
      if (recipe) out.push(fabricate(g, recipe, r.crafted?.[i] ?? ok, a.approval === "granted"));
    });
    if (c) redlineOverdrive(c, a.crafts ?? [], out);
  }
  if (def.effect === "cook") {
    for (const name of a.crafts ?? []) {
      const recipe = RECIPE_BY_NAME[name];
      if (recipe) out.push(cook(g, recipe, ok, strong ? 1 : 0, a.approval === "granted"));
    }
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
  return hidden.length ? [...out, ...hidden] : out;
}

/**
 * Dice for rolling a task: Attribute + Skill, Pressure dice, injuries, conditions, each assistant's
 * skill (up to +4d6), and the unscanned-tile penalty.
 *
 * `asks` are the condition penalties whose scope the rules leave to a ruling. They are reported
 * rather than applied, so nothing is quietly decided on the GM's behalf.
 */
export function taskPool(g: GameState, a: SegmentAction): { dice: number; parts: string[]; asks: ConditionAsk[]; blocked: string | null } {
  const c = g.characters.find((x) => x.id === a.characterId);
  const terms = taskTerms(g, a);
  let dice = terms.dice;
  const parts = [terms.poolLabel];
  const pressure = c ? PRESSURE_STATES[c.pressure] : null;
  if (pressure?.dice) {
    dice += pressure.dice;
    parts.push(`${pressure.name} ${pressure.dice}`);
  }
  const hurt = c && terms.attr ? injuryPenalty(c, terms.skill, terms.attr) : null;
  if (hurt?.dice) {
    dice -= hurt.dice;
    parts.push(...hurt.sources);
  }
  // Unlike the injury penalty, this runs even when the task rolls no attribute: being unconscious
  // stops a survivor doing anything, whether or not the task has a stat attached to it.
  const cond = c ? conditionPenalty(c, { skill: terms.skill, attr: terms.attr }) : null;
  if (cond?.dice) {
    dice += cond.dice;
    parts.push(...cond.sources);
  }
  if (c?.encouraged) {
    dice += 1;
    parts.push("Encouraged +1");
  }
  const helper = bestAssistant(g, a, terms.skill, terms.labor);
  if (helper) {
    dice += helper.dice;
    parts.push(`${helper.name} assists ${helper.dice}`);
  }
  if (a.task === "Plot Unsafe Course" && unscannedTarget(g, a)) {
    dice -= 3;
    parts.push("unscanned −3");
  }
  return { dice: Math.max(0, dice), parts, asks: cond?.asks ?? [], blocked: cond?.blocked ?? null };
}

/**
 * Only one assistant adds dice, and only once their own Assist has succeeded: the best Skill Level,
 * up to +4d6. On Labor it's the helper's Strength instead, since Labor has no skill to lend.
 */
function bestAssistant(g: GameState, a: SegmentAction, skill: SkillKey | null, labor = false) {
  let best: { name: string; dice: number } | null = null;
  for (const x of g.actions) {
    if (x.assists !== a.id || !(x.status === "success" || x.status === "strong")) continue;
    const helper = g.characters.find((h) => h.id === x.characterId);
    const lent = helper ? (labor ? attributeValue(helper, "STR") : skill ? skillLevel(helper, skill) : 0) : 0;
    const level = Math.min(ASSIST_MAX_DICE, lent);
    if (helper && level > (best?.dice ?? 0)) best = { name: helper.name, dice: level };
  }
  return best;
}

/** Assists on this task that nobody has rolled yet: their dice are not in the pool. */
export function pendingAssists(g: GameState, a: SegmentAction) {
  return g.actions
    .filter((x) => x.assists === a.id && x.status === "planned")
    .map((x) => g.characters.find((h) => h.id === x.characterId)?.name ?? "Someone");
}

function unscannedTarget(g: GameState, a: SegmentAction) {
  const map = a.target ? g.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star") : undefined;
  return !!map && !!a.target && !map.tiles[cellKey(a.target.x, a.target.y)];
}

/** Overtaxed or worse: work can't be Routine any more. */
const OVERTAXED = 3;

/** A Push rerolls failed dice once. */
export function canPush(g: GameState, a: SegmentAction) {
  return !!a.roll && !a.roll.pushed && a.roll.dice.some((v) => v !== 6) && g.characters.some((x) => x.id === a.characterId);
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
  const out = [`${c.name} rolls for ${describe(g, a)} (${pool.dice}d6): ${rollText(a.roll.dice)}.`];
  if (c.encouraged) {
    delete c.encouraged;
    out.push(`${c.name}'s encouragement is spent.`);
  }
  return out;
}

/** Push: −1 Energy and +1 Pressure, then reroll every die that isn't a 6, plus any new Pressure dice. */
export function pushTask(g: GameState, id: string): string[] {
  const a = g.actions.find((x) => x.id === id);
  const c = a && g.characters.find((x) => x.id === a.characterId);
  if (!a?.roll || !c || !canPush(g, a)) return [];
  const out: string[] = [];
  const before = PRESSURE_STATES[c.pressure].dice;
  payPush(g, c, out);
  const kept = a.roll.dice.filter((v) => v === 6);
  const extra = Math.max(0, PRESSURE_STATES[c.pressure].dice - before);
  a.roll = { dice: [...kept, ...rollPool(a.roll.dice.length - kept.length + extra)], pushed: true };
  return [...out, `Reroll: ${rollText(a.roll.dice)}.`];
}

export const FIRST_AID = "First Aid: Minor Injury";

/** The healer's First Aid pool, as if it were their task this segment. */
export function firstAidPool(g: GameState, healer: Character) {
  const p = taskPool(g, newAction(g, healer, FIRST_AID));
  return { dice: p.dice, label: p.parts.join(" + ") };
}

/** Kits that make First Aid possible, best first. Using one spends it, adds its dice, and heals its HP. */
export const MEDKITS = [
  { name: "Glitterworld Medkit", dice: 3, heal: 5 },
  { name: "Medkit", dice: 1, heal: 3 },
  { name: "Improvised Medkit", dice: 0, heal: 1 },
] as const;

export type KitSource = { name: string; location: string };

/** Medkits the healer can use: their own inventory, then ship storage. */
export function medkitsFor(g: GameState, healerId: string): (KitSource & { qty: number; dice: number; heal: number })[] {
  const out: (KitSource & { qty: number; dice: number; heal: number })[] = [];
  for (const location of [healerId, "ship"]) {
    for (const kit of MEDKITS) {
      const qty = g.items.filter((i) => i.location === location && i.name === kit.name && !i.broken).reduce((s, i) => s + i.qty, 0);
      if (qty > 0) out.push({ name: kit.name, location, qty, dice: kit.dice, heal: kit.heal });
    }
  }
  return out;
}

const spendKit = (g: GameState, kit: KitSource) => spendUse(g, kit.name, kit.location);

/**
 * First Aid is a free skilled roll (no segment, no Energy) that spends one medkit from the healer's
 * inventory or ship storage. The kit heals its HP and adds its dice. Treating an Untreated injury (any
 * severity) takes the first 6; every other 6 clears one of `clear` (condition ids, in order), then heals 1 HP.
 */
export function giveFirstAid(g: GameState, healerId: string, patientId: string, injuryId: string | null, kit: KitSource, clear: string[] = []): string[] {
  const healer = g.characters.find((x) => x.id === healerId);
  const patient = g.characters.find((x) => x.id === patientId);
  const injury = injuryId ? patient?.injuries.find((i) => i.id === injuryId) : undefined;
  if (!healer || !patient || patient.dead) return ["There's no one to treat."];
  if (injuryId && (!injury || injury.state !== "Untreated")) return ["That injury no longer needs First Aid."];
  if (healer.dead) return [`${healer.name} can't give First Aid.`];
  const def = MEDKITS.find((k) => k.name === kit.name);
  if (!def || (kit.location !== healerId && kit.location !== "ship") || !spendKit(g, kit)) return [`${healer.name} has no ${kit.name} to hand.`];
  const target = injury ? ` for ${injury.name}` : "";
  const who = healer.id === patient.id ? `${healer.name} gives themselves First Aid${target}` : `${healer.name} gives ${patient.name} First Aid${target}`;
  const out = [`🩹 ${who}, using ${kit.location === "ship" ? `the ship's ${kit.name}` : `their ${kit.name}`}.`];
  const dice = rollPool(firstAidPool(g, healer).dice + def.dice);
  if (healer.encouraged) {
    delete healer.encouraged;
    out.push(`${healer.name}'s encouragement is spent.`);
  }
  let extra = sixes(dice);
  const shown = `[${dice.join(", ")}]`;
  if (patient.hp === 0) {
    if (extra === 0) {
      out.push(`${shown}: no 6, so ${patient.name} isn't stabilized and death checks continue.`);
      return out;
    }
    extra -= 1;
    patient.stabilized = true;
    out.push(`${shown}: ${patient.name} is stabilized. No more death checks.`);
  }
  const kitHeal = Math.min(recoveredHp(patient, def.heal), maxHp(patient) - patient.hp);
  if (kitHeal > 0) {
    patient.hp += kitHeal;
    delete patient.stabilized;
    out.push(`The ${kit.name} heals ${kitHeal} HP (${patient.hp}/${maxHp(patient)}).`);
  }
  if (injury) {
    if (extra === 0) {
      out.push(`${shown}: no 6, so ${injury.name} stays Untreated.`);
      return out;
    }
    injury.state = "Treated";
    extra -= 1;
    out.push(`${shown}: ${injury.name} is Treated.${injury.severity !== "Minor" && !injury.operated ? " It still needs Surgery to become a Minor injury." : ""}`);
  } else out.push(`${shown}: ${extra ? `${extra} six${extra > 1 ? "es" : ""}` : "no 6s"}.`);
  for (const id of clear) {
    const cond = patient.conditions.find((x) => x.id === id);
    if (!cond || extra <= 0) continue;
    patient.conditions = patient.conditions.filter((x) => x.id !== id);
    extra -= 1;
    out.push(`A 6 clears ${patient.name}'s ${cond.name}.`);
  }
  const hp = Math.min(recoveredHp(patient, extra), maxHp(patient) - patient.hp);
  if (recoveredHp(patient, extra + def.heal) < extra + def.heal) out.push(`Internal Bleeding halves ${patient.name}'s healing.`);
  if (hp > 0) {
    patient.hp += hp;
    delete patient.stabilized;
    out.push(`${hp > 1 ? `${hp} sixes heal` : "A 6 heals"} ${hp} HP (${patient.hp}/${maxHp(patient)}).`);
  }
  return out;
}

export function newAction(g: GameState, c: Character, task: string): SegmentAction {
  const action: SegmentAction = { id: uid(), characterId: c.id, day: g.day, segment: g.segment, task, detail: "", projectId: null, target: null, assists: null, status: "planned" };
  // Eight Expedition Turns fit in a segment and each allows one task, so a task taken off the ship
  // is stamped with the Turn it belongs to. Aboard, there's no Turn and the key stays absent.
  if (g.expedition?.crew.includes(c.id)) action.turn = g.expedition.turn;
  return action;
}
