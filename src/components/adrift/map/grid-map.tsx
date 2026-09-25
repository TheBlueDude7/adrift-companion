"use client";

import {
  BrushIcon,
  EraserIcon,
  HandIcon,
  LayoutPanelTopIcon,
  MapPinIcon,
  MinusIcon,
  MousePointer2Icon,
  OrbitIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  TypeIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uid } from "@/lib/dice";
import { TERRAIN, TERRAIN_BY_KEY, TOKEN_COLOR, TOKEN_KINDS, cellKey, initials, lineCells, roomCells } from "@/lib/maps";
import { useGame } from "@/lib/store";
import type { GameState, GridMap, MapToken, Terrain, TokenKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CommitInput } from "../commit-input";
import { SectionTitle } from "../common";

type Tool = "select" | "pan" | "brush" | "erase" | "rect" | "room" | "label" | "token";
type Sel = { type: "token" | "label"; id: string } | null;
type Interaction =
  | { mode: "pan"; cx: number; cy: number; sl: number; st: number }
  | { mode: "paint"; last: [number, number]; value: Terrain | null }
  | { mode: "rect"; x0: number; y0: number }
  | { mode: "move"; sel: NonNullable<Sel>; moved: boolean }
  | null;

const TOOLS: { key: Tool; name: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "select", name: "Select", icon: MousePointer2Icon, hint: "Select and drag tokens or labels. Drag empty space to pan." },
  { key: "pan", name: "Pan", icon: HandIcon, hint: "Drag to move around the map." },
  { key: "room", name: "Room", icon: LayoutPanelTopIcon, hint: "Drag a rectangle: floor inside, walls around the edge." },
  { key: "brush", name: "Brush", icon: BrushIcon, hint: "Paint the chosen terrain cell by cell." },
  { key: "rect", name: "Fill", icon: SquareIcon, hint: "Drag a rectangle filled with the chosen terrain." },
  { key: "erase", name: "Erase", icon: EraserIcon, hint: "Drag to clear cells back to empty space." },
  { key: "label", name: "Label", icon: TypeIcon, hint: "Click to drop a text label." },
  { key: "token", name: "Token", icon: UserRoundIcon, hint: "Click to place a crew, enemy, or other token." },
];

const ZOOMS = [10, 14, 18, 24, 32, 44];

function useGridUpdate(mapId: string) {
  const act = useGame((s) => s.act);
  return (label: string, fn: (m: GridMap, g: GameState) => string | void) =>
    act(label, (g) => {
      const m = g.maps.find((x) => x.id === mapId);
      if (!m || m.kind !== "grid") return "";
      return fn(m, g) ?? "";
    });
}

function CellShape({ x, y, t, s }: { x: number; y: number; t: Terrain; s: number }) {
  const px = x * s;
  const py = y * s;
  const floor = <rect x={px} y={py} width={s} height={s} fill={TERRAIN_BY_KEY.floor.fill} />;
  const fill = TERRAIN_BY_KEY[t].fill;
  switch (t) {
    case "floor":
      return floor;
    case "wall":
      return <rect x={px} y={py} width={s} height={s} fill={fill} />;
    case "door":
      return <g>{floor}<rect x={px + s * 0.12} y={py + s * 0.3} width={s * 0.76} height={s * 0.4} rx={s * 0.08} fill={fill} /></g>;
    case "airlock":
      return <g>{floor}<rect x={px + s * 0.15} y={py + s * 0.15} width={s * 0.7} height={s * 0.7} fill="none" stroke={fill} strokeWidth={Math.max(1.5, s * 0.12)} /></g>;
    case "cover":
      return <g>{floor}<rect x={px + s * 0.14} y={py + s * 0.14} width={s * 0.72} height={s * 0.72} rx={s * 0.12} fill={fill} /></g>;
    case "debris":
      return (
        <g>
          {floor}
          <circle cx={px + s * 0.3} cy={py + s * 0.35} r={s * 0.12} fill="#a8a29e" />
          <circle cx={px + s * 0.68} cy={py + s * 0.3} r={s * 0.08} fill="#a8a29e" />
          <circle cx={px + s * 0.5} cy={py + s * 0.7} r={s * 0.14} fill="#a8a29e" />
        </g>
      );
    case "hazard":
      return <g>{floor}<rect x={px} y={py} width={s} height={s} fill="url(#hazard-stripes)" /></g>;
    case "objective":
      return <g>{floor}<path d={`M ${px + s / 2} ${py + s * 0.14} L ${px + s * 0.86} ${py + s / 2} L ${px + s / 2} ${py + s * 0.86} L ${px + s * 0.14} ${py + s / 2} Z`} fill={fill} /></g>;
  }
}

