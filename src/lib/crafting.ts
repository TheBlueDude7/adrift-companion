import { RECIPES, REFINING, recipeMaterialTier, type CraftRecipe, type Station } from "@/data/crafting";
import type { Recipe } from "@/data/cybernetics";
import { ladderFor } from "@/data/ship-upgrades";
import { SKILLS, type SkillKey } from "./rules";
import { recipeText, shortfalls, spend, stockItem } from "./stock";
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
  stockItem(g, name, qty, { category: recipe.category, tier: recipe.tier, maxCharges: recipe.charges, armor: recipe.armor, notes: recipe.notes });
}

/** Recipes the Fabricate Common Item task can make. Kitchen recipes are cooked with Prepare Food instead. */
export const FABRICATE_RECIPES = RECIPES.filter((r) => r.station !== "kitchen");
export const RECIPE_BY_NAME = Object.fromEntries(RECIPES.map((r) => [r.name, r])) as Record<string, CraftRecipe>;

/** Items per Fabricate Common Item task. Redline Familiarity's once-a-day overdrive makes it 3. */
export const FABRICATE_LIMIT = 2;
export const fabricateLimit = (specialty: string | null | undefined) => (specialty === "Redline Familiarity" ? FABRICATE_LIMIT + 1 : FABRICATE_LIMIT);

const TIER_THRESHOLD: Record<string, number> = { "Tier I": 3, "Tier II": 6, "Tier III": 9 };

/** Skills that can make a recipe, with their Routine Thresholds. Recipes without a listed skill use Mechanical Technician by tier. */
export function recipeSkills(recipe: CraftRecipe): { skill: SkillKey; threshold: number }[] {
  const out: { skill: SkillKey; threshold: number }[] = [];
  for (const part of (recipe.skill ?? "").split(/\s+or\s+/)) {
    const m = part.trim().match(/^(.+?)\s+(\d+)$/);
    const key = m && SKILLS.find((s) => s.name.toLowerCase() === m[1].toLowerCase())?.key;
    if (key) out.push({ skill: key, threshold: Number(m[2]) });
  }
  return out.length ? out : [{ skill: "mechTech", threshold: TIER_THRESHOLD[recipe.tier ?? ""] ?? 3 }];
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
 * materials (rounded up); the rest go back to the hold. Refuses when the hold is short or the station is missing.
 */
export function fabricate(g: GameState, recipe: CraftRecipe, success: boolean): string {
  const blocker = craftBlocker(g, recipe);
  if (blocker) return `⚠ ${recipe.name} wasn't made: ${blocker.toLowerCase()}.`;
  const short = shortfalls(g, recipe.inputs, recipe.toolkit);
  if (short.length) return `⚠ ${recipe.name} wasn't made: the hold is short ${short.map((s) => `${s.need - s.have} ${s.name}`).join(", ")}.`;
  if (success) {
    spend(g, recipe.inputs, recipe.toolkit);
    stockOutput(g, recipe, recipe.name, recipe.output);
    return `${recipe.output}× ${recipe.name} added to ship storage (spent ${recipeText(recipe.inputs, recipe.toolkit)}).`;
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
