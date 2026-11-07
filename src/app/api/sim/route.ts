import { selfBase } from "@/lib/sim/client";
import { configuredProviders, PROVIDERS, PROVIDER_KEYS } from "@/lib/sim/models";
import { runCrew, seatCrew, type Seat } from "@/lib/sim/table";
import { STYLE_KEYS } from "@/lib/sim/styles";
import { getRoom, isGm } from "@/lib/sync/rooms";

/** Several survivors, each a model call, take longer than an ordinary request. */
export const maxDuration = 300;

/** What's configured, without exposing any secret. */
export function GET() {
  const ready = configuredProviders();
  return Response.json({
    providers: PROVIDER_KEYS.map((p) => ({ id: p, label: PROVIDERS[p].label, ready: ready.includes(p), keyEnv: PROVIDERS[p].keyEnv, modelEnv: PROVIDERS[p].modelEnv })),
    styles: STYLE_KEYS,
  });
}

/**
 * Run a segment for simulated survivors. The GM sets the scene; each one chooses, speaks, and
 * resolves through the ordinary player endpoints, so the rules hold exactly as they do for the table.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing GM key." }, { status: 401 });
  let body: { code?: unknown; situation?: unknown; players?: unknown; answers?: unknown; commit?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { code, situation, players, answers, commit } = body;
  if (typeof code !== "string") return Response.json({ error: "Which campaign?" }, { status: 400 });
  if (typeof situation !== "string" || !situation.trim() || situation.length > 8000) return Response.json({ error: "Describe the situation in under 8,000 characters." }, { status: 400 });
  if (answers !== undefined && (typeof answers !== "string" || answers.length > 8000)) return Response.json({ error: "Keep the answers under 8,000 characters." }, { status: 400 });
  if (commit !== undefined && typeof commit !== "boolean") return Response.json({ error: "Invalid commit flag." }, { status: 400 });
  if (players !== undefined && !(Array.isArray(players) && players.every((x) => typeof x === "object" && x !== null))) {
    return Response.json({ error: "Invalid player list." }, { status: 400 });
  }

  const room = await getRoom(code.toUpperCase());
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  if (!isGm(room, key)) return Response.json({ error: "Only the GM can run simulated survivors." }, { status: 403 });

  const seated = seatCrew(room.game, players as Seat[] | undefined);
  if ("error" in seated) return Response.json({ error: seated.error }, { status: seated.status });

  try {
    const base = await selfBase(new URL(request.url).origin);
    const report = await runCrew(base, room.code, seated.table, situation, { answers: answers as string | undefined, commit: commit as boolean | undefined });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The segment failed." }, { status: 409 });
  }
}
