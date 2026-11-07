import "server-only";

import { UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { ITEM_CATEGORIES } from "../rules";
import type { GameState, Item } from "../types";

/** What sits in ship storage, by name, so an upgrade can be priced against it. */
function stock(g: GameState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const i of g.items) {
    if (i.location !== "ship" || i.broken) continue;
    counts.set(i.name, (counts.get(i.name) ?? 0) + i.qty);
  }
  return counts;
}

const describe = (i: Item) =>
  [
    i.name,
    i.tier ? ` (${i.tier})` : "",
    i.qty > 1 ? ` ×${i.qty}` : "",
    i.charges !== undefined ? `, ${i.charges}${i.maxCharges ? `/${i.maxCharges}` : ""} charges` : "",
    i.broken ? ", broken" : "",
  ].join("");

/**
 * Ship storage and this survivor's own pack. Without it they can't tell whether a project is one
 * scrap short or fully supplied, which makes any talk of what to build next guesswork.
 */
export function hold(g: GameState, characterId: string): string {
  const shelves = ITEM_CATEGORIES.flatMap((cat) => {
    const of = g.items.filter((i) => i.location === "ship" && i.category === cat);
    return of.length ? [`- ${cat}: ${of.map(describe).join(", ")}`] : [];
  });
  const carried = g.items.filter((i) => i.location === characterId);
  return [
    shelves.length ? `Ship storage:\n${shelves.join("\n")}` : "Ship storage is empty.",
    carried.length ? `You are carrying: ${carried.map(describe).join(", ")}.` : "You are carrying nothing.",
  ].join("\n\n");
}

/**
 * The chart as the crew has filled it in: where the ship sits, what's been found and whether it's
 * been picked over already, and how much of the dark nobody has looked at yet.
 */
export function charts(g: GameState): string {
  const parts: string[] = [];
  for (const m of g.maps) {
    if (m.kind !== "star") continue;
    const here = m.shipAt;
    // Offsets rather than a distance: how far a tile is in travel terms is the rules' business, not ours.
    const at = (x: number, y: number) => {
      if (!here) return `(${x},${y})`;
      const dx = x - here.x;
      const dy = y - here.y;
      if (!dx && !dy) return `(${x},${y}), where the ship is now`;
      const legs = [
        dx ? `${Math.abs(dx)} ${Math.abs(dx) === 1 ? "column" : "columns"} ${dx > 0 ? "right" : "left"}` : "",
        dy ? `${Math.abs(dy)} ${Math.abs(dy) === 1 ? "row" : "rows"} ${dy > 0 ? "down" : "up"}` : "",
      ].filter(Boolean);
      return `(${x},${y}), ${legs.join(" and ")} from the ship`;
    };
    const nodes = m.nodes.map((n) => `- ${n.name || "unnamed"} — ${n.type}, ${n.status}, at ${at(n.x, n.y)}${n.notes ? `. ${n.notes}` : ""}`);
    const rough = Object.entries(m.tiles).filter(([, t]) => t !== "clear");
    parts.push(
      [
        `${m.name}, ${m.size}×${m.size} tiles. The ship is ${here ? `at (${here.x},${here.y})` : "not placed on the chart"}; the neutron star is at (${m.star.x},${m.star.y}).`,
        nodes.length ? `Charted locations:\n${nodes.join("\n")}` : "Nothing is charted on it yet.",
        `${Object.keys(m.tiles).length === 1 ? "1 tile has" : `${Object.keys(m.tiles).length} tiles have`} been scanned and the rest is unknown.${rough.length ? ` Rough space: ${rough.map(([k, t]) => `${k} (${t})`).join(", ")}.` : ""}`,
        m.notes ? `Notes on the chart: ${m.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const decks = g.maps.flatMap((m) => (m.kind === "grid" ? [`- ${m.name}, ${m.width}×${m.height}${m.notes ? `: ${m.notes}` : ""}`] : []));
  if (decks.length) parts.push(`Deck plans the crew has drawn:\n${decks.join("\n")}`);
  return parts.join("\n\n") || "No charts have been drawn yet.";
}

/**
 * The next rung of each compartment's ladder, priced against the hold. This is what turns "which
 * module next" from a guess into something the crew can actually weigh against each other.
 */
export function upgrades(g: GameState): string {
  const have = stock(g);
  const lines = g.ship.rooms.flatMap((r) => {
    if (!r.module) return [`- ${r.name}: empty. A module could go in here.`];
    const ladder = UPGRADE_LADDERS[r.module];
    if (!ladder) return [];
    const rung = r.level ?? 0;
    const now = ladder.levels[rung]?.name ?? "unknown";
    const next = ladder.levels[rung + 1];
    // Most rooms are named after the module in them, and saying it twice reads like a stutter.
    const what = r.name === r.module ? r.name : `${r.name}: ${r.module}`;
    if (!next) return [`- ${what} is "${now}", the top of its ladder.`];
    const short = next.cost.flatMap((c) => {
      const missing = c.qty - (have.get(c.name) ?? 0);
      return missing > 0 ? [`${missing} more ${c.name}`] : [];
    });
    const price = next.cost.map((c) => `${c.qty} ${c.name}`).join(", ");
    return [
      `- ${what} is "${now}". Next is "${next.name}" — ${next.effect} Costs ${price}${next.toolkit ? `, and ${next.toolkit} toolkit charges` : ""}. ${
        short.length ? `The hold is short ${short.join(", ")}.` : "The hold already has everything for it."
      }`,
    ];
  });
  return lines.length ? lines.join("\n") : "Nothing aboard has an upgrade path.";
}
