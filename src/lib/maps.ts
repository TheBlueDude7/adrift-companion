import { INJURY_BY_CODE } from "@/data/injuries";
import { uid } from "./dice";
import { MECH_TIERS } from "@/data/mechs";
import { maxMechArmor } from "./mechs";
import { DEFAULT_ITEM_TEMPLATES, threatBand } from "./rules";
import type { Crop, GameMap, GameState, GridMap, SpaceTile, StarMap, StarNode, StarNodeStatus, StarNodeType, Terrain, ThreatStats, TilePos, TokenKind, ZoneSecrets } from "./types";

export const TERRAIN: { key: Terrain; name: string; fill: string; hint: string }[] = [
  { key: "floor", name: "Floor", fill: "#334155", hint: "Walkable deck" },
  { key: "wall", name: "Wall", fill: "#cbd5e1", hint: "Bulkhead or hull" },
  { key: "door", name: "Door", fill: "#f59e0b", hint: "Hatch or doorway" },
  { key: "airlock", name: "Airlock", fill: "#22d3ee", hint: "Airlock or docking port" },
  { key: "cover", name: "Cover", fill: "#78716c", hint: "Consoles, crates, machinery" },
  { key: "debris", name: "Debris", fill: "#57534e", hint: "Rubble or difficult terrain" },
  { key: "hazard", name: "Hazard", fill: "#e11d48", hint: "Fire, venting, radiation, breach" },
  { key: "objective", name: "Salvage", fill: "#10b981", hint: "Loot, objective, point of interest" },
];
export const TERRAIN_BY_KEY = Object.fromEntries(TERRAIN.map((t) => [t.key, t])) as Record<Terrain, (typeof TERRAIN)[number]>;

export const TOKEN_KINDS: { key: TokenKind; name: string; color: string }[] = [
  { key: "crew", name: "Crew", color: "#f59e0b" },
  { key: "enemy", name: "Enemy", color: "#f43f5e" },
  { key: "neutral", name: "Other", color: "#a78bfa" },
];
export const TOKEN_COLOR = Object.fromEntries(TOKEN_KINDS.map((t) => [t.key, t.color])) as Record<TokenKind, string>;

export const NODE_TYPES: { key: StarNodeType; name: string }[] = [
  { key: "derelict", name: "Derelict" },
  { key: "station", name: "Station" },
  { key: "planet", name: "Planet" },
  { key: "anomaly", name: "Anomaly" },
  { key: "hazard", name: "Hazard" },
  { key: "beacon", name: "Beacon" },
  { key: "unknown", name: "Unknown signal" },
];

export const NODE_STATUSES: { key: StarNodeStatus; name: string; color: string }[] = [
  { key: "unexplored", name: "Unexplored", color: "#94a3b8" },
  { key: "visited", name: "Visited", color: "#38bdf8" },
  { key: "looted", name: "Picked clean", color: "#64748b" },
  { key: "dangerous", name: "Dangerous", color: "#f43f5e" },
];
export const STATUS_COLOR = Object.fromEntries(NODE_STATUSES.map((s) => [s.key, s.color])) as Record<StarNodeStatus, string>;

export const SPACE_TILES: { key: SpaceTile; name: string; color: string; hint: string }[] = [
  { key: "clear", name: "Clear", color: "#475569", hint: "Scanned, nothing notable" },
  { key: "debris", name: "Debris field", color: "#a8a29e", hint: "Wreckage and rubble" },
  { key: "radiation", name: "Radiation", color: "#eab308", hint: "Radiation or flare exposure" },
  { key: "gravity", name: "Gravity well", color: "#8b5cf6", hint: "Gravitational hazard" },
  { key: "interference", name: "Interference", color: "#06b6d4", hint: "Scans here are Skilled work" },
  { key: "hazard", name: "Other hazard", color: "#e11d48", hint: "Anything else dangerous" },
];
export const SPACE_TILE_BY_KEY = Object.fromEntries(SPACE_TILES.map((t) => [t.key, t])) as Record<SpaceTile, (typeof SPACE_TILES)[number]>;

export const STAR_SIZES = [51, 101, 151, 201];

export const cellKey = (x: number, y: number) => `${x},${y}`;

