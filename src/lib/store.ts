"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BioDef } from "@/data/biology";
import { pushLog } from "./log";
import { normalizeGame } from "./maps";
import { createInitialState } from "./seed";
import { applyOps, diff, type Op } from "./sync/ops";
import { outbox } from "./sync/outbox";
import { denyReason, type Actor, type Role } from "./sync/permissions";
import { playerView } from "./sync/redact";
import { toast } from "sonner";
import type { GameState, Line, LogEntry } from "./types";

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
  /** Shared campaigns this device has hosted or joined, newest first, so they can be rejoined. */
  recent: { code: string; gmKey?: string; ship: string; at: number }[];
  status: SyncStatus;
  people: Person[];
  me: { id: string; role: Role } | null;
  /**
   * The biological augmentations this client has been told about, which is all of them for a GM and
   * only the crew's own cultivations for a player. Not persisted: the catalogue is the server's, and
   * a stale copy on disk would be a copy nobody checked the entitlement of.
   */
  bioCatalogue: BioDef[];
  /**
   * The GM looking at the campaign as a player would: as the player of this character, or of none
   * yet. Never persisted, so a reload always comes back as the GM.
   */
  viewAs: { characterId: string | null } | null;
  /** Apply a change. The recipe mutates a draft copy; it may return log lines, some GM-only. */
  act: (label: string, recipe: (g: GameState) => void | string | (string | Line)[], kind?: LogEntry["kind"]) => void;
  undo: () => void;
  replace: (game: GameState, label: string) => void;
};

/** Who this device really is, whoever the GM is viewing as. Offline, you are the GM of your own campaign. */
export function realActorOf(s: Pick<Store, "session" | "me" | "people">): Actor {
  if (!s.session) return { role: "gm", characterId: null };
  const role = s.me?.role ?? (s.session.gmKey ? "gm" : "player");
  return { role, characterId: role === "gm" ? null : (s.people.find((p) => p.id === s.me?.id)?.characterId ?? null) };
}

/** Who is acting: the real actor, or the player a GM is viewing as, held to that player's permissions. */
export function actorOf(s: Pick<Store, "session" | "me" | "people"> & Partial<Pick<Store, "viewAs">>): Actor {
  const real = realActorOf(s);
  return real.role === "gm" && s.viewAs ? { role: "player", characterId: s.viewAs.characterId } : real;
}

const views = new WeakMap<Store, Store>();

/**
 * The state as this client should show it. While the GM views as a player that's the redacted state
 * the server would send that player, and only the biology their lab has grown or someone carries.
 * Cached per state so selectors keep getting the same references.
 */
function shown(s: Store): Store {
  if (!s.viewAs) return s;
  let v = views.get(s);
  if (!v) {
    const known = new Set([...(s.game.research.biology ?? []), ...s.game.characters.flatMap((c) => (c.biology ?? []).map((i) => i.key))]);
    v = { ...s, game: playerView(s.game), bioCatalogue: s.bioCatalogue.filter((d) => known.has(d.key)) };
    views.set(s, v);
  }
  return v;
}

/**
 * A selector passed to `useGame` has to return the same reference when nothing has changed. zustand 5
 * doesn't memoize selectors, so one that builds a fresh object, array or Set every call — `?? []`,
 * `.filter(...)`, or a helper returning `{ ... }` — re-renders until React gives up with "Maximum
 * update depth exceeded". Select the state you need and do the work outside the selector.
 */
const store = create<Store>()(
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
        recent: [],
        status: "offline",
        people: [],
        me: null,
        bioCatalogue: [],
        viewAs: null,
        act: (label, recipe, kind = "info") => {
          const prev = get().game;
          const draft = structuredClone(prev);
          const out = recipe(draft);
          const lines = out === undefined ? [label] : Array.isArray(out) ? out : [out];
          for (const line of lines.slice().reverse()) if (line) pushLog(draft, line, kind);
          // A GM-only line is written by the GM's own device; a player's never produces one.
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
      partialize: (s) => ({ game: s.game, past: s.past.slice(0, 15), playerName: s.playerName, playerKey: s.playerKey, session: s.session, recent: s.recent }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return {
          ...current,
          game: p.game ? normalizeGame(p.game) : current.game,
          past: (p.past ?? []).filter((e) => Array.isArray(e.inverse)),
          playerName: p.playerName ?? "",
          playerKey: p.playerKey ?? "",
          session: p.session ?? null,
          recent: Array.isArray(p.recent) ? p.recent : p.session ? [{ ...p.session, ship: p.game?.ship.name ?? "Campaign", at: Date.now() }] : [],
        };
      },
    },
  ),
);

/**
 * The store, as components read it: what `shown` gives them. `getState` and `setState` are the
 * store's own and always see the whole state, which is what changes have to be made against.
 */
function useShown(): Store;
function useShown<T>(selector: (s: Store) => T): T;
function useShown<T>(selector?: (s: Store) => T) {
  return store((s) => (selector ? selector(shown(s)) : shown(s)));
}
export const useGame = Object.assign(useShown, store);
