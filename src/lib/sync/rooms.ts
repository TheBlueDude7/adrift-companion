import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeGame } from "../maps";
import type { GameState } from "../types";
import { applyOps, type Op } from "./ops";
import type { Actor, Role } from "./permissions";

/** A person as other clients see them. `id` is public; the key that proves identity is not. */
export type Person = { id: string; name: string; role: Role; characterId: string | null; online: boolean };

type Member = { name: string; role: Role; characterId: string | null };
type Conn = { memberId: string; send: (event: string, data: unknown) => void };

type Room = {
  code: string;
  game: GameState;
  version: number;
  gmKeyHash: string | null;
  /** Players by public id (a hash of their private key). */
  members: Record<string, Member>;
  conns: Set<Conn>;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

type Saved = Pick<Room, "version" | "game" | "gmKeyHash" | "members">;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-Z2-9]{6}$/;
const DATA_DIR = process.env.ADRIFT_DATA_DIR ?? path.join(process.cwd(), "data", "campaigns");

// Route handlers can be loaded as separate module instances (and are re-evaluated on
// hot reload), so the live rooms live on globalThis to stay shared.
const g = globalThis as unknown as { __adriftRooms?: Map<string, Room> };
const rooms = (g.__adriftRooms ??= new Map());

const file = (code: string) => path.join(DATA_DIR, `${code}.json`);
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
export const memberIdFor = (key: string) => hash(`member:${key}`).slice(0, 16);

async function save(room: Room) {
  room.saveTimer = null;
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file(room.code)}.tmp`;
  const data: Saved = { version: room.version, game: room.game, gmKeyHash: room.gmKeyHash, members: room.members };
  await writeFile(tmp, JSON.stringify(data));
  await rename(tmp, file(room.code));
}

function scheduleSave(room: Room) {
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => void save(room).catch((e) => console.error("[adrift] save failed", room.code, e)), 1000);
}

export async function getRoom(code: string): Promise<Room | null> {
  if (!CODE_RE.test(code)) return null;
  const live = rooms.get(code);
  if (live) return live;
  try {
    const saved = JSON.parse(await readFile(file(code), "utf8")) as Partial<Saved> & Pick<Saved, "version" | "game">;
    const room: Room = { code, game: normalizeGame(saved.game), version: saved.version, gmKeyHash: saved.gmKeyHash ?? null, members: saved.members ?? {}, conns: new Set(), saveTimer: null };
    return rooms.get(code) ?? (rooms.set(code, room), room);
  } catch {
    return null;
  }
}

export async function createRoom(game: GameState): Promise<{ room: Room; gmKey: string }> {
  let code = "";
  do code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  while (await getRoom(code));
  const gmKey = randomBytes(18).toString("base64url");
  const room: Room = { code, game: normalizeGame(game), version: 0, gmKeyHash: hash(gmKey), members: {}, conns: new Set(), saveTimer: null };
  rooms.set(code, room);
  await save(room);
  return { room, gmKey };
}

export function isGm(room: Room, key: string) {
  // Campaigns hosted before roles existed have no GM key; everyone keeps full control there.
  return room.gmKeyHash === null || hash(key) === room.gmKeyHash;
}

export function actorFor(room: Room, key: string): Actor & { memberId: string } {
  const memberId = memberIdFor(key);
  if (isGm(room, key)) return { role: "gm", characterId: null, memberId };
  return { role: "player", characterId: room.members[memberId]?.characterId ?? null, memberId };
}

export function people(room: Room): Person[] {
  const online = new Set([...room.conns].map((c) => c.memberId));
  return Object.entries(room.members).map(([id, m]) => ({ id, name: m.name, role: m.role, characterId: m.characterId, online: online.has(id) }));
}

export function broadcast(room: Room, event: string, data: unknown) {
  for (const c of room.conns) c.send(event, data);
}

function announce(room: Room) {
  broadcast(room, "presence", people(room));
}

export function applyToRoom(room: Room, ops: Op[], meta: { client: string; opId: string }, claimNewCharacter?: string) {
  const before = new Set(room.game.characters.map((c) => c.id));
  room.game = applyOps(room.game, ops);
  room.version += 1;
  const lost = [...before].filter((id) => !room.game.characters.some((c) => c.id === id));
  for (const m of Object.values(room.members)) if (m.characterId && lost.includes(m.characterId)) m.characterId = null;
  if (claimNewCharacter) {
    const created = room.game.characters.find((c) => !before.has(c.id));
    if (created && room.members[claimNewCharacter]) room.members[claimNewCharacter].characterId = created.id;
  }
  scheduleSave(room);
  broadcast(room, "ops", { version: room.version, ops, ...meta });
  if (lost.length || claimNewCharacter) announce(room);
  return room.version;
}

export function join(room: Room, key: string, name: string, send: Conn["send"]): Conn {
  const memberId = memberIdFor(key);
  const gm = isGm(room, key);
  const existing = room.members[memberId];
  room.members[memberId] = { name, role: gm ? "gm" : "player", characterId: gm ? null : (existing?.characterId ?? null) };
  const conn = { memberId, send };
  room.conns.add(conn);
  scheduleSave(room);
  announce(room);
  return conn;
}

export function leave(room: Room, conn: Conn) {
  room.conns.delete(conn);
  announce(room);
}

/** Give a player a character (or none). A character belongs to at most one player. */
export function claim(room: Room, memberId: string, characterId: string | null): string | null {
  const m = room.members[memberId];
  if (!m || m.role === "gm") return "That person isn't a player in this campaign.";
  if (characterId !== null) {
    if (!room.game.characters.some((c) => c.id === characterId)) return "That character no longer exists.";
    const holder = Object.entries(room.members).find(([id, x]) => id !== memberId && x.characterId === characterId);
    if (holder) return `${holder[1].name} already plays that character.`;
  }
  m.characterId = characterId;
  scheduleSave(room);
  announce(room);
  return null;
}
