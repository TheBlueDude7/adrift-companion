import { entranceOf, SITE_BY_ID, type SiteDefinition } from "@/data/sites";
import { carrySlots, usedSlots } from "./derive";
import { uid } from "./dice";
import { actionBlocker, clearOverwatch, spendAction, type ActionKind } from "./fight";
import { hazardToll } from "./hazards";
import { advanceSegment, changePressure, changeStress } from "./mechanics";
import { borderSprintable, borderWalkable, BUNDLE_BY_LABEL, SEGMENTS, type BorderState } from "./rules";
import { stockItem } from "./stock";
import type { Border, Expedition, FindBy, GameState, Line, Zone } from "./types";

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
  /** An authored site from `content/sites`, which brings its zones with it. */
  siteId?: string;
};

/**
 * Copy an authored site into campaign state.
 *
 * The slugs its author used become generated ids here, which is what lets a player be told that a
 * door leads somewhere without being told where. Nothing starts seen: the entrance is seen because
 * the crew walks into it, and everything past that is earned by walking in or scouting ahead.
 */
export function instantiate(def: SiteDefinition): { zones: Zone[]; borders: Border[]; entrance: string } {
  const ids = new Map(def.zones.map((z) => [z.id, uid()]));
  const entrance = ids.get(entranceOf(def) ?? "") ?? "";
  const zones: Zone[] = def.zones.map((z) => ({
    id: ids.get(z.id)!,
    name: z.name,
    look: z.look ?? "",
    cover: z.cover ?? "none",
    seen: false,
    secured: false,
    searched: false,
    // A bare string is a Search result, since most authored finds are.
    finds: (z.finds ?? []).map((f) => (typeof f === "string" ? { id: uid(), text: f, by: "search" as const } : { id: uid(), text: f.text, by: f.by ?? "search" })),
    secrets: { note: z.note ?? "" },
  }));
  const borders: Border[] = (def.borders ?? [])
    .filter((b) => ids.has(b.from) && ids.has(b.to))
    .map((b) => ({ a: ids.get(b.from)!, b: ids.get(b.to)!, state: b.state ?? "open", note: b.note ?? "" }));
  return { zones, borders, entrance };
}

export const zoneOf = (e: Expedition, characterId: string) => e.zones.find((z) => z.id === e.at[characterId]);

/** Zones a border joins to this one, whatever state that border is in. */
export const neighbours = (e: Expedition, zoneId: string) =>
  e.borders.filter((b) => b.a === zoneId || b.b === zoneId).map((b) => ({ border: b, zone: e.zones.find((z) => z.id === (b.a === zoneId ? b.b : b.a)) }));

export const borderBetween = (e: Expedition, a: string, b: string) => e.borders.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));

/**
 * Zones between two places, counting the way a weapon's range does: 0 for the same zone, 1 for
 * next door. Null when no route joins them at all.
 *
 * `through` decides which borders count. Walking is the default; shooting passes
 * `borderTransparent` instead, since a shut door is a reason you can't fire rather than a detour.
 */
export function zoneDistance(e: Expedition, from: string, to: string, through: (state: BorderState) => boolean = borderWalkable): number | null {
  if (from === to) return 0;
  const seen = new Set([from]);
  let edge = [from];
  for (let step = 1; edge.length; step++) {
    const next: string[] = [];
    for (const id of edge)
      for (const { border, zone } of neighbours(e, id)) {
        if (!zone || seen.has(zone.id) || !through(border.state)) continue;
        if (zone.id === to) return step;
        seen.add(zone.id);
        next.push(zone.id);
      }
    edge = next;
  }
  return null;
}

/** The one zone a sprint could pass through on its way, or undefined when no such route exists. */
const sprintVia = (e: Expedition, from: string, to: string) =>
  neighbours(e, from)
    .filter((n) => n.zone && n.zone.id !== to && borderSprintable(n.border.state))
    .map((n) => n.zone!)
    .find((z) => {
      const onward = borderBetween(e, z.id, to);
      return !!onward && borderSprintable(onward.state);
    });

/**
 * What it would take for this survivor to get there: a step into the next zone for a Fast Action, a
 * Sprint through one zone into a second for a Slow one, or a reason they can't.
 *
 * The Site tab asks this before offering the button, so the reason a move is refused is the same
 * text whether it's read off a disabled button or out of the log.
 */
export type MovePlan = { kind: "entry" | "step" | "sprint"; cost: ActionKind | null; via?: Zone; warning?: string };

