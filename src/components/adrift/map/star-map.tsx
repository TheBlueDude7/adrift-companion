"use client";

import {
  Building2Icon,
  CircleHelpIcon,
  EraserIcon,
  FocusIcon,
  BatteryIcon,
  GlobeIcon,
  GridIcon,
  MinusIcon,
  MousePointer2Icon,
  NavigationIcon,
  PaintbrushIcon,
  PlusIcon,
  RadioTowerIcon,
  SatelliteIcon,
  SparklesIcon,
  SunIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uid } from "@/lib/dice";
import { NODE_STATUSES, NODE_TYPES, SPACE_TILES, SPACE_TILE_BY_KEY, STAR_SIZES, STATUS_COLOR, cellKey, lineCells, newGridMap, resizeStarMap, tileDistance, tileLabel } from "@/lib/maps";
import { newAction } from "@/lib/actions";
import { moveShip as moveShipOnMap, planMove, type MovePlan } from "@/lib/power";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import type { GameState, SpaceTile, StarMap, StarNode, StarNodeStatus, StarNodeType, TilePos } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CommitInput } from "../commit-input";
import { Pill, SectionTitle } from "../common";

type Tool = "select" | "scan" | "unscan" | "contact";
type View = { x: number; y: number; w: number; h: number };
type Stroke = Record<string, SpaceTile | null>;

/** World units per tile. */
const T = 40;
const START = { w: 1000, h: 700 };

const NODE_ICON: Record<StarNodeType, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  derelict: SatelliteIcon,
  station: Building2Icon,
  planet: GlobeIcon,
  anomaly: SparklesIcon,
  hazard: TriangleAlertIcon,
  beacon: RadioTowerIcon,
  unknown: CircleHelpIcon,
};

const TOOLS: { key: Tool; name: string; icon: React.ComponentType; hint: string }[] = [
  { key: "select", name: "Select", icon: MousePointer2Icon, hint: "Click a tile to inspect it. Drag to pan, or drag a contact to another tile." },
  { key: "scan", name: "Scan", icon: PaintbrushIcon, hint: "Click or drag across tiles to record what a scan found." },
  { key: "unscan", name: "Unscan", icon: EraserIcon, hint: "Click or drag to mark tiles as unscanned again." },
  { key: "contact", name: "Contact", icon: PlusIcon, hint: "Click a tile to chart a derelict, station, signal, or anything else there." },
];

