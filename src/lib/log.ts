import { uid } from "./dice";
import type { GameState, Line, LogEntry } from "./types";

export function pushLog(g: GameState, text: string | Line, kind: LogEntry["kind"] = "info", by?: string) {
  const line = typeof text === "string" ? { text } : text;
  g.log.unshift({ id: uid(), at: Date.now(), day: g.day, segment: g.segment, text: line.text, kind, ...(by ? { by } : {}), ...(line.gm ? { gm: true as const } : {}) });
  if (g.log.length > 500) g.log.length = 500;
}
