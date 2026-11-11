import { RECIPES, REFINING, recipeMaterialTier, type CraftRecipe, type Station } from "@/data/crafting";
import { CYBERNETICS, CYBER_SYSTEM_BY_KEY, IMPLANT_RECIPES, implantName, type CyberTier, type Recipe } from "@/data/cybernetics";
import { MECH_MODULES, MODULE_RECIPES, moduleItemName } from "@/data/mechs";
import { ladderFor } from "@/data/ship-upgrades";
import { SKILLS, type ItemTier, type SkillKey } from "./rules";
import { intoHold, recipeText, shortfalls, spend, stockItem, type Sink } from "./stock";
import type { GameState } from "./types";

export const STATION_MODULE: Record<Station, string> = {
  workshop: "Workshop / Fabrication Bay",
  kitchen: "Kitchen",
  cyberlab: "Cybernetics Lab",
};

const UNUSABLE = new Set(["Offline", "Destroyed"]);

/**
 * Best working level of a module aboard, or -1 when there's none. Modules without a ladder count as
 * level 0, and so do facilities built into another room (recorded in its notes).
 */
export function moduleLevel(g: GameState, mod: string) {
  const rooms = g.ship.rooms.filter((r) => !UNUSABLE.has(r.condition) && (r.module === mod || r.notes.includes(`${mod}:`)));
  if (rooms.length === 0) return -1;
  return Math.max(...rooms.map((r) => (r.module === mod ? (r.level ?? 0) : 0)));
}

export const stationLevel = (g: GameState, station: Station) => moduleLevel(g, STATION_MODULE[station]);

export function stationLevelName(station: Station, level: number) {
  if (level < 0) return "None aboard";
  return ladderFor(STATION_MODULE[station])?.levels[level]?.name ?? STATION_MODULE[station];
}

/** Highest material tier the Workshop can work: Makeshift Bench I, Operational and Calibrated II, Advanced Fabricator and up III. */
export function workshopTier(level: number) {
  if (level >= 4) return 3;
  if (level >= 2) return 2;
  if (level >= 1) return 1;
  return 0;
}

const ROMAN = ["", "I", "II", "III"];

/** Why the ship can't make this recipe right now, or null. */
export function craftBlocker(g: GameState, recipe: CraftRecipe): string | null {
  if (!recipe.station) return null;
  const level = stationLevel(g, recipe.station);
  const mod = STATION_MODULE[recipe.station];
  if (recipe.station === "cyberlab") return level < 0 ? "Needs a working Cybernetics Lab" : null;
  if (recipe.station === "workshop") {
    const need = recipeMaterialTier(recipe.inputs);
    if (level < 1) return "Needs a working Workshop";
    if (workshopTier(level) < need) return `Tier ${ROMAN[need]} materials need ${need === 3 ? "an Advanced Fabricator" : "an Operational Workshop"}`;
    return null;
  }
  const ladder = ladderFor(mod);
  const min = recipe.stationLevel ? Math.max(1, ladder?.levels.findIndex((l) => l.name === recipe.stationLevel) ?? 1) : 1;
  if (level < min) return `Needs a ${ladder?.levels[min]?.name ?? mod}`;
  return null;
}

export const scaleRecipe = (recipe: Recipe, n: number): Recipe => recipe.map((p) => ({ ...p, qty: p.qty * n }));

export function stockOutput(g: GameState, recipe: CraftRecipe, name: string, qty: number) {
  stockItem(g, name, qty, outputTemplate(recipe));
}

/** The catalog details a recipe's output carries, used whether it reaches the hold now or next segment. */
export const outputTemplate = (recipe: CraftRecipe) => ({
  category: recipe.category,
  tier: recipe.tier,
  maxCharges: recipe.charges,
  armor: recipe.armor,
  heavy: recipe.heavy,
  notes: recipe.notes,
});

/**
 * Where a finished item goes. The bench itself doesn't care: a GM crafting by hand puts it straight in
 * the hold, where a task hands it to the pending queue so it arrives when the segment turns.
 *
 * Passed in rather than imported so this module stays free of the queue, which would otherwise close
 * an import loop back through the biology catalogue.
 */


/** Recipes the Fabricate Common Item task can make. Kitchen recipes are cooked with Prepare Food instead. */
export const FABRICATE_RECIPES = RECIPES.filter((r) => r.station !== "kitchen");

/** Recipes the Prepare Food task cooks. */
export const COOK_RECIPES = RECIPES.filter((r) => r.station === "kitchen");

/** Medicines the Craft Medicine task makes: the ones that need no station at all. */
export const MEDICINE_RECIPES = RECIPES.filter((r) => r.category === "Medical" && !r.station);

/** Items a Deconstruct task can take apart. Nobody unpicks a cooked meal. */
export const SALVAGE_RECIPES = RECIPES.filter((r) => r.station !== "kitchen");

