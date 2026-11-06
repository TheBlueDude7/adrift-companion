import { ladderFor } from "@/data/ship-upgrades";
import { tileDistance, tileLabel } from "./maps";
import type { GameState, Item, StarMap, TilePos } from "./types";

/** Tiles of movement per cell, days of grid power it holds, and the highest mech tier it can run. */
export const POWER_CELLS = [
  { name: "Flickering Power Cell", tier: 1, tiles: 1, days: 1 },
  { name: "Power Cell", tier: 2, tiles: 2, days: 2 },
  { name: "Advanced Power Cell", tier: 3, tiles: 4, days: 4 },
] as const;

export type PowerCell = (typeof POWER_CELLS)[number];

const CELL_BY_NAME = Object.fromEntries(POWER_CELLS.map((c) => [c.name, c])) as Record<string, PowerCell>;

const usable = (i: Item) => i.location === "ship" && !i.broken && CELL_BY_NAME[i.name] && (i.charges ?? 1) > 0;

/** Power cells in the hold, weakest first. */
export function cellsInHold(g: GameState) {
  return POWER_CELLS.map((c) => ({ ...c, qty: g.items.filter((i) => usable(i) && i.name === c.name).reduce((s, i) => s + i.qty, 0) }));
}

export const cellCount = (g: GameState) => cellsInHold(g).reduce((s, c) => s + c.qty, 0);

/** The weakest cell in the hold that satisfies `ok`, so stronger cells are saved for when they're needed. */
export function pickCell(g: GameState, ok: (c: PowerCell) => boolean): PowerCell | null {
  return cellsInHold(g).find((c) => c.qty > 0 && ok(c)) ?? null;
}

/** Days of grid power left in the cell the ship is running on. */
export const powerDaysLeft = (g: GameState) => g.ship.powerDays ?? 0;

/** The cell the grid loads next: the weakest in the hold, so stronger ones stay available for travel. */
export const nextGridCell = (g: GameState) => pickCell(g, () => true);

/**
 * Keeping the ship running costs a day of a Power Cell's charge at every End of Day. When the
 * charge runs out the grid loads another cell; with none in the hold, the ship goes dark.
 */
export function burnDailyPower(g: GameState, out: string[]) {
  let left = powerDaysLeft(g);
  let loaded = "";
  if (left <= 0) {
    const cell = nextGridCell(g);
    if (!cell) {
      g.ship.powerDays = 0;
      out.push("⚠ The grid has no charge and the hold has no Power Cell: the ship runs dark until the crew finds one.");
      return;
    }
    burnCell(g, cell.name);
    left = cell.days;
    loaded = `A ${cell.name} is loaded into the grid (${cell.days} day${cell.days > 1 ? "s" : ""} of power). `;
  }
  g.ship.powerDays = left - 1;
  const after = g.ship.powerDays;
  out.push(`🔌 ${loaded}${after > 0 ? `The grid has ${after} day${after > 1 ? "s" : ""} of charge left.` : "That charge is spent: tomorrow needs another Power Cell."}`);
}

export function burnCell(g: GameState, name: string) {
  const item = g.items.find((i) => usable(i) && i.name === name);
  if (!item) return false;
  item.qty -= 1;
  g.items = g.items.filter((i) => i.qty > 0);
  return true;
}

/** Cells for a mech deployment: `count` cells, each rated for at least the mech's tier. */
export function mechCells(g: GameState, tier: number, count: number) {
  const picks: PowerCell[] = [];
  const stock = cellsInHold(g);
  for (let n = 0; n < count; n++) {
    const c = stock.find((s) => s.qty > 0 && s.tier >= tier);
    if (!c) return null;
    c.qty -= 1;
    picks.push(c);
  }
  return picks;
}

export function burnMechCells(g: GameState, tier: number, count: number) {
  const picks = mechCells(g, tier, count);
  if (!picks) return null;
  for (const c of picks) burnCell(g, c.name);
  return picks;
}

export const cellList = (cells: readonly { name: string }[]) => {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return [...counts].map(([n, q]) => `${q} ${n}${q > 1 ? "s" : ""}`).join(" and ");
};

/** Tiles the Engine Section can move the ship in one piloted segment, and why it can't when it's 0. */
export function engineRange(g: GameState): { tiles: number; reason: string | null } {
  const engines = g.ship.rooms.filter((r) => r.module === "Engine Section");
  if (engines.length === 0) return { tiles: 0, reason: "The ship has no Engine Section" };
  const working = engines.filter((r) => r.condition !== "Offline" && r.condition !== "Destroyed");
  if (working.length === 0) return { tiles: 0, reason: `The Engine Section is ${engines[0].condition}` };
  const ladder = ladderFor("Engine Section");
  const tiles = Math.max(...working.map((r) => ladder?.levels[r.level ?? 0]?.tiles ?? 1));
  return { tiles, reason: tiles === 0 ? "The Engine Section is Broken. Upgrade it to Repaired to move" : null };
}

/** The star map the ship is charted on. */
export function shipMap(g: GameState): StarMap | null {
  const stars = g.maps.filter((m): m is StarMap => m.kind === "star");
  return stars.find((m) => m.shipAt) ?? stars[0] ?? null;
}

/** `noCell` marks a blocker that is only about the hold lacking a cell. */
export type MovePlan = { dist: number; cell: PowerCell | null; blocker: string | null; noCell?: boolean };

export function planMove(g: GameState, map: StarMap, to: TilePos): MovePlan {
  if (!map.shipAt) return { dist: 0, cell: null, blocker: null };
  const dist = tileDistance(map.shipAt, to);
  const range = engineRange(g);
  if (range.reason) return { dist, cell: null, blocker: range.reason };
  if (dist > range.tiles) return { dist, cell: null, blocker: `The engines reach ${range.tiles} tile${range.tiles === 1 ? "" : "s"} per segment. Plot a shorter hop` };
  const cell = pickCell(g, (c) => c.tiles >= dist);
  if (!cell) {
    const need = POWER_CELLS.find((c) => c.tiles >= dist);
    return { dist, cell: null, blocker: `Needs a ${need?.name ?? "Power Cell"} or better in the hold`, noCell: true };
  }
  return { dist, cell, blocker: null };
}

/**
 * Move the ship on a star map. With `spend`, burns the weakest cell that covers the distance;
 * `free` still checks engine range but burns nothing. Returns the log line, or null if the move isn't possible.
 */
export function moveShip(g: GameState, mapId: string, to: TilePos, spend: boolean, free = false): string | null {
  const map = g.maps.find((m): m is StarMap => m.id === mapId && m.kind === "star");
  if (!map) return null;
  const plan = planMove(g, map, to);
  if (free) {
    if (map.shipAt && plan.blocker && !plan.noCell) return null;
    spend = false;
  }
  if (spend && map.shipAt && plan.blocker) return null;
  if (spend && plan.cell) burnCell(g, plan.cell.name);
  map.shipAt = { ...to };
  const node = map.nodes.find((n) => n.x === to.x && n.y === to.y);
  if (node && node.status === "unexplored") node.status = "visited";
  const place = node ? node.name : `deep space (${tileLabel(map, to)})`;
  g.ship.location = node ? node.name : `Deep space (${tileLabel(map, to)})`;
  return `${g.ship.name} moves to ${place}${spend && plan.cell ? `, burning a ${plan.cell.name}` : ""}.`;
}