export function movePlan(g: GameState, characterId: string, zoneId: string): MovePlan | { blocked: string } {
  const e = g.expedition;
  const c = g.characters.find((x) => x.id === characterId);
  if (!e || !c) return { blocked: "No expedition is under way." };
  if (!e.crew.includes(characterId)) return { blocked: `${c.name} isn't on this expedition.` };
  const to = e.zones.find((z) => z.id === zoneId);
  if (!to) return { blocked: "That zone isn't part of this site." };
  const here = zoneOf(e, characterId);
  // Arriving at the site costs nothing: they walked in off the ship, not out of a zone.
  if (!here) return { kind: "entry", cost: null };
  if (here.id === zoneId) return { blocked: `${c.name} is already in the ${to.name}.` };

  const border = borderBetween(e, here.id, zoneId);
  const step = !!border && borderWalkable(border.state);
  const via = step ? undefined : sprintVia(e, here.id, zoneId);
  if (!step && !via) {
    // The authored note is a sentence of its own, so its full stop is dropped rather than doubled.
    if (border) return { blocked: `The way into the ${to.name} is ${border.state}${border.note ? `: ${border.note.replace(/\.+$/, "")}` : ""}. Breach it or find another route.` };
    const far = zoneDistance(e, here.id, zoneId);
    if (far === null) return { blocked: `There's no way from the ${here.name} to the ${to.name} at all.` };
    if (far === 2) return { blocked: `Getting to the ${to.name} means crossing something that wants a Task on the way, which a Sprint can't.` };
    return { blocked: `The ${to.name} is ${far} zones off, and a Sprint reaches two.` };
  }
  // One zone is a Fast Action once a fight is on, two at a run is the Slow one. Whether leaving a
  // hostile's zone costs a free swing is the GM's to rule: the app doesn't know who is Engaged.
  const cost: ActionKind = step ? "fast" : "slow";
  const unready = actionBlocker(g, characterId, cost);
  if (unready) return { blocked: unready };
  // Crossing a hazard is allowed and may cost an Acrobatics Task, which is the GM's to call for —
  // so the move isn't refused, but it doesn't happen quietly either.
  const warning = border?.state === "hazardous" ? `${border.note ? `${border.note.replace(/\.+$/, "")}. ` : ""}Crossing a hazard may want an Acrobatics Task.` : undefined;
  return step ? { kind: "step", cost, ...(warning ? { warning } : {}) } : { kind: "sprint", cost, via };
}

/** Walk into the next zone, or run through one into a second. */
export function moveTo(g: GameState, characterId: string, zoneId: string): (string | Line)[] {
  const e = g.expedition;
  const c = g.characters.find((x) => x.id === characterId);
  if (!e || !c) return ["No expedition is under way."];
  const plan = movePlan(g, characterId, zoneId);
  if ("blocked" in plan) return [plan.blocked];
  const to = e.zones.find((z) => z.id === zoneId)!;
  const here = zoneOf(e, characterId);
  const first = [plan.via, to].filter((z) => z && !z.seen);
  e.at[characterId] = zoneId;

  const out: (string | Line)[] = [
    plan.kind === "entry"
      ? `${c.name} enters the ${to.name}.`
      : plan.kind === "sprint"
        ? `${c.name} sprints from the ${here!.name} through the ${plan.via!.name} into the ${to.name}.`
        : `${c.name} moves from the ${here!.name} to the ${to.name}.`,
  ];
  const spend = plan.cost ? spendAction(g, characterId, plan.cost) : null;
  if (spend) out.push(spend);
  // Watching a doorway means standing still to do it, so going anywhere gives it up.
  const watched = plan.kind === "entry" ? null : clearOverwatch(g, characterId, "they moved");
  if (watched) out.push(watched);
  // A room run through is a room they've been in, so it stops being unexplored like any other.
  for (const z of first) out.push(...see(e, z!));
  // Walking into a burning room costs you for walking in. A sprint passes through the middle zone
  // too, so that one catches them on the way past.
  for (const z of [plan.via, to].filter((x) => x)) out.push(...hazardToll(g, z!.id, { characterId }));
  return out;
}

/**
 * Change what stands between two zones, which is what a successful Breach comes to.
 *
 * The line it writes names only zones the crew has seen. That a door has opened is public — they
 * heard it — but which room is on the other side is not, and the log is the one place where a name
 * the Site tab is carefully withholding could still get out.
 */
