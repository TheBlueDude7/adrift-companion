import { uid } from "./dice";
import type { GameState, LogEntry } from "./types";

export function pushLog(g: GameState, text: string, kind: LogEntry["kind"] = "info", by?: string) {
  g.log.unshift({ id: uid(), at: Date.now(), day: g.day, segment: g.segment, text, kind, ...(by ? { by } : {}) });
  if (g.log.length > 500) g.log.length = 500;
}
