import { actorFor, getRoom, join, leave, viewFor } from "@/lib/sync/rooms";

const encoder = new TextEncoder();

export async function GET(request: Request, ctx: RouteContext<"/api/campaigns/[code]/events">) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "No campaign with that code." }, { status: 404 });
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || key.length > 200) return Response.json({ error: "Missing player key." }, { status: 401 });
  const name = url.searchParams.get("name")?.trim().slice(0, 40) || "Someone";

  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ping = setInterval(() => write(": ping\n\n"), 15000);
      let conn: ReturnType<typeof join> | null = null;
      cleanup = () => {
        if (!open) return;
        open = false;
        clearInterval(ping);
        if (conn) leave(room, conn);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
      write("retry: 2000\n\n");
      const actor = actorFor(room, key);
      send("me", { id: actor.memberId, role: actor.role });
      send("snapshot", { version: room.version, game: viewFor(room, key) });
      conn = join(room, key, name, send, cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