export function GridMapView({ map, onOpenStarmap }: { map: GridMap; onOpenStarmap?: () => void }) {
  const characters = useGame((s) => s.game.characters);
  const update = useGridUpdate(map.id);
  const [tool, setTool] = useState<Tool>("room");
  const [terrain, setTerrain] = useState<Terrain>("floor");
  const [zoom, setZoom] = useState(3);
  const [selected, setSelected] = useState<Sel>(null);
  const [tokenKind, setTokenKind] = useState<TokenKind>("crew");
  const [tokenChar, setTokenChar] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, Terrain> | null>(null);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [movePos, setMovePos] = useState<{ x: number; y: number } | null>(null);
  const ix = useRef<Interaction>(null);
  const draftRef = useRef<Record<string, Terrain> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const s = ZOOMS[zoom];
  const cells = draft ?? map.cells;
  const alive = characters.filter((c) => !c.dead);
  const unplaced = alive.filter((c) => !map.tokens.some((t) => t.characterId === c.id));
  const chosenCrew = alive.find((k) => k.id === tokenChar) ?? unplaced[0] ?? alive[0];
  const selToken = selected?.type === "token" ? map.tokens.find((t) => t.id === selected.id) : undefined;
  const selLabel = selected?.type === "label" ? map.labels.find((l) => l.id === selected.id) : undefined;

  const tokenName = (t: MapToken) => (t.characterId ? (characters.find((c) => c.id === t.characterId)?.name ?? t.label) : t.label);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || (e.key !== "Delete" && e.key !== "Backspace")) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      update(selected.type === "token" ? "Remove token" : "Remove label", (m) => {
        if (selected.type === "token") m.tokens = m.tokens.filter((t) => t.id !== selected.id);
        else m.labels = m.labels.filter((l) => l.id !== selected.id);
      });
      setSelected(null);
    };
    const el = scrollRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoom + (e.deltaY < 0 ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("wheel", onWheel);
    };
  });

  function cellAt(e: React.PointerEvent): [number, number] {
    const r = svgRef.current!.getBoundingClientRect();
    const x = Math.min(map.width - 1, Math.max(0, Math.floor((e.clientX - r.left) / s)));
    const y = Math.min(map.height - 1, Math.max(0, Math.floor((e.clientY - r.top) / s)));
    return [x, y];
  }

  function hit(x: number, y: number): Sel {
    const t = [...map.tokens].reverse().find((k) => k.x === x && k.y === y);
    if (t) return { type: "token", id: t.id };
    const l = [...map.labels].reverse().find((k) => k.y === y && x >= k.x && x < k.x + Math.max(1, Math.ceil(k.text.length * 0.55)));
    return l ? { type: "label", id: l.id } : null;
  }

  function startPan(e: React.PointerEvent) {
    const el = scrollRef.current!;
    ix.current = { mode: "pan", cx: e.clientX, cy: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  }

  function paintAlong(from: [number, number], to: [number, number], value: Terrain | null) {
    const d = draftRef.current!;
    for (const [x, y] of lineCells(from[0], from[1], to[0], to[1])) {
      if (value) d[cellKey(x, y)] = value;
      else delete d[cellKey(x, y)];
    }
    setDraft({ ...d });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button === 1 || e.button === 2) return startPan(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = cellAt(e);
    switch (tool) {
      case "pan":
        return startPan(e);
      case "select": {
        const h = hit(x, y);
        setSelected(h);
        if (h) {
          ix.current = { mode: "move", sel: h, moved: false };
          setMovePos({ x, y });
        } else startPan(e);
        return;
      }
      case "brush":
      case "erase": {
        const value = tool === "brush" ? terrain : null;
        draftRef.current = { ...map.cells };
        ix.current = { mode: "paint", last: [x, y], value };
        paintAlong([x, y], [x, y], value);
        return;
      }
      case "rect":
      case "room":
        ix.current = { mode: "rect", x0: x, y0: y };
        setRect({ x0: x, y0: y, x1: x, y1: y });
        return;
      case "label": {
        const id = uid();
        update("Add map label", (m) => void m.labels.push({ id, x, y, text: "New label" }));
        setSelected({ type: "label", id });
        setTool("select");
        return;
      }
      case "token": {
        const id = uid();
        const c = tokenKind === "crew" ? chosenCrew : undefined;
        if (tokenKind === "crew" && !c) return;
        const existing = c && map.tokens.find((t) => t.characterId === c.id);
        if (existing) {
          update(`Move ${c.name}`, (m) => {
            const t = m.tokens.find((k) => k.id === existing.id)!;
            t.x = x;
            t.y = y;
          });
          setSelected({ type: "token", id: existing.id });
          return;
        }
        const count = map.tokens.filter((t) => t.kind === tokenKind).length + 1;
        const label = c ? c.name : tokenKind === "enemy" ? `Hostile ${count}` : `Contact ${count}`;
        update("Place token", (m) => void m.tokens.push({ id, x, y, kind: tokenKind, characterId: c?.id, label }));
        setSelected({ type: "token", id });
        setTokenChar("");
        return;
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const cur = ix.current;
    if (!cur) return;
    if (cur.mode === "pan") {
      const el = scrollRef.current!;
      el.scrollLeft = cur.sl - (e.clientX - cur.cx);
      el.scrollTop = cur.st - (e.clientY - cur.cy);
      return;
    }
    const [x, y] = cellAt(e);
    if (cur.mode === "paint") {
      if (x === cur.last[0] && y === cur.last[1]) return;
      paintAlong(cur.last, [x, y], cur.value);
      cur.last = [x, y];
    } else if (cur.mode === "rect") setRect({ x0: cur.x0, y0: cur.y0, x1: x, y1: y });
    else if (cur.mode === "move") {
      if (!movePos || movePos.x !== x || movePos.y !== y) {
        cur.moved = true;
        setMovePos({ x, y });
      }
    }
  }

  function onPointerUp() {
    const cur = ix.current;
    ix.current = null;
    if (!cur) return;
    if (cur.mode === "paint" && draftRef.current) {
      const next = draftRef.current;
      update(cur.value ? `Paint ${TERRAIN_BY_KEY[cur.value].name.toLowerCase()}` : "Erase", (m) => void (m.cells = next));
      draftRef.current = null;
      setDraft(null);
    } else if (cur.mode === "rect" && rect) {
      const mode = tool === "room" ? "room" : tool === "rect" ? terrain : null;
      update(tool === "room" ? "Draw room" : "Fill area", (m) => void (m.cells = roomCells(m.cells, rect.x0, rect.y0, rect.x1, rect.y1, mode)));
      setRect(null);
    } else if (cur.mode === "move" && cur.moved && movePos) {
      const { x, y } = movePos;
      update(cur.sel.type === "token" ? "Move token" : "Move label", (m) => {
        const item = cur.sel.type === "token" ? m.tokens.find((t) => t.id === cur.sel.id) : m.labels.find((l) => l.id === cur.sel.id);
        if (item) {
          item.x = x;
          item.y = y;
        }
      });
    }
    setMovePos(null);
  }

  function placeCrew() {
    const el = scrollRef.current!;
    const cx = Math.floor((el.scrollLeft + el.clientWidth / 2) / s);
    const cy = Math.floor((el.scrollTop + el.clientHeight / 2) / s);
    update("Place crew", (m) => {
      unplaced.forEach((c, i) => {
        m.tokens.push({ id: uid(), x: Math.min(m.width - 1, cx + (i % 3)), y: Math.min(m.height - 1, cy + Math.floor(i / 3)), kind: "crew", characterId: c.id, label: c.name });
      });
    });
  }

  function zoomTo(next: number) {
    const el = scrollRef.current;
    const z = Math.max(0, Math.min(ZOOMS.length - 1, next));
    if (!el || z === zoom) return;
    const ratio = ZOOMS[z] / s;
    const midX = el.scrollLeft + el.clientWidth / 2;
    const midY = el.scrollTop + el.clientHeight / 2;
    setZoom(z);
    requestAnimationFrame(() => {
      el.scrollLeft = midX * ratio - el.clientWidth / 2;
      el.scrollTop = midY * ratio - el.clientHeight / 2;
    });
  }

  const pos = (kind: "token" | "label", id: string, x: number, y: number) =>
    movePos && ix.current?.mode === "move" && ix.current.sel.type === kind && ix.current.sel.id === id ? movePos : { x, y };
  const toolInfo = TOOLS.find((t) => t.key === tool)!;
  const showTerrain = tool === "brush" || tool === "rect";
  const painted = Object.keys(map.cells).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid min-w-0 content-start gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5">
          {TOOLS.map((t) => (
            <Button key={t.key} size="sm" variant={tool === t.key ? "default" : "ghost"} title={t.hint} aria-pressed={tool === t.key} onClick={() => setTool(t.key)}>
              <t.icon /> <span className="hidden md:inline">{t.name}</span>
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Zoom out" disabled={zoom === 0} onClick={() => zoomTo(zoom - 1)}><MinusIcon /></Button>
            <span className="tabular w-10 text-center text-xs text-muted-foreground">{Math.round((s / 24) * 100)}%</span>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => zoomTo(zoom + 1)}><PlusIcon /></Button>
          </div>
        </div>

        {showTerrain && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Terrain">
            {TERRAIN.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={terrain === t.key}
                title={t.hint}
                onClick={() => setTerrain(t.key)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors", terrain === t.key ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/40")}
              >
                <span className="size-3 rounded-sm" style={{ background: t.fill }} /> {t.name}
              </button>
            ))}
          </div>
        )}

        {tool === "token" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {TOKEN_KINDS.map((k) => (
              <button key={k.key} onClick={() => setTokenKind(k.key)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-colors", tokenKind === k.key ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/40")}>
                <span className="size-3 rounded-full" style={{ background: k.color }} /> {k.name}
              </button>
            ))}
            {tokenKind === "crew" && alive.length > 0 && (
              <Select value={chosenCrew?.id ?? ""} onValueChange={(v) => setTokenChar(v as string)}>
                <SelectTrigger size="sm" className="w-48"><SelectValue>{chosenCrew?.name ?? "Choose survivor"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {alive.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{map.tokens.some((t) => t.characterId === c.id) ? " (move)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {tokenKind === "crew" && alive.length === 0 && <span className="text-muted-foreground">No survivors yet. Add them on the Crew tab.</span>}
          </div>
        )}

        <div
          ref={scrollRef}
          className="relative h-[62vh] min-h-80 overflow-auto rounded-xl border bg-[#060a11] shadow-inner"
        >
          <svg
            ref={svgRef}
            width={map.width * s}
            height={map.height * s}
            className={cn("block touch-none select-none", tool === "pan" ? "cursor-grab" : tool === "select" ? "cursor-default" : "cursor-crosshair")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            role="application"
            aria-label={`${map.name} grid, ${map.width} by ${map.height}`}
          >
            <defs>
              <pattern id="grid-minor" width={s} height={s} patternUnits="userSpaceOnUse">
                <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
              </pattern>
              <pattern id="grid-major" width={s * 5} height={s * 5} patternUnits="userSpaceOnUse">
                <rect width={s * 5} height={s * 5} fill="url(#grid-minor)" />
                <path d={`M ${s * 5} 0 L 0 0 0 ${s * 5}`} fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
              </pattern>
              <pattern id="hazard-stripes" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="rgba(225,29,72,0.35)" />
                <rect width="4" height="8" fill="rgba(244,63,94,0.75)" />
              </pattern>
            </defs>
            {Object.entries(cells).map(([k, t]) => {
              const [x, y] = k.split(",").map(Number);
              return <CellShape key={k} x={x} y={y} t={t} s={s} />;
            })}
            <rect width="100%" height="100%" fill="url(#grid-major)" pointerEvents="none" />
            {rect && (
              <rect
                x={Math.min(rect.x0, rect.x1) * s}
                y={Math.min(rect.y0, rect.y1) * s}
                width={(Math.abs(rect.x1 - rect.x0) + 1) * s}
                height={(Math.abs(rect.y1 - rect.y0) + 1) * s}
                fill={tool === "erase" ? "rgba(244,63,94,0.12)" : "rgba(245,158,11,0.12)"}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            )}
            {rect && (
              <text x={Math.max(rect.x0, rect.x1) * s + s + 4} y={Math.max(rect.y0, rect.y1) * s + s} fill="#fbbf24" fontSize="12" pointerEvents="none">
                {Math.abs(rect.x1 - rect.x0) + 1}×{Math.abs(rect.y1 - rect.y0) + 1}
              </text>
            )}
            {map.labels.map((l) => {
              const p = pos("label", l.id, l.x, l.y);
              const on = selected?.type === "label" && selected.id === l.id;
              return (
                <text
                  key={l.id}
                  x={p.x * s + 2}
                  y={p.y * s + s * 0.72}
                  fontSize={Math.max(11, s * 0.62)}
                  fontWeight={600}
                  fill={on ? "#fbbf24" : "#e2e8f0"}
                  stroke="#060a11"
                  strokeWidth={3}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {l.text}
                </text>
              );
            })}
            {map.tokens.map((t) => {
              const p = pos("token", t.id, t.x, t.y);
              const on = selected?.type === "token" && selected.id === t.id;
              const name = tokenName(t);
              const dead = t.characterId && characters.find((c) => c.id === t.characterId)?.dead;
              return (
                <g key={t.id} opacity={dead ? 0.4 : 1} pointerEvents="none">
                  {on && <circle cx={(p.x + 0.5) * s} cy={(p.y + 0.5) * s} r={s * 0.58} fill="none" stroke="#fde68a" strokeWidth={2} strokeDasharray="3 2" />}
                  <circle cx={(p.x + 0.5) * s} cy={(p.y + 0.5) * s} r={s * 0.42} fill={TOKEN_COLOR[t.kind]} stroke="#060a11" strokeWidth={1.5} />
                  {s >= 14 && (
                    <text x={(p.x + 0.5) * s} y={(p.y + 0.5) * s} fontSize={s * 0.36} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="#0b0f17">
                      {initials(name)}
                    </text>
                  )}
                  <title>{name}</title>
                  {(on || s >= 32) && (
                    <text x={(p.x + 0.5) * s} y={(p.y + 1) * s + 10} fontSize={11} textAnchor="middle" fill="#e2e8f0" stroke="#060a11" strokeWidth={3} paintOrder="stroke">
                      {name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {painted === 0 && map.labels.length === 0 && map.tokens.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit max-w-[90%] rounded-lg border bg-card/90 px-4 py-2.5 text-center text-sm text-muted-foreground shadow-lg">
              Uncharted. Pick <span className="text-foreground">Room</span> and drag to sketch the first compartment, then add doors with the Brush.
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{toolInfo.name}:</span> {toolInfo.hint} Ctrl + scroll zooms. Right-drag pans with any tool. Delete removes the selection.
        </p>
      </div>

      <aside className="grid content-start gap-5">
        {(selToken || selLabel) && (
          <div className="grid gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <SectionTitle
              action={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete selection"
                  onClick={() => {
                    update(selToken ? "Remove token" : "Remove label", (m) => {
                      if (selToken) m.tokens = m.tokens.filter((t) => t.id !== selToken.id);
                      else m.labels = m.labels.filter((l) => l.id !== selLabel!.id);
                    });
                    setSelected(null);
                  }}
                >
                  <Trash2Icon />
                </Button>
              }
            >
              {selToken ? "Token" : "Label"}
            </SectionTitle>
            {selLabel && (
              <CommitInput key={selLabel.id} autoFocus aria-label="Label text" value={selLabel.text} onCommit={(v) => update("Rename label", (m) => void (m.labels.find((l) => l.id === selLabel.id)!.text = v.trim() || "Label"))} />
            )}
            {selToken && (
              <>
                {selToken.characterId ? (
                  <p className="text-sm">{tokenName(selToken)}</p>
                ) : (
                  <CommitInput key={selToken.id} aria-label="Token name" value={selToken.label} onCommit={(v) => update("Rename token", (m) => void (m.tokens.find((t) => t.id === selToken.id)!.label = v.trim() || "Token"))} />
                )}
                <p className="text-xs text-muted-foreground">
                  {TOKEN_KINDS.find((k) => k.key === selToken.kind)?.name} · column {selToken.x + 1}, row {selToken.y + 1}
                </p>
              </>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <SectionTitle action={onOpenStarmap && <Button size="xs" variant="ghost" onClick={onOpenStarmap}><OrbitIcon /> System chart</Button>}>Map</SectionTitle>
          <div className="grid gap-1.5">
            <Label htmlFor="map-name" className="text-xs text-muted-foreground">Name</Label>
            <CommitInput id="map-name" value={map.name} onCommit={(v) => update("Rename map", (m) => void (m.name = v.trim() || m.name))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["width", "height"] as const).map((dim) => (
              <div key={dim} className="grid gap-1.5">
                <Label htmlFor={`map-${dim}`} className="text-xs text-muted-foreground capitalize">{dim}</Label>
                <CommitInput
                  id={`map-${dim}`}
                  type="number"
                  min={10}
                  max={200}
                  value={String(map[dim])}
                  onCommit={(v) =>
                    update("Resize map", (m) => {
                      m[dim] = Math.max(10, Math.min(200, Math.round(Number(v)) || m[dim]));
                      for (const k of Object.keys(m.cells)) {
                        const [x, y] = k.split(",").map(Number);
                        if (x >= m.width || y >= m.height) delete m.cells[k];
                      }
                      m.tokens = m.tokens.filter((t) => t.x < m.width && t.y < m.height);
                      m.labels = m.labels.filter((l) => l.x < m.width && l.y < m.height);
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <SectionTitle action={unplaced.length > 0 && <Button size="xs" variant="outline" onClick={placeCrew}><UsersIcon /> Place crew</Button>}>On this map</SectionTitle>
          {map.tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet. Use Place crew to drop everyone in the middle of the view.</p>
          ) : (
            <div className="grid gap-1">
              {map.tokens.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelected({ type: "token", id: t.id });
                    setTool("select");
                    const el = scrollRef.current;
                    if (el) el.scrollTo({ left: (t.x + 0.5) * s - el.clientWidth / 2, top: (t.y + 0.5) * s - el.clientHeight / 2, behavior: "smooth" });
                  }}
                  className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted/40", selected?.id === t.id && "bg-muted/50")}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: TOKEN_COLOR[t.kind] }} />
                  <span className="flex-1 truncate">{tokenName(t)}</span>
                  <MapPinIcon className="size-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <SectionTitle>Legend</SectionTitle>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {TERRAIN.map((t) => (
              <span key={t.key} className="flex items-center gap-1.5" title={t.hint}><span className="size-3 rounded-sm" style={{ background: t.fill }} />{t.name}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <SectionTitle>Notes</SectionTitle>
          <CommitInput multiline aria-label="Map notes" placeholder="Atmosphere, hazards, what's been searched…" value={map.notes} onCommit={(v) => update("Map notes", (m) => void (m.notes = v))} className="min-h-24" />
        </div>
      </aside>
    </div>
  );
}
