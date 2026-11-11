import { moduleLevel } from "./crafting";
import type { ItemCategory, ItemTier } from "./rules";
import { intoHold, stockItem, type Sink } from "./stock";
import type { Crop, CropKind, GameState } from "./types";

export const CROP_DAYS = 3;
export const CROP_LEVEL_NAMES = ["Dead", "Seeded", "Operational", "Expanded", "Self-Sustaining"];

export type CropKindDef = {
  key: CropKind;
  /** What the crew calls this planting. */
  name: string;
  /** The item a finished crop leaves in the beds. */
  item: string;
  category: ItemCategory;
  tier: ItemTier;
  /** Harvest by Hydroponics level: Dead, Seeded, Operational, Expanded, Self-Sustaining. */
  yield: number[];
  /** Why you'd give the beds over to it. */
  note: string;
};

/**
 * The beds grow one thing at a time, and the choice is the whole trade-off: calories, medicine, or
 * material. Yields fall as the produce gets scarcer elsewhere, so a chemical crop runs at half a food
 * crop and fiber lower still.
 */
export const CROP_KINDS: CropKindDef[] = [
  { key: "food", name: "Food", item: "Raw Food", category: "Supply", tier: "Tier I", yield: [0, 4, 6, 8, 10], note: "Bulk calories for the galley to cook into meals." },
  { key: "chemical", name: "Chemical", item: "Chemical Mixture", category: "Material", tier: "Tier I", yield: [0, 2, 3, 4, 5], note: "Pharmaceutical stock for Special Brews, Painkillers, and Psychiatric Medication." },
  { key: "fiber", name: "Fiber", item: "Scrapped Biomass", category: "Material", tier: "Tier II", yield: [0, 1, 2, 3, 4], note: "Dense structural growth, cut down and rendered into biological material." },
  { key: "xeno", name: "Xenoflora", item: "Xenoflora Dose", category: "Medical", tier: "Alien", yield: [0, 0, 0, 3, 5], note: "An alien strain tuned against one condition. It needs tending every day and gets loose if it doesn't get it." },
];

export const CROP_KIND_BY_KEY = Object.fromEntries(CROP_KINDS.map((k) => [k.key, k])) as Record<CropKind, CropKindDef>;

/**
 * What a strain can be tuned against. The conditions are the Adaptive Cultivar list; the damage
 * types are the three a biology could plausibly adapt to, which leaves out Ballistic and Physical.
 */
export type XenoStrain = { name: string; kind: "condition" | "damage" };

export const XENO_STRAINS: XenoStrain[] = [
  { name: "Burning", kind: "condition" },
  { name: "Contaminated", kind: "condition" },
  { name: "Freezing", kind: "condition" },
  { name: "Overheated", kind: "condition" },
  { name: "Poisoned", kind: "condition" },
  { name: "Suffocating", kind: "condition" },
  { name: "Fire", kind: "damage" },
  { name: "Electric", kind: "damage" },
  { name: "Chemical", kind: "damage" },
];

const XENO_STRAIN_BY_NAME = Object.fromEntries(XENO_STRAINS.map((s) => [s.name, s])) as Record<string, XenoStrain>;

export const strainOf = (name: string | undefined) => XENO_STRAIN_BY_NAME[name ?? ""] ?? XENO_STRAINS[0];

/** Xenoflora stays off the list until the Xenoflora Cultivation project is finished. */
export const cropKindsFor = (g: GameState) => CROP_KINDS.filter((k) => k.key !== "xeno" || !!g.research?.xenoflora);

/** A dose is named for what it protects against, so strains don't pool together in the hold. */
export const doseName = (name: string | undefined) => {
  const s = strainOf(name);
  return `Xenoflora Dose (${s.name}${s.kind === "damage" ? " Damage" : ""})`;
};

export const doseNote = (name: string | undefined) => {
  const s = strainOf(name);
  return `Taken before an expedition: Resistant to ${s.kind === "damage" ? `${s.name} damage` : s.name} for the expedition.`;
};

/** What the dose is called in a sentence, as in "3 doses of Fire Damage Resistance". */
export const strainLabel = (name: string | undefined) => {
  const s = strainOf(name);
  return `${s.name}${s.kind === "damage" ? " Damage" : ""} Resistance`;
};

/**
 * Doses from one ripe crop. Halving every hit of a damage type for a whole expedition is worth more
 * than shrugging off one condition, so a damage strain yields half as many, rounded down.
 */
export const doseYield = (name: string | undefined, level: number) => {
  const base = cropYield(CROP_KIND_BY_KEY.xeno, level);
  return strainOf(name).kind === "damage" ? Math.floor(base / 2) : base;
};

/** The best working Hydroponics level aboard: -1 with none, 0 when it's Dead. */
export const hydroponicsLevel = (g: GameState) => moduleLevel(g, "Hydroponics");

export const cropOf = (g: GameState): Crop => g.ship.crop ?? { growing: false, day: 0, plantedDay: 0, tended: [], kind: "food", ready: {} };