const MODULE_TIER_NAME: Record<1 | 2 | 3, ItemTier> = { 1: "Tier I", 2: "Tier II", 3: "Tier III" };

/** Routine Thresholds the mech sheet sets for building a module, by its tier. */
const MODULE_THRESHOLD: Record<1 | 2 | 3, number> = { 1: 3, 2: 5, 3: 7 };

/**
 * Mech modules as workbench recipes, so building one is an ordinary trip to the bench: the same
 * station rules, the same shortfall checks, the same half-the-materials failure as anything else.
 *
 * The output is the module as an item in the hold, which is what the Mechs tab already installs
 * from. Nothing about fitting one changes — only that it now has to be made first.
 */
export const MECH_MODULE_RECIPES: CraftRecipe[] = MECH_MODULES.map((m) => ({
  name: moduleItemName(m),
  category: "Equipment",
  tier: MODULE_TIER_NAME[m.tier],
  skill: `Mechanical Technician ${MODULE_THRESHOLD[m.tier]} or Engineering ${MODULE_THRESHOLD[m.tier]}`,
  inputs: MODULE_RECIPES[m.tier],
  toolkit: 1,
  station: "workshop",
  output: 1,
  heavy: true,
  notes: m.effect,
}));

/** Routine Thresholds the cybernetics rules set for building an implant, by its tier. */
const IMPLANT_THRESHOLD: Record<CyberTier, number> = { 1: 4, 2: 6, 3: 8 };

/**
 * Cybernetic implants as workbench recipes, so an implant is a thing that exists in the hold rather
 * than something a surgery dialog conjures when it needs one.
 *
 * Every one of them is built around a Cybernetic Core, which only a Cybernetics Lab can make, so the
 * whole path runs through a room the crew has to build: Lab for the Core, Workshop for the implant,
 * Medical Bay for the Surgery that puts it in. A Tier I implant also has a Replacement recipe, which
 * is the cheaper build that restores function and grants nothing.
 */
export const IMPLANT_ITEM_RECIPES: CraftRecipe[] = CYBERNETICS.flatMap((d) => {
  const base = (replacement: boolean): CraftRecipe => ({
    name: implantName(d, replacement),
    category: "Equipment",
    tier: MODULE_TIER_NAME[d.tier],
    skill:
      d.tier === 3
        ? `Engineering ${IMPLANT_THRESHOLD[3]}`
        : `Engineering ${IMPLANT_THRESHOLD[d.tier]} or Mechanical Technician ${IMPLANT_THRESHOLD[d.tier]}`,
    inputs: IMPLANT_RECIPES[replacement ? "replacement" : d.tier],
    toolkit: 1,
    station: "workshop",
    output: 1,
    notes: `${MODULE_TIER_NAME[d.tier]} ${CYBER_SYSTEM_BY_KEY[d.system].name} cybernetic.${replacement ? " Replacement: restores function, grants nothing, and can't be upgraded until it's made Enhanced." : ""} ${d.effects.join(" ")}`,
  });
  // Only Tier I implants can be fitted as Replacements, so only they get the cheaper recipe.
  return d.tier === 1 ? [base(false), base(true)] : [base(false)];
});

/** Dice a rough galley costs every roll made in it: −4d6 Improvised, −2d6 Operational, none in a Processing Suite. */
export const galleyPenalty = (level: number) => (level >= 3 ? 0 : level === 2 ? 2 : 4);

/**
 * Cook one kitchen recipe. The ingredients are spent either way; a botched check makes what the
 * recipe lists for a failure, which for the better meals is a pair of Prepared Meals.
 * A Strong Result adds `extra` to the output.
 */
export function cook(g: GameState, recipe: CraftRecipe, success: boolean, extra = 0, allowed = false, into?: Sink): string {
  const blocker = craftBlocker(g, recipe);
  if (blocker && !allowed) return `⚠ ${recipe.name} wasn't cooked: ${blocker.toLowerCase()}.`;
  const short = shortfalls(g, recipe.inputs, recipe.toolkit);
  if (short.length && !allowed) return `⚠ ${recipe.name} wasn't cooked: the hold is short ${short.map((s) => `${s.need - s.have} ${s.name}`).join(", ")}.`;
  spend(g, recipe.inputs, recipe.toolkit);
  const spent = `spent ${recipeText(recipe.inputs, recipe.toolkit)}${blocker || short.length ? "; the GM allowed it despite what was missing" : ""}`;
  const made = success ? { name: recipe.name, qty: recipe.output + extra } : (recipe.onFailure ?? { name: recipe.name, qty: 0 });
  if (made.qty <= 0) return `${recipe.name} is botched: nothing comes of it (${spent}).`;
  (into ?? intoHold(g))(made.name, made.qty, outputTemplate(RECIPE_BY_NAME[made.name] ?? recipe));
  return `${success ? "Cooked" : "Botched"} ${recipe.name} (${spent}).`;
}
// Mech modules and implants are in the lookup but not in `FABRICATE_RECIPES`, so the bench knows how
// to price one without the Fabricate menu growing by a hundred and fifty entries. They have their
// own tasks.
export const RECIPE_BY_NAME = Object.fromEntries([...RECIPES, ...MECH_MODULE_RECIPES, ...IMPLANT_ITEM_RECIPES].map((r) => [r.name, r])) as Record<string, CraftRecipe>;

