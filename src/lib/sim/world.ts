import "server-only";

import { UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { characterAlerts, foodCount, hullTier, power, roomWorks, supplyCount } from "../derive";
import { ITEM_CATEGORIES, PANICKED, PRESSURE_STATES, PROJECT_TEMPLATES } from "../rules";
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

/**
 * Projects the crew could ask the GM to open, and the ones already waiting on an answer.
 *
 * Templates are listed by the exact name a request has to carry, because an ask the app can't match
 * to a template is an ask the GM would have to invent the work for. The pending ones are here so
 * four survivors in a row don't each ask for the same hull repair.
 */
export function projectAsks(g: GameState): string {
  const open = g.ship.projects.filter((p) => !p.done).map((p) => p.name);
  const asked = g.projectRequests ?? [];
  const names = (id: string) => g.characters.find((c) => c.id === id)?.name ?? "someone";
  return [
    "PROJECTS THE GM COULD OPEN, IF YOU ASK",
    "Only the GM starts one. Name it exactly as written here:",
    PROJECT_TEMPLATES.map((t) => `- ${t.name} — ${t.skill || "no skill"}, ${t.required} Progress, ${t.energy} Energy a go${t.facility ? `, needs ${t.facility}` : ""}`).join("\n"),
    open.length ? `Already under way, so work on these rather than asking again:\n${open.map((n) => `- ${n}`).join("\n")}` : "Nothing is under way.",
    asked.length ? `Already asked for and waiting on the GM — don't ask again:\n${asked.map((r) => `- ${r.template}, by ${names(r.by)}${r.note ? ` (“${r.note}”)` : ""}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * What is going wrong right now, counted off the state rather than described by the GM.
 *
 * The point is that nobody has to be told. Food and water are days of it, a hull at half is a number,
 * an untreated wound is on a sheet — so the crew can be handed the arithmetic and left to decide
 * what it means, instead of waiting for a GM to say "you're running low". Every line here is
 * something a player could work out from their own screen; none of it is the GM's side of the table.
 */
export function pressing(g: GameState): string {
  const lines: string[] = [];
  const alive = g.characters.filter((c) => !c.dead);
  const mouths = Math.max(1, alive.length);

  const food = foodCount(g, "*");
  const water = supplyCount(g, "Water Unit", "*");
  const days = (n: number) => `${Math.floor(n / mouths)} day${Math.floor(n / mouths) === 1 ? "" : "s"}`;
  if (food < mouths * 3) lines.push(`- Food: ${food} ration${food === 1 ? "" : "s"} for ${mouths} of you — ${days(food)} at full rations.`);
  if (water < mouths * 3) lines.push(`- Water: ${water} unit${water === 1 ? "" : "s"} for ${mouths} of you — ${days(water)}.`);

  const { surplus, generated, draw } = power(g.ship);
  if (surplus < 0) lines.push(`- Power: drawing ${draw} against ${generated} generated. Something has to come off the bus or be fixed.`);
  else if (surplus === 0) lines.push("- Power: no margin. Anything else you switch on browns out the ship.");

  const tier = hullTier(g.ship);
  if (g.ship.hullHp < tier.maxHp) lines.push(`- Hull: ${g.ship.hullHp} of ${tier.maxHp} ("${tier.name}"). Repairs want Hull Plating and someone on them.`);
  if (g.ship.overloaded) lines.push("- The reactor is overloaded. More power now, a worse failure later.");

  for (const c of alive) {
    // The danger alerts are the ones that kill or end a day. Pressure short of Panicked isn't on
    // that list and is still worth saying, because it's dice against every roll they make.
    const urgent = characterAlerts(g, c).filter((a) => a.tone === "danger").map((a) => a.text);
    if (c.pressure >= 2 && c.pressure < PANICKED) urgent.push(`${PRESSURE_STATES[c.pressure].name}, and it won't come down on its own`);
    if (urgent.length) lines.push(`- ${c.name}: ${urgent.join("; ")}.`);
  }

  const broken = g.ship.rooms.filter((r) => r.module && !roomWorks(r));
  if (broken.length) lines.push(`- Out of action: ${broken.map((r) => `${r.name} (${r.active ? r.condition.toLowerCase() : "switched off"})`).join(", ")}.`);

  const stalled = g.ship.projects.filter((p) => !p.done && p.progress > 0);
  if (stalled.length) lines.push(`- Started and unfinished: ${stalled.map((p) => `${p.name} (${p.progress} of ${p.required})`).join(", ")}.`);

  if (!lines.length) return "WHAT'S PRESSING\n\nNothing is on fire. This is when you get ahead: stores, repairs, a module, a course.";
  return `WHAT'S PRESSING\n\nCounted off the ship's own books, not anybody's opinion:\n\n${lines.join("\n")}`;
}

/**
 * What the crew learned the hard way, signed by whoever learned it.
 *
 * This is their only memory. Everything else they're shown is the state they're standing in, and
 * state carries no inference — a depleted hold doesn't say why, and a room they've searched doesn't
 * say what it cost. So without this, a doctrine with a hole in it gets used again next boarding.
 *
 * It sits in the changing part of the prompt rather than the cached prefix, because a lesson written
 * tonight has to be read tomorrow morning and a cached prefix would still be yesterday's.
 */
export function doctrine(g: GameState): string {
  const lessons = g.doctrine ?? [];
  if (!lessons.length) return "WHAT THE CREW HAS LEARNED\n\nNothing written down yet. Whatever you work out here is the first of it.";
  return [
    "WHAT THE CREW HAS LEARNED",
    "Standing orders, written after jobs that went badly. Follow them unless you have a reason not to, and say the reason.",
    lessons.map((l) => `- ${l.text} — ${l.by}, after ${l.from}`).join("\n"),
  ].join("\n\n");
}
