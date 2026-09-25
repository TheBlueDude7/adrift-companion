"use client";

import { MoonIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supplyCount } from "@/lib/derive";
import { endOfDay, type EndOfDayInput } from "@/lib/mechanics";
import { useGame } from "@/lib/store";
import type { FoodIntake, GameState } from "@/lib/types";
import { cn } from "@/lib/utils";

function consume(g: GameState, name: string, qty: number) {
  let left = qty;
  for (const item of g.items.filter((i) => i.location === "ship" && i.name === name)) {
    const take = Math.min(left, item.qty);
    item.qty -= take;
    left -= take;
    if (left <= 0) break;
  }
  g.items = g.items.filter((i) => i.qty > 0);
  return qty - left;
}

export function EndOfDayDialog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<EndOfDayInput>({});
  const [draw, setDraw] = useState(true);
  const [report, setReport] = useState<string[] | null>(null);
  const alive = game.characters.filter((c) => !c.dead);

  function init() {
    setReport(null);
    const food = supplyCount(game, "Food Unit");
    const water = supplyCount(game, "Water Unit");
    setInput(
      Object.fromEntries(
        alive.map((c, idx) => [
          c.id,
          {
            food: c.survival.food !== "none" ? c.survival.food : idx < food ? "full" : "none",
            water: c.survival.water || idx < water,
            slept: true,
          },
        ]),
      ),
    );
  }

  const foodEaten = Object.values(input).reduce((s, i) => s + (i.food === "full" ? 1 : 0), 0) + Math.ceil(Object.values(input).filter((i) => i.food === "half").length / 2);
  const foodSaved = game.ship.rationsStretched ? Math.floor(foodEaten / 4) : 0;
  const foodNeeded = foodEaten - foodSaved;
  const waterNeeded = Object.values(input).filter((i) => i.water).length;
  const foodHave = supplyCount(game, "Food Unit");
  const waterHave = supplyCount(game, "Water Unit");

  function run() {
    let lines: string[] = [];
    act(`End of Day ${game.day}`, (g) => {
      const out: string[] = [];
      if (draw) {
        const f = consume(g, "Food Unit", foodNeeded);
        const w = consume(g, "Water Unit", waterNeeded);
        if (f || w) out.push(`Drew ${f} Food and ${w} Water from ship storage${foodSaved ? `; stretched rations saved ${foodSaved} Food` : ""}.`);
      }
      out.push(...endOfDay(g, input));
      lines = out;
      return out;
    }, "day");
    setReport(lines);
  }

  const set = (id: string, patch: Partial<EndOfDayInput[string]>) => setInput((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const foods: FoodIntake[] = ["none", "half", "full"];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) init(); }}>
      <DialogTrigger render={<Button size="sm" variant={game.segment === 3 ? "default" : "outline"}><MoonIcon /> End day</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>End of Day {game.day}</DialogTitle>
          <DialogDescription>Check Food, Water, and Sleep for each survivor. Penalties, untreated injuries, natural recovery, Energy, and Pressure are applied automatically.</DialogDescription>
        </DialogHeader>
        {report ? (
          <>
            <ScrollArea className="max-h-[60vh] pr-3">
              <ul className="grid gap-1 text-sm">
                {report.map((l, i) => (
                  <li key={i} className={cn("rounded-md px-2 py-1", l.startsWith("⚠") || l.startsWith("☠") ? "bg-rose-500/10 text-rose-200" : l.startsWith("—") || l.startsWith("Day") ? "font-medium text-primary" : "text-muted-foreground")}>{l}</li>
                ))}
              </ul>
            </ScrollArea>
            <DialogFooter><Button onClick={() => setOpen(false)}>Begin the Morning</Button></DialogFooter>
          </>
        ) : alive.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">No living survivors. The day still passes.</p>
            <DialogFooter><Button onClick={run}>Advance to Day {game.day + 1}</Button></DialogFooter>
          </>
        ) : (
          <>
            <ScrollArea className="max-h-[55vh] pr-3">
              <div className="grid gap-2">
                <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 px-3 text-[11px] tracking-wide text-muted-foreground uppercase sm:grid">
                  <span>Survivor</span><span className="w-40 text-center">Food</span><span className="w-14 text-center">Water</span><span className="w-14 text-center">Slept</span>
                </div>
                {alive.map((c) => {
                  const i = input[c.id];
                  if (!i) return null;
                  return (
                    <div key={c.id} className="grid items-center gap-2 rounded-lg border bg-background/40 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-3">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.survival.rests} rest{c.survival.rests === 1 ? "" : "s"} · {c.injuries.filter((x) => x.state === "Untreated").length} untreated
                          {c.survival.foodMissStreak > 0 && ` · hungry ${c.survival.foodMissStreak}d`}
                          {c.survival.waterMissStreak > 0 && ` · thirsty ${c.survival.waterMissStreak}d`}
                        </p>
                      </div>
                      <div className="grid w-40 grid-cols-3 gap-1">
                        {foods.map((f) => (
                          <button key={f} onClick={() => set(c.id, { food: f })} className={cn("rounded-md border py-1 text-xs capitalize", i.food === f ? (f === "none" ? "border-rose-400 bg-rose-500/15 text-rose-200" : "border-primary bg-primary/15 text-primary") : "text-muted-foreground")}>{f}</button>
                        ))}
                      </div>
                      <label className="flex w-14 items-center justify-center gap-1.5 text-xs sm:justify-center"><span className="sm:hidden">Water</span><Checkbox checked={i.water} onCheckedChange={(v) => set(c.id, { water: !!v })} /></label>
                      <label className="flex w-14 items-center justify-center gap-1.5 text-xs"><span className="sm:hidden">Slept</span><Checkbox checked={i.slept} onCheckedChange={(v) => set(c.id, { slept: !!v })} /></label>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-xs">
              <label className="flex items-center gap-2"><Checkbox checked={draw} onCheckedChange={(v) => setDraw(!!v)} /> Draw meals from ship storage</label>
              <span className={cn(foodNeeded > foodHave || waterNeeded > waterHave ? "text-rose-300" : "text-muted-foreground")}>
                Needs {foodNeeded} Food{foodSaved > 0 && ` (${foodSaved} saved by stretched rations)`} / {waterNeeded} Water · Hold has {foodHave} / {waterHave}
              </span>
            </div>
            <DialogFooter>
              <Button onClick={run}>Resolve End of Day</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
