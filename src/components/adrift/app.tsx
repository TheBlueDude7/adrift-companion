"use client";

import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, EllipsisVerticalIcon, FlagIcon, FootprintsIcon, PencilIcon, RotateCcwIcon, SparklesIcon, Undo2Icon, UploadIcon } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SITES, SITE_BY_ID } from "@/data/sites";
import { endExpedition, markExpeditionTurn, startExpedition, TURNS_PER_SEGMENT, type SiteOutcome } from "@/lib/expedition";
import { advanceSegment, completeAct, previousSegment } from "@/lib/mechanics";
import { SEGMENTS } from "@/lib/rules";
import { createInitialState } from "@/lib/seed";
import { useGame } from "@/lib/store";
import { leaveCampaign } from "@/lib/sync/client";
import type { GameState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ActionsTab } from "./actions";
import { CombatTab } from "./combat";
import { ApplyConditionDialog } from "./conditions";
import { CrewTab } from "./crew";
import { usePerms } from "@/lib/use-perms";
import { EndOfDayDialog } from "./end-of-day";
import { LogTab } from "./log";
import { PlayTogether } from "./multiplayer";
import { MapTab } from "./map/map-tab";
import { MechsTab } from "./mechs";
import { OverviewTab } from "./overview";
import { RulesTab } from "./rules";
import { ShipTab } from "./ship";
import { SiteTab } from "./site";
import { StorageTab } from "./storage";

