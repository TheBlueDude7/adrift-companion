"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pushLog } from "./log";
import { normalizeGame } from "./maps";
import { createInitialState } from "./seed";
import { applyOps, diff, type Op } from "./sync/ops";
import { outbox } from "./sync/outbox";
import { denyReason, type Actor, type Role } from "./sync/permissions";
import { toast } from "sonner";
import type { GameState, LogEntry } from "./types";

const HISTORY_LIMIT = 40;

export type SyncStatus = "offline" | "connecting" | "online" | "lost";
export type Person = { id: string; name: string; role: Role; characterId: string | null; online: boolean };

type Store = {
  game: GameState;
  /** Undo history as inverse changes, so undoing never reverts other players' edits. */
  past: { label: string; inverse: Op[] }[];
  playerName: string;
  /** Private key that identifies this device to shared campaigns. */
  playerKey: string;
  session: { code: string; gmKey?: string } | null;
  status: SyncStatus;
  people: Person[];
  me: { id: string; role: Role } | null;
  /** Apply a change. The recipe mutates a draft copy; it may return log lines. */
  act: (label: string, recipe: (g: GameState) => void | string | string[], kind?: LogEntry["kind"]) => void;
  undo: () => void;
  replace: (game: GameState, label: string) => void;
};

/** Who is acting. Offline, you are the GM of your own campaign. */
export function actorOf(s: Pick<Store, "session" | "me" | "people">): Actor {
  if (!s.session) return { role: "gm", characterId: null };
  const role = s.me?.role ?? (s.session.gmKey ? "gm" : "player");
  return { role, characterId: role === "gm" ? null : (s.people.find((p) => p.id === s.me?.id)?.characterId ?? null) };
}

export const useGame = create<Store>()(
  persist(
    (set, get) => {
      function allowed(prev: GameState, ops: Op[]) {
        const reason = denyReason(prev, ops, actorOf(get()));
        if (reason) toast.error(reason);
        return !reason;
      }
      function commit(label: string, prev: GameState, next: GameState) {
        const ops = diff(prev, next);
        if (ops.length === 0 || !allowed(prev, ops)) return;
        set({ game: next, past: [{ label, inverse: diff(next, prev) }, ...get().past].slice(0, HISTORY_LIMIT) });
        outbox.send?.(ops);
      }
      return {
        game: createInitialState(),
        past: [],
        playerName: "",
        playerKey: "",
        session: null,
        status: "offline",
        people: [],
        me: null,
        act: (label, recipe, kind = "info") => {
          const prev = get().game;
          const draft = structuredClone(prev);
          const out = recipe(draft);
          const lines = out === undefined ? [label] : Array.isArray(out) ? out : [out];
          for (const line of lines.slice().reverse()) if (line) pushLog(draft, line, kind);
          const { session, playerName } = get();
          if (session && playerName) {
            const known = new Set(prev.log.map((e) => e.id));
            for (const e of draft.log) if (!known.has(e.id)) e.by = playerName;
          }
          commit(label, prev, draft);
        },
        undo: () => {
          const [last, ...rest] = get().past;
          if (!last || !allowed(get().game, last.inverse)) return;
          set({ game: normalizeGame(applyOps(structuredClone(get().game), last.inverse)), past: rest });
          outbox.send?.(last.inverse);
        },
        replace: (game, label) => commit(label, get().game, normalizeGame(game)),
      };
    },
    {
      name: "adrift-companion",
      version: 1,
      partialize: (s) => ({ game: s.game, past: s.past.slice(0, 15), playerName: s.playerName, playerKey: s.playerKey, session: s.session }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          game: p.game ? normalizeGame(p.game) : current.game,
          past: (p.past ?? []).filter((e) => Array.isArray(e.inverse)),
          playerName: p.playerName ?? "",
          playerKey: p.playerKey ?? "",
          session: p.session ?? null,
        };
      },
    },
  ),
);
