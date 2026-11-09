import { siteReport } from "@/lib/expedition";
import { actorFor, getRoom } from "@/lib/sync/rooms";

/**
 * The site as the GM knows it, for something running the derelict from outside the app.
 *
 * GM-only, and deliberately not redacted: it carries the Salvage Capacity, the GM's notes on each
 * room, and the finds nobody has been handed yet. A player's key gets nothing — what a player is
 * allowed to know about the site already arrives in their own copy of the campaign.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/campaigns/[code]/site">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  if (actorFor(room, key).role !== "gm") return Response.json({ error: "Only the GM can read the site." }, { status: 403 });
  const site = siteReport(room.game);
  if (!site) return Response.json({ error: "Nobody is off the ship." }, { status: 409 });
  return Response.json(site);
}