/** What's in the beds now. */
export const cropKindOf = (g: GameState) => CROP_KIND_BY_KEY[cropOf(g).kind] ?? CROP_KIND_BY_KEY.food;

/** What the next sowing will be, which is whatever is growing unless the crew has chosen to switch. */
export const nextCropKind = (g: GameState) => {
  const crop = cropOf(g);
  return CROP_KIND_BY_KEY[crop.next ?? crop.kind] ?? CROP_KIND_BY_KEY.food;
};

/** What one finished crop of `kind` leaves in the beds at this Hydroponics level. */
export const cropYield = (kind: CropKindDef, level: number) => (level >= 1 ? (kind.yield[level] ?? 0) : 0);

/** Everything waiting to be harvested, whatever it is. */
export const readyTotal = (crop: Crop) => CROP_KINDS.reduce((s, k) => s + (crop.ready[k.key] ?? 0), 0);

export type CropTending = {
  /** Whether this Hydroponics level ever needs Maintain Crops to keep a planted crop growing. */
  needed: boolean;
  /** A Maintain Crops task is owed: without one, this crop loses growth sooner or later. */
  due: boolean;
  /** Tonight's growth is the one that stalls, so the task can't wait another day. */
  urgent: boolean;
  /** The level's standing requirement, true whether or not anything is planted. */
  rule: string;
  /** Where this crop stands against that requirement. */
  status: string;
};

/**
 * What Maintain Crops is owed at the current Hydroponics level. Seeded needs it daily, Operational
 * once before the crop ripens, and Expanded and up tend themselves. Xenoflora ignores all of that:
 * it resists the automation rather than benefiting from it, so it needs tending every day anywhere.
 */
export function cropTending(g: GameState): CropTending {
  const level = hydroponicsLevel(g);
  const crop = cropOf(g);
  if (level < 1) {
    return { needed: false, due: false, urgent: false, rule: "Nothing grows until it works and is seeded.", status: level < 0 ? "No working Hydroponics aboard" : "Hydroponics is Dead" };
  }
  if (crop.kind === "xeno" && crop.growing) {
    const tendedToday = crop.tended.includes(g.day);
    const rule = "A Xenoflora strain needs Maintain Crops every day at any level, or it slips containment.";
    return { needed: true, due: !tendedToday, urgent: !tendedToday, rule, status: tendedToday ? "Contained today" : "Containment due today" };
  }
  if (level >= 3) {
    return { needed: false, due: false, urgent: false, rule: "It tends itself, so Maintain Crops is never needed to keep a crop growing.", status: "Tends itself" };
  }
  if (level === 1) {
    const tendedToday = crop.tended.includes(g.day);
    const rule = "Crops need Maintain Crops every day, or they lose that day's growth.";
    if (!crop.growing) return { needed: true, due: false, urgent: false, rule, status: "Nothing planted" };
    return { needed: true, due: !tendedToday, urgent: !tendedToday, rule, status: tendedToday ? "Tended today" : "Tending due today" };
  }
  // Operational: one tending after the day it was planted carries the crop to harvest.
  const tendedSince = crop.tended.some((d) => d > crop.plantedDay);
  const rule = "Crops need Maintain Crops once after planting, on their second or third day.";
  if (!crop.growing) return { needed: true, due: false, urgent: false, rule, status: "Nothing planted" };
  const lastDay = crop.day === CROP_DAYS - 1;
  return {
    needed: true,
    due: !tendedSince,
    urgent: !tendedSince && lastDay,
    rule,
    status: tendedSince ? "Tended for this crop" : lastDay ? "Tending due today" : "Tending due before it ripens",
  };
}

/** Why tonight's growth would stall, or null if the crop grows. */
export function cropStall(g: GameState): string | null {
  const level = hydroponicsLevel(g);
  const crop = cropOf(g);
  if (level < 1) return level < 0 ? "No working Hydroponics aboard" : "Hydroponics is Dead";
  if (!crop.growing) return level >= 4 ? null : "Nothing is planted";
  const tending = cropTending(g);
  if (!tending.urgent) return null;
  if (crop.kind === "xeno") return "The strain went untended and will not wait";
  return level === 1 ? "Seeded Hydroponics needs Maintain Crops every day" : "Needs Maintain Crops on its second or third day";
}

/** A successful Maintain Crops: seed the module if it's empty, otherwise tend today's crop. */
export function tendCrops(g: GameState, out: string[]) {
  const level = hydroponicsLevel(g);
  if (level < 1) return void out.push(`⚠ Nothing to tend: ${level < 0 ? "there's no working Hydroponics" : "Hydroponics is Dead"}.`);
  const crop = cropOf(g);
  if (!crop.growing) {
    const kind = nextCropKind(g);
    if (kind.key === "xeno" && level < 3) return void out.push("⚠ A Xenoflora strain won't take root below Expanded Hydroponics.");
    const strain = kind.key === "xeno" ? strainOf(crop.nextStrain).name : undefined;
    g.ship.crop = { ...crop, growing: true, day: 0, plantedDay: g.day, tended: [g.day], kind: kind.key, next: undefined, strain };
    return void out.push(
      strain
        ? `☣ A ${strain} strain goes into the beds. ${doseYield(strain, level)} doses of ${strainLabel(strain)} in ${CROP_DAYS} days, if it stays contained.`
        : `🌱 A new ${kind.name} crop is sown. ${cropYield(kind, level)} ${kind.item} in ${CROP_DAYS} days.`,
    );
  }
  g.ship.crop = { ...crop, tended: [...new Set([...crop.tended, g.day])] };
  out.push(crop.kind === "xeno" ? `☣ The strain is cut back and held (day ${crop.day + 1} of ${CROP_DAYS}).` : `🌱 The crops are tended (day ${crop.day + 1} of ${CROP_DAYS}).`);
}

