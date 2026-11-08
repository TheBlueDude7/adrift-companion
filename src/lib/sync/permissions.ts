import { needsPermission, permissionReasons, restPushConflict, segmentTasks } from "../actions";
import { poolFor } from "../derive";
import { coreMapId } from "../maps";
import { completeModuleWork } from "../modules";
import type { GameState, Item, SegmentAction, StarMap, TilePos } from "../types";
import { applyOps, type Op, type Seg } from "./ops";

export type Role = "gm" | "player";
export type Actor = { role: Role; characterId: string | null };

const idOf = (s: Seg | undefined) => (s && typeof s === "object" ? s.id : undefined);

/**
 * What players may change in a shared campaign. The GM may change anything.
 *
 * Players can edit their own character (spending Energy, but never restoring it), items in the ship's hold or their own inventory (without
 * conjuring new items into the hold), shared-pool cargo carried by anyone in their Loadmaster pool,
 * powering rooms on and off, mechs, cybernetic research, maps (but not the
 * neutron star, chart size, or ship position, and they delete only maps they made, never the core system map), the item catalog, the log, and their own planned
 * segment tasks (the GM resolves them). Projects are the GM's: Progress comes from resolving a
 * Work on a project task, which the server applies itself.
 * Returns a reason when the change is not allowed.
 */
export function denyReason(game: GameState, ops: Op[], actor: Actor): string | null {
  if (actor.role === "gm") return null;
  const own = actor.characterId;

  for (const o of ops) {
    const [head, second] = o.path;
    switch (head) {
      case "maps":
      case "log":
      case "catalog":
      case "mechs":
      case "mechRequests":
      case "firstAidOffers":
      case "research":
        continue;
      case "characters": {
        if (o.path.length === 1) {
          if (o.op === "ins" && own === null && ops.filter((x) => x.op === "ins" && x.path.length === 1 && x.path[0] === "characters").length === 1) continue;
          return own === null ? "Pick or create your character first." : "Only the GM can add or remove characters.";
        }
        if (o.path[2] === "stress" && o.path.length === 3 && completesRecoveryFor(game, ops, idOf(second))) continue;
        if (own === null) return "Pick your character in Play together to edit a character sheet.";
        if (idOf(second) !== own && !acceptsFirstAidFrom(game, ops, own, idOf(second))) return "You can only edit your own character. Ask the GM to change someone else's.";
        continue;
      }
      case "items":
      case "actions":
        continue;
      case "ship": {
        if (second === "projects") return "Only the GM changes projects. Add Progress with a Work on a project task instead.";
        if (second === "rooms") continue;
        if (second === "hullHp" && o.path.length === 2 && o.op === "set" && typeof o.value === "number" && o.value > game.ship.hullHp) continue;
        if (second === "catastrophicEvents" && o.path.length === 2 && o.op === "set" && o.value === 0) continue;
        return "Only the GM can change the hull, power, or the ship's position.";
      }
      default:
        return "Only the GM can change that.";
    }
  }
  if (ops.some((o) => o.path[0] === "characters")) {
    const after = applyOps(structuredClone(game), ops);
    if (after.characters.some((c) => c.energy > (game.characters.find((x) => x.id === c.id)?.energy ?? Infinity))) return "Only the GM can restore Energy.";
    if (newImplants(game, after) && !itemsUsedUp(game, after)) return "Installing or enhancing a cybernetic uses an implant or materials from ship storage. Only the GM can skip that.";
  }
  if (ops.some((o) => o.path[0] === "ship" && o.path[1] === "rooms")) {
    const after = applyOps(structuredClone(game), ops);
    const now = after.ship.rooms;
    const built = structuredClone(game);
    for (const p of after.ship.projects) if (p.done && game.ship.projects.some((q) => q.id === p.id && !q.done)) completeModuleWork(built, p);
    const was = new Map(game.ship.rooms.map((r) => [r.id, r]));
    const expected = new Map(built.ship.rooms.map((r) => [r.id, r]));
    const sameButPower = (r: (typeof now)[number], base: Map<string, (typeof now)[number]>) => {
      const w = base.get(r.id);
      return !!w && JSON.stringify({ ...w, active: r.active }) === JSON.stringify(r);
    };
    if (now.length !== was.size || !now.every((r) => sameButPower(r, was) || sameButPower(r, expected))) return "Only the GM can change rooms. Crew can only power them on and off.";
  }
  if (ops.some((o) => o.path[0] === "mechs")) {
    const had = new Set(game.mechs.map((m) => m.id));
    if (applyOps(structuredClone(game), ops).mechs.some((m) => !had.has(m.id))) return "Only the GM can add mechs. Ask the GM for permission instead.";
  }
  if (ops.some((o) => o.path[0] === "mechRequests")) {
    const before = new Map((game.mechRequests ?? []).map((r) => [r.id, r]));
    const after = applyOps(structuredClone(game), ops).mechRequests ?? [];
    if (after.some((r) => before.has(r.id) && JSON.stringify(before.get(r.id)) !== JSON.stringify(r))) return "Only the GM can change a mech request.";
    if (after.some((r) => !before.has(r.id) && r.by !== own)) return "Ask for mechs as your own character.";
    const kept = new Set(after.map((r) => r.id));
    if ([...before.values()].some((r) => !kept.has(r.id) && r.by !== own)) return "Only the GM can answer someone else's mech request.";
  }
  if (ops.some((o) => o.path[0] === "firstAidOffers")) {
    const reason = firstAidOfferDenyReason(game, ops, own);
    if (reason) return reason;
  }
  if (ops.some((o) => o.path[0] === "maps")) {
    const reason = mapOwnerDenyReason(game, ops, own) ?? moveDenyReason(game, ops);
    if (reason) return reason;
  }
  if (ops.some((o) => o.path[0] === "actions")) {
    const reason = actionDenyReason(game, ops, own);
    if (reason) return reason;
  }
  return ops.some((o) => o.path[0] === "items") ? itemDenyReason(game, ops, own) : null;
}

