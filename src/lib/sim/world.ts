import "server-only";

import { UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { ITEM_CATEGORIES } from "../rules";
import type { GameState, Item, Zone } from "../types";

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
 * The site as this survivor knows it, which is all they get: the state handed to a simulated player
 * comes through the same redaction as a real one's, so an unexplored zone arrives named "Somewhere
 * else" and a creature in a room nobody has entered isn't in their copy at all. What's written here
 * is therefore honest by construction — there is nothing to leak, because nothing was sent.
 *
 * The zone they're standing in comes first and in detail, because every plan starts from the room
 * they're in. The ways out carry their state, since a welded door is the difference between a route
 * and a Breach.
 */
export function site(g: GameState, characterId: string): string {
  const e = g.expedition;
  if (!e) return "You are aboard the ship.";
  const name = (id: string) => e.zones.find((z) => z.id === id)?.name ?? "somewhere unexplored";
  const here = e.zones.find((z) => z.id === e.at[characterId]);
  const withYou = e.crew.filter((id) => id !== characterId && e.at[id] === here?.id).map((id) => g.characters.find((c) => c.id === id)?.name).filter(Boolean);
  const elsewhere = e.crew
    .filter((id) => id !== characterId && e.at[id] !== here?.id)
    .map((id) => `${g.characters.find((c) => c.id === id)?.name ?? "someone"} is in the ${name(e.at[id])}`);
  const ways = here
    ? e.borders
        .filter((b) => b.a === here.id || b.b === here.id)
        .map((b) => {
          const other = b.a === here.id ? b.b : b.a;
          const known = e.zones.find((z) => z.id === other)?.seen;
          return `- ${known ? `the ${name(other)}` : "a way you haven't been through"}: ${b.state}${b.note ? ` — ${b.note}` : ""}`;
        })
    : [];
  const seen = e.zones.filter((z) => z.seen && z.id !== here?.id);
  const threats = g.threats.filter((t) => t.zone && t.zone === here?.id).map((t) => `${t.name} (${t.band})`);
  // Only what the GM has handed over. A find they haven't been given isn't in a player's copy at
  // all, and the filter is here for the GM's own state, which the probes and the table talk read.
  const told = (z: Zone) => z.finds.filter((f) => f.found).map((f) => f.text);
  const learned = e.zones
    .filter((z) => z.id !== here?.id && told(z).length)
    .map((z) => `- in the ${z.name}: ${told(z).join(" ")}`);
  return [
    `You are inside ${e.site}, on Expedition Turn ${e.turn + 1} of 8 in this day segment.`,
    here
      ? `You are standing in the ${here.name}: ${here.look || "nothing you can make much of."}${here.cover === "none" ? " No cover here." : ` Cover here: ${here.cover}.`}${here.secured ? " It's been Secured." : ""}${here.searched ? " It's already been searched." : ""}`
      : "You aren't on the site's map yet.",
    threats.length ? `In this room with you: ${threats.join(", ")}.` : "",
    here && told(here).length ? `What you've worked out about this room:\n${told(here).map((t) => `- ${t}`).join("\n")}` : "",
    withYou.length ? `With you: ${withYou.join(", ")}.` : "You are alone in this room.",
    elsewhere.length ? `The rest of the crew:\n${elsewhere.map((x) => `- ${x}`).join("\n")}` : "",
    ways.length ? `Ways out of this room:\n${ways.join("\n")}` : "",
    seen.length ? `Rooms you've already been in: ${seen.map((z) => `${z.name}${z.searched ? " (searched)" : ""}${z.secured ? " (secured)" : ""}`).join(", ")}.` : "",
    // A crew explores a derelict by accumulating these, so what they learned two rooms back has to
    // still be in front of them when they decide what to do next.
    learned.length ? `What you've learned elsewhere on this site:\n${learned.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
