"use client";

import { toast } from "sonner";
import { uid } from "../dice";
import { normalizeGame } from "../maps";
import { useGame, type Person } from "../store";
import type { Resolution } from "../actions";
import type { GameState } from "../types";
import { applyOps, type Op } from "./ops";
import { outbox } from "./outbox";

export const BACKUP_KEY = "adrift-companion-local-backup";

/**
 * Keeps the local store in step with a shared campaign.
 *
 * `confirmed` mirrors the server exactly (every broadcast applied in server order). What the
 * player sees is `confirmed` plus their own changes that the server hasn't echoed back yet,
 * so every client converges on the same state no matter how edits interleave.
 */
let es: EventSource | null = null;
let confirmed: GameState | null = null;
let version = -1;
let pending: { opId: string; ops: Op[] }[] = [];
let sending = false;
let code: string | null = null;

const clientId = (() => {
  if (typeof window === "undefined") return "server";
  const k = "adrift-client-id";
  const existing = sessionStorage.getItem(k);
  if (existing) return existing;
  const id = uid() + uid();
  sessionStorage.setItem(k, id);
  return id;
})();

function keyFor() {
  const s = useGame.getState();
  if (s.session?.gmKey) return s.session.gmKey;
  if (s.playerKey) return s.playerKey;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");
  useGame.setState({ playerKey: key });
  return key;
}

function show() {
  if (!confirmed) return;
  let view = structuredClone(confirmed);
  for (const p of pending) view = applyOps(view, p.ops);
  useGame.setState({ game: normalizeGame(view) });
}

async function flush() {
  if (sending || !code) return;
  sending = true;
  try {
    while (pending.length > 0 && code) {
      const next = pending.find((p) => !("sent" in p));
      if (!next) break;
      const res = await fetch(`/api/campaigns/${code}/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
        body: JSON.stringify({ client: clientId, opId: next.opId, ops: next.ops }),
      }).catch(() => null);
      if (!res) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (res.status === 404) {
        lost();
        break;
      }
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 413) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error ?? "The server rejected that change.");
        pending = pending.filter((p) => p !== next);
        show();
        continue;
      }
      // Gateway errors while the host restarts or redeploys. Ops are idempotent, so resending is safe.
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      Object.assign(next, { sent: true });
    }
  } finally {
    sending = false;
  }
}

function lost() {
  es?.close();
  es = null;
  useGame.setState({ status: "lost" });
}

function open() {
  es?.close();
  const { playerName } = useGame.getState();
  const src = new EventSource(`/api/campaigns/${code}/events?key=${encodeURIComponent(keyFor())}&name=${encodeURIComponent(playerName || "Someone")}`);
  es = src;
  useGame.setState({ status: "connecting" });

  src.addEventListener("snapshot", (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { version: number; game: GameState };
    confirmed = normalizeGame(data.game);
    version = data.version;
    for (const p of pending) delete (p as { sent?: boolean }).sent;
    useGame.setState({ status: "online" });
    show();
    void flush();
  });

  src.addEventListener("ops", (e) => {
    const data = JSON.parse((e as MessageEvent).data) as { version: number; ops: Op[]; client: string; opId: string };
    if (!confirmed) return;
    if (data.version !== version + 1) {
      open();
      return;
    }
    version = data.version;
    confirmed = applyOps(confirmed, data.ops);
    if (data.client === clientId) pending = pending.filter((p) => p.opId !== data.opId);
    show();
  });

  src.addEventListener("me", (e) => {
    useGame.setState({ me: JSON.parse((e as MessageEvent).data) as { id: string; role: "gm" | "player" } });
  });

  src.addEventListener("presence", (e) => {
    useGame.setState({ people: JSON.parse((e as MessageEvent).data) as Person[] });
  });

  src.onerror = async () => {
    if (es !== src) return;
    useGame.setState({ status: "connecting" });
    const res = await fetch(`/api/campaigns/${code}`).catch(() => null);
    if (res?.status === 404) lost();
  };
}

export function connect(sessionCode: string) {
  if (code === sessionCode && es) return;
  code = sessionCode;
  confirmed = null;
  version = -1;
  pending = [];
  outbox.send = (ops) => {
    pending.push({ opId: uid(), ops });
    void flush();
  };
  open();
}

export function disconnect() {
  es?.close();
  es = null;
  code = null;
  confirmed = null;
  pending = [];
  outbox.send = null;
  useGame.setState({ status: "offline", people: [], me: null });
}

/** Reconnect so other players see a new display name. */
export function reannounce() {
  if (code) open();
}

export async function hostCampaign() {
  const { game } = useGame.getState();
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game }) });
  const data = (await res.json()) as { code?: string; gmKey?: string; error?: string };
  if (!res.ok || !data.code || !data.gmKey) throw new Error(data.error ?? "Could not reach the server.");
  useGame.setState({ session: { code: data.code, gmKey: data.gmKey } });
  connect(data.code);
  return data.code;
}

export async function lookupCampaign(raw: string) {
  const c = raw.trim().toUpperCase();
  const res = await fetch(`/api/campaigns/${encodeURIComponent(c)}`).catch(() => null);
  if (!res) throw new Error("Could not reach the server.");
  const data = (await res.json()) as { code?: string; ship?: string; crew?: number; people?: Person[]; error?: string };
  if (!res.ok || !data.code) throw new Error(data.error ?? "No campaign with that code.");
  return data as { code: string; ship: string; crew: number; people: Person[] };
}

export function joinCampaign(c: string, gmKey?: string) {
  const s = useGame.getState();
  if (!s.session) localStorage.setItem(BACKUP_KEY, JSON.stringify(s.game));
  disconnect();
  useGame.setState({ session: gmKey ? { code: c, gmKey } : { code: c }, past: [] });
  connect(c);
}

/** Resolve one of your own planned tasks. The server applies the result and broadcasts it. */
export async function resolveOwnTask(actionId: string, r: Omit<Resolution, "energy">) {
  const { session } = useGame.getState();
  if (!session) return;
  const res = await fetch(`/api/campaigns/${session.code}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ client: clientId, opId: uid(), actionId, ...r }),
  }).catch(() => null);
  if (!res) return toast.error("Could not reach the server. Try again in a moment.");
  if (!res.ok) toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The server couldn't resolve that task.");
}

/** Pick a character to play, or (as GM) assign one to another player. `null` releases it. */
export async function claimCharacter(characterId: string | null, memberId?: string) {
  const { session } = useGame.getState();
  if (!session) return;
  const res = await fetch(`/api/campaigns/${session.code}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ characterId, memberId }),
  }).catch(() => null);
  if (!res) throw new Error("Could not reach the server.");
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not claim that character.");
}

/** Stop syncing. The latest shared state stays on this device as a local copy. */
export function leaveCampaign() {
  disconnect();
  useGame.setState({ session: null, past: [] });
}

export function restoreBackup() {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return false;
  useGame.getState().replace(JSON.parse(raw) as GameState, "Restore local campaign");
  localStorage.removeItem(BACKUP_KEY);
  return true;
}
