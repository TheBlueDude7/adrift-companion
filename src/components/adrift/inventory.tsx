"use client";

import { usePerms } from "@/lib/use-perms";
import { ArrowRightLeftIcon, BatteryIcon, PackagePlusIcon, SearchIcon, Trash2Icon, WeightIcon, WrenchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { heavyRelief, itemSlots, poolFor, poolUsage } from "@/lib/derive";
import { uid } from "@/lib/dice";
import { ITEM_CATEGORIES, ITEM_TIERS, type ItemCategory, type ItemTemplate, type ItemTier } from "@/lib/rules";
import { itemFromTemplate } from "@/lib/seed";
import { addItem, sameKind } from "@/lib/stock";
import { useGame } from "@/lib/store";
import type { GameState, Item } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, Pill, Stepper } from "./common";

export function locationName(g: GameState, loc: string) {
  if (loc === "ship") return "Ship storage";
  return g.characters.find((c) => c.id === loc)?.name ?? "Unknown";
}

/**
 * Move `qty` units of an item to another location, merging with a matching stack.
 * Moved units leave the Contingency Pack, and only stay shared between members of the same pool.
 */
export function moveItem(g: GameState, itemId: string, to: string, qty: number) {
  const item = g.items.find((i) => i.id === itemId);
  if (!item) return "";
  const n = Math.min(qty, item.qty);
  const from = locationName(g, item.location);
  const pool = item.shared ? poolFor(g, item.location) : null;
  const moved: Item = { ...item, id: uid(), qty: n, location: to, shared: pool?.members.includes(to) ? true : undefined, contingency: undefined };
  const target = g.items.find((i) => i.location === to && i.id !== item.id && sameKind(i, moved));
  if (n === item.qty && !target) Object.assign(item, { location: to, shared: moved.shared, contingency: undefined });
  else {
    item.qty -= n;
    if (target) target.qty += n;
    else g.items.push(moved);
    if (item.qty <= 0) g.items = g.items.filter((i) => i.id !== item.id);
  }
  return `Moved ${n}× ${item.name} from ${from} to ${locationName(g, to)}${moved.shared ? " (shared pool)" : ""}.`;
}

/** Flag an item as shared cargo or personal gear, merging with a matching stack in the same inventory. */
export function setShared(g: GameState, itemId: string, shared: boolean) {
  const item = g.items.find((i) => i.id === itemId);
  if (!item) return "";
  const next: Item = { ...item, shared: shared || undefined, contingency: undefined };
  const target = g.items.find((i) => i.location === item.location && i.id !== item.id && sameKind(i, next));
  if (target) {
    target.qty += item.qty;
    g.items = g.items.filter((i) => i.id !== item.id);
  } else Object.assign(item, { shared: next.shared, contingency: undefined });
  return shared ? `${item.qty}× ${item.name} added to the shared pool (${locationName(g, item.location)} carries it).` : `${item.qty}× ${item.name} taken out of the shared pool.`;
}

export { addItem };

