import { runRoster, seatRecruiters, type RosterSeat } from "@/lib/sim/roster";
import { SHAPES, SPREADS } from "@/lib/sim/create";
import { BACKGROUNDS } from "@/lib/rules";
import { getRoom, isGm } from "@/lib/sync/rooms";

/** One model call per survivor, in series. */
export const maxDuration = 300;

/** The pieces a simulated survivor is built from, so a caller can see the choices before making any. */
export function GET() {
  return Response.json({
    backgrounds: BACKGROUNDS.map((b) => ({ key: b.key, name: b.name, specialties: b.specialties.map((s) => s.name) })),
    spreads: SPREADS.map((s) => ({ key: s.key, label: s.label })),
    shapes: SHAPES.map((s) => ({ key: s.key, label: s.label, levels: s.levels })),
  });
}

/**
 * Run character creation for simulated survivors, in order. Each one is inserted through the
 * ordinary player endpoints, so the campaign changes exactly as it would if a person had joined.
 */
export async function POST(request: Request) {
  const key = request.headers.get("x-adrift-key");
  if (!key) return Response.json({ error: "Missing GM key." }, { status: 401 });
  let body: { code?: unknown; directive?: unknown; count?: unknown; builders?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const { code, directive, count, builders } = body;
  if (typeof code !== "string") return Response.json({ error: "Which campaign?" }, { status: 400 });
  if (directive !== undefined && (typeof directive !== "string" || directive.length > 8000)) return Response.json({ error: "Keep the brief under 8,000 characters." }, { status: 400 });
  if (count !== undefined && (typeof count !== "number" || !Number.isFinite(count) || count < 1 || count > 8)) return Response.json({ error: "Make between 1 and 8 survivors." }, { status: 400 });
  if (builders !== undefined && !(Array.isArray(builders) && builders.every((x) => typeof x === "object" && x !== null))) {
    return Response.json({ error: "Invalid builder list." }, { status: 400 });
  }

  const room = await getRoom(code.toUpperCase());
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  if (!isGm(room, key)) return Response.json({ error: "Only the GM can run simulated survivors." }, { status: 403 });

  const seated = seatRecruiters(builders as RosterSeat[] | undefined, count === undefined ? undefined : Math.round(count));
  if ("error" in seated) return Response.json({ error: seated.error }, { status: seated.status });

  try {
    const report = await runRoster(new URL(request.url).origin, room.code, seated.table, (directive as string | undefined) ?? "");
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "The roster failed." }, { status: 409 });
  }
}