/** End of Day: grow the crop a day, and bank what it produced when it's done. */
export function growCrops(g: GameState, out: string[]) {
  const level = hydroponicsLevel(g);
  let crop = cropOf(g);
  const queued = crop.next ?? crop.kind;
  // Self-sustaining beds sow themselves, but the ship's routine never puts an alien strain in the ground.
  if (level >= 4 && !crop.growing && queued !== "xeno") {
    crop = { ...crop, growing: true, day: 0, plantedDay: g.day, tended: [], kind: queued, next: undefined };
  }
  if (!crop.growing) return;
  const stall = cropStall({ ...g, ship: { ...g.ship, crop } });
  if (stall) {
    // An untended strain doesn't stall, it gets out. The crop is gone and the beds revert to something safe.
    if (crop.kind === "xeno") {
      g.ship.crop = { ...crop, growing: false, day: 0, tended: [], kind: "food", next: undefined, strain: undefined, nextStrain: crop.strain };
      return void out.push(`☣ The ${crop.strain ?? "Xenoflora"} strain slipped containment overnight. The crop is lost, and whatever it has become is loose aboard.`);
    }
    g.ship.crop = crop;
    return void out.push(`🌱 The crops don't grow today. ${stall}.`);
  }
  crop = { ...crop, day: crop.day + 1 };
  if (crop.day < CROP_DAYS) {
    g.ship.crop = crop;
    return void out.push(`🌱 The crops grow (${crop.day}/${CROP_DAYS} days).`);
  }
  const kind = CROP_KIND_BY_KEY[crop.kind] ?? CROP_KIND_BY_KEY.food;
  const qty = kind.key === "xeno" ? doseYield(crop.strain, level) : cropYield(kind, level);
  if (kind.key === "xeno") {
    // Doses are drawn and sealed as the strain ripens; they can't be left standing in the beds.
    const name = doseName(crop.strain);
    stockItem(g, name, qty, { category: kind.category, tier: kind.tier, notes: doseNote(crop.strain) });
    g.ship.crop = { ...crop, growing: false, day: 0, plantedDay: g.day + 1, tended: [], strain: undefined, nextStrain: crop.strain };
    return void out.push(`☣ The ${crop.strain} strain ripens: ${qty}× ${name} sealed and stowed. The beds stand empty until someone sows them again.`);
  }
  const waiting = (crop.ready[kind.key] ?? 0) + qty;
  // Beds that replant themselves are the only chance to switch crops, so honour a queued choice here.
  const again = level >= 3 && queued !== "xeno";
  const sown = again ? queued : crop.kind;
  g.ship.crop = { ...crop, growing: again, day: 0, plantedDay: g.day + 1, tended: [], kind: sown, next: again ? undefined : crop.next, ready: { ...crop.ready, [kind.key]: waiting } };
  const follows = CROP_KIND_BY_KEY[sown] ?? CROP_KIND_BY_KEY.food;
  out.push(`🌾 The ${kind.name} crop is ready: ${qty} ${kind.item} waiting in Hydroponics (${waiting} to harvest).${again ? ` A new ${follows.name} crop starts on its own.` : " Maintain Crops to sow again."}`);
}

/**
 * A successful Harvest Hydroponics: move everything that's ready into the hold, plus `bonus` of
 * whatever the largest pile is. Returns how much came out.
 */
export function harvestCrops(g: GameState, out: string[], bonus = 0, into?: Sink) {
  const crop = cropOf(g);
  const piles = CROP_KINDS.map((k) => ({ kind: k, qty: crop.ready[k.key] ?? 0 })).filter((p) => p.qty > 0);
  if (!piles.length) {
    out.push("⚠ Nothing is ready to harvest yet.");
    return 0;
  }
  const main = piles.reduce((b, p) => (p.qty > b.qty ? p : b));
  main.qty += bonus;
  const deposit = into ?? intoHold(g);
  for (const { kind, qty } of piles) deposit(kind.item, qty, { category: kind.category, tier: kind.tier });
  out.push(`🌾 Cut and carried: ${piles.map((p) => `${p.qty} ${p.kind.item}`).join(" and ")}.`);
  if (bonus > 0) out.push(`That includes ${bonus} extra ${main.kind.item} from careful harvesting.`);
  g.ship.crop = { ...crop, ready: {} };
  return piles.reduce((s, p) => s + p.qty, 0);
}
