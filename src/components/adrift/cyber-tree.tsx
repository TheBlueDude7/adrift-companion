"use client";

import {
  ActivityIcon,
  AirVentIcon,
  ApertureIcon,
  AudioWaveformIcon,
  BiohazardIcon,
  BoneIcon,
  BotIcon,
  BoxesIcon,
  BrainIcon,
  CableIcon,
  CalculatorIcon,
  CircleCheckIcon,
  CircuitBoardIcon,
  CogIcon,
  CrosshairIcon,
  DatabaseIcon,
  DropletsIcon,
  EarIcon,
  EyeIcon,
  FactoryIcon,
  FastForwardIcon,
  FilterIcon,
  FlameIcon,
  FlaskConicalIcon,
  FootprintsIcon,
  FrameIcon,
  Gamepad2Icon,
  GaugeIcon,
  HammerIcon,
  HandIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  LayersIcon,
  LockIcon,
  PlugIcon,
  RadioIcon,
  RadioTowerIcon,
  ScanEyeIcon,
  SearchIcon,
  Share2Icon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShieldPlusIcon,
  SplineIcon,
  SplitIcon,
  TestTubeIcon,
  ThermometerIcon,
  UsersIcon,
  WeightIcon,
  WindIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CYBER_BY_KEY, CYBER_SYSTEMS, DAMAGE_BOOST, DAMPENING_CAP, DAMPENING_STRESS_COST, FABRICATE_TASK, IMPLANT_RECIPES, INTERFACE_MECH_ARMOR, LOAD_PER_DAMPENING, SURGERY_TASK, TIER_LABEL, type CyberDef } from "@/data/cybernetics";
import { researchTree, type TechBranch, type TechState } from "@/lib/cyber";
import type { DamageType } from "@/lib/rules";
import { recipeText } from "@/lib/stock";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ATTRIBUTE_HUE, HUE, Pill, type Hue } from "./common";
import { GlossaryText } from "./glossary";

/**
 * A system is drawn in the colour of the Attribute it raises, so Structural reads as Strength here
 * exactly as it does on a survivor's sheet. The two systems that raise no Attribute get the two hues
 * no Attribute uses.
 */
const SYSTEM_ICON: Record<CyberDef["system"], LucideIcon> = {
  structural: BoneIcon,
  sensory: EyeIcon,
  internal: HeartPulseIcon,
  neural: BrainIcon,
  interface: CableIcon,
  damage: ShieldIcon,
};

const NO_ATTR_HUE: Partial<Record<CyberDef["system"], Hue>> = { interface: "violet", damage: "orange" };

const themeOf = (system: (typeof CYBER_SYSTEMS)[number]) => HUE[system.attr ? ATTRIBUTE_HUE[system.attr] : (NO_ATTR_HUE[system.key] ?? "violet")];

type Theme = (typeof HUE)[Hue] & { icon: LucideIcon };

const DAMAGE_THEME: Record<DamageType, { icon: LucideIcon; text: string }> = {
  Ballistic: { icon: CrosshairIcon, text: "text-zinc-300" },
  Physical: { icon: HammerIcon, text: "text-stone-300" },
  Fire: { icon: FlameIcon, text: "text-orange-300" },
  Electric: { icon: ZapIcon, text: "text-sky-300" },
  Chemical: { icon: BiohazardIcon, text: "text-lime-300" },
};

