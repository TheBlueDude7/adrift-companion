import { uid } from "./dice";
import { completeModuleWork } from "./modules";
import { HULL_TIERS, MODULE_CONDITIONS, SEGMENTS, type ItemTemplate } from "./rules";
import { roomFromPreset } from "./seed";
import { stockItem } from "./stock";
import type { GameState, PendingEffect, PendingWork } from "./types";

/**
 * Work the crew has finished that the ship hasn't felt yet.
 *
 * A segment is everyone acting at once, so nothing one survivor does in it can be the reason another
 * survivor's own afternoon went better. The crew still changes immediately — Energy, wounds, Stress,
 * and an Assist, which is somebody standing right there helping — but the ship waits for the segment
 * to turn. A Workshop rebuilt this afternoon is a better Workshop this evening, and an implant that
 * came off the bench at noon is in the hold by nightfall.
 *
 * Only what the work *produces* waits. Materials come out of the hold the moment they're used, so two
 * people can never pay for their own work with the same scrap.
 */

/** Put a finished effect in the queue. Returns the line telling the crew it's coming. */
export function queueWork(g: GameState, label: string, effect: PendingEffect, from: { characterId?: string; actionId?: string } = {}): string {
  if (!g.pending) g.pending = [];
  g.pending.push({ id: uid(), day: g.day, segment: g.segment, label, effect, ...from });
  return `⏳ ${label} — ready for ${nextSegmentName(g)}.`;
}

/** Shorthand for the commonest case: something made or hauled, going into ship storage. */
export const stockLater = (
  g: GameState,
  label: string,
  items: { name: string; qty: number; fallback?: Partial<ItemTemplate> }[],
  from: { characterId?: string; actionId?: string } = {},
) => queueWork(g, label, { kind: "stock", items: items.filter((i) => i.qty > 0) }, from);

/** What the crew calls the segment this work will land in. Night's work lands the next Morning. */
export const nextSegmentName = (g: GameState) => (g.segment < SEGMENTS.length - 1 ? SEGMENTS[g.segment + 1] : `Day ${g.day + 1}`);

/** Everything still waiting, in the order it was finished. */
export const pendingWork = (g: GameState) => g.pending ?? [];

/** What's waiting on a particular room, so the Ship tab can say so where it matters. */
export const pendingForRoom = (g: GameState, roomId: string) =>
  pendingWork(g).filter((w) => {
    const e = w.effect;
    if (e.kind === "restore" || e.kind === "fitting") return e.roomId === roomId;
    if (e.kind === "module") return g.ship.projects.find((p) => p.id === e.projectId)?.roomId === roomId;
    return false;
  });

/** What's waiting on a particular project. */
export const pendingForProject = (g: GameState, projectId: string) =>
  pendingWork(g).filter((w) => w.effect.kind === "module" && w.effect.projectId === projectId);

/** What's waiting from a particular task, so a resolved card can say what it will do. */
export const pendingForAction = (g: GameState, actionId: string) => pendingWork(g).filter((w) => w.actionId === actionId);

/**
 * Apply everything in the queue and empty it. Called as a segment begins, so the first survivor to
 * act in the new segment finds the ship the last segment's work left behind.
 *
 * Stepping a segment backwards doesn't put the work back in the queue — Undo is the way to take back
 * a segment that shouldn't have turned.
 */
export function applyPending(g: GameState): string[] {
  const queue = g.pending ?? [];
  if (queue.length === 0) return [];
  g.pending = [];
  const out: string[] = ["The last segment's work reaches the ship."];
  for (const w of queue) out.push(...applyOne(g, w));
  return out;
}

function applyOne(g: GameState, w: PendingWork): string[] {
  const e = w.effect;
  switch (e.kind) {
    case "stock": {
      for (const i of e.items) stockItem(g, i.name, i.qty, i.fallback ?? {});
      const what = e.items.map((i) => `${i.qty}× ${i.name}`).join(", ");
      return [what ? `${what} added to ship storage.` : `${w.label} comes to nothing.`];
    }
    case "module": {
      const p = g.ship.projects.find((x) => x.id === e.projectId);
      if (!p) return [`⚠ ${w.label} can't be finished: the project is gone.`];
      const line = completeModuleWork(g, p);
      return line ? [line] : [];
    }
    case "restore": {
      const r = g.ship.rooms.find((x) => x.id === e.roomId);
      if (!r) return [`⚠ ${w.label} can't be finished: the room is gone.`];
      if (r.condition === "Destroyed") return [`⚠ ${r.name} is Destroyed, so the repair comes to nothing.`];
      r.condition = MODULE_CONDITIONS[Math.max(0, MODULE_CONDITIONS.indexOf(r.condition) - 1)];
      return [`${r.name} restored to ${r.condition}.`];
    }
    case "fitting": {
      const r = g.ship.rooms.find((x) => x.id === e.roomId);
      if (!r) return [`⚠ ${w.label} can't be finished: the room is gone.`];
      if (r.fitting) return [`⚠ ${r.name}'s spare slot already holds ${r.fitting}, so the ${e.name} has nowhere to go.`];
      r.fitting = e.name;
      r.powerDraw += e.powerDraw;
      return [`🏗 ${e.name} is up in ${r.name}${e.powerDraw ? `, drawing ${e.powerDraw} more Power` : ""}.`];
    }
    case "room":
      g.ship.rooms.push(roomFromPreset(null, "New Room"));
      return ["A new empty room is sealed and pressurized."];
    case "research":
      if (g.research[e.key]) return [];
      g.research[e.key] = true;
      return ["☣ The strain takes to the nutrient bath. Hydroponics will now accept a Xenoflora sowing, tuned against one condition."];
    case "hull": {
      g.ship.hullHp = Math.min(HULL_TIERS[g.ship.hullTier].maxHp, g.ship.hullHp + e.amount);
      if (g.ship.hullHp > 0) g.ship.catastrophicEvents = 0;
      return [`Hull restored to ${g.ship.hullHp}.`];
    }
  }
}