/** Tiles between two tiles, counting diagonal steps as one move. */
export const tileDistance = (a: TilePos, b: TilePos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Coordinates relative to the neutron star, e.g. "+12, −4". North is negative rows. */
export function tileLabel(m: Pick<StarMap, "star">, p: TilePos) {
  const f = (n: number) => (n === 0 ? "0" : n > 0 ? `+${n}` : `−${-n}`);
  return `${f(p.x - m.star.x)}, ${f(m.star.y - p.y)}`;
}

export function newGridMap(name: string, width = 60, height = 40): GridMap {
  return { id: uid(), kind: "grid", name, width, height, cells: {}, labels: [], tokens: [], notes: "" };
}

export function newStarMap(name: string, size = 101): StarMap {
  const c = (size - 1) / 2;
  const home = { x: c + 9, y: c + 5 };
  return {
    id: uid(),
    kind: "star",
    name,
    size,
    star: { x: c, y: c },
    tiles: { [cellKey(home.x, home.y)]: "debris" },
    nodes: [],
    shipAt: home,
    notes: "",
  };
}

export function defaultMaps(): GameMap[] {
  return [newStarMap("System chart")];
}

/** The core system map: the campaign's first system chart. Only the GM may delete it. */
export function coreMapId(maps: GameMap[]): string | undefined {
  return maps.find((m) => m.kind === "star")?.id;
}

/**
 * Grow or shrink a chart around its middle tile. Returns false (and changes nothing) if a
 * contact, the ship, or the star would fall off the edge.
 */
export function resizeStarMap(m: StarMap, size: number) {
  const d = (size - m.size) / 2;
  const inside = (p: TilePos) => p.x + d >= 0 && p.y + d >= 0 && p.x + d < size && p.y + d < size;
  if (!m.nodes.every(inside) || !inside(m.star) || (m.shipAt && !inside(m.shipAt))) return false;
  const tiles: Record<string, SpaceTile> = {};
  for (const [k, t] of Object.entries(m.tiles)) {
    const [x, y] = k.split(",").map(Number);
    if (inside({ x, y })) tiles[cellKey(x + d, y + d)] = t;
  }
  m.tiles = tiles;
  for (const n of m.nodes) { n.x += d; n.y += d; }
  m.star = { x: m.star.x + d, y: m.star.y + d };
  if (m.shipAt) m.shipAt = { x: m.shipAt.x + d, y: m.shipAt.y + d };
  m.size = size;
  return true;
}

type OldStarMap = { id: string; kind: "star"; name: string; nodes: StarNode[]; links?: unknown; shipAt: string | null };

/** Starmaps used to be free-form node graphs on a 2000×1400 canvas. Put each location on a tile. */
function migrateStarMap(old: OldStarMap): StarMap {
  const size = 101;
  const c = (size - 1) / 2;
  const clamp = (n: number) => Math.min(size - 1, Math.max(0, n));
  const tiles: Record<string, SpaceTile> = {};
  const taken = new Set<string>();
  const nodes = old.nodes.map((n) => {
    let x = clamp(c + Math.round((n.x - 1000) / 40));
    const y = clamp(c + Math.round((n.y - 700) / 40));
    while (taken.has(cellKey(x, y)) && x < size - 1) x++;
    taken.add(cellKey(x, y));
    if (n.status !== "unexplored") tiles[cellKey(x, y)] = "clear";
    return { ...n, x, y };
  });
  const ship = nodes.find((n) => n.id === old.shipAt);
  return { id: old.id, kind: "star", name: old.name, size, star: { x: c, y: c }, tiles, nodes, shipAt: ship ? { x: ship.x, y: ship.y } : null, notes: "" };
}

/** Fill fields that older saves are missing. Deterministic, so server and clients agree. */
const MODULE_RENAMES: Record<string, string> = { "Cargo Storage": "Storage Bay", "Biological Laboratory": "Biological Lab" };

export function normalizeGame(g: GameState): GameState {
  if (!Array.isArray(g.maps)) g.maps = defaultMaps();
  g.maps = g.maps.map((m) => (m.kind === "star" && typeof (m as Partial<StarMap>).size !== "number" ? migrateStarMap(m as unknown as OldStarMap) : m));
  if (!Array.isArray(g.mechs)) g.mechs = [];
  if (!Array.isArray(g.threats)) g.threats = [];
  // A threat's numbers used to sit alongside its name, where every player could read them.
  for (const t of g.threats) {
    const old = t as unknown as ThreatStats & { downed?: boolean };
    if (typeof old.hp === "number") {
      t.stats = { hp: old.hp, maxHp: old.maxHp, armor: old.armor, resist: old.resist ?? [], vulnerable: old.vulnerable ?? [], immune: old.immune ?? [], notes: old.notes ?? "" };
      for (const k of ["hp", "maxHp", "armor", "resist", "vulnerable", "immune", "notes", "downed"] as const) delete old[k];
    }
    if (!Array.isArray(t.conditions)) t.conditions = [];
    if (!t.known || !Array.isArray(t.known.defenses)) t.known = { defenses: [], facts: [] };
    // A player's copy has no numbers to read the band from, so only recompute where they exist.
    if (t.stats) t.band = threatBand(t.stats.hp, t.stats.maxHp);
    else if (!t.band) t.band = "unhurt";
  }
  for (const m of g.mechs) {
    // Mech Armor used to be a permanent module bonus. Saves from then start with their plating intact.
    if (typeof m.armor !== "number") m.armor = maxMechArmor(m);
    // Plating used to come only from modules. Frames carry their own now, fitted once to older mechs.
    else if (!m.plated) m.armor += MECH_TIERS[m.tier].armor;
    m.plated = true;
  }
  if (!Array.isArray(g.actions)) g.actions = [];
  // An expedition that began before sites had zones is one unmapped room the crew is standing in.
  if (g.expedition) {
    if (!Array.isArray(g.expedition.zones)) g.expedition.zones = [];
    if (!Array.isArray(g.expedition.borders)) g.expedition.borders = [];
    if (!g.expedition.at) g.expedition.at = {};
    // What a Search would turn up used to be one line of the GM's note. It's a find now, waiting in
    // the room like any other — and a player's copy has no secrets, so there's nothing to carry.
    for (const z of g.expedition.zones) {
      const old = z.secrets as (ZoneSecrets & { search?: string }) | undefined;
      if (!Array.isArray(z.finds)) z.finds = old?.search?.trim() ? [{ id: uid(), text: old.search, by: "search" }] : [];
      if (old) delete old.search;
    }
  }
  if (!g.research || !Array.isArray(g.research.cybernetics)) g.research = { cybernetics: [] };
  // Hydroponics grew food and nothing else, so `ready` was a plain count of Raw Food.
  const crop = g.ship.crop as (Omit<Crop, "ready"> & { ready: number | Crop["ready"] }) | undefined;
  if (crop) {
    if (!crop.kind) crop.kind = "food";
    if (typeof crop.ready === "number") crop.ready = crop.ready > 0 ? { food: crop.ready } : {};
    else if (!crop.ready) crop.ready = {};
  }
  for (const r of g.ship.rooms) {
    if (r.module && MODULE_RENAMES[r.module]) r.module = MODULE_RENAMES[r.module];
  }
  const known = new Set(g.catalog.map((t) => t.name));
  const missing = DEFAULT_ITEM_TEMPLATES.filter((t) => !known.has(t.name));
  if (missing.length) g.catalog = [...g.catalog, ...missing];
  for (const t of g.catalog) {
    const d = DEFAULT_ITEM_TEMPLATES.find((x) => x.name === t.name);
    if (!d) continue;
    if (d.heavy && t.heavy === undefined) t.heavy = true;
    // Weapons used to carry their damage only as prose, which nothing could referee.
    if (d.weapon && !t.weapon) t.weapon = d.weapon;
    if (/Power Cell$/.test(t.name) && t.notes?.startsWith("Powers the ship")) t.notes = d.notes;
  }
  const heavy = new Set(g.catalog.filter((t) => t.heavy).map((t) => t.name));
  for (const i of g.items) if (i.heavy === undefined && (heavy.has(i.name) || i.name.endsWith("(mech module)"))) i.heavy = true;
  const profiles = new Map(g.catalog.flatMap((t) => (t.weapon ? [[t.name, t.weapon] as const] : [])));
  for (const i of g.items) if (!i.weapon && profiles.has(i.name)) i.weapon = profiles.get(i.name);
  for (const c of g.characters) {
    for (const inj of c.injuries) {
      if (!inj.location && !inj.legacy) inj.legacy = true;
      if ((inj.state as string) === "Stabilized") inj.state = "Treated";
      const def = inj.location ? INJURY_BY_CODE[inj.code] : undefined;
      if (def && def.name === inj.name) inj.effect = def.effect;
    }
  }
  return g;
}

/** Cells on the straight line between two cells, so fast brush strokes leave no gaps. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

/** A room: floor inside, walls around the edge. Existing doors and airlocks on the edge are kept. */
export function roomCells(cells: Record<string, Terrain>, x0: number, y0: number, x1: number, y1: number, mode: "room" | Terrain | null) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const next = { ...cells };
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++) {
      const k = cellKey(x, y);
      if (mode === null) delete next[k];
      else if (mode === "room") {
        const edge = x === ax || x === bx || y === ay || y === by;
        if (!edge) next[k] = "floor";
        else if (next[k] !== "door" && next[k] !== "airlock") next[k] = "wall";
      } else next[k] = mode;
    }
  return next;
}

export function initials(name: string) {
  const parts = name.replace(/^(Dr|Sgt|Cpt|Lt)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
