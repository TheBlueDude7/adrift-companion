"use client";

import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carrySlots, foodCount, supplyCount, usedSlots } from "@/lib/derive";
import { ITEM_CATEGORIES } from "@/lib/rules";
import { cellCount } from "@/lib/power";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { Meter, SectionTitle } from "./common";
import { CraftDialog } from "./crafting";
import { AddItemDialog, ItemList } from "./inventory";

export const KEY_SUPPLIES = ["Food Unit", "Water Unit", "Fuel Unit", "Medical Supply", "Scrap Metal", "Scrap Components"] as const;

export function SupplyStrip() {
  const game = useGame((s) => s.game);
  const alive = game.characters.filter((c) => !c.dead).length;
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {KEY_SUPPLIES.map((n) => {
        const count = n === "Food Unit" ? foodCount(game) : supplyCount(game, n);
        const perDay = n === "Food Unit" || n === "Water Unit" ? alive : 0;
        const days = perDay ? Math.floor(count / perDay) : null;
        return (
          <div key={n} className={cn("rounded-lg border bg-background/40 p-2.5", days !== null && days < 2 && "border-rose-500/40")}>
            <p className="truncate text-[11px] text-muted-foreground">{n.replace(" Unit", "")}</p>
            <p className="font-mono text-xl">{count}</p>
            {days !== null && <p className={cn("text-[11px]", days < 2 ? "text-rose-300" : "text-muted-foreground")}>{days} day{days === 1 ? "" : "s"} for crew</p>}
          </div>
        );
      })}
      <div className={cn("rounded-lg border bg-background/40 p-2.5", cellCount(game) === 0 && "border-rose-500/40")}>
        <p className="truncate text-[11px] text-muted-foreground">Power cells</p>
        <p className="font-mono text-xl">{cellCount(game)}</p>
        <p className="text-[11px] text-muted-foreground">for moves and mechs</p>
      </div>
    </div>
  );
}

export function StorageTab() {
  const game = useGame((s) => s.game);
  const { isGM } = usePerms();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const alive = game.characters.filter((c) => !c.dead);

  return (
    <div className="grid gap-5">
      <SupplyStrip />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Ship storage</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search the hold…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
              </div>
              <Select value={cat} onValueChange={(v) => setCat(v as string)}>
                <SelectTrigger className="w-36"><SelectValue>{cat === "all" ? "All categories" : cat}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {ITEM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <CraftDialog />
              {isGM && <AddItemDialog location="ship" />}
            </div>
            <ItemList location="ship" filter={q} category={cat} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-3">
          <SectionTitle>Carried by the crew</SectionTitle>
          {alive.length === 0 && <p className="text-sm text-muted-foreground">No survivors yet.</p>}
          {alive.map((c) => {
            const used = usedSlots(game, c.id);
            const max = carrySlots(game, c);
            return (
              <Card key={c.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-sm">
                    {c.name}
                    <span className={cn("font-mono text-xs", used > max ? "text-rose-300" : "text-muted-foreground")}>{used}/{max} slots</span>
                  </CardTitle>
                  <Meter value={used} max={max} tone={used > max ? "hp" : "good"} segmented />
                </CardHeader>
                <CardContent>
                  <ItemList location={c.id} compact />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
