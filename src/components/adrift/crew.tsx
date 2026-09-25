"use client";

import { BedIcon, BrainIcon, DicesIcon, PlusIcon, ShieldIcon, SkullIcon, Trash2Icon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  attributeValue,
  characterAlerts,
  creationSpend,
  carrySlots,
  maxEnergy,
  maxHp,
  maxWillpower,
  skillLevel,
  poolFor,
  usedSlots,
  wornArmor,
} from "@/lib/derive";
import { changePressure, changeStress, clampVitals, findChar, gainXp, mindBreak, rest } from "@/lib/mechanics";
import {
  ATTRIBUTES,
  ATTRIBUTE_NAMES,
  BACKGROUNDS,
  BACKGROUND_BY_KEY,
  CREATION_ATTRIBUTE_POINTS,
  CREATION_SKILL_XP,
  FREQUENCY_LABEL,
  INJURY_SEVERITIES,
  INJURY_STATES,
  MAX_SKILL_LEVEL,
  PRESSURE_STATES,
  pressureTip,
  SKILLS,
  stressBand,
  xpForNextLevel,
  type Attribute,
  type InjurySeverity,
  type InjuryState,
} from "@/lib/rules";
import { newCharacter, sampleCrew } from "@/lib/seed";
import { useGame } from "@/lib/store";
import type { Character, FoodIntake, GameState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CompendiumPicker, DamageDialog } from "./character-dialogs";
import { CommitInput } from "./commit-input";
import { READ_ONLY, usePerms } from "@/lib/use-perms";
import { claimCharacter } from "@/lib/sync/client";
import { toast } from "sonner";
import { ApplyConditionDialog, ConditionChips, conditionTip, QuickConditions, SceneControls } from "./conditions";
import { EmptyState, Meter, Pill, SectionTitle, StatBlock, Stepper, Tip } from "./common";
import { DiceRoller } from "./dice-roller";
import { AddItemDialog, ItemList } from "./inventory";
import { CyberneticsPanel } from "./cybernetics";
import { ContingencyPanel, SharedPoolPanel } from "./quartermaster";

type Edit = (label: string, fn: (c: Character, g: GameState) => void | string | string[], kind?: "info" | "danger") => void;

function useEditCharacter(id: string): Edit {
  const act = useGame((s) => s.act);
  return (label, fn, kind) =>
    act(label, (g) => {
      const c = findChar(g, id);
      const r = fn(c, g);
      clampVitals(c);
      return r;
    }, kind);
}