function Header() {
  const { game, act, undo, past, replace, session } = useGame();
  const { isGM } = usePerms();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [shipName, setShipName] = useState("");
  const [ending, setEnding] = useState(false);
  const [panicked, setPanicked] = useState<string[]>([]);
  const [safe, setSafe] = useState(true);
  const [outcome, setOutcome] = useState<SiteOutcome>("active");
  // Held from when the dialog opened: clearing the expedition would otherwise swap the dialog's
  // contents out from under its own closing animation.
  const [leaving, setLeaving] = useState<{ site: string; crew: string[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [site, setSite] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [capacity, setCapacity] = useState("3");
  const [siteNotes, setSiteNotes] = useState("");
  const [crew, setCrew] = useState<string[]>([]);
  const away = game.expedition;
  const living = game.characters.filter((c) => !c.dead);

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
          {away && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs">
              <FootprintsIcon className="size-3.5 text-amber-500" />
              <span className="max-w-32 truncate font-medium sm:max-w-none" title={away.site}>{away.site}</span>
              <span className="text-muted-foreground">Turn {away.turn} of {TURNS_PER_SEGMENT}</span>
              {isGM && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  title="One Expedition Turn: twenty to forty minutes of cautious work. Eight of them use up the segment."
                  onClick={() => {
                    const last = away.turn + 1 === TURNS_PER_SEGMENT;
                    act("Mark Expedition Turn", (g) => markExpeditionTurn(g), "day");
                    if (last) toast("Eight Expedition Turns gone — the segment is used up");
                  }}
                >
                  Mark turn
                </Button>
              )}
            </div>
          )}
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
                  {!away && (
                    <DropdownMenuItem onClick={() => { setSite(""); setSiteId(null); setCapacity("3"); setSiteNotes(""); setCrew(living.map((c) => c.id)); setStarting(true); }}><FootprintsIcon /> Start expedition</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => { setPanicked([]); setSafe(true); setOutcome("active"); setLeaving(away ? { site: away.site, crew: away.crew } : null); setEnding(true); }}><FlagIcon /> End expedition</DropdownMenuItem>
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

      <Dialog open={starting} onOpenChange={setStarting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave the ship</DialogTitle>
            <DialogDescription>Who goes, where, and how much the site holds. Salvage Capacity stays yours alone — the crew learns it by searching.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const cap = Number(capacity);
              act("Start expedition", (g) => startExpedition(g, { site, crew, capacity: Number.isFinite(cap) ? cap : 0, notes: siteNotes, siteId: siteId ?? undefined }), "day");
              setStarting(false);
              toast.success(`Expedition to ${site.trim() || "an unnamed site"} begins`);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="site-file">Authored site</Label>
              <Select
                value={siteId ?? "none"}
                onValueChange={(v) => {
                  const def = typeof v === "string" && v !== "none" ? SITE_BY_ID[v] : undefined;
                  setSiteId(def?.id ?? null);
                  if (def) { setSite(def.name); setCapacity(String(def.capacity)); setSiteNotes(def.notes ?? ""); }
                }}
              >
                <SelectTrigger id="site-file"><SelectValue>{(siteId && SITE_BY_ID[siteId]?.name) || "None — no zones to move between"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — no zones to move between</SelectItem>
                  {SITES.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.zones.length} zones)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-name">Site</Label>
              <Input id="site-name" value={site} maxLength={60} placeholder="The Tanager, lower decks" onChange={(e) => setSite(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-capacity">Salvage Capacity</Label>
              <Input id="site-capacity" type="number" min={0} max={20} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              <p className="text-xs text-muted-foreground">1–2 for a wreckage pocket, 3–4 for a minor derelict, 5–8 for a large derelict or station section.</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Crew going in</Label>
              {living.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={crew.includes(c.id)} onCheckedChange={(v) => setCrew((p) => (v ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                  {c.name}
                </label>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="site-notes">Your notes on the site</Label>
              <Textarea id="site-notes" value={siteNotes} maxLength={500} rows={2} placeholder="What's really in there" onChange={(e) => setSiteNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={crew.length === 0}>Enter the site</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{leaving ? `Return from ${leaving.site}` : "End the expedition"}</DialogTitle>
            <DialogDescription>
              Pressure eases by 1 once the danger has passed, Panicked costs 1 Stress, and once-per-expedition abilities become ready again.
              {!leaving && " Nobody is recorded as away, so this covers the whole crew — which is what you want for a trip you ran off the app."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              {living.filter((c) => !leaving || leaving.crew.includes(c.id)).map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={panicked.includes(c.id)} onCheckedChange={(v) => setPanicked((p) => (v ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                  {c.name} reached Panicked
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={safe} onCheckedChange={(v) => setSafe(!!v)} />
              The immediate danger has ended
            </label>
            {leaving && (
              <div className="grid gap-1.5">
                <Label htmlFor="site-outcome">The site is now</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as SiteOutcome)}>
                  <SelectTrigger id="site-outcome"><SelectValue>{{ secured: "Secured", abandoned: "Abandoned", active: "Still active" }[outcome]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="secured">Secured</SelectItem>
                    <SelectItem value="abandoned">Abandoned</SelectItem>
                    <SelectItem value="active">Still active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => { act("End expedition", (g) => endExpedition(g, { panicked, safe, outcome: leaving ? outcome : undefined }), "day"); setEnding(false); toast.success("Expedition over"); }}>
              {leaving ? "Come aboard" : "End expedition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  { value: "site", label: "Site", expedition: true },
  { value: "combat", label: "Combat" },
  { value: "crew", label: "Crew" },
  { value: "ship", label: "Ship" },
  { value: "mechs", label: "Mechs" },
  { value: "storage", label: "Storage" },
  { value: "map", label: "Map" },
  { value: "log", label: "Log" },
  { value: "rules", label: "Rules" },
];

const subscribeNoop = () => () => {};

export function AdriftApp() {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const away = useGame((s) => !!s.game.expedition);
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
              {TABS.filter((t) => away || !t.expedition).map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-3">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="overview" className="pt-3"><OverviewTab onOpenCharacter={(id) => { setSelected(id); setTab("crew"); }} onGo={setTab} /></TabsContent>
          <TabsContent value="actions" className="pt-3"><ActionsTab /></TabsContent>
          {away && <TabsContent value="site" className="pt-3"><SiteTab /></TabsContent>}
          <TabsContent value="combat" className="pt-3"><CombatTab /></TabsContent>
          <TabsContent value="crew" className="pt-3"><CrewTab selectedId={selected} onSelect={setSelected} /></TabsContent>
          <TabsContent value="ship" className="pt-3"><ShipTab /></TabsContent>
          <TabsContent value="mechs" className="pt-3"><MechsTab /></TabsContent>
          <TabsContent value="storage" className="pt-3"><StorageTab /></TabsContent>
          <TabsContent value="map" className="pt-3"><MapTab /></TabsContent>
          <TabsContent value="log" className="pt-3"><LogTab /></TabsContent>
          <TabsContent value="rules" className="pt-3"><RulesTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