export function setBorderState(g: GameState, a: string, b: string, state: BorderState): (string | Line)[] {
  const e = g.expedition;
  const border = e && borderBetween(e, a, b);
  if (!e || !border) return ["That isn't a way between two zones of this site."];
  if (border.state === state) return [];
  const was = border.state;
  border.state = state;
  const ends = [border.a, border.b].map((id) => e.zones.find((z) => z.id === id));
  const known = ends.filter((z) => z?.seen);
  if (known.length === 2) return [`The way between the ${known[0]!.name} and the ${known[1]!.name} is now ${state}, where it was ${was}.`];
  if (known.length === 1) return [`One way out of the ${known[0]!.name} is now ${state}, where it was ${was}.`];
  return [{ text: `A way the crew hasn't found is now ${state}, where it was ${was}.`, gm: true }];
}

/** A successful Scout Ahead: learn the next zone without walking into it. */
export function scout(g: GameState, zoneId: string): (string | Line)[] {
  const e = g.expedition;
  const to = e?.zones.find((z) => z.id === zoneId);
  if (!e || !to) return ["That zone isn't part of this site."];
  if (to.seen) return [`The crew already knows the ${to.name}.`];
  return see(e, to);
}

/** Everything the crew learns by laying eyes on a zone: what it looks like, and how many ways on. */
function see(e: Expedition, z: Zone): (string | Line)[] {
  z.seen = true;
  const ways = neighbours(e, z.id).filter((n) => n.zone && !n.zone.seen).length;
  const out: (string | Line)[] = [`The ${z.name}: ${z.look || "nothing the crew can make much of."}`];
  // Only the ways they haven't been through: the door they came in by needs no announcing.
  if (ways) out.push(ways === 1 ? "One more way on, unexplored." : `${ways} more ways on, none of them explored.`);
  if (z.secrets?.note) out.push({ text: `${z.name}: ${z.secrets.note}`, gm: true });
  return out;
}

/**
 * The whole site as the GM knows it, in one readable object: the layout, where everyone is standing,
 * what each room still has to give up, and what it costs to take it.
 *
 * This is the GM's side of the screen, so it carries the notes, the Salvage Capacity and the finds
 * nobody has been handed yet. It exists to be served to something running the site from outside the
 * app, which is why the names are spelled out and the ids are kept: the names are for reading and
 * the ids are what every other endpoint takes.
 */
export function siteReport(g: GameState) {
  const e = g.expedition;
  if (!e) return null;
  const nameOf = (id: string) => e.zones.find((z) => z.id === id)?.name ?? null;
  return {
    site: e.site,
    turn: e.turn + 1,
    turnsPerSegment: TURNS_PER_SEGMENT,
    capacity: e.secrets?.capacity ?? null,
    notes: e.secrets?.notes ?? "",
    crew: e.crew.map((id) => ({
      id,
      name: g.characters.find((c) => c.id === id)?.name ?? "someone",
      zoneId: e.at[id] ?? null,
      zone: nameOf(e.at[id] ?? ""),
    })),
    zones: e.zones.map((z) => ({
      id: z.id,
      name: z.name,
      look: z.look,
      cover: z.cover,
      seen: z.seen,
      secured: z.secured,
      searched: z.searched,
      note: z.secrets?.note ?? "",
      threats: g.threats.filter((t) => t.zone === z.id).map((t) => ({ id: t.id, name: t.name, band: t.band })),
      finds: z.finds.map((f) => ({ id: f.id, text: f.text, by: f.by, found: !!f.found })),
      ways: neighbours(e, z.id).map((n) => ({ toId: n.border.a === z.id ? n.border.b : n.border.a, to: n.zone?.name ?? null, seen: !!n.zone?.seen, state: n.border.state, note: n.border.note })),
    })),
  };
}

/** What's waiting in a zone, in the order the GM authored it. */
export const findsWaiting = (z: Zone) => z.finds.filter((f) => !f.found);

const FIND_BY_LABEL: Record<FindBy, string> = { look: "a look round", search: "a Search", task: "a task or a ruling" };
export const findByLabel = (by: FindBy) => FIND_BY_LABEL[by];

/**
 * Hand one of a zone's finds to the crew.
 *
 * The text is logged for everyone and the find stays on the zone, so a clue learned three rooms ago
 * can be read again without anyone having written it down. Which finds a room gives up, and in what
 * order, is the GM's: the app holds the material and says how it would normally come to light.
 */
export function revealFind(g: GameState, zoneId: string, findId: string): (string | Line)[] {
  const z = g.expedition?.zones.find((x) => x.id === zoneId);
  const f = z?.finds.find((x) => x.id === findId);
  if (!z || !f) return ["That's nothing this site holds."];
  if (f.found) return [`The crew already knows: ${f.text}`];
  f.found = true;
  // Naming the room matters: the crew learns things in several at once and the log is read later.
  return [`${z.name}: ${f.text}`];
}