/** Players may delete maps their character made, never the core system map, and can't reassign who made one. */
function mapOwnerDenyReason(game: GameState, ops: Op[], own: string | null): string | null {
  const after = new Map(applyOps(structuredClone(game), ops).maps.map((m) => [m.id, m]));
  const had = new Set(game.maps.map((m) => m.id));
  for (const m of game.maps) {
    const n = after.get(m.id);
    if (n) {
      if (n.createdBy !== m.createdBy) return "Only the GM can change who made a map.";
      continue;
    }
    if (m.id === coreMapId(game.maps)) return "Only the GM can delete the core system map.";
    if (!own || m.createdBy !== own) return "You can only delete maps you made. Ask the GM to delete this one.";
  }
  for (const n of after.values()) if (!had.has(n.id) && n.createdBy !== undefined && n.createdBy !== own) return "Make new maps as your own character.";
  return null;
}

/** The neutron star, the chart's size, and the ship's position are the GM's. Players move the ship by planning a course. */
function moveDenyReason(game: GameState, ops: Op[]): string | null {
  const after = applyOps(structuredClone(game), ops);
  const same = (a: TilePos | null, b: TilePos | null) => a?.x === b?.x && a?.y === b?.y;
  for (const m of game.maps) {
    if (m.kind !== "star") continue;
    const n = after.maps.find((x): x is StarMap => x.id === m.id && x.kind === "star");
    if (!n) {
      if (m.shipAt) return "Only the GM can delete the chart the ship is on.";
      continue;
    }
    if (!same(m.shipAt, n.shipAt)) return "Only the GM can move the ship. Plan a course on the Actions tab instead.";
    if (!same(m.star, n.star) || m.size !== n.size) return "Only the GM can move the neutron star or resize the chart.";
  }
  return null;
}

/** The patient accepts First Aid `healerId` offered them, and the healer's only change is spending Energy. */
function acceptsFirstAidFrom(game: GameState, ops: Op[], own: string | null, healerId: string | undefined): boolean {
  const after = applyOps(structuredClone(game), ops);
  const kept = new Set((after.firstAidOffers ?? []).map((o) => o.id));
  if (!(game.firstAidOffers ?? []).some((o) => o.healerId === healerId && o.patientId === own && !kept.has(o.id))) return false;
  const was = game.characters.find((c) => c.id === healerId);
  const now = after.characters.find((c) => c.id === healerId);
  return !!was && !!now && JSON.stringify({ ...now, energy: was.energy }) === JSON.stringify(was);
}

