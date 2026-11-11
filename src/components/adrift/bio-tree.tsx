"use client";

import {
  ActivityIcon,
  BiohazardIcon,
  BoxesIcon,
  CircleCheckIcon,
  CrosshairIcon,
  DnaIcon,
  EyeIcon,
  FlameIcon,
  FootprintsIcon,
  HammerIcon,
  HeartPulseIcon,
  LeafIcon,
  LockIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  UndoIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  BIOLOGY,
  BIO_MILESTONE,
  BIO_TEMP_HP,
  BIO_TIER_LABEL,
  BIO_TREES,
  CULTIVATE_TASK,
  GRAFT_TASK,
  REGEN_CEILING,
  STRESS_GATE,
  SURGE_BY_PRESSURE,
  TIER_THREE_SURGE,
  type BioCategory,
  type BioDef,
  type BioTree,
} from "@/data/biology";
import { bioResearchBlocker, grown, isBioUnlocked } from "@/lib/biology";
import { useGame } from "@/lib/store";
import type { GameState } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { HUE, Pill, type Hue } from "./common";

/** A category's icon, which is the fastest way to find a card again by its shape. */
const CATEGORY_ICON: Record<BioCategory, LucideIcon> = {
  Regenerative: HeartPulseIcon,
  Defensive: ShieldIcon,
  Sensory: EyeIcon,
  Physical: HammerIcon,
  Ballistic: CrosshairIcon,
  Chemical: BiohazardIcon,
  Fire: FlameIcon,
  Electric: ZapIcon,
  Control: ActivityIcon,
  Symbiotic: LeafIcon,
  Environmental: BoxesIcon,
  Movement: FootprintsIcon,
  Reactive: UndoIcon,
  Utility: WrenchIcon,
};

/** The Adaptive tree is for the fight and the Utility tree is for the voyage, so they read apart at a glance. */
const TREE_HUE: Record<BioTree, Hue> = { adaptive: "rose", utility: "emerald" };

const searchable = (d: BioDef) => [d.name, ...d.categories, ...d.effects, d.expression ?? "", d.backlash ?? ""].join(" ").toLowerCase();

type Node = { def: BioDef; unlocked: boolean; locked: string | null; carriers: string[] };

function nodes(g: GameState): Node[] {
  return BIOLOGY.map((def) => ({
    def,
    unlocked: isBioUnlocked(g, def),
    locked: bioResearchBlocker(g, def),
    carriers: g.characters.filter((c) => grown(c).some((x) => x.def.key === def.key)).map((c) => c.name.split(" ")[0]),
  }));
}

function BioCard({ n, hue }: { n: Node; hue: (typeof HUE)[Hue] }) {
  const { def } = n;
  const Icon = CATEGORY_ICON[def.categories[0]];
  return (
    <div className={cn("grid content-start gap-1.5 rounded-lg border p-3", n.unlocked ? hue.node : "border-dashed bg-background/20 opacity-80")}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", hue.text)} />
        <span className="min-w-0 flex-1 font-medium">{def.name}</span>
        {n.unlocked ? <CircleCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /> : <LockIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300/80" />}
      </div>
      <div className="flex flex-wrap gap-1">
        {def.categories.map((cat) => <Pill key={cat}>{cat}</Pill>)}
        {def.bonus?.maxHp && <Pill tone="good">+{def.bonus.maxHp} Max HP</Pill>}
        {def.bonus?.maxEnergy && <Pill tone="good">+{def.bonus.maxEnergy} Max Energy</Pill>}
        {def.attack && <Pill tone="info">{def.attack.damage} {def.attack.type}, {def.attack.range}</Pill>}
      </div>
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {def.effects.map((e) => <li key={e} className="flex gap-1.5"><span className={hue.text}>•</span>{e}</li>)}
      </ul>
      {def.expression && (
        <p className="flex gap-1.5 text-xs text-amber-200/90">
          <SparklesIcon className="mt-0.5 size-3 shrink-0" />
          <span><span className="font-medium">Stress Expression:</span> {def.expression}</span>
        </p>
      )}
      {def.backlash && <p className="text-[11px] text-rose-200/80"><span className="font-medium">Backlash:</span> {def.backlash}</p>}
      {n.carriers.length > 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/80"><UsersIcon className="size-3" />{n.carriers.join(", ")}</p>
      )}
      {n.locked && <p className="text-[11px] text-amber-200/90">{n.locked}</p>}
      {def.note && <p className="text-[11px] text-amber-200/70">{def.note}</p>}
    </div>
  );
}

