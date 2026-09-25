import { poolFor } from "../derive";
import type { GameState } from "../types";
import { applyOps, type Op, type Seg } from "./ops";

export type Role = "gm" | "player";
export type Actor = { role: Role; characterId: string | null };

const idOf = (s: Seg | undefined) => (s && typeof s === "object" ? s.id : undefined);

/**
 * What players may change in a shared campaign. The GM may change anything.
 *
 * Players can edit their own character, items in the ship's hold or their own inventory,
 * shared-pool cargo carried by anyone in their Loadmaster pool, ship rooms and projects
 * (building and repairing), mechs, cybernetic research, maps, the item catalog, the log, and their
 * own planned segment tasks (the GM resolves them).
 * Returns a reason when the change is not allowed.
 */
export function denyReason(game: GameState, ops: Op[], actor: Actor): string | null {
  if (actor.role === "gm") return null;
  const own = actor.characterId;

  for (const o of ops) {
    const [head, second] = o.path;
    switch (head) {
      case "log":
      case "maps":
      case "catalog":
      case "mechs":
      case "research":
        continue;
      case "characters": {
        if (o.path.length === 1) {
          if (o.op === "ins" && own === null && ops.filter((x) => x.op === "ins" && x.path.length === 1 && x.path[0] === "characters").length === 1) continue;
          return own === null ? "Pick or create your character first." : "Only the GM can add or remove characters.";
        }
        if (o.path[2] === "stress" && o.path.length === 3 && completesRecoveryFor(game, ops, idOf(second))) continue;
        if (own === null) return "Pick your character in Play together to edit a character sheet.";
        if (idOf(second) !== own) return "You can only edit your own character. Ask the GM to change someone else's.";
        continue;
      }
      case "items":
      case "actions":
        continue;
      case "ship": {
        if (second === "projects" || second === "rooms") continue;
        if (second === "hullHp" && o.path.length === 2 && o.op === "set" && typeof o.value === "number" && o.value > game.ship.hullHp) continue;
        if (second === "catastrophicEvents" && o.path.length === 2 && o.op === "set" && o.value === 0) continue;
        return "Only the GM can change the hull, power, or the ship's position.";
      }
      default:
        return "Only the GM can change that.";
    }
  }
  if (ops.some((o) => o.path[0] === "actions")) {
    const reason = actionDenyReason(game, ops, own);
    if (reason) return reason;
  }
  return ops.some((o) => o.path[0] === "items") ? itemDenyReason(game, ops, own) : null;
}

/** True when these ops finish a Stress Recovery project whose patient is `patientId`. */
function completesRecoveryFor(game: GameState, ops: Op[], patientId: string | undefined): boolean {
  if (!patientId) return false;
  const after = applyOps(structuredClone(game), ops);
  return after.ship.projects.some((p) => p.done && p.patientId === patientId && game.ship.projects.some((q) => q.id === p.id && !q.done));
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
    for (const x of [a, b]) {
      if (!x) continue;
      if (x.characterId !== own) return "You can only plan tasks for your own character.";
      if (x.status !== "planned") return "Only the GM can resolve tasks.";
    }
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
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id);
    const b = now.get(id);
    if (a && b && JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a && !mine(a.location) && !(inPool(a.location) && a.shared)) return "You can only change items in the ship's hold, your own inventory, or your shared pool.";
    if (b && !mine(b.location) && !(inPool(b.location) && (b.shared || a?.shared))) return "Players can move items between the hold, their own inventory, and their shared pool.";
  }
  return null;
}
