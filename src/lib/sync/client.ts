"use client";

import { toast } from "sonner";
import type { BioDef } from "@/data/biology";
import { installBiology } from "../bio-catalogue";
import { uid } from "../dice";
import { normalizeGame } from "../maps";
import { useGame, type Person } from "../store";
import type { Resolution } from "../actions";
import type { Cover } from "../rules";
import type { GameState } from "../types";
import { applyOps, type Op } from "./ops";
import { outbox } from "./outbox";

export const BACKUP_KEY = "adrift-companion-local-backup";

/**
 * Take delivery of a biological catalogue.
 *
 * It goes two places on purpose. The registry is what the game rules read — synchronously, from
 * server and browser alike — and the store is what the interface watches, so a cultivation completing
 * redraws the tree instead of leaving a stale page. One call site keeps them from drifting.
 */
export function receiveCatalogue(defs: BioDef[]) {
  installBiology(defs);
  useGame.setState({ bioCatalogue: defs });
}

/**
 * Solo play has no server-side identity to check, so the catalogue is fetched whole.
 *
 * There is nobody to keep a secret from on a device playing alone: whoever is sitting there is the
 * GM. In a shared campaign this is never called, because the catalogue arrives over the campaign's
 * own authenticated channel instead.
 */
export async function loadSoloCatalogue() {
  if (useGame.getState().session) return;
  const res = await fetch("/api/biology").catch(() => null);
  if (!res?.ok) return;
  const data = (await res.json().catch(() => null)) as { biology?: BioDef[] } | null;
  if (data?.biology) receiveCatalogue(data.biology);
}

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

  // The biological catalogue is server-held, so this is the only way a client in a shared campaign
  // learns what exists. A player is sent what their lab has grown; a GM is sent all of it.
  src.addEventListener("catalogue", (e) => {
    receiveCatalogue((JSON.parse((e as MessageEvent).data) as { biology: BioDef[] }).biology);
  });

  src.addEventListener("kicked", () => {
    leaveCampaign();
    toast.error("The GM removed you from the shared campaign. The latest version is kept on this device.");
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

/** Keep a campaign in this device's list so it can be rejoined later. A GM key, once known, is never dropped. */
export function remember(c: string, ship: string, gmKey?: string) {
  const { recent } = useGame.getState();
  const old = recent.find((r) => r.code === c);
  const entry = { code: c, ship, at: Date.now(), ...((gmKey ?? old?.gmKey) ? { gmKey: gmKey ?? old?.gmKey } : {}) };
  useGame.setState({ recent: [entry, ...recent.filter((r) => r.code !== c)].slice(0, 20) });
}

export function forget(c: string) {
  useGame.setState({ recent: useGame.getState().recent.filter((r) => r.code !== c) });
}

export async function hostCampaign() {
  const { game } = useGame.getState();
  const res = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game }) });
  const data = (await res.json()) as { code?: string; gmKey?: string; error?: string };
  if (!res.ok || !data.code || !data.gmKey) throw new Error(data.error ?? "Could not reach the server.");
  useGame.setState({ session: { code: data.code, gmKey: data.gmKey } });
  remember(data.code, game.ship.name, data.gmKey);
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

export function joinCampaign(c: string, gmKey?: string, ship?: string) {
  const s = useGame.getState();
  if (!s.session) localStorage.setItem(BACKUP_KEY, JSON.stringify(s.game));
  else remember(s.session.code, s.game.ship.name, s.session.gmKey);
  const key = gmKey ?? s.recent.find((r) => r.code === c)?.gmKey;
  disconnect();
  useGame.setState({ session: key ? { code: c, gmKey: key } : { code: c }, past: [] });
  remember(c, ship ?? s.recent.find((r) => r.code === c)?.ship ?? "Campaign", key);
  connect(c);
}

export type TaskStep = "roll" | "push" | "accept" | "routine" | "cancel";

/** Roll, Push, or resolve one of your own planned tasks. The server rolls, applies the result, and broadcasts it. */
export async function resolveOwnTask(actionId: string, step: TaskStep, r: Pick<Resolution, "outcome" | "scan" | "crafted"> = { outcome: "" }) {
  const { session } = useGame.getState();
  if (!session) return;
  const res = await fetch(`/api/campaigns/${session.code}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ client: clientId, opId: uid(), actionId, step, ...r }),
  }).catch(() => null);
  if (!res) return toast.error("Could not reach the server. Try again in a moment.");
  if (!res.ok) toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The server couldn't resolve that task.");
}

/**
 * Attack with your own survivor, or make their death check. The server builds the pool, rolls it and
 * applies the damage, so what goes over the wire is only who you shot at and from where.
 */
export async function attackOwnTarget(body: AttackRequest) {
  const { session } = useGame.getState();
  if (!session) return;
  const res = await fetch(`/api/campaigns/${session.code}/attack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ client: clientId, opId: uid(), ...body }),
  }).catch(() => null);
  if (!res) return toast.error("Could not reach the server. Try again in a moment.");
  if (!res.ok) toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The server couldn't resolve that attack.");
}

export type AttackRequest =
  | { step?: undefined; attackerId: string; targetId: string; itemId: string | null; zones: number; cover: Cover; aim: boolean; burst: boolean; answers: Record<string, boolean> }
  | { step: "death-check"; attackerId: string; willpower: boolean };

/** Pick a character to play, or (as GM) assign one to another player. `null` releases it. */
export async function claimCharacter(characterId: string | null, memberId?: string) {
  const { session, viewAs } = useGame.getState();
  if (!session) return;
  if (viewAs) throw new Error("You're viewing as a player, so that would claim the character for you. Go back to the GM's view first.");
  const res = await fetch(`/api/campaigns/${session.code}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ characterId, memberId }),
  }).catch(() => null);
  if (!res) throw new Error("Could not reach the server.");
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not claim that character.");
}

/** GM only: remove a player from the campaign and free their character. */
export async function kickPlayer(memberId: string) {
  const { session } = useGame.getState();
  if (!session) return;
  const res = await fetch(`/api/campaigns/${session.code}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-adrift-key": keyFor() },
    body: JSON.stringify({ memberId }),
  }).catch(() => null);
  if (!res) throw new Error("Could not reach the server.");
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not remove that player.");
}

/** Stop syncing. The latest shared state stays on this device as a local copy. */
export function leaveCampaign() {
  const { session, game } = useGame.getState();
  if (session) remember(session.code, game.ship.name, session.gmKey);
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
