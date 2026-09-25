import { createRoom } from "@/lib/sync/rooms";
import type { GameState } from "@/lib/types";

const MAX_BYTES = 5_000_000;

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BYTES) return Response.json({ error: "Campaign is too large to host." }, { status: 413 });
  let game: GameState;
  try {
    game = (JSON.parse(body) as { game: GameState }).game;
  } catch {
    return Response.json({ error: "Invalid campaign data." }, { status: 400 });
  }
  if (!game || game.version !== 1 || !Array.isArray(game.characters) || !game.ship) return Response.json({ error: "Not an Adrift campaign." }, { status: 400 });
  const { room, gmKey } = await createRoom(game);
  return Response.json({ code: room.code, gmKey });
}
