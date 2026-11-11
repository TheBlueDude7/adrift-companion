import { allBiology, biologyFor } from "@/lib/biology-server";
import { CODE_RE, getRoom, isGm } from "@/lib/sync/rooms";

/**
 * The biological catalogue, which is not in the browser bundle and has to be asked for.
 *
 * With a campaign code and a key, the answer is whatever that key's holder is entitled to — the whole
 * catalogue for the GM, and only the grown strains for a player. That is the case that matters, and
 * it is airtight: a player's browser is never handed a strain their crew hasn't cultivated.
 *
 * Without a code, the answer is the whole catalogue, because a device playing alone has no identity
 * for the server to check and whoever is sitting at it is the GM. A player in a shared campaign could
 * therefore ask without their code and be told everything. Closing that would mean solo play couldn't
 * see its own trees, so it is a deployment choice rather than a guess: set ADRIFT_STRICT_BIOLOGY and
 * the catalogue is only ever served against a campaign, at the cost of needing to host one to prep.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();

  if (code) {
    if (!CODE_RE.test(code)) return Response.json({ error: "That isn't a campaign code." }, { status: 400 });
    const room = await getRoom(code);
    if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
    const key = request.headers.get("x-adrift-key");
    if (!key || key.length > 200) return Response.json({ error: "Missing player key." }, { status: 401 });
    return Response.json({ biology: biologyFor(room.game, isGm(room, key)) });
  }

  if (process.env.ADRIFT_STRICT_BIOLOGY) {
    return Response.json({ error: "This server only serves the biological catalogue to a campaign. Host one to see the trees." }, { status: 403 });
  }
  return Response.json({ biology: allBiology() });
}
