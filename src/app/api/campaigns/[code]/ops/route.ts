import { isOpList } from "@/lib/sync/ops";
import { denyReason } from "@/lib/sync/permissions";
import { actorFor, applyToRoom, getRoom } from "@/lib/sync/rooms";

const MAX_BYTES = 5_000_000;

export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/ops">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  const body = await request.text();
  if (body.length > MAX_BYTES) return Response.json({ error: "Change is too large." }, { status: 413 });
  let parsed: { client?: unknown; opId?: unknown; ops?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { client, opId, ops } = parsed;
  if (typeof client !== "string" || typeof opId !== "string" || !isOpList(ops)) return Response.json({ error: "Invalid change." }, { status: 400 });
  const actor = actorFor(room, key);
  const denied = denyReason(room.game, ops, actor);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const createsCharacter = actor.role === "player" && actor.characterId === null && ops.some((o) => o.op === "ins" && o.path.length === 1 && o.path[0] === "characters");
  const version = applyToRoom(room, ops, { client, opId }, createsCharacter ? actor.memberId : undefined);
  return Response.json({ version });
}