export function ItemRow({ item, compact, showCarrier }: { item: Item; compact?: boolean; showCarrier?: boolean }) {
  const { act, game } = useGame();
  const { canUseLocation, isGM } = usePerms();
  const pool = item.location === "ship" ? null : poolFor(game, item.location);
  const shared = !!item.shared && !!pool;
  const poolRoom = pool ? poolUsage(game, pool.members) : null;
  const destinations = [{ id: "ship", name: "Ship storage" }, ...game.characters.filter((c) => !c.dead).map((c) => ({ id: c.id, name: c.name }))].filter(
    (d) => d.id !== item.location && (canUseLocation(d.id) || (shared && pool!.members.includes(d.id))),
  );
  const update = (label: string, fn: (i: Item) => void) =>
    act(label, (g) => {
      const it = g.items.find((x) => x.id === item.id);
      if (it) fn(it);
    });
  const depleted = item.maxCharges !== undefined && (item.charges ?? 0) <= 0;
  const slots = shared || item.location === "ship" ? itemSlots(item) : itemSlots(item, heavyRelief(game, item.location).heavyCost);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background/40 px-3 py-2", item.broken && "border-rose-500/30")}>
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{item.name}</span>
          {item.tier && <Pill>{item.tier}</Pill>}
          {item.heavy && <Pill tone="warn">Heavy</Pill>}
          {item.broken && <Pill tone="danger">Broken</Pill>}
          {depleted && <Pill tone="warn">Depleted</Pill>}
          {shared && !showCarrier && <Pill tone="info">Shared</Pill>}
          {item.contingency && <Pill tone="warn">Contingency</Pill>}
          {showCarrier && <span className="text-xs text-muted-foreground">carried by {locationName(game, item.location)}</span>}
        </div>
        {!compact && item.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.notes}>{item.notes}</p>}
      </div>
      {item.maxCharges !== undefined && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Charges">
          <BatteryIcon className="size-3.5" />
          <Stepper value={item.charges ?? 0} min={0} max={item.maxCharges} size="xs" label="charges" onChange={(v) => update(`${item.name} charges → ${v}`, (i) => (i.charges = v))} />
          <span>/{item.maxCharges}</span>
        </div>
      )}
      <Stepper
        value={item.qty}
        min={0}
        max={item.location === "ship" && !isGM ? item.qty : undefined}
        size="xs"
        label="quantity"
        onChange={(v) =>
          act(`${item.name} ×${v}`, (g) => {
            if (v <= 0) {
              g.items = g.items.filter((i) => i.id !== item.id);
              return `${item.name} used up (${locationName(g, item.location)}).`;
            }
            const it = g.items.find((x) => x.id === item.id)!;
            const diff = v - it.qty;
            it.qty = v;
            return `${diff > 0 ? "Added" : "Used"} ${Math.abs(diff)}× ${item.name} (${locationName(g, item.location)}, now ${v}).`;
          })
        }
      />
      <span className="tabular w-12 text-right text-xs text-muted-foreground" title="Inventory slots when carried">{slots} slot{slots === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Transfer ${item.name}`}><ArrowRightLeftIcon /></Button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to…</DropdownMenuLabel>
              {destinations.map((d) => (
                <DropdownMenuItem key={d.id} onClick={() => act("Transfer", (g) => moveItem(g, item.id, d.id, item.qty))}>
                  {d.name} {item.qty > 1 && <span className="ml-auto text-xs text-muted-foreground">all {item.qty}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            {item.qty > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Move one…</DropdownMenuLabel>
                  {destinations.map((d) => (
                    <DropdownMenuItem key={d.id} onClick={() => act("Transfer", (g) => moveItem(g, item.id, d.id, 1))}>
                      1 → {d.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            {pool && (shared || canUseLocation(item.location)) && (
              <>
                <DropdownMenuSeparator />
                {shared ? (
                  <DropdownMenuItem onClick={() => act("Take out of shared pool", (g) => setShared(g, item.id, false))}>Take out of shared pool</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled={poolRoom!.used + itemSlots(item) > poolRoom!.capacity} onClick={() => act("Add to shared pool", (g) => setShared(g, item.id, true))}>
                    Put in shared pool <span className="ml-auto text-xs text-muted-foreground">{poolRoom!.capacity - poolRoom!.used} free</span>
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => update(`${item.name} ${item.heavy ? "not Heavy" : "Heavy"}`, (i) => (i.heavy = !i.heavy))}>
              <WeightIcon /> {item.heavy ? "Not Heavy" : "Mark Heavy (2 slots)"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => update(`${item.name} ${item.broken ? "repaired" : "broken"}`, (i) => (i.broken = !i.broken))}>
              <WrenchIcon /> {item.broken ? "Mark repaired" : "Mark broken"}
            </DropdownMenuItem>
            {item.maxCharges !== undefined && (
              <DropdownMenuItem onClick={() => update(`${item.name} recharged`, (i) => (i.charges = i.maxCharges))}>
                <BatteryIcon /> Refill charges
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => act(`Discard ${item.name}`, (g) => { g.items = g.items.filter((i) => i.id !== item.id); return `Discarded ${item.qty}× ${item.name} from ${locationName(g, item.location)}.`; })}>
              <Trash2Icon /> Discard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function ItemList({ location, filter = "", category = "all", compact, personal }: { location: string; filter?: string; category?: string; compact?: boolean; personal?: boolean }) {
  const items = useGame((s) => s.game.items);
  const pooled = useGame((s) => personal && !!poolFor(s.game, location));
  const list = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return items
      .filter((i) => i.location === location && !(pooled && i.shared))
      .filter((i) => category === "all" || i.category === category)
      .filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.notes.toLowerCase().includes(needle))
      .sort((a, b) => (location === "ship" ? 0 : a.category.localeCompare(b.category)) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [items, location, filter, category, pooled]);

  if (list.length === 0 && personal && !filter && category === "all")
    return <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Carrying nothing{pooled ? " of their own" : ""}. Add items or transfer them from ship storage.</p>;
  if (list.length === 0)
    return (
      <EmptyState
        title={filter || category !== "all" ? "No matching items" : location === "ship" ? "The hold is empty" : "Carrying nothing"}
        body={filter || category !== "all" ? "Try a different search or category." : "Add items from the catalog or transfer them from another inventory."}
      />
    );

  return (
    <div className="grid gap-1.5">
      {list.map((i) => (
        <ItemRow key={i.id} item={i} compact={compact} />
      ))}
    </div>
  );
}

const blankTemplate: ItemTemplate = { name: "", category: "Equipment" };

export function AddItemDialog({ location, trigger }: { location: string; trigger?: React.ReactElement }) {
  const { act, game } = useGame();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState<ItemTemplate>(blankTemplate);
  const [save, setSave] = useState(true);

  const catalog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return game.catalog.filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.category.toLowerCase().includes(needle));
  }, [game.catalog, q]);

  function addFromTemplate(t: ItemTemplate) {
    act("Add item", (g) => {
      addItem(g, itemFromTemplate(t, qty, location));
      return `Added ${qty}× ${t.name} to ${locationName(g, location)}.`;
    });
    setOpen(false);
  }

  function addCustom() {
    if (!custom.name.trim()) return;
    const t = { ...custom, name: custom.name.trim() };
    act("Add custom item", (g) => {
      if (save && !g.catalog.some((c) => c.name.toLowerCase() === t.name.toLowerCase())) g.catalog.push(t);
      addItem(g, itemFromTemplate(t, qty, location));
      return `Added ${qty}× ${t.name} to ${locationName(g, location)}${save ? " (saved to catalog)" : ""}.`;
    });
    setCustom(blankTemplate);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setQty(1); setQ(""); } }}>
      <DialogTrigger render={trigger ?? <Button size="sm"><PackagePlusIcon /> Add item</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to {locationName(game, location)}</DialogTitle>
          <DialogDescription>Pick from your catalog or define something new you crafted or salvaged.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <Label>Quantity</Label>
          <Stepper value={qty} onChange={setQty} min={1} max={99} label="quantity" />
        </div>
        <Tabs defaultValue="catalog">
          <TabsList className="w-full">
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="custom">New item</TabsTrigger>
          </TabsList>
          <TabsContent value="catalog" className="grid gap-2 pt-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search catalog…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <ScrollArea className="h-72 pr-3">
              <div className="grid gap-1">
                {catalog.map((t) => (
                  <button key={t.name} onClick={() => addFromTemplate(t)} className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5">
                    <span>
                      <span className="font-medium">{t.name}</span>
                      {t.notes && <span className="block text-xs text-muted-foreground">{t.notes}</span>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Pill>{t.category}</Pill>
                      {t.heavy && <Pill tone="warn">Heavy</Pill>}
                      {t.maxCharges !== undefined && <Pill tone="info">{t.maxCharges} charges</Pill>}
                    </span>
                  </button>
                ))}
                {catalog.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Not in the catalog — create it under “New item”.</p>}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="custom" className="grid gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="item-name">Name</Label>
              <Input id="item-name" placeholder="e.g. Pipe Rifle" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select value={custom.category} onValueChange={(v) => setCustom({ ...custom, category: v as ItemCategory })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{ITEM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tier</Label>
                <Select value={custom.tier ?? "none"} onValueChange={(v) => setCustom({ ...custom, tier: v === "none" ? undefined : (v as ItemTier) })}>
                  <SelectTrigger className="w-full"><SelectValue>{custom.tier ?? "—"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {ITEM_TIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Max charges <span className="text-muted-foreground">(blank = none)</span></Label>
              <Input type="number" min={1} value={custom.maxCharges ?? ""} onChange={(e) => setCustom({ ...custom, maxCharges: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Damage, damage type, range, recipe, special rules…" value={custom.notes ?? ""} onChange={(e) => setCustom({ ...custom, notes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={!!custom.heavy} onCheckedChange={(v) => setCustom({ ...custom, heavy: !!v || undefined })} /> Heavy: takes 2 slots and slows whoever carries it
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={save} onCheckedChange={(v) => setSave(!!v)} /> Save to catalog for reuse
            </label>
            <DialogFooter>
              <Button onClick={addCustom} disabled={!custom.name.trim()}>Add {qty}× {custom.name || "item"}</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
