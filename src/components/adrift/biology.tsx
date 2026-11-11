"use client";

import { DnaIcon, FlaskConicalIcon, MoreHorizontalIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BIO_MILESTONE,
  BIO_TEMP_HP,
  BIO_TIER_LABEL,
  BIO_TREES,
  CULTIVATE_TASK,
  GRAFT_TASK,
  STRESS_GATE,
  type BioDef,
  type BioTier,
  type BioTree,
} from "@/data/biology";
import { bioDef } from "@/lib/bio-catalogue";
import {
  bioTempHp,
  bioTierReady,
  certaintyLive,
  expressionsLive,
  grown,
  growBlocker,
  hasBiologicalLab,
  isBioUnlocked,
  milestones,
  surgePool,
} from "@/lib/biology";
import { useGame } from "@/lib/store";
import { installBySurgery } from "@/lib/surgery";
import type { Character, GameState } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { EmptyState, Pill } from "./common";

const char = (g: GameState, id: string) => g.characters.find((c) => c.id === id)!;

/** What a project could still turn up in a tree, so the table has something to roll on. */
export const cultivateCandidates = (g: GameState, catalogue: BioDef[], tree: BioTree, tier: BioTier) =>
  catalogue.filter((d) => d.tree === tree && d.tier === tier && !isBioUnlocked(g, d));

function GrownRow({ x, c }: { x: ReturnType<typeof grown>[number]; c: Character }) {
  const act = useGame((s) => s.act);
  const { inst, def } = x;
  const live = expressionsLive(c);

  return (
    <div className="grid gap-1.5 rounded-lg border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{def.name}</span>
        <Pill tone="info">{BIO_TIER_LABEL[def.tier]}</Pill>
        <Pill>{def.tree === "adaptive" ? "Adaptive" : "Utility"}</Pill>
        {def.categories.map((cat) => <Pill key={cat}>{cat}</Pill>)}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`${def.name} actions`}><MoreHorizontalIcon /></Button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem variant="destructive" onClick={() => act("Remove augmentation", (g) => {
              const who = char(g, c.id);
              who.biology = (who.biology ?? []).filter((i) => i.id !== inst.id);
              return `${who.name}'s ${def.name} is cut out. Grown tissue doesn't go back in the hold.`;
            })}>
              Excise augmentation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {def.effects.map((e) => <li key={e} className="flex gap-1.5"><span className="text-primary/70">•</span>{e}</li>)}
        {inst.choice && <li className="text-foreground/80">Choice: {inst.choice}</li>}
      </ul>
      {def.expression && (
        <p className={cn("flex gap-1.5 text-xs", live ? "text-amber-200" : "text-muted-foreground/70")}>
          <SparklesIcon className="mt-0.5 size-3 shrink-0" />
          <span><span className="font-medium">Stress Expression{live ? "" : ` (needs ${STRESS_GATE.expression} Stress)`}:</span> {def.expression}</span>
        </p>
      )}
      {def.backlash && <p className="text-[11px] text-rose-200/80"><span className="font-medium">Backlash:</span> {def.backlash}</p>}
      {def.note && <p className="text-[11px] text-amber-200/70">{def.note}</p>}
    </div>
  );
}

export function BiologyPanel({ c }: { c: Character }) {
  const list = grown(c);
  const pool = surgePool(c);
  const milestone = milestones(c);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={pool.dice ? "good" : "muted"} tip={pool.parts.join(", ") || "Pressure, Afflictions and Tier III augmentations under Stress all feed the pool."}>
          {pool.dice} Surge {pool.dice === 1 ? "Die" : "Dice"}
        </Pill>
        <Pill tone={expressionsLive(c) ? "warn" : "muted"}>Expressions {expressionsLive(c) ? "live" : `at ${STRESS_GATE.expression} Stress`}</Pill>
        {certaintyLive(c) && <Pill tone="warn" tip={`At ${STRESS_GATE.certainty}+ Stress one Surge Die counts as a 6 without rolling.`}>Certainty</Pill>}
        {list.length > 0 && <Pill tone="info">+{bioTempHp(c)} Temp HP per fight</Pill>}
        {c.tempHp ? <Pill tone="good">{c.tempHp} Temporary HP now</Pill> : null}
        {milestone > 0 && <Pill tone="good">+{milestone} Max Energy</Pill>}
        <div className="ml-auto"><GraftDialog c={c} /></div>
      </div>
      {pool.parts.length > 0 && <p className="text-xs text-muted-foreground">Surge pool: {pool.parts.join(", ")}.</p>}
      {list.length === 0 ? (
        <EmptyState title="Nothing grown" body="The lab finds a strain before anyone can carry it. Grafting one is Surgery in a Medical Bay, and it takes hold over a full Rest." />
      ) : (
        <div className="grid gap-2">{list.map((x) => <GrownRow key={x.inst.id} x={x} c={c} />)}</div>
      )}
      {list.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Every {BIO_MILESTONE} augmentations is worth +1 Maximum Energy, and each one is worth +{BIO_TEMP_HP} Temporary HP when a fight starts. There is no cap on how many anyone carries.
        </p>
      )}
    </div>
  );
}

