import { carrySlots, usedSlots } from "./derive";
import { advanceSegment, changePressure, changeStress } from "./mechanics";
import { SEGMENTS } from "./rules";
import type { Expedition, GameState, Line } from "./types";

/** Eight Expedition Turns consume one day segment. */
export const TURNS_PER_SEGMENT = 8;

/** Harm the return procedure asks the crew to resolve, rather than carrying it quietly back aboard. */
const LINGERING = ["Bleeding", "Burning", "Contaminated", "Suffocating"];

export type SiteOutcome = "secured" | "abandoned" | "active";

const OUTCOME_NOTE: Record<SiteOutcome, string> = {
  secured: "The site is Secured: the primary hostile force is dealt with and a stable route runs back to the ship.",
  abandoned: "The site is abandoned. Whatever is left there stays there.",
  active: "The site is still active. The crew can return to it on another expedition.",
};

export type ExpeditionStart = {
  site: string;
  /** Characters leaving the ship. Everyone else is aboard. */
  crew: string[];
  /** Salvage bundles the site holds: 1–2 for a wreckage pocket, 3–4 for a minor derelict, 5–8 for a large one. */
  capacity?: number;
  /** The GM's own notes on the site. Never sent to a player. */
  notes?: string;
};

export type ExpeditionEnd = {
  /** Characters who reached Panicked during it. Each gains 1 Stress, once. */
  panicked?: string[];
  /** False while the crew is still in danger, which holds back the Pressure relief. */
  safe?: boolean;
  outcome?: SiteOutcome;
};

/**
 * Leave the ship. The checks here are the rulebook's departure checks: who is going, and whether
 * each of them is within their inventory limit, since a crew that leaves full has nowhere to put
 * what it finds.
 *
 * Being over the limit is reported rather than refused. The GM may have a reason to allow it, and
 * the point of saying so is that nobody notices three zones later.
 */
export function startExpedition(g: GameState, start: ExpeditionStart): (string | Line)[] {
  if (g.expedition) return [`The crew is already on an expedition to ${g.expedition.site}. End that one first.`];
  const site = start.site.trim() || "an unnamed site";
  const crew = g.characters.filter((c) => start.crew.includes(c.id) && !c.dead);
  if (!crew.length) return ["Nobody is going, so there's no expedition."];

  g.expedition = {
    site,
    started: { day: g.day, segment: g.segment },
    turn: 0,
    crew: crew.map((c) => c.id),
    secrets: { capacity: Math.max(0, start.capacity ?? 0), notes: start.notes ?? "" },
  };

  const out: (string | Line)[] = [`— Expedition to ${site} begins (${SEGMENTS[g.segment]}, Day ${g.day}) —`];
  out.push(`Going in: ${crew.map((c) => c.name).join(", ")}.`);
  const aboard = g.characters.filter((c) => !c.dead && !start.crew.includes(c.id));
  out.push(aboard.length ? `Still aboard and free to work the ship: ${aboard.map((c) => c.name).join(", ")}.` : "Nobody is left aboard.");
  for (const c of crew) {
    const [used, limit] = [usedSlots(g, c.id), carrySlots(g, c)];
    if (used > limit) out.push(`${c.name} is over the inventory limit at ${used} of ${limit} slots.`);
    else if (used === limit && limit > 0) out.push(`${c.name} leaves with every slot full, so there's no room to carry anything back.`);
  }
  const capacity = g.expedition.secrets?.capacity ?? 0;
  out.push({ text: capacity ? `${site} holds ${capacity} salvage bundle${capacity === 1 ? "" : "s"}.` : `${site} has no ordinary salvage left to find.`, gm: true });
  if (start.notes?.trim()) out.push({ text: `${site}: ${start.notes.trim()}`, gm: true });
  return out;
}

