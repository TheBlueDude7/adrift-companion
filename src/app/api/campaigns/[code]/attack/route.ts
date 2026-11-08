import { COVER_POINTS, deathCheck, resolveAttack, type Cover } from "@/lib/combat";
import { pushLog } from "@/lib/log";
import { diff } from "@/lib/sync/ops";
import { actorFor, applyToRoom, getRoom } from "@/lib/sync/rooms";
import type { Line } from "@/lib/types";

const COVERS = new Set(Object.keys(COVER_POINTS));
/** Far enough to cover any weapon's reach plus the one-zone overreach. */
const MAX_ZONES = 10;

/**
 * One attack, or one death check. The server builds the pool, rolls it, and applies the damage, so
 * a player decides only who they shoot at and from where — never whether it landed or how hard.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/campaigns/[code]/attack">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing player key." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { client, opId, attackerId, targetId, itemId, zones, cover, aim, burst, step, willpower } = body;
  if (typeof client !== "string" || typeof opId !== "string" || typeof attackerId !== "string") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const actor = actorFor(room, key);
  // A player attacks with their own survivor. The GM plays everyone, including whatever bit back.
  if (actor.role !== "gm" && actor.characterId !== attackerId) {
    return Response.json({ error: "You can only attack with your own character." }, { status: 403 });
  }

  const draft = structuredClone(room.game);
  let lines: Line[];

  if (step === "death-check") {
    const down = draft.characters.find((c) => c.id === attackerId);
    if (!down) return Response.json({ error: "That survivor isn't in the campaign." }, { status: 409 });
    lines = deathCheck(down, willpower === true);
  } else {
    if (typeof targetId !== "string") return Response.json({ error: "Attack what?" }, { status: 400 });
    if (itemId !== null && typeof itemId !== "string") return Response.json({ error: "Invalid weapon." }, { status: 400 });
    if (typeof zones !== "number" || !Number.isInteger(zones) || zones < 0 || zones > MAX_ZONES) {
      return Response.json({ error: `How far away? 0 to ${MAX_ZONES} zones.` }, { status: 400 });
    }
    if (cover !== undefined && !(typeof cover === "string" && COVERS.has(cover))) return Response.json({ error: "Invalid cover." }, { status: 400 });
    const result = resolveAttack(draft, attackerId, targetId, (itemId as string | null) ?? null, {
      zones,
      cover: ((cover as Cover | undefined) ?? "none"),
      aim: aim === true,
      burst: burst === true,
    });
    if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
    lines = result.lines;
  }

  const by = room.members[actor.memberId]?.name;
  for (const line of lines.slice().reverse()) if (line.text) pushLog(draft, line, "roll", by);
  const version = applyToRoom(room, diff(room.game, draft), { client, opId });
  return Response.json({ version });
}
