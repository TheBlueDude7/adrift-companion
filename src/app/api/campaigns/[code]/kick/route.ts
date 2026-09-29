import { actorFor, getRoom, kick } from "@/lib/sync/rooms";

export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/kick">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  if (actorFor(room, key).role !== "gm") return Response.json({ error: "Only the GM can remove players." }, { status: 403 });
  let body: { memberId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.memberId !== "string") return Response.json({ error: "Missing player." }, { status: 400 });
  const error = kick(room, body.memberId);
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json({ ok: true });
}
