import { moduleLevel } from "./crafting";
import { stockItem } from "./stock";
import type { Crop, GameState } from "./types";

export const CROP_DAYS = 3;
/** Raw Food per crop by Hydroponics level: Dead, Seeded, Operational, Expanded, Self-Sustaining. */
export const CROP_YIELD = [0, 4, 6, 8, 10];
export const CROP_LEVEL_NAMES = ["Dead", "Seeded", "Operational", "Expanded", "Self-Sustaining"];

/** The best working Hydroponics level aboard: -1 with none, 0 when it's Dead. */
export const hydroponicsLevel = (g: GameState) => moduleLevel(g, "Hydroponics");

export const cropOf = (g: GameState): Crop => g.ship.crop ?? { growing: false, day: 0, plantedDay: 0, tended: [], ready: 0 };

/** Why tonight's growth would stall, or null if the crop grows. */
export function cropStall(g: GameState): string | null {
  const level = hydroponicsLevel(g);
  const crop = cropOf(g);
  if (level < 1) return level < 0 ? "No working Hydroponics aboard" : "Hydroponics is Dead";
  if (!crop.growing) return level >= 4 ? null : "Nothing is planted";
  if (level === 1 && !crop.tended.includes(g.day)) return "Seeded Hydroponics needs Maintain Crops every day";
  if (level === 2 && crop.day === CROP_DAYS - 1 && !crop.tended.some((d) => d > crop.plantedDay)) return "Needs Maintain Crops on its second or third day";
  return null;
}

/** A successful Maintain Crops: seed the module if it's empty, otherwise tend today's crop. */
export function tendCrops(g: GameState, out: string[]) {
  const level = hydroponicsLevel(g);
  if (level < 1) return void out.push(`⚠ Nothing to tend: ${level < 0 ? "there's no working Hydroponics" : "Hydroponics is Dead"}.`);
  const crop = cropOf(g);
  if (!crop.growing) {
    g.ship.crop = { ...crop, growing: true, day: 0, plantedDay: g.day, tended: [g.day] };
    return void out.push(`🌱 New crops are seeded. ${CROP_YIELD[level]} Raw Food in ${CROP_DAYS} days.`);
  }
  g.ship.crop = { ...crop, tended: [...new Set([...crop.tended, g.day])] };
  out.push(`🌱 The crops are tended (day ${crop.day + 1} of ${CROP_DAYS}).`);
}

/** End of Day: grow the crop a day, and bank its food when it's done. */
export function growCrops(g: GameState, out: string[]) {
  const level = hydroponicsLevel(g);
  let crop = cropOf(g);
  if (level >= 4 && !crop.growing) crop = { ...crop, growing: true, day: 0, plantedDay: g.day, tended: [] };
  if (!crop.growing) return;
  const stall = cropStall({ ...g, ship: { ...g.ship, crop } });
  if (stall) {
    g.ship.crop = crop;
    return void out.push(`🌱 The crops don't grow today. ${stall}.`);
  }
  crop = { ...crop, day: crop.day + 1 };
  if (crop.day < CROP_DAYS) {
    g.ship.crop = crop;
    return void out.push(`🌱 The crops grow (${crop.day}/${CROP_DAYS} days).`);
  }
  const food = CROP_YIELD[level];
  const again = level >= 3;
  g.ship.crop = { growing: again, day: 0, plantedDay: g.day + 1, tended: [], ready: crop.ready + food };
  out.push(`🌾 The crops are ready: ${food} Raw Food waiting in Hydroponics (${crop.ready + food} to harvest).${again ? " A new crop starts on its own." : " Maintain Crops to plant again."}`);
}

/** A successful Harvest Hydroponics: move everything that's ready into the hold. Returns how much. */
export function harvestCrops(g: GameState, out: string[]) {
  const crop = cropOf(g);
  if (crop.ready <= 0) {
    out.push("⚠ Nothing is ready to harvest yet.");
    return 0;
  }
  stockItem(g, "Raw Food", crop.ready, { category: "Supply" });
  out.push(`🌾 Harvested ${crop.ready} Raw Food into ship storage.`);
  g.ship.crop = { ...crop, ready: 0 };
  return crop.ready;
}
