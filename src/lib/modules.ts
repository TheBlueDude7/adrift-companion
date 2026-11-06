import type { Recipe } from "@/data/cybernetics";
import { FACILITIES, ladderFor, SOLAR_FUEL_PER_DAY, SOLAR_PANELS } from "@/data/ship-upgrades";
import { MODULE_PRESETS } from "./rules";
import { stockItem } from "./stock";
import type { GameState, Project, Room } from "./types";

/** Move a room to a level on its module's ladder, taking that level's facility grade and reactor output. */
export function setRoomLevel(r: Room, index: number) {
  const ladder = ladderFor(r.module);
  if (!ladder) return;
  r.level = index;
  const step = ladder.levels[index];
  if (step.grade) r.grade = step.grade;
  if (step.powerOutput !== undefined) r.powerOutput = step.powerOutput;
}

/** Levels a module can be installed at in an empty room: up to and including the first one with a build cost. */
export function installLevels(module: string) {
  const ladder = ladderFor(module);
  if (!ladder) return [];
  const first = ladder.levels.findIndex((l) => l.cost.length > 0);
  return ladder.levels.slice(0, first < 0 ? 1 : first + 1);
}

/** Materials and toolkit charges to build a module at a ladder level, or a one-off facility. */
export function moduleCost(module: string, level: number | undefined): { cost: Recipe; toolkit: number } {
  const step = level === undefined ? undefined : ladderFor(module)?.levels[level];
  if (step) return { cost: step.cost, toolkit: step.toolkit };
  const f = FACILITIES.find((x) => x.name === module);
  return { cost: f?.cost ?? [], toolkit: f?.toolkit ?? 0 };
}

/** The next level on a room's upgrade ladder, if it has one. */
export function nextRoomLevel(r: Room) {
  if (r.level === undefined) return undefined;
  const step = ladderFor(r.module)?.levels[r.level + 1];
  return step ? { index: r.level + 1, step } : undefined;
}

/**
 * Rooms whose solar panels are collecting. Panels need no power, but a dead room gathers nothing.
 * Campaigns that built panels before they had a slot of their own still have them as a room's module.
 */
export const solarRooms = (g: GameState) =>
  g.ship.rooms.filter((r) => (r.fitting === SOLAR_PANELS || r.module === SOLAR_PANELS) && r.condition !== "Offline" && r.condition !== "Destroyed");

/** Overnight, every working set of solar panels adds its Fuel to the hold. */
export function runSolarPanels(g: GameState, out: string[]) {
  const sets = solarRooms(g).length;
  if (sets === 0) return;
  const fuel = sets * SOLAR_FUEL_PER_DAY;
  stockItem(g, "Fuel Unit", fuel, { category: "Supply" });
  out.push(`☀ ${sets} set${sets > 1 ? "s" : ""} of solar panels collect ${fuel} Fuel Unit${fuel > 1 ? "s" : ""} into ship storage.`);
}

const PLACEHOLDER_NAMES = new Set(["Empty Room", "New Room"]);

/** Finish an Install or Upgrade Module project: its room gets the module at the planned level. */
export function completeModuleWork(g: GameState, p: Project): string | null {
  if (!p.module) return null;
  const r = g.ship.rooms.find((x) => x.id === p.roomId);
  if (!r) return `The room for ${p.name} is gone, so nothing is installed.`;
  const { name, level } = p.module;
  const upgrade = r.module === name;
  const was = r.name;
  if (!upgrade) {
    const preset = MODULE_PRESETS.find((m) => m.name === name);
    const facility = FACILITIES.find((f) => f.name === name);
    r.module = name;
    r.level = undefined;
    r.powerDraw = preset?.powerDraw ?? facility?.powerDraw ?? 0;
    r.powerOutput = preset?.powerOutput ?? 0;
    r.essential = preset?.essential ?? false;
    if (facility && !ladderFor(name) && !r.notes) r.notes = facility.effect;
    if (PLACEHOLDER_NAMES.has(r.name)) r.name = name;
  }
  if (level !== undefined) setRoomLevel(r, level);
  const step = level === undefined ? undefined : ladderFor(name)?.levels[level];
  const what = upgrade ? `is upgraded to ${step?.name ?? name}` : `now houses ${name}${step ? ` (${step.name})` : ""}`;
  return `🔧 ${was} ${what}.${step ? ` ${step.effect}` : ""}`;
}
