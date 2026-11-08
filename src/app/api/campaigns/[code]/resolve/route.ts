import { canPush, needsPermission, permissionReasons, playerResolves, pushTask, resolveAction, rolledStatus, rollTask, taskTerms, type Resolution } from "@/lib/actions";
import { pushLog } from "@/lib/log";
import { SPACE_TILE_BY_KEY } from "@/lib/maps";
import { diff } from "@/lib/sync/ops";
import { actorFor, applyToRoom, getRoom } from "@/lib/sync/rooms";
import type { Line, LogEntry, SpaceTile } from "@/lib/types";

type Step = "roll" | "push" | "accept" | "routine" | "cancel";
const STEPS = new Set<Step>(["roll", "push", "accept", "routine", "cancel"]);

/**
 * A player works through one of their own planned tasks. The server rolls the dice and runs the
 * resolution, so the result comes from the roll (or the Routine rule) and never from the player.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/resolve">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  let body: { client?: unknown; opId?: unknown; actionId?: unknown; step?: unknown; outcome?: unknown; scan?: unknown; crafted?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { client, opId, actionId, step, outcome, scan, crafted } = body;
  if (typeof client !== "string" || typeof opId !== "string" || typeof actionId !== "string" || !STEPS.has(step as Step)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (outcome !== undefined && (typeof outcome !== "string" || outcome.length > 500)) return Response.json({ error: "Invalid outcome note." }, { status: 400 });
  if (scan !== undefined && scan !== null && !(typeof scan === "string" && scan in SPACE_TILE_BY_KEY)) return Response.json({ error: "Invalid scan result." }, { status: 400 });
  if (crafted !== undefined && !(Array.isArray(crafted) && crafted.every((x) => typeof x === "boolean"))) return Response.json({ error: "Invalid craft results." }, { status: 400 });

  const actor = actorFor(room, key);
  const a = room.game.actions.find((x) => x.id === actionId);
  if (!a) return Response.json({ error: "That task no longer exists." }, { status: 409 });
  if (a.status !== "planned") return Response.json({ error: "That task has already been resolved." }, { status: 409 });
  if (actor.role !== "gm" && !playerResolves(a, actor.characterId)) return Response.json({ error: "Only the GM can resolve that task." }, { status: 403 });

  if (actor.role !== "gm" && (step === "roll" || step === "routine") && needsPermission(room.game, a)) {
    return Response.json({ error: `That task needs the GM's permission (${permissionReasons(room.game, a).join("; ")}).` }, { status: 409 });
  }
  const terms = taskTerms(room.game, a);
  const draft = structuredClone(room.game);
  let lines: (string | Line)[];
  let kind: LogEntry["kind"] = "roll";
  const finish = (status: Resolution["status"]) => {
    const ok = status === "success" || status === "strong";
    kind = status === "failed" ? "danger" : "info";
    return resolveAction(draft, actionId, {
      status,
      energy: status === "cancelled" ? 0 : terms.energy,
      outcome: (outcome as string | undefined) ?? "",
      scan: ok ? (scan as SpaceTile | null | undefined) : undefined,
      crafted: ok ? (crafted as boolean[] | undefined) : undefined,
    });
  };
  // The dice decide as they land: once there's no Push left to take, the task resolves.
  const settle = () => {
    const rolled = draft.actions.find((x) => x.id === actionId)!;
    return canPush(draft, rolled) ? [] : finish(rolledStatus(rolled.roll!, terms.routine));
  };
  switch (step as Step) {
    case "roll":
      if (a.roll) return Response.json({ error: "This task has already been rolled." }, { status: 409 });
      lines = rollTask(draft, actionId);
      lines.push(...settle());
      break;
    case "push":
      if (!a.roll) return Response.json({ error: "Roll first, then decide whether to Push." }, { status: 409 });
      if (!canPush(room.game, a)) return Response.json({ error: a.roll.pushed ? "You can only Push once." : "There are no failed dice to reroll." }, { status: 409 });
      lines = pushTask(draft, actionId);
      lines.push(...settle());
      break;
    case "accept":
      if (!a.roll) return Response.json({ error: "Roll the dice first." }, { status: 409 });
      lines = finish(rolledStatus(a.roll, terms.routine));
      break;
    case "routine":
      if (a.roll) return Response.json({ error: "This task has been rolled. The dice decide it now." }, { status: 409 });
      if (!terms.routine) return Response.json({ error: "This task isn't Routine for this survivor. Roll for it." }, { status: 409 });
      lines = finish(terms.expert ? "strong" : "success");
      break;
    case "cancel":
      if (a.roll) return Response.json({ error: "The dice have been rolled. They decide it now." }, { status: 409 });
      lines = finish("cancelled");
      break;
  }
  const by = room.members[actor.memberId]?.name;
  for (const line of lines.slice().reverse()) if (line) pushLog(draft, line, kind, by);
  const version = applyToRoom(room, diff(room.game, draft), { client, opId });
  return Response.json({ version });
}