/** One icon per technology, for flavour and for finding a card again by its shape. */
const ICON: Record<string, LucideIcon> = {
  "cyber-limb": HandIcon,
  "spinal-brace": SplineIcon,
  "servo-musculature": CogIcon,
  "kinetic-bracing": ShieldPlusIcon,
  "precision-actuators": CrosshairIcon,
  "locomotion-actuators": FootprintsIcon,
  "full-skeletal-lattice": FrameIcon,
  "industrial-frame": FactoryIcon,
  "cyber-eye": EyeIcon,
  "auditory-implant": EarIcon,
  "multispectrum-vision": ApertureIcon,
  "predictive-targeting": CrosshairIcon,
  "acoustic-mapping": AudioWaveformIcon,
  "communications-suite": RadioTowerIcon,
  "panoptic-sensorium": ScanEyeIcon,
  "shared-targeting-lattice": Share2Icon,
  "cyber-heart": HeartPulseIcon,
  "artificial-kidney": FilterIcon,
  "artificial-lung": WindIcon,
  "medical-regulator": ActivityIcon,
  "redundant-circulation": DropletsIcon,
  "toxin-processor": FlaskConicalIcon,
  "closed-cycle-respirator": AirVentIcon,
  "redundant-organ-network": LayersIcon,
  "autonomous-survival-core": ShieldCheckIcon,
  "neural-regulator": BrainIcon,
  "reflex-processor": ZapIcon,
  "pressure-governor": GaugeIcon,
  "mind-break-interlock": ShieldAlertIcon,
  "predictive-reflexes": FastForwardIcon,
  "memory-lattice": DatabaseIcon,
  "affective-partition": SplitIcon,
  "deterministic-cognition": CalculatorIcon,
  "data-port": PlugIcon,
  "mech-control-interface": Gamepad2Icon,
  "neural-mech-integration": CableIcon,
  "remote-systems-control": RadioIcon,
  "cybernetic-override": KeyRoundIcon,
  "distributed-control": Share2Icon,
  "total-mech-integration": BotIcon,
  "reactive-ballistic-lattice": ShieldIcon,
  "kinetic-rejection-array": ShieldPlusIcon,
  "powered-skeletal-lattice": HammerIcon,
  "inertial-dominance-frame": WeightIcon,
  "heat-exchange-network": ThermometerIcon,
  "closed-thermal-reactor": FlameIcon,
  "surge-capture-network": ZapIcon,
  "closed-circuit-nervous-system": CircuitBoardIcon,
  "closed-circulatory-processor": TestTubeIcon,
  "synthetic-metabolic-isolation": BiohazardIcon,
};

/** The widest tier in the tree, which fixes the card width for all of them. */
const COLUMNS = 5;

/** How a card relates to whichever one the reader has picked, which is what stands in for drawn edges. */
type Relation = "picked" | "needs" | "leads" | "none";

const searchable = (t: TechState) =>
  [t.def.name, t.def.damage ?? "", t.def.replacement ?? "", t.def.note ?? "", ...t.def.effects, ...(t.def.requires ?? []).map((r) => r.label)].join(" ").toLowerCase();

/**
 * The line between one tier and the next: a stub up from every card above, a rail across, and a stub
 * down to every card below. Positions come from the column count, since both rows are equal columns.
 */
function Rail({ from, to, hue }: { from: number; to: number; hue: string }) {
  const centres = (n: number) => Array.from({ length: n }, (_, i) => ((i + 0.5) / COLUMNS) * 100);
  const up = centres(from);
  const down = centres(to);
  const all = [...up, ...down];
  const left = Math.min(...all);
  // Only drawn at the width where each tier really is one row of equal columns, which is what makes
  // the stub positions arithmetic rather than measurement.
  return (
    <div className="relative hidden h-7 xl:block" aria-hidden="true">
      {up.map((x) => (
        <span key={`u${x}`} style={{ left: `${x}%` }} className={cn("absolute top-0 h-3.5 w-px", hue)} />
      ))}
      <span style={{ left: `${left}%`, width: `${Math.max(...all) - left}%` }} className={cn("absolute top-3.5 h-px", hue)} />
      {down.map((x) => (
        <span key={`d${x}`} style={{ left: `${x}%` }} className={cn("absolute top-3.5 h-3.5 w-px", hue)} />
      ))}
    </div>
  );
}