function TreePanel({ tree, list, isGM }: { tree: (typeof BIO_TREES)[number]; list: Node[]; isGM: boolean }) {
  const hue = HUE[TREE_HUE[tree.key]];
  const unlocked = list.filter((n) => n.unlocked).length;
  const shown = isGM ? list : list.filter((n) => n.unlocked);
  return (
    <Card className={cn("overflow-hidden py-0", hue.border)}>
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5", hue.border, hue.head)}>
        <DnaIcon className={cn("size-4", hue.text)} />
        <h3 className={cn("font-heading text-sm font-semibold tracking-wide uppercase", hue.text)}>{tree.name}</h3>
        {/* How much of a tree is left to find is the GM's to know: the size of it is a map of what's coming. */}
        {isGM && (
          <span className="ml-auto flex items-center gap-2">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-background/60">
              <span className={cn("block h-full rounded-full", hue.bar)} style={{ width: `${(unlocked / list.length) * 100}%` }} />
            </span>
            <span className="text-xs text-muted-foreground">{unlocked}/{list.length}</span>
          </span>
        )}
      </div>
      <CardContent className="px-4 pt-3 pb-4">
        <p className="mb-3 text-xs text-muted-foreground">{tree.focus}.</p>
        {([1, 2, 3] as const).map((tier) => {
          const here = shown.filter((n) => n.def.tier === tier);
          const hidden = list.filter((n) => n.def.tier === tier && !n.unlocked).length;
          if (!here.length) return null;
          return (
            <div key={tier} className="mt-3 first:mt-0">
              <div className="flex items-center gap-2">
                <span className={cn("rounded px-2 py-0.5 font-heading text-[11px] font-semibold tracking-widest uppercase", hue.band)}>{BIO_TIER_LABEL[tier]}</span>
                {tier === 3 && <span className="text-[11px] text-muted-foreground">+{TIER_THREE_SURGE.each}d6 Surge each at {STRESS_GATE.tierThree}+ Stress, up to +{TIER_THREE_SURGE.cap}d6</span>}
                <span className="h-px flex-1 bg-border" />
                {isGM && <span className="text-[11px] text-muted-foreground">{here.filter((n) => n.unlocked).length}/{here.length}</span>}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {here.map((n) => <BioCard key={n.def.key} n={n} hue={hue} />)}
              </div>
              {!isGM && hidden > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  {hidden} more {BIO_TIER_LABEL[tier]} {hidden === 1 ? "strain is" : "strains are"} growable in principle. What they are is nobody&apos;s to know until the lab grows one.
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function BioTreePanel() {
  const game = useGame((s) => s.game);
  const { isGM } = usePerms();
  const all = useMemo(() => nodes(game), [game]);
  const [q, setQ] = useState("");
  const [onlyOurs, setOnlyOurs] = useState(false);

  const needle = q.trim().toLowerCase();
  // A player searching the tree must not be able to fish for a name they haven't grown, so the
  // search runs over what they can already see rather than over the catalogue.
  const mine = isGM ? all : all.filter((n) => n.unlocked);
  const shown = mine.filter((n) => (!needle || searchable(n.def).includes(needle)) && (!onlyOurs || n.unlocked));
  const unlocked = all.filter((n) => n.unlocked).length;

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="font-heading text-lg font-semibold">Biological augmentation</h2>
            {isGM ? (
              <span className="flex items-center gap-2">
                <span className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(unlocked / all.length) * 100}%` }} />
                </span>
                <span className="text-sm text-muted-foreground">{unlocked} of {all.length} cultivated</span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{unlocked} cultivated so far</span>
            )}
            <div className="relative ml-auto min-w-52 flex-1 sm:max-w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8" placeholder={isGM ? "Search names, effects, Expressions…" : "Search what the crew has grown…"} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {isGM && (
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Checkbox checked={onlyOurs} onCheckedChange={(v) => setOnlyOurs(!!v)} />
                Only ours
              </label>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            The two trees are drawn from independently: nothing in one is a prerequisite for anything in the other, and there is no cap on how many anyone carries. {CULTIVATE_TASK} {GRAFT_TASK} Record a
            cultivation on the Ship tab; graft from a survivor&apos;s sheet on the Crew tab.
          </p>

          {!isGM && (
            <p className="text-xs text-amber-200/90">
              A strain is nothing to the crew until the lab grows it. What else the dark could be made to do isn&apos;t on this page, because nobody aboard knows yet.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Everything grown pays off under pressure. <span className="text-foreground/90">Surge Dice</span> are {SURGE_BY_PRESSURE.map((n, i) => `${n} at Pressure ${i}`).join(", ")}, plus one per
            Affliction carried, less one for every 2 Cybernetic Dampening — the one place the two paths pull against each other. A <span className="text-foreground/90">Stress Expression</span> is live at{" "}
            {STRESS_GATE.expression}+ Stress and most are paid for with a Backlash on a failed flat Constitution roll; at {STRESS_GATE.certainty}+ Stress a Surge Die counts as a 6. Every augmentation is
            worth +{BIO_TEMP_HP} Temporary HP at the start of a fight, every {BIO_MILESTONE} of them is worth +1 Maximum Energy, and regeneration never carries anyone past{" "}
            {Math.round(REGEN_CEILING * 100)}% of their Maximum HP.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><CircleCheckIcon className="size-3.5 text-emerald-400" /> Cultivated</span>
            {isGM && <span className="flex items-center gap-1.5"><LockIcon className="size-3.5 text-amber-300/80" /> Not found yet, with what it waits on</span>}
            <span className="flex items-center gap-1.5"><UsersIcon className="size-3.5" /> Who is carrying one</span>
            <span className="flex items-center gap-1.5"><SparklesIcon className="size-3.5 text-amber-200/90" /> Live at {STRESS_GATE.expression}+ Stress</span>
          </div>
        </CardContent>
      </Card>

      {BIO_TREES.map((tree) => {
        const list = shown.filter((n) => n.def.tree === tree.key);
        return list.length > 0 ? <TreePanel key={tree.key} tree={tree} list={list} isGM={isGM} /> : null;
      })}

      {shown.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {needle ? "Nothing the crew has grown matches that." : isGM ? "No augmentation matches that." : "The crew has grown nothing yet. The lab is where that changes."}
        </p>
      )}
    </div>
  );
}
