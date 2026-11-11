import type { Recipe } from "@/data/cybernetics";
import { uid } from "./dice";
import type { ItemTemplate } from "./rules";
import type { GameState, Item } from "./types";

export const sameKind = (a: Item, b: Item) =>
  a.name === b.name && a.charges === undefined && b.charges === undefined && !a.broken && !b.broken && !a.heavy === !b.heavy && !a.shared === !b.shared && !a.contingency === !b.contingency;

export function addItem(g: GameState, item: Item) {
  const target = g.items.find((i) => i.location === item.location && sameKind(i, item));
  if (target) target.qty += item.qty;
  else g.items.push(item);
}

/**
 * Add `qty` of a named item to ship storage, using the campaign catalog for its details.
 *
 * `where` is a character id for something that has to be carried rather than stowed: salvage found
 * off the ship goes into the finder's own hands, where it counts against their inventory slots.
 */
export function stockItem(g: GameState, name: string, qty: number, fallback: Partial<ItemTemplate> = {}, where = "ship") {
  if (qty <= 0) return;
  const t = g.catalog.find((c) => c.name === name);
  const charges = t?.maxCharges ?? fallback.maxCharges;
  const base: Omit<Item, "id" | "qty"> = {
    name,
    category: t?.category ?? fallback.category ?? "Other",
    tier: t?.tier ?? fallback.tier,
    charges,
    maxCharges: charges,
    armor: t?.armor ?? fallback.armor,
    heavy: t?.heavy ?? fallback.heavy,
    weapon: t?.weapon ?? fallback.weapon,
    broken: false,
    notes: t?.notes ?? fallback.notes ?? "",
    location: where,
  };
  // Items with charges are tracked one per stack.
  if (charges !== undefined) for (let n = 0; n < qty; n++) g.items.push({ ...base, id: uid(), qty: 1 });
  else addItem(g, { ...base, id: uid(), qty });
}

/**
 * Where something the crew produced ends up.
 *
 * The bench, the beds and the salvage torch all make things without caring where they land, so the
 * destination is handed to them: straight into the hold when the GM is working by hand, or into the
 * pending queue when a task made it, so it arrives as the next segment begins. Passing it rather than
 * importing the queue also keeps these modules free of it, which would otherwise close an import loop.
 */
export type Sink = (name: string, qty: number, fallback?: Partial<ItemTemplate>) => void;

/** The ordinary destination: ship storage, right now. */
export const intoHold =
  (g: GameState): Sink =>
  (name, qty, fallback) =>
    stockItem(g, name, qty, fallback ?? {});

export const isToolkit = (i: Item) => /toolkit/i.test(i.name) && !i.broken;

export function haveInStorage(g: GameState, name: string) {
  return g.items.filter((i) => i.location === "ship" && i.name === name && !i.broken).reduce((s, i) => s + i.qty, 0);
}

export function toolkitCharges(g: GameState) {
  return g.items.filter((i) => i.location === "ship" && isToolkit(i)).reduce((s, i) => s + (i.charges ?? 0) * i.qty, 0);
}

export type Shortfall = { name: string; need: number; have: number };

export function shortfalls(g: GameState, recipe: Recipe, toolkit = 0): Shortfall[] {
  const out: Shortfall[] = [];
  for (const part of recipe) {
    const have = haveInStorage(g, part.name);
    if (have < part.qty) out.push({ name: part.name, need: part.qty, have });
  }
  if (toolkit > 0) {
    const have = toolkitCharges(g);
    if (have < toolkit) out.push({ name: "Toolkit charges", need: toolkit, have });
  }
  return out;
}

/** Remove materials and toolkit charges from ship storage. Takes what's there if some is missing. */
export function spend(g: GameState, recipe: Recipe, toolkit = 0) {
  for (const part of recipe) {
    let left = part.qty;
    for (const item of g.items.filter((i) => i.location === "ship" && i.name === part.name && !i.broken)) {
      const take = Math.min(left, item.qty);
      item.qty -= take;
      left -= take;
      if (left <= 0) break;
    }
  }
  let charges = toolkit;
  // Burn the cheapest toolkits first.
  const kits = g.items.filter((i) => i.location === "ship" && isToolkit(i) && (i.charges ?? 0) > 0).sort((a, b) => (a.maxCharges ?? 0) - (b.maxCharges ?? 0));
  for (const kit of kits) {
    while (charges > 0 && (kit.charges ?? 0) > 0) {
      kit.charges = (kit.charges ?? 0) - 1;
      charges -= 1;
    }
  }
  g.items = g.items.filter((i) => i.qty > 0);
}

/**
 * Use up one charge of an item, or the item itself when it has no charges left to give.
 * A fresh unit comes with a full load of charges. Returns false when there's none to use.
 */
export function spendUse(g: GameState, name: string, location = "ship") {
  const item = g.items.find((i) => i.location === location && i.name === name && i.qty > 0 && !i.broken);
  if (!item) return false;
  if ((item.charges ?? 1) > 1) item.charges! -= 1;
  else {
    item.qty -= 1;
    if (item.maxCharges) item.charges = item.maxCharges;
  }
  g.items = g.items.filter((i) => i.qty > 0);
  return true;
}

/** Take one of a named item out of ship storage. Returns false if there isn't one. */
export function takeOne(g: GameState, name: string) {
  const item = g.items.find((i) => i.location === "ship" && i.name === name && i.qty > 0 && !i.broken);
  if (!item) return false;
  item.qty -= 1;
  g.items = g.items.filter((i) => i.qty > 0);
  return true;
}

export function recipeText(recipe: Recipe, toolkit = 0) {
  const parts = recipe.map((p) => `${p.qty} ${p.name}`);
  if (toolkit) parts.push(`${toolkit} toolkit charge${toolkit > 1 ? "s" : ""}`);
  return parts.join(", ") || "Nothing";
}
