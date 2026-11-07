import "server-only";

import { uid } from "../dice";
import { diff } from "../sync/ops";
import type { GameState } from "../types";

/**
 * A simulated player, driven over the same HTTP endpoints the browser uses. Nothing here knows the
 * rules: the server runs `denyReason` on every change and rolls the dice itself, so a simulated
 * player is refereed exactly like a human one and can't cheat even if the model asks it to.
 */
export type SimClient = {
  readonly code: string;
  readonly name: string;
  snapshot: () => Promise<GameState>;
  claim: (characterId: string | null) => Promise<void>;
  /** Mutate a copy of the live state and send the difference, the way the app's `act()` does. */
  change: (fn: (g: GameState) => void) => Promise<void>;
  resolveStep: (actionId: string, step: ResolveStep, body?: Record<string, unknown>) => Promise<void>;
};

export type ResolveStep = "roll" | "push" | "accept" | "routine" | "cancel";

/** Keys live only in memory: a restart gives a simulated player a new key, and `join` hands back its old slot by name. */
const g = globalThis as unknown as { __adriftSimKeys?: Map<string, string> };
const keys = (g.__adriftSimKeys ??= new Map());
export const simKey = (code: string, characterId: string) => {
  const at = `${code}:${characterId}`;
  let key = keys.get(at);
  if (!key) keys.set(at, (key = `sim-${uid()}${uid()}`));
  return key;
};

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(`${what}: ${body?.error ?? `${res.status} ${res.statusText}`}`);
}

/**
 * Read the campaign over the event stream, which is the only endpoint that serves full state.
 * Opening it also registers the simulated player, so the GM sees them in the campaign's roster.
 */
export async function readSnapshot(base: string, code: string, key: string, name: string): Promise<GameState> {
  const url = `${base}/api/campaigns/${code}/events?key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`;
  const stop = new AbortController();
  const res = await fetch(url, { signal: stop.signal, headers: { Accept: "text/event-stream" } });
  if (!res.ok || !res.body) {
    stop.abort();
    return fail(res, "Couldn't read the campaign");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("The campaign stream closed before sending a snapshot.");
      buffer += decoder.decode(value, { stream: true });
      // Events are separated by a blank line; everything before the last one is complete.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const lines = frame.split("\n");
        if (!lines.some((l) => l === "event: snapshot")) continue;
        const data = lines.find((l) => l.startsWith("data: "));
        if (data) return (JSON.parse(data.slice(6)) as { game: GameState }).game;
      }
    }
  } finally {
    stop.abort();
  }
}

export function createSimClient(base: string, code: string, characterId: string, name: string): SimClient {
  const key = simKey(code, characterId);
  const client = uid();
  const post = async (path: string, body: unknown, what: string) => {
    const res = await fetch(`${base}/api/campaigns/${code}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-adrift-key": key },
      body: JSON.stringify(body),
    });
    if (!res.ok) await fail(res, what);
  };
  const snapshot = () => readSnapshot(base, code, key, name);
  return {
    code,
    name,
    snapshot,
    claim: (id) => post("claim", { characterId: id }, "Couldn't take that character"),
    change: async (fn) => {
      const before = await snapshot();
      const after = structuredClone(before);
      fn(after);
      const ops = diff(before, after);
      if (ops.length) await post("ops", { client, opId: uid(), ops }, "The server refused the change");
    },
    resolveStep: (actionId, step, body = {}) => post("resolve", { client, opId: uid(), actionId, step, ...body }, `Couldn't ${step} that task`),
  };
}
