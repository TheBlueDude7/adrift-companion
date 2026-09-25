import { getRoom, people } from "@/lib/sync/rooms";

export async function GET(_request: Request, ctx: RouteContext<"/api/campaigns/[code]">) {
  const { code } = await ctx.params;
  const room = await getRoom(code.toUpperCase());
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  return Response.json({ code: room.code, version: room.version, ship: room.game.ship.name, crew: room.game.characters.length, people: people(room).filter((p) => p.online) });
}