const same = (a: TilePos | null | undefined, b: TilePos | null | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;
const mod = (n: number, m: number) => ((n % m) + m) % m;

function useStarUpdate(mapId: string) {
  const act = useGame((s) => s.act);
  return (label: string, fn: (m: StarMap, g: GameState) => string | void, kind?: "info" | "day") =>
    act(
      label,
      (g) => {
        const m = g.maps.find((x) => x.id === mapId);
        if (!m || m.kind !== "star") return "";
        return fn(m, g) ?? "";
      },
      kind,
    );
}

export function StarMapView({ map, onOpenMap }: { map: StarMap; onOpenMap: (id: string) => void }) {
  const shipName = useGame((s) => s.game.ship.name);
  const maps = useGame((s) => s.game.maps);
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const update = useStarUpdate(map.id);
  const { isGM, myCharacterId } = usePerms();
  const W = map.size * T;

  const [tool, setTool] = useState<Tool>("select");
  const [brush, setBrush] = useState<SpaceTile>("clear");
  const [view, setView] = useState<View>(() => {
    const at = map.shipAt ?? map.star;
    return { x: (at.x + 0.5) * T - START.w / 2, y: (at.y + 0.5) * T - START.h / 2, ...START };
  });
  const [selected, setSelected] = useState<TilePos | null>(map.shipAt);
  const [hover, setHover] = useState<TilePos | null>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const [dragNode, setDragNode] = useState<{ id: string; to: TilePos } | null>(null);
  const ix = useRef<
    | { mode: "pan"; px: number; py: number; view: View; moved: boolean; tile: TilePos | null }
    | { mode: "paint"; last: TilePos; stroke: Stroke }
    | { mode: "node"; id: string; from: TilePos; moved: boolean }
    | null
  >(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const nodeAt = (p: TilePos | null) => (p ? map.nodes.find((n) => n.x === p.x && n.y === p.y) : undefined);
  const selNode = nodeAt(selected);
  const tilesAcross = view.w / T;
  const glyph = Math.min(4, Math.max(1, view.w / START.w));

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      setView((v) => zoomAround(v, p, e.deltaY < 0 ? 0.85 : 1 / 0.85));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function toWorld(cx: number, cy: number) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const m = svg.getScreenCTM();
    const w = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: w.x, y: w.y };
  }

  function tileAt(cx: number, cy: number): TilePos | null {
    const w = toWorld(cx, cy);
    const x = Math.floor(w.x / T);
    const y = Math.floor(w.y / T);
    return x >= 0 && y >= 0 && x < map.size && y < map.size ? { x, y } : null;
  }

  function zoomAround(v: View, p: { x: number; y: number }, f: number): View {
    const w = Math.min(W * 1.6, Math.max(T * 8, v.w * f));
    const k = w / v.w;
    return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w, h: v.h * k };
  }

  function centerOn(p: TilePos) {
    setView((v) => ({ ...v, x: (p.x + 0.5) * T - v.w / 2, y: (p.y + 0.5) * T - v.h / 2 }));
  }

  function fitAll() {
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.max(W / r.width, W / r.height) * 1.04;
    setView({ x: W / 2 - (r.width * s) / 2, y: W / 2 - (r.height * s) / 2, w: r.width * s, h: r.height * s });
  }

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = tileAt(e.clientX, e.clientY);
    const panning = e.button !== 0 || tool === "select";
    if (!panning && p && (tool === "scan" || tool === "unscan")) {
      const s = { [cellKey(p.x, p.y)]: tool === "scan" ? brush : null };
      ix.current = { mode: "paint", last: p, stroke: s };
      setStroke(s);
      return;
    }
    if (!panning && p && tool === "contact") {
      if (!nodeAt(p) && !same(p, map.star)) {
        const n: StarNode = { id: uid(), ...p, name: `Contact ${map.nodes.length + 1}`, type: "unknown", status: "unexplored", notes: "" };
        update("Chart contact", (m) => void m.nodes.push(n));
      }
      setSelected(p);
      setTool("select");
      return;
    }
    const n = e.button === 0 && tool === "select" ? nodeAt(p) : undefined;
    if (n && p) {
      ix.current = { mode: "node", id: n.id, from: p, moved: false };
      return;
    }
    ix.current = { mode: "pan", px: e.clientX, py: e.clientY, view, moved: false, tile: p };
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const cur = ix.current;
    if (!cur) {
      const p = tileAt(e.clientX, e.clientY);
      if (!same(p, hover) && (p || hover)) setHover(p);
      return;
    }
    if (cur.mode === "pan") {
      if (Math.abs(e.clientX - cur.px) + Math.abs(e.clientY - cur.py) > 4) cur.moved = true;
      const r = svgRef.current!.getBoundingClientRect();
      const scale = Math.min(cur.view.w / r.width, cur.view.h / r.height);
      setView({ ...cur.view, x: cur.view.x - (e.clientX - cur.px) * scale, y: cur.view.y - (e.clientY - cur.py) * scale });
      return;
    }
    const p = tileAt(e.clientX, e.clientY);
    if (!p) return;
    if (cur.mode === "paint") {
      if (same(p, cur.last)) return;
      const value = tool === "scan" ? brush : null;
      for (const [x, y] of lineCells(cur.last.x, cur.last.y, p.x, p.y)) cur.stroke[cellKey(x, y)] = value;
      cur.last = p;
      setStroke({ ...cur.stroke });
    } else {
      cur.moved = cur.moved || !same(p, cur.from);
      setDragNode({ id: cur.id, to: p });
    }
  }

  function onUp() {
    const cur = ix.current;
    ix.current = null;
    if (cur?.mode === "pan" && !cur.moved) setSelected(cur.tile);
    if (cur?.mode === "paint") {
      const s = cur.stroke;
      const n = Object.keys(s).length;
      update(tool === "scan" ? "Record scan" : "Clear scan", (m) => {
        for (const [k, v] of Object.entries(s)) {
          if (v) m.tiles[k] = v;
          else delete m.tiles[k];
        }
        return v0(s) ? `Scanned ${n} tile${n === 1 ? "" : "s"}: ${SPACE_TILE_BY_KEY[v0(s)!].name}.` : "";
      });
      setStroke(null);
    }
    if (cur?.mode === "node") {
      const to = dragNode?.to;
      if (cur.moved && to && !nodeAt(to)) {
        update("Move contact", (m) => {
          const n = m.nodes.find((k) => k.id === cur.id);
          if (n) Object.assign(n, to);
        });
        setSelected(to);
      } else setSelected(cur.from);
      setDragNode(null);
    }
  }

  function editNode(label: string, fn: (n: StarNode) => void) {
    if (!selNode) return;
    const id = selNode.id;
    update(label, (m) => {
      const n = m.nodes.find((k) => k.id === id);
      if (n) fn(n);
    });
  }

  function planCourse(to: TilePos) {
    act("Plan a course", (g) => {
      const c = g.characters.find((x) => x.id === myCharacterId);
      if (!c) return undefined;
      const unsafe = !map.tiles[cellKey(to.x, to.y)] || map.tiles[cellKey(to.x, to.y)] !== "clear";
      const task = unsafe ? "Plot Unsafe Course" : "Plot Safe Course";
      const target = { mapId: map.id, x: to.x, y: to.y };
      const existing = g.actions.find((a) => a.characterId === c.id && a.day === g.day && a.segment === g.segment && a.status === "planned" && (a.task === "Plot Safe Course" || a.task === "Plot Unsafe Course"));
      if (existing) Object.assign(existing, { task, target });
      else g.actions.push({ ...newAction(g, c, task), target });
      return `${c.name} plans to ${task.toLowerCase()} to ${nodeAt(to)?.name ?? tileLabel(map, to)}.`;
    });
    toast.success("Course added to your tasks for this segment");
  }

  function moveShip(to: TilePos, spend: boolean) {
    act("Move ship", (g) => moveShipOnMap(g, map.id, to, spend) ?? undefined, "day");
  }

  function deckMap(n: StarNode) {
    if (n.mapId && maps.some((m) => m.id === n.mapId)) return onOpenMap(n.mapId);
    const grid = newGridMap(n.name);
    update("Chart derelict", (m, g) => {
      g.maps.push(grid);
      m.nodes.find((k) => k.id === n.id)!.mapId = grid.id;
      return `Started a deck map for ${n.name}.`;
    });
    onOpenMap(grid.id);
  }

  const lines = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let i = 0; i <= map.size; i++) {
      const major = mod(i - map.star.x - 5, 10) === 0;
      const majorY = mod(i - map.star.y - 5, 10) === 0;
      out.push(<line key={`v${i}`} x1={i * T} y1={0} x2={i * T} y2={map.size * T} stroke={major ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.13)"} vectorEffect="non-scaling-stroke" />);
      out.push(<line key={`h${i}`} x1={0} y1={i * T} x2={map.size * T} y2={i * T} stroke={majorY ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.13)"} vectorEffect="non-scaling-stroke" />);
    }
    return out;
  }, [map.size, map.star.x, map.star.y]);

  const tiles = useMemo(() => {
    const all: Record<string, SpaceTile | null> = { ...map.tiles, ...stroke };
    return Object.entries(all).map(([k, t]) => {
      if (!t) return null;
      const [x, y] = k.split(",").map(Number);
      return <rect key={k} x={x * T + 1} y={y * T + 1} width={T - 2} height={T - 2} rx={3} fill={SPACE_TILE_BY_KEY[t].color} fillOpacity={t === "clear" ? 0.28 : 0.42} />;
    });
  }, [map.tiles, stroke]);

  const toolInfo = TOOLS.find((t) => t.key === tool)!;
  const zoomPct = Math.round((START.w / view.w) * 100);
  const sc = map.star;
  const starCx = (sc.x + 0.5) * T;
  const starCy = (sc.y + 0.5) * T;
  const hoverTile = hover ? map.tiles[cellKey(hover.x, hover.y)] : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="grid min-w-0 content-start gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border bg-card p-1.5">
          {TOOLS.map((t) => (
            <Button key={t.key} size="sm" variant={tool === t.key ? "default" : "ghost"} title={t.hint} aria-pressed={tool === t.key} onClick={() => setTool(t.key)}>
              <t.icon /> <span className="hidden sm:inline">{t.name}</span>
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {map.shipAt && <Button size="sm" variant="ghost" onClick={() => centerOn(map.shipAt!)} title="Center on the ship"><NavigationIcon /> <span className="hidden md:inline">Ship</span></Button>}
            <Button size="icon-sm" variant="ghost" aria-label="Center on the neutron star" title="Center on the neutron star" onClick={() => centerOn(map.star)}><SunIcon /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Show the whole system" title="Show the whole system" onClick={fitAll}><FocusIcon /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => setView((v) => zoomAround(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, 1.25))}><MinusIcon /></Button>
            <span className="tabular w-11 text-center text-xs text-muted-foreground">{zoomPct}%</span>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => setView((v) => zoomAround(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, 0.8))}><PlusIcon /></Button>
          </div>
        </div>

        {tool === "scan" && (
          <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5" role="radiogroup" aria-label="Scan result">
            {SPACE_TILES.map((t) => (
              <button
                key={t.key}
                role="radio"
                aria-checked={brush === t.key}
                title={t.hint}
                onClick={() => setBrush(t.key)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors", brush === t.key ? "border-primary/60 bg-primary/10 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/40")}
              >
                <span className="size-3 rounded-sm" style={{ background: t.color }} /> {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="relative h-[64vh] min-h-80 overflow-hidden rounded-xl border bg-[#010207]">
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid slice"
            className={cn("absolute inset-0 size-full touch-none select-none", tool === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair")}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
            role="application"
            aria-label={`${map.name}: ${map.size} by ${map.size} tiles`}
          >
            <defs>
              <radialGradient id={`light-${map.id}`}>
                <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.55" />
                <stop offset="6%" stopColor="#bae6fd" stopOpacity="0.32" />
                <stop offset="30%" stopColor="#38bdf8" stopOpacity="0.1" />
                <stop offset="65%" stopColor="#1e3a8a" stopOpacity="0.04" />
                <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={`core-${map.id}`}>
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#e0f2fe" />
                <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x={-W} y={-W} width={W * 3} height={W * 3} fill="#010207" />
            <rect x={0} y={0} width={W} height={W} fill="#04060d" />
            <circle cx={starCx} cy={starCy} r={T * 36} fill={`url(#light-${map.id})`}>
              <animate attributeName="opacity" values="1;0.78;0.95;0.7;1;0.88;1" keyTimes="0;0.12;0.2;0.46;0.6;0.83;1" dur="6.5s" repeatCount="indefinite" />
            </circle>
            {tiles}
            <g opacity={tilesAcross > 80 ? 0.45 : 1}>{lines}</g>
            <rect x={0} y={0} width={W} height={W} fill="none" stroke="rgba(148,163,184,0.35)" vectorEffect="non-scaling-stroke" />

            {map.shipAt && (
              <rect x={(map.shipAt.x - 1) * T} y={(map.shipAt.y - 1) * T} width={T * 3} height={T * 3} fill="rgba(245,158,11,0.05)" stroke="rgba(245,158,11,0.5)" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            )}

            <g transform={`translate(${starCx} ${starCy})`} aria-label="Neutron star">
              <circle r={T * 0.9} fill={`url(#core-${map.id})`}>
                <animate attributeName="r" values={`${T * 0.85};${T * 1.05};${T * 0.8};${T * 0.95};${T * 0.85}`} keyTimes="0;0.2;0.45;0.7;1" dur="3.7s" repeatCount="indefinite" />
              </circle>
              <circle r={T * 0.22} fill="#ffffff" />
              {tilesAcross < 90 && (
                <text y={T * 1.1 + 12 * glyph} textAnchor="middle" fontSize={12 * glyph} fontWeight={600} letterSpacing={1.5} fill="#e0f2fe" stroke="#04060d" strokeWidth={4 * glyph} paintOrder="stroke">
                  NEUTRON STAR
                </text>
              )}
            </g>

            {map.nodes.map((n) => {
              const at = dragNode?.id === n.id ? dragNode.to : n;
              const Icon = NODE_ICON[n.type];
              const on = same(at, selected);
              const r = 14 * glyph;
              return (
                <g key={n.id} transform={`translate(${(at.x + 0.5) * T} ${(at.y + 0.5) * T})`} className="cursor-pointer" aria-label={n.name}>
                  <circle r={r} fill="#0b1220" stroke={STATUS_COLOR[n.status]} strokeWidth={2 * glyph} strokeDasharray={n.status === "unexplored" ? `${4 * glyph} ${3 * glyph}` : undefined} />
                  <Icon x={-r * 0.62} y={-r * 0.62} width={r * 1.24} height={r * 1.24} color={n.status === "looted" ? "#64748b" : "#e2e8f0"} />
                  {n.mapId && <rect x={r * 0.55} y={-r * 1.05} width={r * 0.55} height={r * 0.55} rx={2} fill="#f59e0b" />}
                  {(on || tilesAcross < 60) && (
                    <text y={r + 13 * glyph} textAnchor="middle" fontSize={12 * glyph} fontWeight={600} fill={on ? "#fde68a" : "#e2e8f0"} stroke="#04060d" strokeWidth={4 * glyph} paintOrder="stroke">
                      {n.name}
                    </text>
                  )}
                </g>
              );
            })}

            {map.shipAt && (
              <g transform={`translate(${(map.shipAt.x + 0.5) * T} ${(map.shipAt.y + 0.5) * T})`} pointerEvents="none" aria-label={`${shipName} is here`}>
                <circle r={T * 0.7} fill="none" stroke="#f59e0b" strokeWidth={2} vectorEffect="non-scaling-stroke">
                  <animate attributeName="r" values={`${T * 0.6};${T * 0.95};${T * 0.6}`} dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.15;0.9" dur="2.4s" repeatCount="indefinite" />
                </circle>
                {!nodeAt(map.shipAt) && <NavigationIcon x={-9 * glyph} y={-9 * glyph} width={18 * glyph} height={18 * glyph} color="#fbbf24" fill="#fbbf24" />}
                {tilesAcross < 90 && (
                  <text y={-T * 0.75 - 4 * glyph} textAnchor="middle" fontSize={11 * glyph} fontWeight={700} letterSpacing={1.5} fill="#fbbf24" stroke="#04060d" strokeWidth={4 * glyph} paintOrder="stroke">
                    YOU ARE HERE
                  </text>
                )}
              </g>
            )}

            {hover && !same(hover, selected) && (
              <rect x={hover.x * T} y={hover.y * T} width={T} height={T} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.45)" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
            {selected && <rect x={selected.x * T} y={selected.y * T} width={T} height={T} fill="none" stroke="#fde68a" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] text-muted-foreground tabular">
            {hover ? (
              <>
                <span className="text-foreground">{tileLabel(map, hover)}</span> · {hoverTile ? SPACE_TILE_BY_KEY[hoverTile].name : "Unscanned"} · {tileDistance(hover, map.star)} from the star
              </>
            ) : (
              `${map.size} × ${map.size} tiles`
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{toolInfo.name}:</span> {toolInfo.hint} Scroll to zoom; right-drag pans with any tool. The dashed box around the ship is one move away.
        </p>
      </div>

      <aside className="grid content-start gap-5">
        {selected ? (
          <TilePanel
            map={map}
            at={selected}
            node={selNode}
            isGM={isGM}
            plan={selected ? planMove(game, map, selected) : null}
            shipName={shipName}
            deckMapExists={!!selNode?.mapId && maps.some((m) => m.id === selNode.mapId)}
            onScan={(t) => update(t ? "Record scan" : "Clear scan", (m) => {
              const k = cellKey(selected.x, selected.y);
              if (t) m.tiles[k] = t;
              else delete m.tiles[k];
              return t ? `Tile ${tileLabel(m, selected)} scanned: ${SPACE_TILE_BY_KEY[t].name}.` : "";
            })}
            onAddContact={() => update("Chart contact", (m) => void m.nodes.push({ id: uid(), ...selected, name: `Contact ${m.nodes.length + 1}`, type: "unknown", status: "unexplored", notes: "" }))}
            editNode={editNode}
            onDeleteNode={() => {
              const n = selNode!;
              update("Remove contact", (m) => {
                m.nodes = m.nodes.filter((k) => k.id !== n.id);
                return `${n.name} removed from the chart.`;
              });
            }}
            onDeckMap={() => selNode && deckMap(selNode)}
            onMoveShip={(spend) => moveShip(selected, spend)}
            onPlanCourse={myCharacterId && !isGM ? () => planCourse(selected) : undefined}
            onPlaceStar={() => update("Place neutron star", (m) => void (m.star = { ...selected }))}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Select a tile to record a scan, chart a contact, or move the ship.</p>
        )}

        <div className="grid gap-2">
          <SectionTitle>Contacts · {map.nodes.length}</SectionTitle>
          {map.nodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing charted yet. Use the Contact tool to mark derelicts, stations, and signals.</p>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto">
              {map.nodes.map((n) => {
                const Icon = NODE_ICON[n.type];
                return (
                  <button key={n.id} onClick={() => { setSelected({ x: n.x, y: n.y }); centerOn(n); }} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/40", same(n, selected) && "bg-muted/50")}>
                    <Icon className="size-3.5 shrink-0" style={{ color: STATUS_COLOR[n.status] }} />
                    <span className="flex-1 truncate">{n.name}</span>
                    {same(n, map.shipAt) ? <Pill tone="warn">Ship</Pill> : <span className="tabular text-[11px] text-muted-foreground">{tileLabel(map, n)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <SectionTitle>Legend</SectionTitle>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-slate-700 bg-[#04060d]" />Unscanned</span>
            {SPACE_TILES.map((t) => (
              <span key={t.key} className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: t.color }} />{t.name}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {NODE_STATUSES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5"><span className="size-3 rounded-full border-2" style={{ borderColor: s.color }} />{s.name}</span>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <SectionTitle>Chart</SectionTitle>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <CommitInput aria-label="Chart name" value={map.name} onCommit={(v) => update("Rename chart", (m) => void (m.name = v.trim() || m.name))} />
            <Select
              value={String(map.size)}
              disabled={!isGM}
              onValueChange={(v) => {
                const size = Number(v);
                if (size === map.size) return;
                const probe = structuredClone(map);
                if (!resizeStarMap(probe, size)) {
                  toast.error("Something charted would fall off the edge. Move it closer to the middle first.");
                  return;
                }
                update("Resize chart", (m) => {
                  resizeStarMap(m, size);
                  return `${m.name} is now ${size} × ${size} tiles.`;
                });
                setSelected(null);
                setView((cur) => ({ ...cur, x: cur.x + ((size - map.size) / 2) * T, y: cur.y + ((size - map.size) / 2) * T }));
              }}
            >
              <SelectTrigger size="sm" aria-label="Chart size"><SelectValue>{`${map.size} × ${map.size}`}</SelectValue></SelectTrigger>
              <SelectContent>{STAR_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} × {s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <CommitInput multiline aria-label="Chart notes" placeholder="Known routes, rumours, where the last signal came from…" value={map.notes} onCommit={(v) => update("Chart notes", (m) => void (m.notes = v))} className="min-h-16" />
        </div>
      </aside>
    </div>
  );
}

function v0(s: Stroke) {
  return Object.values(s)[0] ?? null;
}

function TilePanel({
  map,
  at,
  node,
  isGM,
  plan,
  shipName,
  deckMapExists,
  onScan,
  onAddContact,
  editNode,
  onDeleteNode,
  onDeckMap,
  onMoveShip,
  onPlanCourse,
  onPlaceStar,
}: {
  map: StarMap;
  at: TilePos;
  node: StarNode | undefined;
  isGM: boolean;
  plan: MovePlan | null;
  shipName: string;
  deckMapExists: boolean;
  onScan: (t: SpaceTile | null) => void;
  onAddContact: () => void;
  editNode: (label: string, fn: (n: StarNode) => void) => void;
  onDeleteNode: () => void;
  onDeckMap: () => void;
  onMoveShip: (spend: boolean) => void;
  onPlanCourse?: () => void;
  onPlaceStar: () => void;
}) {
  const tile = map.tiles[cellKey(at.x, at.y)];
  const isStar = same(at, map.star);
  const shipHere = same(at, map.shipAt);
  const fromStar = tileDistance(at, map.star);

  return (
    <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div>
        <SectionTitle>Tile {tileLabel(map, at)}</SectionTitle>
        <p className="-mt-1 text-xs text-muted-foreground">{isStar ? "The neutron star." : `${fromStar} tile${fromStar === 1 ? "" : "s"} from the neutron star.`}</p>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Scan result</Label>
        <Select value={tile ?? "none"} onValueChange={(v) => onScan((v as string) === "none" ? null : (v as SpaceTile))}>
          <SelectTrigger size="sm" className="w-full" aria-label="Scan result">
            <SelectValue>{tile ? SPACE_TILE_BY_KEY[tile].name : "Unscanned"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unscanned</SelectItem>
            {SPACE_TILES.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {node ? (
        <div className="grid gap-2 rounded-lg border bg-background/40 p-2.5">
          <div className="flex items-center gap-2">
            <CommitInput key={node.id} aria-label="Contact name" value={node.name} onCommit={(v) => editNode("Rename contact", (n) => void (n.name = v.trim() || n.name))} className="h-8" />
            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${node.name}`} onClick={onDeleteNode}><Trash2Icon /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={node.type} onValueChange={(v) => editNode("Contact type", (n) => void (n.type = v as StarNodeType))}>
              <SelectTrigger size="sm" className="w-full" aria-label="Contact type"><SelectValue>{NODE_TYPES.find((t) => t.key === node.type)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{NODE_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={node.status} onValueChange={(v) => editNode("Contact status", (n) => void (n.status = v as StarNodeStatus))}>
              <SelectTrigger size="sm" className="w-full" aria-label="Contact status"><SelectValue>{NODE_STATUSES.find((t) => t.key === node.status)?.name}</SelectValue></SelectTrigger>
              <SelectContent>{NODE_STATUSES.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <CommitInput key={`${node.id}-notes`} multiline aria-label="Contact notes" placeholder="Scans, signals, who or what is out there…" value={node.notes} onCommit={(v) => editNode("Contact notes", (n) => void (n.notes = v))} className="min-h-16" />
          <Button size="sm" variant="outline" onClick={onDeckMap}><GridIcon /> {deckMapExists ? "Open deck map" : "Start a deck map"}</Button>
        </div>
      ) : (
        !isStar && <Button size="sm" variant="outline" onClick={onAddContact}><PlusIcon /> Chart a contact here</Button>
      )}

      <div className="grid gap-1.5">
        {shipHere ? (
          <p className="flex items-center gap-1.5 text-xs text-primary"><NavigationIcon className="size-3.5" /> {shipName} is here.</p>
        ) : isStar ? null : isGM ? (
          <>
            {map.shipAt ? (
              <>
                <Button size="sm" disabled={!plan || !!plan.blocker} onClick={() => onMoveShip(true)}>
                  <NavigationIcon /> Move ship here <span className="flex items-center gap-0.5 opacity-80"><BatteryIcon className="size-3" />1</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onMoveShip(false)}>Move without spending a cell</Button>
                <p className={cn("text-[11px]", plan?.blocker ? "text-amber-300" : "text-muted-foreground")}>
                  {plan?.blocker ? `${plan.blocker}.` : plan?.cell ? `${plan.dist} tile${plan.dist === 1 ? "" : "s"}: burns a ${plan.cell.name}.` : null}
                </p>
              </>
            ) : (
              <Button size="sm" onClick={() => onMoveShip(false)}><NavigationIcon /> Place ship here</Button>
            )}
            {!tile && map.shipAt && <p className="text-[11px] text-amber-300">Unscanned: entering is Crisis work at −3d6.</p>}
            {tile && tile !== "clear" && map.shipAt && <p className="text-[11px] text-amber-300">{SPACE_TILE_BY_KEY[tile].name}: moving in is Skilled or Crisis work.</p>}
          </>
        ) : (
          <>
            {map.shipAt && onPlanCourse && <Button size="sm" onClick={onPlanCourse}><NavigationIcon /> Plan a course here</Button>}
            <p className={cn("text-[11px]", plan?.blocker ? "text-amber-300" : "text-muted-foreground")}>
              {plan?.blocker ? `${plan.blocker}. ` : ""}Piloting is a segment task: plan it, and the GM moves the ship when it resolves.
            </p>
          </>
        )}
        {!isStar && isGM && (
          <Button size="sm" variant="ghost" onClick={onPlaceStar}><SunIcon /> Put the neutron star here</Button>
        )}
      </div>
    </div>
  );
}
