"use client";

import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EllipsisVerticalIcon, PencilIcon, RotateCcwIcon, SparklesIcon, Undo2Icon, UploadIcon } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { advanceSegment, completeAct, previousSegment } from "@/lib/mechanics";
import { SEGMENTS } from "@/lib/rules";
import { createInitialState } from "@/lib/seed";
import { useGame } from "@/lib/store";
import { leaveCampaign } from "@/lib/sync/client";
import type { GameState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionsTab } from "./actions";
import { ApplyConditionDialog } from "./conditions";
import { CrewTab } from "./crew";
import { usePerms } from "@/lib/use-perms";
import { EndOfDayDialog } from "./end-of-day";
import { LogTab } from "./log";
import { PlayTogether } from "./multiplayer";
import { MapTab } from "./map/map-tab";
import { MechsTab } from "./mechs";
import { OverviewTab } from "./overview";
import { ShipTab } from "./ship";
import { StorageTab } from "./storage";

function Header() {
  const { game, act, undo, past, replace, session } = useGame();
  const { isGM } = usePerms();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [shipName, setShipName] = useState("");

  function rename() {
    const name = shipName.trim();
    if (name && name !== game.ship.name) act("Rename ship", (g) => { const old = g.ship.name; g.ship.name = name; return `${old} is renamed ${name}.`; });
    setRenaming(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(game, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adrift-day${game.day}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Campaign exported");
  }

  async function importJson(file: File) {
    try {
      const data = JSON.parse(await file.text()) as GameState;
      if (data.version !== 1 || !Array.isArray(data.characters) || !data.ship) throw new Error("Not an Adrift Companion save file.");
      replace(data, "Import");
      toast.success(`Loaded day ${data.day} with ${data.characters.length} survivors`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <SparklesIcon className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.2em] uppercase">Adrift</p>
            <p className="text-[11px] text-muted-foreground">Act {game.act} · {game.ship.name}</p>
          </div>
        </div>

        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto sm:flex-1 sm:justify-center">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
            <span className="text-sm font-semibold">Day {game.day}</span>
            <div className="flex gap-1" aria-label={`Segment: ${SEGMENTS[game.segment]}`}>
              {SEGMENTS.map((s, i) => (
                <span key={s} title={s} className={cn("h-1.5 w-5 rounded-full", i < game.segment ? "bg-primary/40" : i === game.segment ? "bg-primary" : "bg-muted")} />
              ))}
            </div>
            <span className="text-sm text-primary">{SEGMENTS[game.segment]}</span>
          </div>
          {isGM && game.segment > 0 && (
            <Button size="sm" variant="ghost" aria-label="Previous segment" title={`Back to ${SEGMENTS[game.segment - 1]}`} onClick={() => act("Previous segment", (g) => previousSegment(g), "day")}>
              <ChevronLeftIcon />
            </Button>
          )}
          {isGM && game.segment < 3 && (
            <Button size="sm" variant="outline" onClick={() => act("Next segment", (g) => advanceSegment(g), "day")}>
              Next <ChevronRightIcon />
            </Button>
          )}
          {isGM && <EndOfDayDialog />}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <PlayTogether />
          <ApplyConditionDialog trigger={<Button size="sm"><ActivityIcon /> <span className="hidden sm:inline">Condition</span></Button>} />
          <Button size="sm" variant="ghost" disabled={past.length === 0} onClick={() => { const label = past[0]?.label; undo(); toast(`Undid: ${label}`); }} title={past[0] ? `Undo: ${past[0].label}` : "Nothing to undo"}>
            <Undo2Icon /> <span className="hidden sm:inline">Undo</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Campaign menu"><EllipsisVerticalIcon /></Button>} />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={exportJson}><DownloadIcon /> Export campaign</DropdownMenuItem>
              {isGM && (
                <>
                  <DropdownMenuItem onClick={() => fileRef.current?.click()}><UploadIcon /> Import campaign</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setShipName(game.ship.name); setRenaming(true); }}><PencilIcon /> Rename ship</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { act("Complete Act", (g) => completeAct(g), "day"); toast.success("Act complete — Willpower restored"); }}><SparklesIcon /> Complete Act</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmReset(true)}><RotateCcwIcon /> New campaign</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        </div>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename the ship</DialogTitle>
            <DialogDescription>The new name shows for everyone in the campaign and is noted in the log.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); rename(); }}>
            <Input id="ship-name" aria-label="Ship name" value={shipName} maxLength={60} autoFocus onChange={(e) => setShipName(e.target.value)} />
            <DialogFooter>
              <Button type="submit" disabled={!shipName.trim()}>Rename</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {session
                ? `You'll leave the shared campaign ${session.code} and start a fresh one on this device. The shared campaign isn't touched: your players keep playing it, and you can rejoin it from Play together.`
                : "This clears the crew, ship, storage, maps, and log. Export first if you want to keep this one. Undo can still bring it back."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const shared = session?.code;
                if (shared) leaveCampaign();
                replace(createInitialState(), "New campaign");
                toast(shared ? `A new campaign begins. ${shared} is still in Play together.` : "A new campaign begins");
              }}
            >
              Start fresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "actions", label: "Actions" },
  { value: "crew", label: "Crew" },
  { value: "ship", label: "Ship" },
  { value: "mechs", label: "Mechs" },
  { value: "storage", label: "Storage" },
  { value: "map", label: "Map" },
  { value: "log", label: "Log" },
];

const subscribeNoop = () => () => {};

export function AdriftApp() {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState<string | null>(null);

  if (!mounted)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm tracking-[0.3em] text-muted-foreground uppercase">
        Restoring ship systems…
      </div>
    );

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <TabsList className="h-9!">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview" className="pt-3"><OverviewTab onOpenCharacter={(id) => { setSelected(id); setTab("crew"); }} onGo={setTab} /></TabsContent>
          <TabsContent value="actions" className="pt-3"><ActionsTab /></TabsContent>
          <TabsContent value="crew" className="pt-3"><CrewTab selectedId={selected} onSelect={setSelected} /></TabsContent>
          <TabsContent value="ship" className="pt-3"><ShipTab /></TabsContent>
          <TabsContent value="mechs" className="pt-3"><MechsTab /></TabsContent>
          <TabsContent value="storage" className="pt-3"><StorageTab /></TabsContent>
          <TabsContent value="map" className="pt-3"><MapTab /></TabsContent>
          <TabsContent value="log" className="pt-3"><LogTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
