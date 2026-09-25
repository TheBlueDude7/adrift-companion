"use client";

import { HammerIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RECIPES } from "@/data/crafting";
import { craftBlocker, refiningOptions, scaleRecipe as scale, stationLevel, stationLevelName, stockOutput, STATION_MODULE } from "@/lib/crafting";
import { haveInStorage, recipeText, shortfalls, spend, stockItem, toolkitCharges } from "@/lib/stock";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Pill, Stepper } from "./common";

const CATEGORIES = ["All", ...Array.from(new Set(RECIPES.map((r) => r.category)))];

function StationStrip() {
  const game = useGame((s) => s.game);
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {(Object.keys(STATION_MODULE) as (keyof typeof STATION_MODULE)[]).map((s) => {
        const level = stationLevel(game, s);
        return (
          <Pill key={s} tone={level > 0 || (s === "cyberlab" && level === 0) ? "info" : "muted"}>
            {STATION_MODULE[s].replace(" / Fabrication Bay", "")}: {stationLevelName(s, level)}
          </Pill>
        );
      })}
      <Pill tone={toolkitCharges(game) > 0 ? "good" : "warn"}>{toolkitCharges(game)} toolkit charges</Pill>
    </div>
  );
}

export function CraftDialog() {
  const { act, game } = useGame();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [name, setName] = useState<string | null>(null);
  const [batches, setBatches] = useState(1);
  const [override, setOverride] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return RECIPES.filter((r) => (cat === "All" || r.category === cat) && (!needle || r.name.toLowerCase().includes(needle) || r.notes.toLowerCase().includes(needle)));
  }, [q, cat]);

  const recipe = RECIPES.find((r) => r.name === name) ?? null;
  const inputs = recipe ? scale(recipe.inputs, batches) : [];
  const toolkit = (recipe?.toolkit ?? 0) * batches;
  const blocker = recipe ? craftBlocker(game, recipe) : null;
  const short = recipe ? shortfalls(game, inputs, toolkit) : [];
  const ready = !!recipe && ((!blocker && short.length === 0) || override);

  function craft(success: boolean) {
    if (!recipe) return;
    const r = recipe;
    const n = batches;
    act(`Craft ${r.name}`, (g) => {
      spend(g, scale(r.inputs, n), (r.toolkit ?? 0) * n);
      const out = success ? { name: r.name, qty: r.output * n } : { name: r.onFailure!.name, qty: r.onFailure!.qty * n };
      stockOutput(g, r, out.name, out.qty);
      const made = out.qty > 0 ? `${out.qty}× ${out.name} added to ship storage` : "nothing came of it";
      return `${r.onFailure ? (success ? "Cooked" : "Botched") : "Crafted"} ${r.name}${n > 1 ? ` ×${n}` : ""}: ${made}. Spent ${recipeText(scale(r.inputs, n), (r.toolkit ?? 0) * n)}.`;
    });
    setBatches(1);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setName(null); setBatches(1); setOverride(false); } }}>
      <DialogTrigger render={<Button size="sm" variant="outline"><HammerIcon /> Craft</Button>} />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crafting</DialogTitle>
          <DialogDescription>Spend materials from ship storage to make gear, supplies, and meals. The Workshop&apos;s level limits which material tiers you can work, and some recipes need a Kitchen upgrade or the Cybernetics Lab.</DialogDescription>
        </DialogHeader>
        <StationStrip />
        <Tabs defaultValue="recipes">
          <TabsList className="w-full">
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
            <TabsTrigger value="refine">Refining</TabsTrigger>
          </TabsList>
          <TabsContent value="recipes" className="grid gap-3 pt-2">
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((c) => (
                <Button key={c} size="xs" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>{c}</Button>
              ))}
            </div>
            <div className="grid min-h-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="grid content-start gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search recipes…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
                </div>
                <ScrollArea className="h-56 pr-3 sm:h-80">
                  <div className="grid gap-1">
                    {list.map((r) => {
                      const why = craftBlocker(game, r) ?? (shortfalls(game, r.inputs, r.toolkit).length ? "Missing materials" : null);
                      return (
                        <button
                          key={r.name}
                          onClick={() => { setName(r.name); setBatches(1); setOverride(false); }}
                          className={cn("grid gap-0.5 rounded-md border px-3 py-2 text-left hover:border-primary/50", name === r.name ? "border-primary bg-primary/10" : "bg-background/40", why && "opacity-70")}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.name}</span>
                            {r.tier && <Pill>{r.tier}</Pill>}
                          </span>
                          <span className={cn("text-[11px]", why ? "text-muted-foreground" : "text-emerald-300")}>{why ?? "Ready to craft"}</span>
                        </button>
                      );
                    })}
                    {list.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No recipes match.</p>}
                  </div>
                </ScrollArea>
              </div>
              <div className="grid content-start gap-3 rounded-lg border bg-muted/20 p-3">
                {!recipe ? (
                  <p className="text-sm text-muted-foreground">Pick a recipe to see what it takes. Materials are drawn from ship storage, so move anything the crew is carrying into the hold first.</p>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{recipe.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{recipe.notes}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Pill>{recipe.category}</Pill>
                        {recipe.station && <Pill tone="info">{STATION_MODULE[recipe.station].replace(" / Fabrication Bay", "")}{recipe.stationLevel && `: ${recipe.stationLevel}`}</Pill>}
                        {recipe.skill && <Pill tone="info">{recipe.skill}</Pill>}
                        {recipe.charges !== undefined && <Pill>{recipe.charges} {recipe.category === "Tool" ? "charges" : recipe.charges === 1 ? "use" : "uses"}</Pill>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Batches</Label>
                      <Stepper value={batches} onChange={setBatches} min={1} max={20} label="batches" />
                    </div>
                    <div className="grid gap-1 text-xs">
                      <p className="text-muted-foreground">Needs</p>
                      {inputs.map((p) => {
                        const have = haveInStorage(game, p.name);
                        return (
                          <p key={p.name} className="flex justify-between">
                            <span>{p.qty}× {p.name}</span>
                            <span className={cn("font-mono", have < p.qty ? "text-rose-300" : "text-muted-foreground")}>{have} in hold</span>
                          </p>
                        );
                      })}
                      {toolkit > 0 && (
                        <p className="flex justify-between">
                          <span>{toolkit} toolkit charge{toolkit > 1 ? "s" : ""}</span>
                          <span className={cn("font-mono", toolkitCharges(game) < toolkit ? "text-rose-300" : "text-muted-foreground")}>{toolkitCharges(game)} left</span>
                        </p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        Makes {recipe.output * batches}× {recipe.name}
                        {recipe.onFailure && `; on a failed check, ${recipe.onFailure.qty * batches ? `${recipe.onFailure.qty * batches}× ${recipe.onFailure.name}` : "nothing"}`}.
                      </p>
                    </div>
                    {blocker && <p className="rounded-md bg-rose-500/10 p-2 text-xs text-rose-200">{blocker}. Upgrade or build it from the Ship tab.</p>}
                    {(blocker || short.length > 0) && (
                      <label className="flex items-start gap-2 text-xs">
                        <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
                        <span>The GM allows it anyway. Whatever is in the hold gets spent.</span>
                      </label>
                    )}
                    <DialogFooter className="gap-2">
                      {recipe.onFailure ? (
                        <>
                          <Button variant="outline" disabled={!ready} onClick={() => craft(false)}>Check failed</Button>
                          <Button disabled={!ready} onClick={() => craft(true)}>Check succeeded</Button>
                        </>
                      ) : (
                        <Button disabled={!ready} onClick={() => craft(true)}><HammerIcon /> Craft {recipe.output * batches}×</Button>
                      )}
                    </DialogFooter>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="refine" className="grid gap-2 pt-2">
            <RefineList />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RefineList() {
  const { act, game } = useGame();
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const options = refiningOptions(game);
  return (
    <>
      <p className="text-xs text-muted-foreground">An upgraded Workshop turns lower-tier materials into higher ones. Better Workshops need fewer inputs per unit.</p>
      {options.map((o) => {
        const n = amounts[o.output] ?? 1;
        const need = o.ratio ? o.ratio * n : 0;
        const have = haveInStorage(game, o.input);
        return (
          <div key={o.output} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2">
            <div className="text-sm">
              <p className="font-medium">{o.output} <Pill className="ml-1">{o.tier}</Pill></p>
              <p className="text-xs text-muted-foreground">
                {o.ratio ? `${o.ratio} ${o.input} each · ${have} in hold` : `Needs a ${o.minLevel} or better. Rates: ${Object.entries(o.by).map(([k, v]) => `${k} ${v}:1`).join(", ")}`}
              </p>
            </div>
            {o.ratio && (
              <div className="flex items-center gap-2">
                <Stepper value={n} onChange={(v) => setAmounts({ ...amounts, [o.output]: v })} min={1} max={20} label={`${o.output} amount`} />
                <Button
                  size="sm"
                  disabled={have < need}
                  onClick={() =>
                    act(`Refine ${o.output}`, (g) => {
                      spend(g, [{ name: o.input, qty: need }]);
                      stockItem(g, o.output, n, { category: "Material", tier: o.tier });
                      return `Refined ${need} ${o.input} into ${n}× ${o.output}.`;
                    })
                  }
                >
                  Refine
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