function GraftDialog({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const catalogue = useGame((s) => s.bioCatalogue);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<BioTree>("adaptive");
  const [key, setKey] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const { isGM } = usePerms();

  const def = key ? bioDef(key) : null;
  // A player's catalogue is already only what the lab has grown, so this filter is the GM's own view
  // being narrowed rather than a secret being kept — the secret was kept before it reached them.
  const defs = catalogue.filter((d) => d.tree === tree && (isGM || isBioUnlocked(game, d)));
  const blocker = def ? growBlocker(game, c, def) : null;
  const force = isGM && !!blocker;

  function graft() {
    if (!def) return;
    act(`Graft ${def.name}`, (g) => {
      const out: string[] = [];
      installBySurgery(g, char(g, c.id), { kind: "bio", key: def.key, choice }, out, { forcedBy: blocker ?? undefined });
      out.push("Recorded by the GM rather than performed as a Surgery.");
      return out;
    });
    setOpen(false);
  }

  if (!isGM) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setKey(null); }}>
      <DialogTrigger render={<Button size="sm" variant="outline"><DnaIcon /> Graft augmentation (GM)</Button>} />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Graft an augmentation without a Surgery</DialogTitle>
          <DialogDescription>The crew graft by planning a Surgery, which spends a segment and can fail. This writes one straight onto the sheet instead. Only what the lab has grown can be grafted, at any tier, and a cultivation belongs to the whole crew once it exists. Nobody has a limit on how many they carry.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {BIO_TREES.map((t) => (
            <Button key={t.key} size="xs" variant={tree === t.key ? "default" : "outline"} onClick={() => { setTree(t.key); setKey(null); }}>{t.name}</Button>
          ))}
        </div>
        <div className="grid min-h-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ScrollArea className="h-56 pr-3 sm:h-96">
            <div className="grid gap-1">
              {defs.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nothing in this tree has been grown yet. Run a Biological Cultivation project in the lab to find out what can be.
                </p>
              )}
              {defs.map((d) => {
                const why = growBlocker(game, c, d);
                return (
                  <button
                    key={d.key}
                    onClick={() => { setKey(d.key); setChoice(""); }}
                    className={cn("grid gap-0.5 rounded-md border px-3 py-2 text-left hover:border-primary/50", key === d.key ? "border-primary bg-primary/10" : "bg-background/40", why && "opacity-70")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Pill tone={isBioUnlocked(game, d) ? "info" : "muted"}>{BIO_TIER_LABEL[d.tier]}</Pill>
                    </span>
                    <span className={cn("text-[11px]", why ? "text-muted-foreground" : "text-emerald-300")}>{why ?? "Ready to graft"}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="grid content-start gap-3 rounded-lg border bg-muted/20 p-3">
            {!def ? (
              <p className="text-sm text-muted-foreground">{BIO_TREES.find((t) => t.key === tree)!.focus}. Pick one to see what it does.</p>
            ) : (
              <>
                <div>
                  <p className="font-medium">{def.name}</p>
                  <p className="text-[11px] text-muted-foreground">{def.categories.join(", ")}</p>
                  <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                    {def.effects.map((e) => <li key={e}>• {e}</li>)}
                  </ul>
                  {def.expression && <p className="mt-1.5 text-xs text-amber-200/90">Stress Expression: {def.expression}</p>}
                  {def.backlash && <p className="mt-1 text-xs text-rose-200/80">Backlash: {def.backlash}</p>}
                  {def.note && <p className="mt-1 text-xs text-amber-200/70">{def.note}</p>}
                </div>
                {force && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-100">{blocker}. As GM you can force the graft anyway.</p>}
                {blocker && !force ? (
                  <p className="rounded-md bg-rose-500/10 p-2 text-xs text-rose-200">{blocker}.{blocker.startsWith("Needs") && " Record the cultivation under Biological research on the Ship tab."}</p>
                ) : (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="bio-choice">Choices made as it grows</Label>
                      <Input id="bio-choice" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder="Which organs, which damage type, which condition…" className="h-8" />
                      <p className="text-[11px] text-muted-foreground">Some are tuned as they take hold, like which three organ Injuries a Redundant Organ Cluster covers.</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{GRAFT_TASK}</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!def || (!!blocker && !force)} onClick={graft}>{force ? "Force graft" : "Graft"} {def?.name ?? "augmentation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordCultivationDialog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const catalogue = useGame((s) => s.bioCatalogue);
  const [tier, setTier] = useState<BioTier>(1);
  const [tree, setTree] = useState<BioTree>("adaptive");
  const candidates = useMemo(() => cultivateCandidates(game, catalogue, tree, tier), [game, catalogue, tree, tier]);
  const gated = !bioTierReady(game, tree, tier);
  const treeName = BIO_TREES.find((t) => t.key === tree)!.name;

  function record(d: BioDef) {
    act("Record cultivation", (g) => {
      g.research.biology = [...(g.research.biology ?? []), d.key];
      return `🧬 Biological cultivation succeeds: ${d.name} (${BIO_TIER_LABEL[d.tier]} ${treeName}) can now be grafted into anyone aboard.`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><FlaskConicalIcon /> Record cultivation</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete a cultivation project</DialogTitle>
          <DialogDescription>Choose the tier and tree you cultivated, roll at the table, and pick the matching result. What the crew already has is left out, so reroll anything that isn&apos;t listed.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Select value={String(tier)} onValueChange={(v) => setTier(Number(v) as BioTier)}>
            <SelectTrigger className="w-full"><SelectValue>{BIO_TIER_LABEL[tier]}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="1">Tier I</SelectItem><SelectItem value="2">Tier II</SelectItem><SelectItem value="3">Tier III</SelectItem></SelectContent>
          </Select>
          <Select value={tree} onValueChange={(v) => setTree(v as BioTree)}>
            <SelectTrigger className="w-full"><SelectValue>{treeName}</SelectValue></SelectTrigger>
            <SelectContent>{BIO_TREES.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {gated ? (
          <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-100">{BIO_TIER_LABEL[tier]} {treeName} cultivation needs two {BIO_TIER_LABEL[(tier - 1) as BioTier]} {treeName} augmentations grown first.</p>
        ) : candidates.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Everything in this tree and tier is already cultivated.</p>
        ) : (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Roll 1d{candidates.length} (or any die, rerolling blanks):</p>
            <ScrollArea className="max-h-72 pr-3">
              <div className="grid gap-1">
                {candidates.map((d, i) => (
                  <button key={d.key} onClick={() => record(d)} className="flex items-center gap-3 rounded-md border bg-background/40 px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-sm">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-medium">{d.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{d.effects[0]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function BioResearchCard() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const cultivated = (game.research.biology ?? []).map((k) => bioDef(k)).filter(Boolean);
  const lab = hasBiologicalLab(game);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DnaIcon className="size-4 text-primary" /> Biological research</CardTitle>
        <CardDescription>Cultivation is crew-wide and has nothing to do with what the crew fought: an augmentation grown in the lab can be grafted into anyone aboard, as often as they can stand the surgery. The whole of both trees is on the Biology tab.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!lab && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-100">No Biological Lab aboard. The lab is needed for Biological Cultivation and for extracting Research Traits. Build one from the Ship tab.</p>}
        <p className="text-xs text-muted-foreground">{CULTIVATE_TASK}</p>
        {/* The roll table is the list of what hasn't been found, which is the one thing players mustn't read. */}
        {isGM && <div className="flex flex-wrap gap-1.5"><RecordCultivationDialog /></div>}
        <div className="grid gap-2 sm:grid-cols-2">
          {BIO_TREES.map((t) => {
            const mine = cultivated.filter((d) => d.tree === t.key);
            return (
              <div key={t.key} className="rounded-lg border bg-background/40 p-2.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.name}</p>
                {mine.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground/70">Tier I only</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {mine.map((d) => (
                      <span key={d.key} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
                        {d.name}
                        <span className="text-muted-foreground">{d.tier === 3 ? "III" : "II"}</span>
                        <button
                          aria-label={`Forget ${d.name}`}
                          className="text-muted-foreground/60 hover:text-rose-300"
                          onClick={() => act("Forget cultivation", (g) => { g.research.biology = (g.research.biology ?? []).filter((k) => k !== d.key); return `${d.name} is removed from the crew's cultivations.`; })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