/** The medkit a First Aid offer to `own` names, when these ops accept that offer. */
function acceptedKit(game: GameState, after: GameState, own: string | null): { name: string; location: string } | null {
  const kept = new Set((after.firstAidOffers ?? []).map((o) => o.id));
  return (game.firstAidOffers ?? []).find((o) => o.patientId === own && o.kit && !kept.has(o.id))?.kit ?? null;
}

/** `b` is `a` with one use of the named kit spent (or gone, if that was the last). */
function usesOneKit(a: Item, b: Item | undefined, kit: { name: string; location: string }): boolean {
  if (a.name !== kit.name || a.location !== kit.location) return false;
  if (!b) return a.qty === 1 && (a.charges ?? 1) <= 1;
  if (b.qty === a.qty - 1) return JSON.stringify({ ...b, qty: a.qty, charges: a.charges }) === JSON.stringify(a);
  return b.qty === a.qty && (b.charges ?? 0) === (a.charges ?? 0) - 1 && JSON.stringify({ ...b, charges: a.charges }) === JSON.stringify(a);
}

/** Players offer First Aid as their own character. The healer withdraws an offer; the patient accepts or declines it. */
function firstAidOfferDenyReason(game: GameState, ops: Op[], own: string | null): string | null {
  const before = new Map((game.firstAidOffers ?? []).map((o) => [o.id, o]));
  const after = applyOps(structuredClone(game), ops).firstAidOffers ?? [];
  if (after.some((o) => before.has(o.id) && JSON.stringify(before.get(o.id)) !== JSON.stringify(o))) return "Withdraw the offer and make a new one instead.";
  if (after.some((o) => !before.has(o.id) && o.healerId !== own)) return "Offer First Aid as your own character.";
  const kept = new Set(after.map((o) => o.id));
  if ([...before.values()].some((o) => !kept.has(o.id) && o.healerId !== own && o.patientId !== own)) return "Only the healer or the patient can answer a First Aid offer.";
  return null;
}

/** True when these ops finish a Stress Recovery project whose patient is `patientId`. */
function completesRecoveryFor(game: GameState, ops: Op[], patientId: string | undefined): boolean {
  if (!patientId) return false;
  const after = applyOps(structuredClone(game), ops);
  return after.ship.projects.some((p) => p.done && p.patientId === patientId && game.ship.projects.some((q) => q.id === p.id && !q.done));
}

/** Withdrawing a task clears the assists that were helping it, even though those belong to other characters. */
function orphanedAssist(a: SegmentAction, b: SegmentAction, now: Map<string, SegmentAction>) {
  const gone = a.assists;
  return !!gone && b.assists === null && !now.has(gone) && JSON.stringify({ ...b, assists: gone }) === JSON.stringify(a);
}

/** Players plan, edit, and withdraw their own tasks while they're still planned. Only the GM resolves them. */
function actionDenyReason(game: GameState, ops: Op[], own: string | null): string | null {
  if (own === null) return "Pick your character in Play together to plan tasks.";
  const after = applyOps(structuredClone(game), ops);
  const was = new Map(game.actions.map((a) => [a.id, a]));
  const now = new Map(after.actions.map((a) => [a.id, a]));
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id);
    const b = now.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a && b && orphanedAssist(a, b, now)) continue;
    for (const x of [a, b]) {
      if (!x) continue;
      if (x.characterId !== own) return "You can only plan tasks for your own character.";
      if (x.status !== "planned") return "Only the GM can resolve tasks.";
    }
    if (a?.roll || b?.roll) return "That task has been rolled. The dice decide it now.";
    if (b?.approval === "granted") return "Only the GM can grant permission. Changing the task clears it.";
    if (b && b.status !== "cancelled") {
      // Off the ship the allowance is per Expedition Turn, which is what `turn` on the task records.
      const same = segmentTasks(after, b.characterId, b.day, b.segment, b.turn);
      const when = b.turn === undefined ? "segment" : "Expedition Turn";
      if (same.length > 2) return `Only one extra task per ${when}.`;
      if (same.length === 2 && !same.some((x) => x.extra)) return `One task per ${when}. Push for an extra task (−1 Energy, +1 Pressure).`;
      if (b.extra && !a?.extra) {
        const before = game.characters.find((c) => c.id === b.characterId);
        const now = after.characters.find((c) => c.id === b.characterId);
        if (a || !before || !now || now.energy >= before.energy || now.pressure < before.pressure) return "An extra task costs 1 Energy and 1 Pressure when you Push for it.";
      }
      const clash = restPushConflict(after, b);
      if (clash) return `${clash}.`;
    }
    if (b && b.approval !== "pending" && needsPermission(after, b)) return `That task needs the GM's permission (${permissionReasons(after, b).join("; ")}).`;
  }
  return null;
}

