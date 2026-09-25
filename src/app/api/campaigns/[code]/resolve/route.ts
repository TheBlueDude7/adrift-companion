import { playerResolves, resolveAction, taskTerms, type Resolution } from "@/lib/actions";
import { pushLog } from "@/lib/log";
import { SPACE_TILE_BY_KEY } from "@/lib/maps";
import { diff } from "@/lib/sync/ops";
import { actorFor, applyToRoom, getRoom } from "@/lib/sync/rooms";
import type { SpaceTile } from "@/lib/types";

const STATUSES = new Set<Resolution["status"]>(["success", "strong", "failed", "cancelled"]);

/**
 * A player resolves one of their own planned tasks. The server runs the resolution itself, so the
 * player only chooses the result they rolled: Energy and every effect follow the rules.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/resolve">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  let body: { client?: unknown; opId?: unknown; actionId?: unknown; status?: unknown; outcome?: unknown; scan?: unknown; crafted?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { client, opId, actionId, status, outcome, scan, crafted } = body;
  if (typeof client !== "string" || typeof opId !== "string" || typeof actionId !== "string" || !STATUSES.has(status as Resolution["status"])) {
    return Response.json({ error: "Invalid resolution." }, { status: 400 });
  }
  if (outcome !== undefined && (typeof outcome !== "string" || outcome.length > 500)) return Response.json({ error: "Invalid outcome note." }, { status: 400 });
  if (scan !== undefined && scan !== null && !(typeof scan === "string" && scan in SPACE_TILE_BY_KEY)) return Response.json({ error: "Invalid scan result." }, { status: 400 });
  if (crafted !== undefined && !(Array.isArray(crafted) && crafted.every((x) => typeof x === "boolean"))) return Response.json({ error: "Invalid craft results." }, { status: 400 });

  const actor = actorFor(room, key);
  const a = room.game.actions.find((x) => x.id === actionId);
  if (!a) return Response.json({ error: "That task no longer exists." }, { status: 409 });
  if (a.status !== "planned") return Response.json({ error: "That task has already been resolved." }, { status: 409 });
  if (actor.role !== "gm" && !playerResolves(a, actor.characterId)) return Response.json({ error: "Only the GM can resolve that task." }, { status: 403 });

  const s = status as Resolution["status"];
  const draft = structuredClone(room.game);
  const lines = resolveAction(draft, actionId, {
    status: s,
    energy: s === "cancelled" ? 0 : taskTerms(room.game, a).energy,
    outcome: (outcome as string | undefined) ?? "",
    scan: scan as SpaceTile | null | undefined,
    crafted: crafted as boolean[] | undefined,
  });
  const by = room.members[actor.memberId]?.name;
  for (const line of lines.slice().reverse()) if (line) pushLog(draft, line, s === "failed" ? "danger" : "info", by);
  const version = applyToRoom(room, diff(room.game, draft), { client, opId });
  return Response.json({ version });
}