function TechCard({ t, theme, relation, dim, onPick }: { t: TechState; theme: Theme; relation: Relation; dim: boolean; onPick: () => void }) {
  const { def } = t;
  const Icon = ICON[def.key] ?? theme.icon;
  const damage = def.damage ? DAMAGE_THEME[def.damage] : null;
  return (
    <button
      type="button"
      aria-pressed={relation === "picked"}
      onClick={onPick}
      className={cn(
        "grid cursor-pointer content-start gap-1.5 rounded-lg border p-3 text-left transition-all",
        t.unlocked ? theme.node : "border-dashed border-border/70 bg-background/20 hover:border-muted-foreground/50",
        dim && "opacity-35",
        relation === "picked" && "ring-2 ring-primary",
        relation === "needs" && "ring-2 ring-emerald-400/70",
        relation === "leads" && "ring-2 ring-sky-400/70",
      )}
    >
      <span className="flex items-start gap-2">
        <Icon className={cn("mt-px size-4 shrink-0", t.unlocked ? theme.text : "text-muted-foreground")} />
        <span className="grid flex-1 gap-0.5">
          <span className={cn("leading-tight font-medium", !t.unlocked && "text-muted-foreground")}>{def.name}</span>
          {def.requires && <span className="text-[11px] text-muted-foreground">Requires {def.requires.map((r) => r.label).join(" and ")}.</span>}
        </span>
        {t.unlocked ? (
          <CircleCheckIcon className={cn("size-3.5 shrink-0", def.tier === 1 ? "text-muted-foreground/60" : "text-emerald-400")} />
        ) : (
          <LockIcon className="size-3.5 shrink-0 text-amber-300/80" />
        )}
      </span>

      <ul className="grid gap-0.5 pl-6 text-xs text-muted-foreground">
        {def.effects.map((e) => (
          <li key={e} className="flex gap-1.5">
            <span className={cn("shrink-0", theme.text)}>&bull;</span>
            <span><GlossaryText text={e} /></span>
          </li>
        ))}
      </ul>

      {def.replacement && <span className="pl-6 text-[11px] text-muted-foreground/75">As a Replacement: {def.replacement} No Enhanced abilities and no Load.</span>}
      {def.note && <span className="pl-6 text-[11px] text-amber-200/75">{def.note}</span>}

      <span className="flex flex-wrap items-center gap-1 pl-6">
        {damage && def.damage && (
          <span className={cn("flex items-center gap-1 text-[11px]", damage.text)}>
            <damage.icon className="size-3" />
            {def.damage}
          </span>
        )}
        {t.carriers.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-foreground/80">
            <UsersIcon className="size-3" />
            {t.carriers.join(", ")}
          </span>
        )}
        {t.spare > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-foreground/80">
            <BoxesIcon className="size-3" />
            {t.spare} spare
          </span>
        )}
        {!t.unlocked && <span className="text-[11px] text-amber-200/90">{t.locked}</span>}
      </span>
    </button>
  );
}