/**
 * Compare every changed item before and after. A player may touch an item when it is in the hold
 * or their own inventory, or when it is (or was just) shared cargo carried by someone in their pool.
 */
function itemDenyReason(game: GameState, ops: Op[], own: string | null): string | null {
  const after = applyOps(structuredClone(game), ops);
  const pools = own ? [poolFor(game, own), poolFor(after, own)].flatMap((p) => p?.members ?? []) : [];
  const mine = (loc: string) => loc === "ship" || (own !== null && loc === own);
  const inPool = (loc: string) => pools.includes(loc);
  const was = new Map(game.items.map((i) => [i.id, i]));
  const now = new Map(after.items.map((i) => [i.id, i]));
  let kitAllowance = acceptedKit(game, after, own);
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id);
    const b = now.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a && kitAllowance && usesOneKit(a, b, kitAllowance)) {
      kitAllowance = null;
      continue;
    }
    if (a && !mine(a.location) && !(inPool(a.location) && a.shared)) return "You can only change items in the ship's hold, your own inventory, or your shared pool.";
    if (b && !mine(b.location) && !(inPool(b.location) && (b.shared || a?.shared))) return "Players can move items between the hold, their own inventory, and their shared pool.";
  }
  return addsToHold(game, after, ops) ? "Only the GM can add items to ship storage." : null;
}

/**
 * True when the hold gains items out of nowhere: more than survivors handed over, with nothing
 * used up to make them. Crafting, refining, and removing implants or mech modules still stock the hold.
 */
/** A cybernetic was installed, or a Replacement was made Enhanced. */
function newImplants(game: GameState, after: GameState): boolean {
  return after.characters.some((c) => {
    const was = new Map((game.characters.find((x) => x.id === c.id)?.cybernetics ?? []).map((i) => [i.id, i]));
    return (c.cybernetics ?? []).some((i) => {
      const w = was.get(i.id);
      return !w || (w.replacement && !i.replacement);
    });
  });
}

/** Some item's total across the campaign went down. */
function itemsUsedUp(game: GameState, after: GameState): boolean {
  const tally = (items: Item[]) => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.name, (m.get(i.name) ?? 0) + i.qty);
    return m;
  };
  const now = tally(after.items);
  return [...tally(game.items)].some(([name, n]) => (now.get(name) ?? 0) < n);
}

function addsToHold(game: GameState, after: GameState, ops: Op[]): boolean {
  const tally = (items: Item[], where: (location: string) => boolean) => {
    const m = new Map<string, number>();
    for (const i of items) if (where(i.location)) m.set(i.name, (m.get(i.name) ?? 0) + i.qty);
    return m;
  };
  const hold = (l: string) => l === "ship";
  const carried = (l: string) => l !== "ship";
  const anywhere = () => true;
  const [holdBefore, holdAfter] = [tally(game.items, hold), tally(after.items, hold)];
  const [carriedBefore, carriedAfter] = [tally(game.items, carried), tally(after.items, carried)];
  const gained = [...holdAfter].some(([name, n]) => {
    const gain = n - (holdBefore.get(name) ?? 0);
    return gain > 0 && gain > (carriedBefore.get(name) ?? 0) - (carriedAfter.get(name) ?? 0);
  });
  if (!gained || ops.some((o) => o.path[0] !== "items" && o.path[0] !== "log")) return false;
  const [allBefore, allAfter] = [tally(game.items, anywhere), tally(after.items, anywhere)];
  const usedUp = [...allBefore].some(([name, n]) => (allAfter.get(name) ?? 0) < n);
  const now = new Map(after.items.map((i) => [i.id, i]));
  const chargesSpent = game.items.some((i) => (now.get(i.id)?.charges ?? 0) < (i.charges ?? 0));
  return !usedUp && !chargesSpent;
}
