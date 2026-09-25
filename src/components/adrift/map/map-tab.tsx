"use client";

import { GridIcon, OrbitIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { coreMapId, newGridMap, newStarMap } from "@/lib/maps";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import type { GameMap } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common";
import { GridMapView } from "./grid-map";
import { StarMapView } from "./star-map";

export function MapTab() {
  const maps = useGame((s) => s.game.maps);
  const act = useGame((s) => s.act);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { isGM, myCharacterId } = usePerms();
  const active = maps.find((m) => m.id === activeId) ?? maps[0];
  const starmap = maps.find((m) => m.kind === "star");
  const parentStar = active?.kind === "grid" ? maps.find((m) => m.kind === "star" && m.nodes.some((n) => n.mapId === active.id)) : undefined;
  const canDelete = !!active && (isGM || (active.id !== coreMapId(maps) && !!myCharacterId && active.createdBy === myCharacterId));

  function create(kind: GameMap["kind"]) {
    const blank = kind === "grid" ? newGridMap(`Deck map ${maps.filter((x) => x.kind === "grid").length + 1}`) : newStarMap(`System chart ${maps.filter((x) => x.kind === "star").length + 1}`);
    const m: GameMap = { ...blank, ...(myCharacterId ? { createdBy: myCharacterId } : {}) };
    act(kind === "grid" ? "New deck map" : "New system chart", (g) => {
      g.maps.push(m);
      return `Created ${m.name}.`;
    });
    setActiveId(m.id);
  }

  const newMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline"><PlusIcon /> New map</Button>} />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => create("grid")}><GridIcon /> Deck map (grid)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => create("star")}><OrbitIcon /> System chart (tiles)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!active)
    return <EmptyState title="No maps yet" body="Chart the system tile by tile, or sketch a derelict's decks on a grid." action={newMenu} />;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => setActiveId(m.id)}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors", m.id === active.id ? "border-primary/60 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/40")}
            >
              {m.kind === "star" ? <OrbitIcon className="size-3.5" /> : <GridIcon className="size-3.5" />}
              {m.name}
            </button>
          ))}
        </div>
        {newMenu}
        {canDelete && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${active.name}`} onClick={() => setConfirmDelete(true)}><Trash2Icon /></Button>}
      </div>

      {active.kind === "star" ? (
        <StarMapView key={active.id} map={active} onOpenMap={setActiveId} />
      ) : (
        <GridMapView key={active.id} map={active} onOpenStarmap={parentStar || starmap ? () => setActiveId((parentStar ?? starmap)!.id) : undefined} />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {active.name}?</AlertDialogTitle>
            <AlertDialogDescription>Everything drawn on this map is removed. Undo can bring it back during this session.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = active.id;
                act("Delete map", (g) => {
                  g.maps = g.maps.filter((m) => m.id !== id);
                  for (const m of g.maps) if (m.kind === "star") for (const n of m.nodes) if (n.mapId === id) delete n.mapId;
                  return `Deleted ${active.name}.`;
                });
                setActiveId(null);
              }}
            >
              Delete map
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