function SystemPanel({
  branch,
  rails,
  relationOf,
  dimOf,
  onPick,
}: {
  branch: TechBranch;
  rails: boolean;
  relationOf: (t: TechState) => Relation;
  dimOf: (t: TechState) => boolean;
  onPick: (key: string) => void;
}) {
  const { system } = branch;
  const theme: Theme = { ...themeOf(system), icon: SYSTEM_ICON[system.key] };
  const Icon = theme.icon;
  return (
    <Card className={cn("overflow-hidden py-0", theme.border)}>
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5", theme.border, theme.head)}>
        <Icon className={cn("size-4", theme.text)} />
        <h3 className={cn("font-heading text-sm font-semibold tracking-wide uppercase", theme.text)}>{system.name} Systems</h3>
        {system.attr && <Pill tone="muted">{system.attr}</Pill>}
        <Pill tone="muted" tip="What becomes of this system while its owner is piloting a mech.">Mech: {system.mech}</Pill>
        <span className="ml-auto flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-background/60">
            <span className={cn("block h-full rounded-full", theme.bar)} style={{ width: `${(branch.unlocked / branch.total) * 100}%` }} />
          </span>
          <span className="text-xs text-muted-foreground">{branch.unlocked}/{branch.total}</span>
        </span>
      </div>
      <CardContent className="px-4 pt-3 pb-4">
        <p className="mb-3 text-xs text-muted-foreground">{system.focus}.</p>
        {branch.tiers.map((tier, i) => (
          <div key={tier.tier}>
            {i > 0 && rails && <Rail from={branch.tiers[i - 1].techs.length} to={tier.techs.length} hue={theme.rail} />}
            {/* The rail supplies the gap where it is drawn; below that width the band needs its own. */}
            <div className={cn("flex items-center gap-2", i > 0 && (rails ? "mt-4 xl:mt-0" : "mt-4"))}>
              <span className={cn("rounded px-2 py-0.5 font-heading text-[11px] font-semibold tracking-widest uppercase", theme.band)}>{TIER_LABEL[tier.tier]}</span>
              {system.attr && <span className="text-[11px] text-muted-foreground">+{tier.attrBonus} {system.attr}</span>}
              {/* Interface raises no Attribute; what it raises is the frame the pilot is plugged into. */}
              {system.key === "interface" && <span className="text-[11px] text-muted-foreground">+{INTERFACE_MECH_ARMOR[tier.tier]} mech Armor</span>}
              {system.key === "damage" && <span className="text-[11px] text-muted-foreground">+{Math.round(DAMAGE_BOOST[tier.tier] * 100)}% damage</span>}
              <span className="text-[11px] text-muted-foreground">Load {tier.load}</span>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">{tier.techs.filter((t) => t.unlocked).length}/{tier.techs.length}</span>
            </div>
            <div
              className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3 xl:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
              style={{ "--cols": COLUMNS } as CSSProperties}
            >
              {tier.techs.map((t) => (
                <TechCard key={t.def.key} t={t} theme={theme} relation={relationOf(t)} dim={dimOf(t)} onPick={() => onPick(t.def.key)} />
              ))}
            </div>
          </div>
        ))}
        {system.key === "interface" && (
          <p className="mt-3 text-xs text-muted-foreground">
            The one branch built around no Attribute, because what it improves isn&apos;t the body: a mech its owner is piloting gains that much Maximum HP, and only the best Interface system they
            carry counts. It shows on the frame itself over on the Mechs tab.
          </p>
        )}
        {system.key === "damage" && (
          <p className="mt-3 text-xs text-muted-foreground">
            No Tier I: a Damage system is already specialised work. Each damage type is its own system for Load, so two Tier II systems cost 4 between them, not 2. The damage bonus is a
            share of the hit as it stands, rounded up, so it never adds less than 1 and never stops mattering.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function CyberTreePanel() {
  const game = useGame((s) => s.game);
  const branches = useMemo(() => researchTree(game), [game]);
  const [q, setQ] = useState("");
  const [onlyOurs, setOnlyOurs] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const filtering = needle.length > 0 || onlyOurs;
  const all = useMemo(() => branches.flatMap((b) => b.tiers.flatMap((t) => t.techs)), [branches]);
  const pickedTech = all.find((t) => t.def.key === picked) ?? null;

  const shown = useMemo(
    () =>
      branches
        .map((b) => ({
          ...b,
          tiers: b.tiers
            .map((t) => ({ ...t, techs: t.techs.filter((x) => (!needle || searchable(x).includes(needle)) && (!onlyOurs || x.unlocked)) }))
            .filter((t) => t.techs.length > 0),
        }))
        .filter((b) => b.tiers.length > 0),
    [branches, needle, onlyOurs],
  );

  const total = all.length;
  const unlocked = all.filter((t) => t.unlocked).length;

  const relationOf = (t: TechState): Relation => {
    if (!pickedTech) return "none";
    if (t.def.key === pickedTech.def.key) return "picked";
    if (pickedTech.needs.includes(t.def.key)) return "needs";
    if (pickedTech.leadsTo.includes(t.def.key)) return "leads";
    return "none";
  };
  const dimOf = (t: TechState) => !!pickedTech && relationOf(t) === "none";

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="font-heading text-lg font-semibold">Cybernetic research</h2>
            <span className="flex items-center gap-2">
              <span className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(unlocked / total) * 100}%` }} />
              </span>
              <span className="text-sm text-muted-foreground">{unlocked} of {total} researched</span>
            </span>
            <div className="relative ml-auto min-w-52 flex-1 sm:max-w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8" placeholder="Search names, effects, prerequisites…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Checkbox checked={onlyOurs} onCheckedChange={(v) => setOnlyOurs(!!v)} />
              Only ours
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Tier I is every crew&apos;s from the start. Tier II and III are unlocked by Cybernetic Research projects and belong to the whole crew once found, so anyone eligible can receive one and it
            can be fabricated again and again. Record a discovery on the Ship tab; install from a survivor&apos;s sheet on the Crew tab.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><CircleCheckIcon className="size-3.5 text-emerald-400" /> Researched</span>
            <span className="flex items-center gap-1.5"><CircleCheckIcon className="size-3.5 text-muted-foreground/60" /> Standard, no research needed</span>
            <span className="flex items-center gap-1.5"><LockIcon className="size-3.5 text-amber-300/80" /> Locked, with what it waits on</span>
            <span className="flex items-center gap-1.5"><UsersIcon className="size-3.5" /> Who is carrying one</span>
            <span className="flex items-center gap-1.5"><BoxesIcon className="size-3.5" /> Finished ones in the hold</span>
          </div>

          {pickedTech ? (
            <div className="grid gap-1.5 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{pickedTech.def.name}</span>
                <Pill tone="info">{TIER_LABEL[pickedTech.def.tier]}</Pill>
                {pickedTech.needs.length > 0 && <Pill tone="good">Builds on what&apos;s ringed green</Pill>}
                {pickedTech.leadsTo.length > 0 && <Pill tone="info">Leads to what&apos;s ringed blue</Pill>}
                <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setPicked(null)}>Clear</button>
              </span>
              <span className="text-xs text-muted-foreground">
                Fabricate: {FABRICATE_TASK[pickedTech.def.tier]}, from {recipeText(IMPLANT_RECIPES[pickedTech.def.tier])}. Install: {SURGERY_TASK[pickedTech.def.tier]}.
              </span>
              {pickedTech.needs.length > 0 && (
                <span className="text-xs text-muted-foreground">Builds on {pickedTech.needs.map((k) => CYBER_BY_KEY[k]?.name ?? k).join(", ")}.</span>
              )}
              {pickedTech.leadsTo.length > 0 && (
                <span className="text-xs text-muted-foreground">Leads to {pickedTech.leadsTo.map((k) => CYBER_BY_KEY[k]?.name ?? k).join(", ")}.</span>
              )}
              {pickedTech.locked && <span className="text-xs text-amber-200/90">{pickedTech.locked}.</span>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pick any technology to see what it builds on and what builds on it. Load is the highest Tier installed in each system, added together, and every{" "}
              {LOAD_PER_DAMPENING} of it is a point of Dampening up to {DAMPENING_CAP} — which is a Tier III system in all six branches. Dampening is a pool each Scene: a point holds off a
              level of Pressure, {DAMPENING_STRESS_COST} hold off a point of Stress.
            </p>
          )}
        </CardContent>
      </Card>

      {shown.map((b) => (
        <SystemPanel key={b.system.key} branch={b} rails={!filtering} relationOf={relationOf} dimOf={dimOf} onPick={(k) => setPicked(picked === k ? null : k)} />
      ))}

      {shown.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {onlyOurs && needle ? "Nothing the crew has researched matches that." : onlyOurs ? "The crew has researched nothing above Tier I yet." : "No technology matches that."}
        </p>
      )}
    </div>
  );
}