/**
 * Mark one Expedition Turn: twenty to forty minutes of searching, climbing, treating or arguing.
 *
 * The eighth consumes the day segment. Clocks and supplies are named rather than applied, because
 * neither exists in the campaign yet — the clocks arrive with sites.
 */
export function markExpeditionTurn(g: GameState): string[] {
  const e = g.expedition;
  if (!e) return ["No expedition is under way."];
  e.turn += 1;
  if (e.turn < TURNS_PER_SEGMENT) return [`Expedition Turn ${e.turn} of ${TURNS_PER_SEGMENT}.`];
  e.turn = 0;
  return [
    `Expedition Turn ${TURNS_PER_SEGMENT} of ${TURNS_PER_SEGMENT} — the segment is used up.`,
    ...advanceSegment(g),
    "Advance environmental and threat clocks, consume anything the segment requires, and let the crew decide whether it goes on.",
  ];
}

/** How long the crew has been gone, in the rulebook's units. */
function elapsed(g: GameState, e: Expedition): string {
  const segments = (g.day - e.started.day) * SEGMENTS.length + (g.segment - e.started.segment);
  const parts: string[] = [];
  if (segments > 0) parts.push(`${segments} day segment${segments === 1 ? "" : "s"}`);
  if (e.turn > 0) parts.push(`${e.turn} Expedition Turn${e.turn === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" and ") : "less than one Expedition Turn";
}

/**
 * Come back aboard, and settle up.
 *
 * This is the rulebook's return procedure in its own order. The mechanical parts happen: Pressure
 * eases once the danger has, Panicked costs 1 Stress, once-per-expedition abilities come back. The
 * two that need a person — which salvage goes into the hold, and which supplies the trip ate — are
 * named and left, because guessing at either would be worse than asking.
 *
 * It still works with no expedition recorded, since a GM may only want the abilities reset.
 */
export function endExpedition(g: GameState, end: ExpeditionEnd = {}): (string | Line)[] {
  const { panicked = [], safe = true, outcome } = end;
  const e = g.expedition;
  const out: (string | Line)[] = [e ? `— The crew returns from ${e.site} —` : "— Expedition ends —"];
  if (e) out.push(`Away for ${elapsed(g, e)}.`);

  const crew = e ? g.characters.filter((c) => e.crew.includes(c.id)) : g.characters;
  const alive = crew.filter((c) => !c.dead);
  // Pressure and Stress narrate themselves into a plain list, which then joins the rest.
  const changes: string[] = [];

  out.push("Move recovered salvage into ship storage on the Storage tab, and note anything abandoned or destroyed out there.");
  for (const c of alive) {
    const harm = c.conditions.filter((x) => LINGERING.includes(x.name));
    if (harm.length) out.push(`${c.name} is still ${harm.map((x) => x.name).join(" and ")} — resolve that before anything else.`);
  }
  // A survivor who came back Calm has nothing to ease, and saying so every time is noise.
  if (safe) {
    for (const c of alive) if (c.pressure > 0) changePressure(g, c, -1, changes);
  } else changes.push("The danger hasn't passed, so nobody's Pressure eases yet.");
  for (const c of alive) {
    if (!panicked.includes(c.id)) continue;
    changes.push(`${c.name} reached Panicked during the expedition.`);
    changeStress(c, 1, changes);
  }
  out.push(...changes);
  for (const c of g.characters) for (const key of Object.keys(c.abilityUsed)) if (key.startsWith("expedition:")) delete c.abilityUsed[key];
  out.push("Once-per-expedition abilities are ready again.");
  out.push("Consume any Food, Water, Oxygen, Fuel or medical supplies the trip required.");

  // What the site still holds is as much a secret on the way out as it was on the way in.
  const left = e?.secrets?.capacity;
  if (left !== undefined) out.push({ text: `${e!.site} still holds ${left} salvage bundle${left === 1 ? "" : "s"}.`, gm: true });
  if (outcome) out.push(OUTCOME_NOTE[outcome]);
  delete g.expedition;
  return out;
}