export function NewCharacterDialog({ onCreated }: { onCreated?: (id: string) => void }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [player, setPlayer] = useState("");
  const [bg, setBg] = useState<string>(BACKGROUNDS[0].key);
  const [spec, setSpec] = useState<string>(BACKGROUNDS[0].specialties[0].name);
  const background = BACKGROUND_BY_KEY[bg];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><UserPlusIcon /> New survivor</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New survivor</DialogTitle>
          <DialogDescription>Every human starts with 8 HP, 3 Energy, 1 Willpower, and 1 in each attribute — then spends 6 attribute points and 45 skill XP.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nc-name">Character name</Label>
              <Input id="nc-name" autoFocus placeholder="e.g. Mara Kestrel" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nc-player">Player</Label>
              <Input id="nc-player" placeholder="optional" value={player} onChange={(e) => setPlayer(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Background</Label>
            <Select value={bg} onValueChange={(v) => { setBg(v as string); setSpec(BACKGROUND_BY_KEY[v as string].specialties[0].name); }}>
              <SelectTrigger className="w-full"><SelectValue>{background.name}</SelectValue></SelectTrigger>
              <SelectContent>{BACKGROUNDS.map((b) => <SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground italic">{background.tagline}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-xs">
            <p><span className="text-muted-foreground">Attributes:</span> {Object.entries(background.attributes).map(([k, v]) => `+${v} ${k}`).join(", ")}</p>
            <p><span className="text-muted-foreground">Skills:</span> {Object.entries(background.skills).map(([k, v]) => `${SKILLS.find((s) => s.key === k)!.name} +${v}`).join(", ")}</p>
            <p className="mt-1.5"><span className="font-medium text-primary">{background.signature.name}</span> — {background.signature.summary}</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Background Specialty</Label>
            <div className="grid gap-1.5">
              {background.specialties.map((s) => (
                <button key={s.name} onClick={() => setSpec(s.name)} className={cn("rounded-lg border p-2.5 text-left text-xs transition-colors", spec === s.name ? "border-primary bg-primary/10" : "hover:bg-muted/40")}>
                  <span className="text-sm font-medium">{s.name}</span> <span className="text-muted-foreground">· {FREQUENCY_LABEL[s.frequency]}</span>
                  <p className="mt-0.5 text-muted-foreground">{s.summary}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const c = newCharacter(name.trim(), bg, spec, player.trim());
              act("New survivor", (g) => {
                g.characters.push(c);
                return `${c.name} (${background.name}) joins the crew.`;
              });
              onCreated?.(c.id);
              setOpen(false);
              setName("");
              setPlayer("");
            }}
          >
            Create survivor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrewListCard({ c, selected, onSelect }: { c: Character; selected: boolean; onSelect: () => void }) {
  const game = useGame((s) => s.game);
  const alerts = characterAlerts(game, c);
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  return (
    <button onClick={onSelect} className={cn("w-full rounded-xl border p-3 text-left transition-colors", selected ? "border-primary/60 bg-primary/5" : "bg-card hover:bg-muted/40", c.dead && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{bg?.name ?? "No background"}{c.player && ` · ${c.player}`}</p>
        </div>
        <Pill tone={c.pressure >= 3 ? "danger" : c.pressure >= 1 ? "warn" : "muted"} tip={pressureTip(c.pressure)}>{PRESSURE_STATES[c.pressure].name}</Pill>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
        <div><span className="tabular">HP {c.hp}/{maxHp(c)}</span><Meter value={c.hp} max={maxHp(c)} tone="hp" className="mt-1 h-1.5" /></div>
        <div><span className="tabular">EN {c.energy}/{maxEnergy(c)}</span><Meter value={c.energy} max={maxEnergy(c)} tone="energy" className="mt-1 h-1.5" /></div>
        <div><span className="tabular">Stress {c.stress}</span><Meter value={c.stress} max={10} tone="stress" className="mt-1 h-1.5" /></div>
      </div>
      {alerts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {alerts.map((a) => <Pill key={a.text} tone={a.tone} tip={a.tip}>{a.text}</Pill>)}
        </div>
      )}
      {c.conditions.length > 0 && (
        <p className="mt-2 truncate text-[11px] text-amber-200/80">
          {c.conditions.map((k, i) => (
            <span key={k.id}>
              {i > 0 && " · "}
              <Tip content={conditionTip(k.name)}><span className="cursor-help">{k.name}</span></Tip>
            </span>
          ))}
        </p>
      )}
    </button>
  );
}

function Vitals({ c, edit }: { c: Character; edit: Edit }) {
  const band = stressBand(c.stress);
  const { isGM } = usePerms();
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatBlock label="HP" value={c.hp} max={maxHp(c)} tone="hp" onChange={(v) => edit(`${c.name} HP → ${v}`, (x) => { x.hp = v; return `${x.name} HP set to ${v}.`; })} />
        <StatBlock
          label="Energy"
          value={c.energy}
          max={maxEnergy(c)}
          limit={isGM ? maxEnergy(c) : c.energy}
          tone="energy"
          onChange={(v) => edit(`${c.name} Energy → ${v}`, (x) => { const diff = v - x.energy; x.energy = v; return `${x.name} ${diff < 0 ? "spends" : "regains"} ${Math.abs(diff)} Energy (${v}/${maxEnergy(x)}).`; })}
          extra={c.survival.energyPenalty > 0 ? <span className="text-[11px] text-amber-300">−{c.survival.energyPenalty} max today</span> : c.energy === 0 ? <span className="text-[11px] text-amber-300">Exhausted</span> : undefined}
        />
        <StatBlock label="Willpower" value={c.willpower} max={maxWillpower(c)} tone="willpower" onChange={(v) => edit(`${c.name} Willpower → ${v}`, (x) => { x.willpower = v; return `${x.name} Willpower set to ${v}.`; })} />
      </div>

      <div className="rounded-lg border bg-background/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pressure</span>
          <div className="flex gap-1">
            <Button size="xs" variant="outline" onClick={() => edit(`${c.name} −Pressure`, (x, g) => { const o: string[] = []; changePressure(g, x, -1, o); return o; })}>− Reduce</Button>
            <Button size="xs" variant="outline" onClick={() => edit(`${c.name} +Pressure`, (x, g) => { const o: string[] = []; changePressure(g, x, 1, o); return o; }, "danger")}>+ Gain</Button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {PRESSURE_STATES.map((p, i) => (
            <Tip key={p.name} content={pressureTip(i)}>
            <button
              onClick={() => edit(`${c.name} Pressure → ${p.name}`, (x) => { x.pressure = i; return `${x.name}'s Pressure set to ${p.name}.`; })}
              className={cn(
                "rounded-md border px-1 py-1.5 text-center text-[11px] font-medium transition-colors sm:text-xs",
                c.pressure === i ? (i >= 3 ? "border-rose-400 bg-rose-500/20 text-rose-200" : i >= 1 ? "border-amber-300 bg-amber-400/15 text-amber-200" : "border-emerald-400 bg-emerald-500/15 text-emerald-200") : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              {p.name}
              <span className="block font-mono text-[10px] opacity-70">+{p.dice}d6</span>
            </button>
            </Tip>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">On a failed roll: {PRESSURE_STATES[c.pressure].failure}</p>
      </div>

      <div className="rounded-lg border bg-background/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Stress · <Tip content={`${band.name} (Stress ${band.min === band.max ? band.min : `${band.min}–${band.max}`}): ${band.effect}`}><span className="cursor-help text-orange-300 normal-case underline decoration-dotted underline-offset-2">{band.name}</span></Tip></span>
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="outline" onClick={() => edit(`${c.name} −Stress`, (x) => { const o: string[] = []; changeStress(x, -1, o); return o; })}>− Recover</Button>
            <Button size="xs" variant="outline" onClick={() => edit(`${c.name} +Stress`, (x) => { const o: string[] = []; changeStress(x, 1, o); return o; }, "danger")}>+ Gain</Button>
            <Button size="xs" variant="outline" disabled={c.willpower <= 0 || c.stress <= 0} onClick={() => edit(`${c.name} Willpower prevents Stress`, (x) => { x.willpower -= 1; x.stress -= 1; return `${x.name} spends 1 Willpower to prevent 1 Stress.`; })}>Prevent with WP</Button>
            <Button size="xs" variant="outline" onClick={() => edit(`${c.name} Mind Break`, (x) => mindBreak(x), "danger")}><BrainIcon /> Mind Break</Button>
          </div>
        </div>
        <Meter value={c.stress} max={10} tone="stress" segmented />
        <p className="mt-2 text-xs text-muted-foreground">{band.effect}</p>
      </div>
    </div>
  );
}

const ATTRIBUTE_TONE: Record<Attribute, { card: string; text: string; badge: string; group: string }> = {
  STR: { card: "border-rose-500/40 bg-rose-500/10", text: "text-rose-300", badge: "bg-rose-500/20 text-rose-200", group: "border-t-rose-500/70" },
  CON: { card: "border-amber-400/40 bg-amber-400/10", text: "text-amber-300", badge: "bg-amber-400/20 text-amber-200", group: "border-t-amber-400/70" },
  INT: { card: "border-sky-500/40 bg-sky-500/10", text: "text-sky-300", badge: "bg-sky-500/20 text-sky-200", group: "border-t-sky-500/70" },
  WIT: { card: "border-emerald-500/40 bg-emerald-500/10", text: "text-emerald-300", badge: "bg-emerald-500/20 text-emerald-200", group: "border-t-emerald-500/70" },
};

function Attributes({ c, edit }: { c: Character; edit: Edit }) {
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  const spend = creationSpend(c);
  return (
    <div>
      <SectionTitle action={<span className={cn("text-xs", spend.attrPoints > CREATION_ATTRIBUTE_POINTS ? "text-amber-300" : "text-muted-foreground")}>{spend.attrPoints}/{CREATION_ATTRIBUTE_POINTS} creation points</span>}>Attributes</SectionTitle>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {ATTRIBUTES.map((a) => {
          const bonus = bg?.attributes[a] ?? 0;
          const mod = c.attributeMods[a];
          return (
            <div key={a} className={cn("rounded-lg border p-3", ATTRIBUTE_TONE[a].card)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className={cn("rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider", ATTRIBUTE_TONE[a].badge)}>{a}</span>
                  <p className="mt-1.5 truncate text-sm font-medium">{ATTRIBUTE_NAMES[a]}</p>
                </div>
                <span className={cn("font-mono text-4xl font-bold", ATTRIBUTE_TONE[a].text)}>{attributeValue(c, a)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <Stepper value={c.attributes[a]} min={1} max={10} size="xs" label={`${a} base`} onChange={(v) => edit(`${c.name} ${a} → ${v}`, (x) => { x.attributes[a] = v; return `${x.name}'s base ${ATTRIBUTE_NAMES[a]} set to ${v}.`; })} />
                <span className="text-[11px] text-muted-foreground">{bonus ? `+${bonus} bg` : ""}{mod ? ` ${mod > 0 ? "+" : ""}${mod} mod` : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Modifiers (injuries, cybernetics, augmentations)</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ATTRIBUTES.map((a) => (
            <div key={a} className="flex items-center justify-between gap-1">
              <span>{a}</span>
              <Stepper value={c.attributeMods[a]} min={-5} max={5} size="xs" label={`${a} modifier`} onChange={(v) => edit(`${c.name} ${a} mod`, (x) => { x.attributeMods[a] = v; })} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-1"><span>Max HP</span><Stepper value={c.maxHpMod} min={-10} max={10} size="xs" onChange={(v) => edit(`${c.name} max HP mod`, (x) => { x.maxHpMod = v; })} /></div>
          <div className="flex items-center justify-between gap-1"><span>Max EN</span><Stepper value={c.maxEnergyMod} min={-5} max={5} size="xs" onChange={(v) => edit(`${c.name} max Energy mod`, (x) => { x.maxEnergyMod = v; })} /></div>
          <div className="flex items-center justify-between gap-1"><span>Max WP</span><Stepper value={c.maxWillpowerMod} min={-3} max={3} size="xs" onChange={(v) => edit(`${c.name} max WP mod`, (x) => { x.maxWillpowerMod = v; })} /></div>
        </div>
      </details>
    </div>
  );
}

function Skills({ c, edit }: { c: Character; edit: Edit }) {
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  const spend = creationSpend(c);
  const groups = (["STR", "INT", "WIT"] as const).map((a) => ({ attr: a, skills: SKILLS.filter((s) => s.attr === a) }));
  return (
    <div>
      <SectionTitle action={<span className={cn("text-xs", spend.skillXp > CREATION_SKILL_XP ? "text-amber-300" : "text-muted-foreground")}>{spend.skillXp}/{CREATION_SKILL_XP} creation XP</span>}>Skills</SectionTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))] gap-3">
        {groups.map((grp) => (
          <div key={grp.attr} className={cn("rounded-lg border border-t-2 bg-background/40 p-2", ATTRIBUTE_TONE[grp.attr].group)}>
            <p className={cn("px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase", ATTRIBUTE_TONE[grp.attr].text)}>{ATTRIBUTE_NAMES[grp.attr]} · {attributeValue(c, grp.attr)}</p>
            <div className="grid">
              {grp.skills.map((s) => {
                const lvl = skillLevel(c, s.key);
                const bonus = bg?.skills[s.key] ?? 0;
                const need = xpForNextLevel(lvl);
                const xp = c.skillXp[s.key];
                return (
                  <div key={s.key} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/30">
                    <DiceRoller character={c} initialSkill={s.key} trigger={<Button size="icon-xs" variant="ghost" aria-label={`Roll ${s.name}`}><DicesIcon /></Button>} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{s.name}</p>
                      {lvl < MAX_SKILL_LEVEL && (
                        <div className="flex items-center gap-1.5">
                          <Meter value={xp} max={need} tone="progress" className="h-1" />
                          <span className="tabular shrink-0 text-[10px] text-muted-foreground">{xp}/{need} xp</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-[11px] text-teal-300"
                      disabled={lvl >= MAX_SKILL_LEVEL}
                      onClick={() =>
                        edit(`${c.name} +1 XP ${s.name}`, (x) => gainXp(x, s.key))
                      }
                    >
                      +xp
                    </Button>
                    <Stepper value={c.skills[s.key]} min={0} max={MAX_SKILL_LEVEL - bonus} size="xs" label={s.name} onChange={(v) => edit(`${c.name} ${s.name} → ${v + bonus}`, (x) => { x.skills[s.key] = v; })} />
                    <span className={cn("tabular w-6 text-right font-mono text-sm font-semibold", lvl === 0 && "text-muted-foreground")} title={bonus ? `${c.skills[s.key]} trained + ${bonus} background` : undefined}>
                      {lvl}
                      {bonus > 0 && <sup className="text-[9px] text-primary">+</sup>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Abilities({ c, edit }: { c: Character; edit: Edit }) {
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  if (!bg) return null;
  const list = [{ ...bg.signature, kind: "Signature Trait" }, ...bg.specialties.filter((s) => s.name === c.specialty).map((s) => ({ ...s, kind: "Specialty" }))];
  const disabled = c.afflictions.some((a) => a.name === "Identity Erosion");
  return (
    <div>
      <SectionTitle>Background abilities{disabled && <Pill tone="danger" className="ml-2 normal-case" tip="Identity Erosion disables the Background ability until the affliction is cured. Passive Attribute and Skill benefits remain.">Disabled by Identity Erosion</Pill>}</SectionTitle>
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((a) => {
          const key = `${a.frequency}:${a.name}`;
          const used = !!c.abilityUsed[key];
          return (
            <div key={a.name} className={cn("rounded-lg border bg-background/40 p-3", used && "opacity-60", disabled && "opacity-40")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">{a.kind} · {FREQUENCY_LABEL[a.frequency]}</p>
                </div>
                {a.frequency !== "passive" && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={used} onCheckedChange={(v) => edit(`${c.name} ${a.name} ${v ? "used" : "ready"}`, (x) => { if (v) x.abilityUsed[key] = true; else delete x.abilityUsed[key]; return v ? `${x.name} uses ${a.name}.` : `${x.name}'s ${a.name} is ready again.`; })} />
                    Used
                  </label>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{a.summary}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Injuries({ c, edit }: { c: Character; edit: Edit }) {
  return (
    <div>
      <SectionTitle action={<CompendiumPicker character={c} kind="injury" />}>Injuries</SectionTitle>
      {c.injuries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No injuries. Enjoy it while it lasts.</p>
      ) : (
        <div className="grid gap-2">
          {c.injuries.map((inj) => (
            <div key={inj.id} className={cn("rounded-lg border bg-background/40 p-3", inj.state === "Untreated" && "border-rose-500/30")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{inj.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{inj.code}</span>
                <span className="text-xs text-muted-foreground">· day {inj.dayReceived}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Select value={inj.severity} onValueChange={(v) => edit(`${inj.name} severity`, (x) => { x.injuries.find((i) => i.id === inj.id)!.severity = v as InjurySeverity; return `${x.name}'s ${inj.name} is now ${v}.`; })}>
                    <SelectTrigger size="sm" className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{INJURY_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={inj.state} onValueChange={(v) => edit(`${inj.name} ${v}`, (x) => { x.injuries.find((i) => i.id === inj.id)!.state = v as InjuryState; return `${x.name}'s ${inj.name} is now ${v}.`; })}>
                    <SelectTrigger size="sm" className={cn("w-28", inj.state === "Untreated" && "text-rose-300")}><SelectValue /></SelectTrigger>
                    <SelectContent>{INJURY_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="icon-sm" variant="ghost" aria-label="Heal injury" onClick={() => edit(`Heal ${inj.name}`, (x) => { x.injuries = x.injuries.filter((i) => i.id !== inj.id); return `${x.name}'s ${inj.name} has healed.`; })}><XIcon /></Button>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{inj.effect}</p>
              {inj.notes && <p className="mt-1 text-xs text-amber-300">{inj.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Afflictions({ c, edit }: { c: Character; edit: Edit }) {
  return (
    <div>
      <SectionTitle action={<CompendiumPicker character={c} kind="affliction" />}>Afflictions</SectionTitle>
      {c.afflictions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Mind intact — for now.</p>
      ) : (
        <div className="grid gap-2">
          {c.afflictions.map((a) => (
            <div key={a.id} className="rounded-lg border border-violet-400/25 bg-violet-500/5 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Cure affliction" onClick={() => edit(`Cure ${a.name}`, (x) => { x.afflictions = x.afflictions.filter((i) => i.id !== a.id); return `${x.name} is cured of ${a.name}.`; })}><XIcon /></Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{a.effect}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Conditions({ c }: { c: Character }) {
  return (
    <div>
      <SectionTitle action={<ApplyConditionDialog targets={[c.id]} trigger={<Button size="xs" variant="outline"><PlusIcon /> More…</Button>} />}>
        Conditions
      </SectionTitle>
      <div className="grid gap-3">
        {c.conditions.length === 0 ? <p className="text-sm text-muted-foreground">No active conditions.</p> : <ConditionChips c={c} />}
        <div>
          <p className="mb-1.5 text-[11px] text-muted-foreground">Quick toggle</p>
          <QuickConditions c={c} />
        </div>
      </div>
    </div>
  );
}

function Survival({ c, edit }: { c: Character; edit: Edit }) {
  const s = c.survival;
  const foods: { v: FoodIntake; label: string }[] = [
    { v: "none", label: "None" },
    { v: "half", label: "Half" },
    { v: "full", label: "Full" },
  ];
  return (
    <div>
      <SectionTitle>Today&apos;s survival</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-background/40 p-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Food eaten</p>
          <div className="grid grid-cols-3 gap-1">
            {foods.map((f) => (
              <button key={f.v} onClick={() => edit(`${c.name} food: ${f.label}`, (x) => { x.survival.food = f.v; return `${x.name} ${f.v === "none" ? "hasn't eaten" : f.v === "half" ? "eats half a ration" : "eats a full ration"}.`; })} className={cn("rounded-md border py-1 text-xs", s.food === f.v ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between rounded-lg border bg-background/40 p-3 text-sm">
          <span className="text-xs text-muted-foreground">Water drunk</span>
          <Checkbox checked={s.water} onCheckedChange={(v) => edit(`${c.name} water`, (x) => { x.survival.water = !!v; return v ? `${x.name} drinks their Water.` : undefined; })} />
        </label>
        <div className="flex items-center justify-between rounded-lg border bg-background/40 p-3">
          <span className="text-xs text-muted-foreground">Rests today</span>
          <span className="font-mono">{s.rests}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.foodMissStreak > 0 && <Pill tone="warn" tip={s.foodMissStreak === 1 ? "Missed Food yesterday: −1 Max Energy today. A second day in a row costs 2 Max Energy and stops Rest restoring Energy; a third adds 1 Stress." : `Missed Food ${s.foodMissStreak} days running: −2 Max Energy and Rest restores no Energy.${s.foodMissStreak >= 3 ? " Each further day adds 1 Stress." : " A third day adds 1 Stress."}`}>Missed food {s.foodMissStreak}d</Pill>}
        {s.waterMissStreak > 0 && <Pill tone="danger" tip={s.waterMissStreak === 1 ? "Missed Water: −2 Max Energy. A second day without Water means death without immediate intervention." : "Two or more days without Water: death without immediate intervention."}>Missed water {s.waterMissStreak}d</Pill>}
        {s.sleepMissStreak > 0 && <Pill tone="warn" tip={s.sleepMissStreak === 1 ? "Missed sleep: −1 Max Energy the next day. A second night costs 3 Max Energy." : s.sleepMissStreak === 2 ? "Missed sleep twice: −3 Max Energy. A third night means collapsing for 2 segments of Rest and 1 Stress." : "Collapsed from sleep deprivation: must Rest for 2 segments and gains 1 Stress each night without sleep."}>Missed sleep {s.sleepMissStreak}d</Pill>}
        {s.rationStreak > 0 && <Pill tone="info" tip="Eating half rations. Each day needs a Constitution roll or −1 Max Energy, and every second day in a row adds 1 Stress (Ration Discipline skips both).">Rationing {s.rationStreak}d</Pill>}
        {s.restBlocked && <Pill tone="danger" tip="From missing Food two or more days running. Resting still heals 1 HP but gives no Energy until they eat a full ration.">Rest restores no Energy</Pill>}
      </div>
    </div>
  );
}

function SheetOwner({ c }: { c: Character }) {
  const perms = usePerms();
  const player = perms.playerOf(c.id);
  if (perms.isGM)
    return <p className="text-xs text-muted-foreground">{player ? `Played by ${player.name}.` : "No player has claimed this character yet."} As GM you can edit every sheet.</p>;
  if (perms.myCharacterId === c.id) return <p className="text-xs text-emerald-300">This is your character.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <span className="flex-1">{player ? `${player.name} plays ${c.name}. Only they or the GM can edit this sheet.` : `Nobody plays ${c.name} yet, so only the GM can edit this sheet.`}</span>
      {!player && perms.myCharacterId === null && !c.dead && (
        <Button size="sm" onClick={() => claimCharacter(c.id).then(() => toast.success(`You now play ${c.name}`)).catch((e: Error) => toast.error(e.message))}>
          Play as {c.name.split(" ")[0]}
        </Button>
      )}
    </div>
  );
}

function CharacterSheet({ c, onDeleted }: { c: Character; onDeleted: () => void }) {
  const edit = useEditCharacter(c.id);
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  const slots = carrySlots(game, c);
  const used = usedSlots(game, c.id);
  const perms = usePerms();
  const canEdit = perms.canEditCharacter(c.id);

  return (
    <div className="grid gap-5">
      {perms.shared && <SheetOwner c={c} />}
      <fieldset disabled={!canEdit} className={cn("grid min-w-0 gap-5", !canEdit && READ_ONLY)}>
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="grid w-full min-w-0 gap-2 md:flex-1">
              <CommitInput aria-label="Character name" value={c.name} onCommit={(v) => edit("Rename", (x) => { x.name = v || x.name; })} className="h-auto border-transparent bg-transparent px-0 text-2xl font-semibold dark:bg-transparent" />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={c.background ?? "none"} onValueChange={(v) => edit(`${c.name} background`, (x) => { x.background = v === "none" ? null : (v as string); x.specialty = v === "none" ? null : BACKGROUND_BY_KEY[v as string].specialties[0].name; })}>
                  <SelectTrigger size="sm"><SelectValue>{bg?.name ?? "No background"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No background</SelectItem>
                    {BACKGROUNDS.map((b) => <SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {bg && (
                  <Select value={c.specialty ?? ""} onValueChange={(v) => edit(`${c.name} specialty`, (x) => { x.specialty = v as string; })}>
                    <SelectTrigger size="sm"><SelectValue>{c.specialty ?? "Specialty"}</SelectValue></SelectTrigger>
                    <SelectContent>{bg.specialties.map((s) => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                <CommitInput aria-label="Player" placeholder="Player" value={c.player} onCommit={(v) => edit("Player", (x) => { x.player = v; })} className="h-7 w-32 text-xs" />
                {c.dead && <Pill tone="danger" tip="This survivor has died. They take no tasks and are skipped at End of Day."><SkullIcon className="size-3" /> Dead</Pill>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <DiceRoller character={c} />
              <DamageDialog character={c} />
              {perms.isGM && <Button size="sm" variant="outline" onClick={() => edit(`${c.name} rests`, (x, g) => { const o: string[] = []; rest(g, x, o); return o; })}><BedIcon /> Rest</Button>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Vitals c={c} edit={edit} />
        </CardContent>
      </Card>

      <Card><CardContent className="grid gap-6"><Attributes c={c} edit={edit} /><Skills c={c} edit={edit} /></CardContent></Card>

      <Card><CardContent className="grid gap-6"><Survival c={c} edit={edit} /><Conditions c={c} /><Abilities c={c} edit={edit} /></CardContent></Card>

      <Card><CardContent className="grid gap-6 lg:grid-cols-2"><Injuries c={c} edit={edit} /><Afflictions c={c} edit={edit} /></CardContent></Card>

      <Card>
        <CardContent>
          <SectionTitle>Cybernetics</SectionTitle>
          <CyberneticsPanel c={c} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <SectionTitle action={<AddItemDialog location={c.id} />}>
            Inventory · <span className={cn("normal-case", used > slots ? "text-rose-300" : "text-foreground")}>{used}/{slots} slots</span>
          </SectionTitle>
          <div className="mb-3 flex items-center gap-3">
            <Meter value={used} max={slots} tone={used > slots ? "hp" : "good"} segmented className="flex-1" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Worn Armor (ablative)">
              <ShieldIcon className="size-3.5" /> Armor
              <Stepper value={c.armor} min={0} max={20} size="xs" label="armor" onChange={(v) => edit(`${c.name} Armor → ${v}`, (x) => { x.armor = v; })} />
            </div>
          </div>
          {used > slots && <p className="mb-2 text-xs text-rose-300">Over capacity — {c.name} is carrying more than they can manage.</p>}
          {(() => {
            const worn = wornArmor(game, c.id);
            return (
              <p className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs">
                <ShieldIcon className="size-3.5 text-sky-300" />
                <span className="text-muted-foreground">Armor Slot:</span>
                {worn ? (
                  <>
                    <span className="font-medium">{worn.name}</span>
                    {worn.armor ? <Pill tone="info">+{worn.armor} Armor</Pill> : null}
                    {worn.broken && <Pill tone="danger">Broken</Pill>}
                  </>
                ) : (
                  <span className="text-muted-foreground">empty. Carried armor or a space suit goes here and takes no inventory slot.</span>
                )}
              </p>
            );
          })()}
          <ItemList location={c.id} personal />
          <div className="mt-3 grid gap-3 empty:hidden">
            <ContingencyPanel c={c} />
            <SharedPoolPanel c={c} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Slots = Strength + ⅓ Scavenging (rounded down){poolFor(game, c.id) ? ", minus one given to the shared pool" : ""}. Every item takes one slot, except the armor worn in the Armor Slot.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <SectionTitle>Notes</SectionTitle>
          <CommitInput multiline aria-label="Notes" placeholder="Origin, motivation, bonds, secrets, cybernetics…" value={c.notes} onCommit={(v) => edit(`${c.name} notes`, (x) => { x.notes = v; })} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => edit(c.dead ? "Revive" : "Mark dead", (x) => { x.dead = !x.dead; return x.dead ? `${x.name} is dead.` : `${x.name} is alive again.`; }, "danger")}>
              <SkullIcon /> {c.dead ? "Mark alive" : "Mark dead"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="destructive"><Trash2Icon /> Remove from crew</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                  <AlertDialogDescription>Their carried items move to ship storage. You can undo this from the header.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      act("Remove survivor", (g) => {
                        for (const i of g.items) if (i.location === c.id) i.location = "ship";
                        g.characters = g.characters.filter((x) => x.id !== c.id);
                        return `${c.name} was removed from the crew.`;
                      });
                      onDeleted();
                    }}
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
      </fieldset>
    </div>
  );
}

export function CrewTab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const characters = useGame((s) => s.game.characters);
  const act = useGame((s) => s.act);
  const perms = usePerms();
  const canCreate = perms.isGM || perms.myCharacterId === null;
  const selected = characters.find((c) => c.id === selectedId) ?? characters.find((c) => c.id === perms.myCharacterId) ?? characters[0];

  if (characters.length === 0)
    return (
      <EmptyState
        title="No survivors aboard"
        body="Create a character for each player, or load a sample crew to explore the tracker."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {canCreate && <NewCharacterDialog onCreated={onSelect} />}
            {perms.isGM && <Button size="sm" variant="outline" onClick={() => act("Sample crew", (g) => { g.characters.push(...sampleCrew()); return "A sample crew of three wakes up aboard the derelict."; })}>
              <UsersIcon /> Load sample crew
            </Button>}
          </div>
        }
      />
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="grid content-start gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Crew · {characters.filter((c) => !c.dead).length} alive</h2>
          {canCreate && <NewCharacterDialog onCreated={onSelect} />}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible">
          {characters.map((c) => (
            <div key={c.id} className="min-w-64 lg:min-w-0">
              <CrewListCard c={c} selected={c.id === selected?.id} onSelect={() => onSelect(c.id)} />
            </div>
          ))}
        </div>
        {perms.isGM && (
          <div className="mt-1 rounded-xl border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Scene tracking</p>
            <SceneControls />
          </div>
        )}
      </aside>
      {selected && <CharacterSheet key={selected.id} c={selected} onDeleted={() => onSelect(null)} />}
    </div>
  );
}