/** Something the crew found that nobody wrote up in advance, which is most of what a site gives up. */
export function addFind(g: GameState, zoneId: string, text: string, by: FindBy = "look"): (string | Line)[] {
  const z = g.expedition?.zones.find((x) => x.id === zoneId);
  if (!z) return ["That's no zone of this site."];
  if (!text.trim()) return ["There's nothing written to find."];
  z.finds.push({ id: uid(), text: text.trim(), by });
  return revealFind(g, zoneId, z.finds.at(-1)!.id);
}

/**
 * A Search that found something, recorded against the room and against the site.
 *
 * `bundles` is what the GM says the crew came away with, one label per bundle, from the rulebook's
 * list. Each costs the site a point of Salvage Capacity and goes into the searcher's own hands,
 * where it counts against their inventory slots on the way home. A Search that turned up a hidden
 * feature, a unique item, or a way into somewhere passes no bundles and costs the site nothing.
 *
 * `finds` are the room's own waiting discoveries the search brought to light, which cost it nothing
 * either: a clue is not salvage.
 *
 * The Capacity itself stays the GM's: a crew that could read how much was left would know whether
 * to keep searching without searching.
 */
export function recordSearch(g: GameState, characterId: string, bundles: string[] = [], finds: string[] = []): (string | Line)[] {
  const e = g.expedition;
  const z = e ? zoneOf(e, characterId) : undefined;
  const out: (string | Line)[] = [];
  if (!e) return ["There's no expedition for that search to have happened on."];
  if (z) for (const id of finds) out.push(...revealFind(g, z.id, id));
  if (z && !z.searched) {
    z.searched = true;
    out.push(`The ${z.name} has been searched. Another ordinary Search there turns up nothing: that takes new information, the right equipment, a Thorough Search, or a change in the room.`);
  }
  if (!bundles.length) {
    out.push("What they found isn't ordinary salvage, so the site is no poorer for it.");
    return out;
  }
  // Capacity is absent from a player's copy of the state, and this only ever runs on the GM's.
  const left = e.secrets?.capacity;
  const took = left === undefined ? bundles : bundles.slice(0, left);
  for (const label of took) {
    for (const item of BUNDLE_BY_LABEL[label]?.items ?? []) stockItem(g, item.name, item.qty, { category: "Material", tier: "Tier I" }, characterId);
  }
  const named = took.map((label) => BUNDLE_BY_LABEL[label]?.log ?? label);
  const who = g.characters.find((c) => c.id === characterId)?.name ?? "They";
  if (took.length) out.push(`${who} comes away with ${took.length} salvage bundle${took.length === 1 ? "" : "s"}: ${named.join(", ")}.`);
  if (left !== undefined) {
    e.secrets!.capacity = left - took.length;
    if (took.length < bundles.length) out.push({ text: `${e.site} only had ${left} bundle${left === 1 ? "" : "s"} left, so that's all they get.`, gm: true });
    out.push({ text: e.secrets!.capacity ? `${e.site} holds ${e.secrets!.capacity} salvage bundle${e.secrets!.capacity === 1 ? "" : "s"} now.` : `${e.site} is stripped of ordinary useful material.`, gm: true });
  }
  return out;
}

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
  const def = start.siteId ? SITE_BY_ID[start.siteId] : undefined;
  const site = start.site.trim() || def?.name || "an unnamed site";
  const crew = g.characters.filter((c) => start.crew.includes(c.id) && !c.dead);
  if (!crew.length) return ["Nobody is going, so there's no expedition."];
  const { zones, borders, entrance } = def ? instantiate(def) : { zones: [], borders: [], entrance: "" };

  g.expedition = {
    site,
    started: { day: g.day, segment: g.segment },
    turn: 0,
    crew: crew.map((c) => c.id),
    zones,
    borders,
    at: Object.fromEntries(entrance ? crew.map((c) => [c.id, entrance]) : []),
    secrets: { capacity: Math.max(0, start.capacity ?? def?.capacity ?? 0), notes: start.notes ?? def?.notes ?? "" },
  };

  const out: (string | Line)[] = [`— Expedition to ${site} begins (${SEGMENTS[g.segment]}, Day ${g.day}) —`];
  out.push(`Going in: ${crew.map((c) => c.name).join(", ")}.`);
  const first = zones.find((z) => z.id === entrance);
  if (first) out.push(...see(g.expedition, first));
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
  // Zone ids die with the expedition, so anything still standing in one is left standing nowhere.
  for (const t of g.threats) delete t.zone;
  delete g.expedition;
  return out;
}
