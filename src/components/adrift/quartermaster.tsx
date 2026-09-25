"use client";

import { BoxesIcon, PackageOpenIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CONTINGENCY_SLOTS, contingencyFor, hasContingencyPack, isLoadmaster, poolFor, poolUsage } from "@/lib/derive";
import { uid } from "@/lib/dice";
import { useGame } from "@/lib/store";
import type { Character, GameState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Meter, Pill } from "./common";
import { ItemRow, addItem, setShared } from "./inventory";

function findChar(g: GameState, id: string) {
  return g.characters.find((c) => c.id === id);
}

export function ContingencyPanel({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  if (!hasContingencyPack(c)) return null;
  const pack = contingencyFor(game, c);

  if (!pack)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Contingency Pack</p>
          <p className="text-xs text-muted-foreground">Before heading out, keep {CONTINGENCY_SLOTS} slots undecided. Later, reveal what you packed from anything in ship storage right now.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            act("Pack contingency", (g) => {
              const x = findChar(g, c.id)!;
              x.contingency = { slots: CONTINGENCY_SLOTS, manifest: [...new Set(g.items.filter((i) => i.location === "ship" && i.qty > 0).map((i) => i.name))] };
              return `${x.name} packs ${CONTINGENCY_SLOTS} Contingency Slots.`;
            })
          }
        >
          <PackageOpenIcon /> Pack contingency
        </Button>
      </div>
    );

  return (
    <div className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Contingency Pack <span className="font-normal text-muted-foreground">· {pack.undecided} of {pack.slots} undecided</span>
        </p>
        <div className="flex gap-1.5">
          <RevealDialog c={c} disabled={pack.undecided === 0} manifest={pack.manifest} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              act("Unpack contingency", (g) => {
                const x = findChar(g, c.id)!;
                delete x.contingency;
                for (const i of g.items) if (i.location === c.id && i.contingency) delete i.contingency;
                return `${x.name} unpacks the Contingency Pack.`;
              })
            }
          >
            Unpack
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pack.revealed.flatMap((i) => Array.from({ length: i.qty }, (_, k) => (
          <span key={`${i.id}-${k}`} className="rounded-md border border-amber-500/40 bg-background/60 px-2 py-1 text-xs">{i.name}</span>
        )))}
        {Array.from({ length: pack.undecided }, (_, k) => (
          <span key={k} className="rounded-md border border-dashed border-amber-500/50 px-2 py-1 text-xs text-amber-200/80">Undecided</span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Reveal as many items as you like. A slot becomes undecided again once its item is used up, discarded, or handed to someone else.</p>
    </div>
  );
}

function RevealDialog({ c, disabled, manifest }: { c: Character; disabled: boolean; manifest: string[] }) {
  const items = useGame((s) => s.game.items);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const stock = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byName = new Map<string, { name: string; qty: number; category: string }>();
    for (const i of items) {
      if (i.location !== "ship" || i.qty <= 0 || !manifest.includes(i.name)) continue;
      const cur = byName.get(i.name);
      if (cur) cur.qty += i.qty;
      else byName.set(i.name, { name: i.name, qty: i.qty, category: i.category });
    }
    return [...byName.values()].filter((i) => !needle || i.name.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, manifest, q]);

  function reveal(name: string) {
    act("Reveal contingency", (g) => {
      const from = g.items.find((i) => i.location === "ship" && i.name === name && i.qty > 0);
      if (!from) return "";
      from.qty -= 1;
      addItem(g, { ...from, id: uid(), qty: 1, location: c.id, shared: undefined, contingency: true });
      if (from.qty <= 0) g.items = g.items.filter((i) => i.id !== from.id);
      return `${c.name} reveals a ${name} in the Contingency Pack (taken from ship storage).`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setQ(""); }}>
      <DialogTrigger render={<Button size="sm" disabled={disabled}><SparklesIcon /> Reveal item</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What was in the pack?</DialogTitle>
          <DialogDescription>Pick an ordinary portable item that could reasonably have been packed. Only things that were in ship storage when you packed, and are still there, are listed.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search ship storage…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
        <ScrollArea className="h-72 pr-3">
          <div className="grid gap-1">
            {stock.map((i) => (
              <button key={i.name} onClick={() => reveal(i.name)} className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5">
                <span className="font-medium">{i.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Pill>{i.category}</Pill>
                  <span className="tabular text-xs text-muted-foreground">{i.qty} aboard</span>
                </span>
              </button>
            ))}
            {stock.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{q ? "Nothing matching in storage." : "Nothing left in storage that was aboard when you packed."}</p>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function PoolMembersDialog({ c, current, trigger }: { c: Character; current: string[] | null; trigger: React.ReactElement }) {
  const characters = useGame((s) => s.game.characters);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const crew = characters.filter((x) => !x.dead);

  function save() {
    const members = [c.id, ...picked.filter((id) => id !== c.id)];
    act(current ? "Change shared pool" : "Set up shared pool", (g) => {
      const x = findChar(g, c.id)!;
      const dropped = (current ?? []).filter((id) => !members.includes(id));
      for (const i of [...g.items]) if (i.shared && dropped.includes(i.location)) setShared(g, i.id, false);
      x.pool = members;
      const names = members.map((id) => findChar(g, id)?.name).filter(Boolean).join(", ");
      return `${x.name} ${current ? "reorganizes" : "sets up"} a shared pool of ${members.length} slots: ${names}.`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setPicked(current ?? [c.id]); }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Who&apos;s on the expedition?</DialogTitle>
          <DialogDescription>Each member gives one of their inventory slots to the shared pool. Anyone in the pool can carry and pass its cargo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          {crew.map((x) => (
            <label key={x.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40", x.id === c.id && "opacity-80")}>
              <Checkbox
                checked={x.id === c.id || picked.includes(x.id)}
                disabled={x.id === c.id}
                onCheckedChange={(v) => setPicked((p) => (v ? [...p, x.id] : p.filter((id) => id !== x.id)))}
                aria-label={x.name}
              />
              {x.name}
              {x.id === c.id && <span className="text-xs text-muted-foreground">(Loadmaster)</span>}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save}>{current ? "Save" : `Create a ${new Set([c.id, ...picked]).size}-slot pool`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SharedPoolPanel({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const pool = poolFor(game, c.id);

  if (!pool) {
    if (!isLoadmaster(c)) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Shared pool</p>
          <p className="text-xs text-muted-foreground">As Loadmaster, pool one slot from each expedition member into shared cargo.</p>
        </div>
        <PoolMembersDialog c={c} current={null} trigger={<Button size="sm" variant="outline"><BoxesIcon /> Set up shared pool</Button>} />
      </div>
    );
  }

  const { items, used, capacity } = poolUsage(game, pool.members);
  const owner = pool.owner;
  const isOwner = owner.id === c.id;

  return (
    <div className="grid gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Shared pool <span className={cn("font-normal", used > capacity ? "text-rose-300" : "text-muted-foreground")}>· {used}/{capacity} slots</span>
        </p>
        {isOwner && (
          <div className="flex gap-1.5">
            <PoolMembersDialog c={c} current={pool.members} trigger={<Button size="sm" variant="outline">Members</Button>} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                act("End shared pool", (g) => {
                  for (const i of [...g.items]) if (i.shared && pool.members.includes(i.location)) setShared(g, i.id, false);
                  delete findChar(g, c.id)!.pool;
                  return `${c.name} breaks up the shared pool. Everyone keeps what they're carrying.`;
                })
              }
            >
              End pool
            </Button>
          </div>
        )}
      </div>
      <Meter value={used} max={capacity} tone={used > capacity ? "hp" : "good"} segmented />
      <p className="text-xs text-muted-foreground">
        {isOwner ? "Pooling" : `${owner.name}'s pool`}: {pool.members.map((id) => findChar(game, id)?.name).join(", ")}. Each gives up one personal slot. Members in the same zone can pass pool cargo without spending an Action; if someone gets separated, only what they carry goes with them.
      </p>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Nothing in the pool yet. Use an item&apos;s transfer menu and choose “Put in shared pool”.</p>
      ) : (
        <div className="grid gap-1.5">{items.map((i) => <ItemRow key={i.id} item={i} compact showCarrier />)}</div>
      )}
    </div>
  );
}