const TIER_THRESHOLD: Record<string, number> = { "Tier I": 3, "Tier II": 6, "Tier III": 9 };

/**
 * Skills that can make a recipe, with their Routine Thresholds. Recipes without a listed skill fall
 * back to the station's trade by tier: Cooking in the galley, Mechanical Technician everywhere else.
 */
export function recipeSkills(recipe: CraftRecipe): { skill: SkillKey; threshold: number }[] {
  const out: { skill: SkillKey; threshold: number }[] = [];
  for (const part of (recipe.skill ?? "").split(/\s+or\s+/)) {
    const m = part.trim().match(/^(.+?)\s+(\d+)$/);
    const key = m && SKILLS.find((s) => s.name.toLowerCase() === m[1].toLowerCase())?.key;
    if (key) out.push({ skill: key, threshold: Number(m[2]) });
  }
  const trade: SkillKey = recipe.station === "kitchen" ? "cooking" : "mechTech";
  return out.length ? out : [{ skill: trade, threshold: TIER_THRESHOLD[recipe.tier ?? ""] ?? 3 }];
}

/**
 * What taking one unit apart gives back: half the materials it was made from, rounded down, or three
 * quarters on a Strong Result. The budget comes off the bulkiest inputs first, and toolkit charges never return.
 */
export function salvageParts(recipe: CraftRecipe, strong = false): Recipe {
  const perUnit = recipe.inputs.map((p) => ({ name: p.name, qty: p.qty / recipe.output }));
  let budget = Math.floor(perUnit.reduce((n, p) => n + p.qty, 0) * (strong ? 0.75 : 0.5));
  const out: Recipe = [];
  for (const p of [...perUnit].sort((a, b) => b.qty - a.qty)) {
    const take = Math.min(budget, Math.floor(p.qty));
    if (take <= 0) continue;
    out.push({ name: p.name, qty: take });
    budget -= take;
  }
  return out;
}

/** Combined materials and toolkit charges for a list of recipe names. */
export function fabricateCost(names: string[]) {
  const totals = new Map<string, number>();
  let toolkit = 0;
  for (const n of names) {
    const r = RECIPE_BY_NAME[n];
    if (!r) continue;
    for (const p of r.inputs) totals.set(p.name, (totals.get(p.name) ?? 0) + p.qty);
    toolkit += r.toolkit ?? 0;
  }
  return { inputs: [...totals].map(([name, qty]) => ({ name, qty })), toolkit };
}

/**
 * Make one recipe from ship storage. A failure still spends the toolkit charges and loses half the
 * materials (rounded up); the rest go back to the hold. Refuses when the hold is short or the station is missing,
 * unless the GM allowed it, in which case it uses whatever the hold has.
 */
export function fabricate(g: GameState, recipe: CraftRecipe, success: boolean, allowed = false, into?: Sink): string {
  const blocker = craftBlocker(g, recipe);
  if (blocker && !allowed) return `⚠ ${recipe.name} wasn't made: ${blocker.toLowerCase()}.`;
  const short = shortfalls(g, recipe.inputs, recipe.toolkit);
  if (short.length && !allowed) return `⚠ ${recipe.name} wasn't made: the hold is short ${short.map((s) => `${s.need - s.have} ${s.name}`).join(", ")}.`;
  if (success) {
    spend(g, recipe.inputs, recipe.toolkit);
    (into ?? intoHold(g))(recipe.name, recipe.output, outputTemplate(recipe));
    return `${recipe.output}× ${recipe.name} comes off the bench (spent ${recipeText(recipe.inputs, recipe.toolkit)}${blocker || short.length ? "; the GM allowed it despite what was missing" : ""}).`;
  }
  const lost = recipe.inputs.map((p) => ({ ...p, qty: Math.ceil(p.qty / 2) }));
  spend(g, lost, recipe.toolkit);
  return `${recipe.name} failed: lost ${recipeText(lost, recipe.toolkit)}; the rest goes back to the hold.`;
}

/** Refining ratios available at the ship's current Workshop level. */
export function refiningOptions(g: GameState) {
  const name = stationLevelName("workshop", stationLevel(g, "workshop"));
  return REFINING.map((r) => ({ ...r, ratio: r.by[name] as number | undefined, minLevel: Object.keys(r.by)[0] }));
}
