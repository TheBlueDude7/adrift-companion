import { actorFor, claim, getRoom } from "@/lib/sync/rooms";

export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/claim">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  let body: { characterId?: unknown; memberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const characterId = typeof body.characterId === "string" ? body.characterId : null;
  const actor = actorFor(room, key);
  let target = actor.memberId;
  if (typeof body.memberId === "string" && body.memberId !== actor.memberId) {
    if (actor.role !== "gm") return Response.json({ error: "Only the GM can assign characters to other players." }, { status: 403 });
    target = body.memberId;
  }
  const error = claim(room, target, characterId);
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json({ ok: true });
}
