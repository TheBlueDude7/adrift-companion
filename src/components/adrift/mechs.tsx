"use client";

import { AlertTriangleIcon, BotIcon, BatteryIcon, CheckIcon, HandIcon, HeartCrackIcon, PlusIcon, RocketIcon, Trash2Icon, UndoIcon, WrenchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CHASSIS,
  MECH_COMPLICATIONS,
  MECH_CONDITIONS,
  MECH_DAMAGE_TYPES,
  MECH_REPAIR_RECIPES,
  MECH_TIERS,
  MECH_MODULES,
  MODULE_CATEGORIES,
  MODULE_CRAFT_TASK,
  MODULE_RECIPES,
  moduleItemName,
  type MechModule,
  type ModuleCategory,
} from "@/data/mechs";
import { TIER_LABEL } from "@/data/cybernetics";
import { uid } from "@/lib/dice";
import { applyDamage, damageSteps } from "@/lib/mechanics";
import { burnMechCells, cellList, mechCells } from "@/lib/power";
import { mechCapacity, mechModules, mechStats, moduleBlocker, newMech, resolveMechDamage } from "@/lib/mechs";
import { haveInStorage, recipeText, shortfalls, spend, stockItem, takeOne } from "@/lib/stock";
import { useGame } from "@/lib/store";
import type { GameState, Mech, MechChassis, MechDamageType } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { EMPTY_ROLL, InjuryRollFields, parseRoll, type RollDraft } from "./character-dialogs";
import { CommitInput } from "./commit-input";
import { EmptyState, Meter, Pill, SectionTitle, Stepper } from "./common";

const cellWord = (tier: 1 | 2 | 3, n: number) => `${n} ${tier === 1 ? "power" : tier === 2 ? "Tier II+" : "Advanced"} cell${n === 1 ? "" : "s"}`;
const findMech = (g: GameState, id: string) => g.mechs.find((m) => m.id === id)!;
const tierName = (t: 1 | 2 | 3) => TIER_LABEL[t];

/** The frame's built-in Resistance picks: distinct types, filled with unused ones. */
function fillPicks(resist: MechDamageType[], count: number) {
  const chosen = [...new Set(resist)];
  const spare = MECH_DAMAGE_TYPES.filter((t) => !chosen.includes(t));
  return [...chosen, ...spare].slice(0, count);
}

function ResistPicker({ tier, value, onChange }: { tier: 1 | 2 | 3; value: MechDamageType[]; onChange: (v: MechDamageType[]) => void }) {
  const picks = MECH_TIERS[tier].resistPicks;
  if (picks === 0) return <p className="text-xs text-muted-foreground">Tier I frames have no built-in Resistance.</p>;
  return (
    <div className="grid gap-1.5">
      <Label>{tier === 2 ? "Resistance to one damage type" : "Resistance to two different damage types"}</Label>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: picks }, (_, i) => (
          <Select key={i} value={value[i] ?? "Physical"} onValueChange={(v) => { const next = [...value]; next[i] = v as MechDamageType; onChange(next.slice(0, picks)); }}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{MECH_DAMAGE_TYPES.map((t) => <SelectItem key={t} value={t} disabled={value.some((v, j) => j !== i && v === t)}>{t}</SelectItem>)}</SelectContent>
          </Select>
        ))}
      </div>
    </div>
  );
}

/** A GM adds a finished frame; a player asks the GM to. */
function addMech(g: GameState, m: Mech) {
  const cap = mechCapacity(g);
  if (cap.used >= cap.capacity) m.external = true;
  g.mechs.push(m);
  return `🤖 ${m.name} (${tierName(m.tier)} ${CHASSIS[m.chassis].name}) is assembled${m.external ? " and secured outside the hull: no berth is free" : " in a mech berth"}.`;
}

function MechRequests() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM, myCharacterId } = usePerms();
  const requests = game.mechRequests ?? [];
  if (!requests.length) return null;
  const who = (id: string) => game.characters.find((c) => c.id === id)?.name ?? "Someone";
  const answer = (id: string, allow: boolean | null) =>
    act(allow ? "Allow mech" : allow === false ? "Refuse mech" : "Withdraw mech request", (g) => {
      const r = (g.mechRequests ?? []).find((x) => x.id === id);
      g.mechRequests = (g.mechRequests ?? []).filter((x) => x.id !== id);
      if (!r) return "";
      if (allow) return [`The GM allows ${who(r.by)}'s ${r.mech.name}.`, addMech(g, r.mech)];
      return allow === false ? `The GM refuses ${who(r.by)}'s request for ${r.mech.name}.` : `${who(r.by)} withdraws their request for ${r.mech.name}.`;
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HandIcon className="size-4" /> Mech requests</CardTitle>
        <CardDescription>Players have asked to add these frames. They don&apos;t exist until the GM allows them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/40 p-2.5 text-sm">
            <span className="font-medium">{r.mech.name}</span>
            <Pill tone="info">{tierName(r.mech.tier)} {CHASSIS[r.mech.chassis].name}</Pill>
            <span className="text-xs text-muted-foreground">asked by {who(r.by)}</span>
            <span className="ml-auto flex gap-1.5">
              {isGM ? (
                <>
                  <Button size="xs" variant="outline" onClick={() => answer(r.id, false)}><XIcon /> Refuse</Button>
                  <Button size="xs" onClick={() => answer(r.id, true)}><CheckIcon /> Allow</Button>
                </>
              ) : r.by === myCharacterId ? (
                <>
                  <span className="self-center text-[11px] text-muted-foreground">Waiting for the GM</span>
                  <Button size="xs" variant="ghost" onClick={() => answer(r.id, null)}>Withdraw</Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Waiting for the GM</span>
              )}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NewMechDialog() {
  const act = useGame((s) => s.act);
  const { isGM, myCharacterId } = usePerms();
  const { capacity, used } = mechCapacity(useGame((s) => s.game));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [chassis, setChassis] = useState<MechChassis>("utility");
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [resist, setResist] = useState<MechDamageType[]>([]);
  const c = CHASSIS[chassis];
  const t = MECH_TIERS[tier];
  const picks = fillPicks(resist, t.resistPicks);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setName(""); setResist([]); } }}>
      <DialogTrigger render={<Button size="sm"><PlusIcon /> Add mech</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a finished mech frame</DialogTitle>
          <DialogDescription>Frames are built as Projects on the Ship tab. When one completes, record it here. It starts at full HP with no optional modules.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mech-name">Name</Label>
            <Input id="mech-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${c.name} ${tier === 1 ? "I" : tier === 2 ? "II" : "III"}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label>Chassis</Label>
              <Select value={chassis} onValueChange={(v) => setChassis(v as MechChassis)}>
                <SelectTrigger className="w-full"><SelectValue>{c.name}</SelectValue></SelectTrigger>
                <SelectContent>{(Object.keys(CHASSIS) as MechChassis[]).map((k) => <SelectItem key={k} value={k}>{CHASSIS[k].name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tier</Label>
              <Select value={String(tier)} onValueChange={(v) => setTier(Number(v) as 1 | 2 | 3)}>
                <SelectTrigger className="w-full"><SelectValue>{tierName(tier)}</SelectValue></SelectTrigger>
                <SelectContent>{([1, 2, 3] as const).map((n) => <SelectItem key={n} value={String(n)}>{tierName(n)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center text-xs">
            <div><p className="font-mono text-lg">{c.hp + t.hpBonus}</p><p className="text-muted-foreground">Mech HP</p></div>
            <div><p className="font-mono text-lg">{t.slots}</p><p className="text-muted-foreground">Module Slots</p></div>
            <div><p className="font-mono text-lg">{c.hardpoints}</p><p className="text-muted-foreground">Hardpoints</p></div>
            <div><p className="font-mono text-lg">{t.frame}</p><p className="text-muted-foreground">Frame STR/CON</p></div>
            <div><p className="font-mono text-lg">+{c.inventory}</p><p className="text-muted-foreground">Inventory</p></div>
            <div><p className="font-mono text-lg">{t.cells}</p><p className="text-muted-foreground">Cells / deploy</p></div>
          </div>
          <p className="text-xs text-muted-foreground"><b className="text-foreground">{c.ability}.</b> {c.abilityText.join(" ")} Noise: {c.noise}.</p>
          <ResistPicker tier={tier} value={picks} onChange={setResist} />
          {used >= capacity && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-100">Every mech berth is taken ({used}/{capacity}). The new frame will have to be secured outside the hull.</p>}
        </div>
        <DialogFooter className="gap-2 sm:items-center">
          {!isGM && <span className="text-xs text-muted-foreground sm:mr-auto">Only the GM adds mechs. Your request waits for their answer.</span>}
          <Button
            disabled={!isGM && !myCharacterId}
            onClick={() => {
              const m = newMech(name.trim() || `${c.name} ${tier === 1 ? "I" : tier === 2 ? "II" : "III"}`, chassis, tier, picks);
              if (isGM) act("Add mech", (g) => addMech(g, m));
              else
                act("Ask for a mech", (g) => {
                  (g.mechRequests ??= []).push({ id: uid(), by: myCharacterId!, mech: m });
                  const who = g.characters.find((x) => x.id === myCharacterId)?.name ?? "A player";
                  return `${who} asks the GM to add ${m.name} (${tierName(tier)} ${c.name}).`;
                });
              setOpen(false);
            }}
          >
            {isGM ? `Add ${tierName(tier)} ${c.name}` : <><HandIcon /> Ask the GM to add it</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MechDamageDialog({ mech }: { mech: Mech }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(3);
  const [type, setType] = useState<MechDamageType | "Other">("Physical");
  const [cover, setCover] = useState(0);
  const [vulnerable, setVulnerable] = useState(false);
  const [roll, setRoll] = useState<RollDraft>(EMPTY_ROLL);
  const [injury, setInjury] = useState(false);
  const r = resolveMechDamage(game, mech, amount, type, cover, vulnerable);
  const stats = mechStats(game, mech);
  const pilot = game.characters.find((c) => c.id === mech.pilotId && mech.deployed);
  const injuryRoll = parseRoll(roll);
  const breaks = mech.hp > 0 && r.toMech >= mech.hp;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setRoll(EMPTY_ROLL); setInjury(false); setVulnerable(false); } }}>
      <DialogTrigger render={<Button size="xs" variant="destructive"><HeartCrackIcon /> Damage</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Damage {mech.name}</DialogTitle>
          <DialogDescription>Vulnerability, then Resistance, then Cover (Ballistic only), then Armor, which absorbs 1 and loses a point of plating. What the mech can&apos;t absorb at 0 HP passes to the pilot.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center justify-between"><Label>Incoming damage</Label><Stepper value={amount} onChange={setAmount} min={1} max={30} label="damage" /></div>
          <div className="flex items-center justify-between gap-2">
            <Label>Damage type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MechDamageType | "Other")}>
              <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{[...MECH_DAMAGE_TYPES, "Other" as const].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={vulnerable} onCheckedChange={(v) => setVulnerable(!!v)} /> Vulnerable to this damage (+half)</label>
          <div className="flex items-center justify-between"><Label>Cover (Ballistic only)</Label><Stepper value={cover} onChange={setCover} min={0} max={10} size="xs" label="cover" /></div>
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            {r.vulnerable > 0 && <p>Vulnerability adds {r.vulnerable}.</p>}
            {r.resisted > 0 && <p>Resistance halves it, stopping {r.resisted}.</p>}
            {r.resisted === 0 && r.vulnerable === 0 && vulnerable && type !== "Other" && stats.resist[type] > 0 && <p>Resistance and Vulnerability cancel out.</p>}
            {r.covered > 0 && <p>Cover stops {r.covered}.</p>}
            {r.armored > 0 && <p>Armor stops 1 (plating {stats.armor} → {stats.armor - 1}).</p>}
            {r.armored === 0 && stats.maxArmor > 0 && stats.armor === 0 && <p className="text-amber-200">The plating is spent: no Armor left to absorb a hit.</p>}
            <p>The mech takes <b>{r.toMech}</b>{mech.hp > 0 ? ` (HP ${mech.hp} → ${mech.hp - r.toMech})` : " (already Offline)"}.</p>
            {r.excess > 0 && <p className="text-rose-200">{r.excess} passes through to {pilot ? pilot.name : "the pilot"}.</p>}
            {breaks && <p className="mt-1 text-xs text-amber-200">The mech goes Offline. Consider a complication: {MECH_COMPLICATIONS.slice(0, 3).join(" ")}</p>}
          </div>
          {r.excess > 0 && pilot && (
            <>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={injury} onCheckedChange={(v) => setInjury(!!v)} /> {pilot.name} suffers an Injury (3+ HP from one hit, or dropped to 0)</label>
              {injury && <InjuryRollFields value={roll} onChange={setRoll} character={pilot} />}
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={injury && !injuryRoll}
            onClick={() => {
              act(`Damage ${mech.name}`, (g) => {
                const m = findMech(g, mech.id);
                const out: string[] = [];
                const res = resolveMechDamage(g, m, amount, type, cover, vulnerable);
                const wasUp = m.hp > 0;
                m.hp -= res.toMech;
                if (res.armored) m.armor = Math.max(0, mechStats(g, m).armor - res.armored);
                const absorbed = [res.vulnerable && `+${res.vulnerable} Vulnerability`, res.resisted && `${res.resisted} resisted`, res.covered && `${res.covered} Cover`, res.armored && `1 Armor, plating down to ${m.armor}`].filter(Boolean).join(", ");
                out.push(`${m.name} takes ${res.toMech} ${type === "Other" ? "" : `${type} `}damage${absorbed ? ` (${absorbed})` : ""}. Mech HP ${m.hp}/${mechStats(g, m).maxHp}.`);
                if (wasUp && m.hp <= 0) out.push(`⚠ ${m.name} goes Offline: no Frame Attributes, powered modules, or mounted weapons. The pilot stays inside until they exit (a Slow Action in combat).`);
                const p = g.characters.find((c) => c.id === m.pilotId && m.deployed);
                if (res.excess > 0 && p) applyDamage(g, p, { amount: res.excess, useArmor: true, pierce: 0, gainPressure: damageSteps(p, { amount: res.excess, useArmor: true, pierce: 0 }).lost >= 2, injury: injury ? injuryRoll : null }, out);
                else if (res.excess > 0) out.push(`${res.excess} damage passes through the frame.`);
                return out;
              }, "danger");
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepairDialog({ mech }: { mech: Mech }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(false);
  const s = mechStats(game, mech);
  const cap = field ? Math.ceil(s.maxHp / 2) : s.maxHp;
  const gain = Math.max(0, Math.min(2, cap - mech.hp));
  const recipe = MECH_REPAIR_RECIPES[mech.tier];
  const short = shortfalls(game, recipe, field ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline"><WrenchIcon /> Repair</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Repair {mech.name}</DialogTitle>
          <DialogDescription>Mechanical Technician (Routine 3) or Engineering (Routine 4), 2 Energy, one segment, at a Workshop or mech berth. Restores 2 Mech HP.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={field} onCheckedChange={(v) => setField(!!v)} />
          <span>Field repair during an expedition<span className="block text-xs text-muted-foreground">Skilled or Crisis. Can&apos;t raise the mech above half its Maximum HP ({Math.ceil(s.maxHp / 2)}).</span></span>
        </label>
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p>Restores <b>{gain}</b> HP ({mech.hp} → {mech.hp + gain}).</p>
          <p className={cn("text-xs", short.length ? "text-rose-300" : "text-muted-foreground")}>
            Spends {recipeText(recipe, field ? 1 : 0)}{short.length ? `. Missing ${short.map((x) => x.name).join(", ")}.` : "."}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Repairing HP doesn&apos;t remove conditions.</p>
        </div>
        <DialogFooter>
          <Button
            disabled={gain === 0 || short.length > 0}
            onClick={() => {
              act(`Repair ${mech.name}`, (g) => {
                const m = findMech(g, mech.id);
                spend(g, recipe, field ? 1 : 0);
                m.hp += gain;
                return `${m.name} is repaired for ${gain} HP (${m.hp}/${mechStats(g, m).maxHp}), using ${recipeText(recipe, field ? 1 : 0)}.`;
              });
              setOpen(false);
            }}
          >
            {gain === 0 ? (field ? "At the field-repair limit" : "Already at full HP") : `Repair ${gain} HP`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ModuleSource = "storage" | "craft" | "untracked";

function AddModuleDialog({ mech }: { mech: Mech }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ModuleCategory | "all">("all");
  const [source, setSource] = useState<ModuleSource>("craft");
  const [expedition, setExpedition] = useState(false);
  const s = mechStats(game, mech);
  const list = MECH_MODULES.filter((m) => category === "all" || m.category === category);

  function install(def: MechModule, from: ModuleSource) {
    act(`Install ${def.name}`, (g) => {
      const m = findMech(g, mech.id);
      if (from === "storage") takeOne(g, moduleItemName(def));
      if (from === "craft") spend(g, MODULE_RECIPES[def.tier], 1);
      m.modules.push({ id: uid(), key: def.key, damaged: false });
      // New plating comes fitted, so its points are live rather than starting spent.
      if (def.armor) m.armor = mechStats(g, m).armor + def.armor;
      const how = from === "storage" ? " from the hold" : from === "craft" ? `, crafted from ${recipeText(MODULE_RECIPES[def.tier], 1)}` : "";
      return `${def.name} is installed on ${m.name}${how}.${expedition ? " (Expedition install: one Expedition Turn and 2 Energy.)" : ""}`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline"><PlusIcon /> Module</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Install a module on {mech.name}</DialogTitle>
          <DialogDescription>
            {s.usedSlots}/{s.slots} Module Slots and {s.usedHardpoints}/{s.hardpoints} Hardpoints used. {tierName(mech.tier)} frames take Tier {mech.tier === 1 ? "I" : mech.tier === 2 ? "I–II" : "I–III"} modules. Safe shipboard installs cost 1 Energy and no roll.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={category} onValueChange={(v) => setCategory(v as ModuleCategory | "all")}>
            <SelectTrigger size="sm" className="w-44"><SelectValue>{category === "all" ? "All modules" : category}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {MODULE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={(v) => setSource(v as ModuleSource)}>
            <SelectTrigger size="sm" className="w-56"><SelectValue>{source === "craft" ? "Craft it from ship storage" : source === "storage" ? "Use a module from the hold" : "Don't track materials"}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="craft">Craft it from ship storage</SelectItem>
              <SelectItem value="storage">Use a module from the hold</SelectItem>
              <SelectItem value="untracked">Don&apos;t track materials</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={expedition} onCheckedChange={(v) => setExpedition(!!v)} /> During an expedition</label>
        </div>
        {expedition && <p className="text-xs text-amber-200/90">Expedition installs take one Expedition Turn and 2 Energy, need a Toolkit, and are Skilled Mechanical Technician or Engineering Tasks at −3d6 without a berth or portable Workshop.</p>}
        <ScrollArea className="h-[55vh] pr-3">
          <div className="grid gap-1.5">
            {list.map((def) => {
              const why = moduleBlocker(game, mech, def);
              const stored = haveInStorage(game, moduleItemName(def));
              const short = shortfalls(game, MODULE_RECIPES[def.tier], 1);
              const missing = source === "storage" ? (stored === 0 ? "None in the hold" : null) : source === "craft" && short.length ? `Missing ${short.map((x) => x.name).join(", ")}` : null;
              return (
                <div key={def.key} className={cn("grid gap-1 rounded-md border bg-background/40 p-2.5", why && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{def.name}</span>
                    <Pill tone="info">{tierName(def.tier)}</Pill>
                    <Pill>{def.slots} slot{def.slots === 1 ? "" : "s"}</Pill>
                    {def.weapon && <Pill tone="warn">{def.weapon} · Hardpoint</Pill>}
                    {stored > 0 && <Pill tone="good">{stored} in hold</Pill>}
                    <Button size="xs" className="ml-auto" disabled={!!why || !!missing} onClick={() => install(def, source)}>{why ?? missing ?? "Install"}</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{def.effect}</p>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <p className="text-[11px] text-muted-foreground">Crafting a module: {recipeText(MODULE_RECIPES[1], 1)} (Tier I) · {recipeText(MODULE_RECIPES[2], 1)} (Tier II) · {recipeText(MODULE_RECIPES[3], 1)} (Tier III). {MODULE_CRAFT_TASK[mech.tier]}.</p>
      </DialogContent>
    </Dialog>
  );
}

function TierUpgradeDialog({ mech }: { mech: Mech }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const next = (mech.tier + 1) as 2 | 3;
  const [resist, setResist] = useState<MechDamageType[]>(mech.tierResist);
  const picks = fillPicks(resist, MECH_TIERS[next]?.resistPicks ?? 0);
  if (mech.tier === 3) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setResist(mech.tierResist); }}>
      <DialogTrigger render={<Button size="xs" variant="outline">{mech.upgrading ? `Finish Tier ${next === 2 ? "II" : "III"} upgrade` : `Upgrade to Tier ${next === 2 ? "II" : "III"}`}</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mech.upgrading ? "Complete the upgrade" : "Start a tier upgrade"}</DialogTitle>
          <DialogDescription>
            {mech.upgrading
              ? `The upgrade Project is done. ${mech.name} becomes a ${tierName(next)} frame with the same chassis.`
              : `Track the upgrade as a Project on the Ship tab. ${mech.name} stays Offline and can't be deployed until it's finished.`}
          </DialogDescription>
        </DialogHeader>
        {mech.upgrading && <ResistPicker tier={next} value={picks} onChange={setResist} />}
        <DialogFooter>
          {mech.upgrading && (
            <Button variant="ghost" onClick={() => { act("Cancel mech upgrade", (g) => { findMech(g, mech.id).upgrading = false; return `${mech.name}'s upgrade is called off.`; }); setOpen(false); }}>Cancel upgrade</Button>
          )}
          <Button
            onClick={() => {
              act(mech.upgrading ? "Finish mech upgrade" : "Start mech upgrade", (g) => {
                const m = findMech(g, mech.id);
                if (!m.upgrading) {
                  m.upgrading = true;
                  m.deployed = false;
                  return `${m.name} is taken Offline for a ${tierName(next)} upgrade.`;
                }
                const before = mechStats(g, m).maxHp;
                m.upgrading = false;
                m.tier = next;
                m.tierResist = picks;
                m.hp = Math.min(mechStats(g, m).maxHp, m.hp + (mechStats(g, m).maxHp - before));
                return `⬆ ${m.name} is now a ${tierName(next)} ${CHASSIS[m.chassis].name}: ${MECH_TIERS[next].slots} Module Slots, Frame ${MECH_TIERS[next].frame}, Resistance ${picks.join(" + ")}.`;
              });
              setOpen(false);
            }}
          >
            {mech.upgrading ? "Finish upgrade" : "Take it Offline and start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MechCard({ mech }: { mech: Mech }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const s = mechStats(game, mech);
  const mods = mechModules(mech);
  const pilot = game.characters.find((c) => c.id === mech.pilotId);
  const cells = mechCells(game, mech.tier, s.cells);
  const needCells = cellWord(mech.tier, s.cells);
  const edit = (label: string, fn: (m: Mech, g: GameState) => string | string[] | void) => act(label, (g) => fn(findMech(g, mech.id), g));
  const resist = MECH_DAMAGE_TYPES.filter((t) => s.resist[t] > 0);
  const status = mech.upgrading ? "Upgrading" : mech.hp <= 0 ? "Offline" : mech.deployed ? "Deployed" : "Ready";
  const tone = mech.upgrading ? "warn" : mech.hp <= 0 ? "danger" : mech.deployed ? "info" : "good";

  return (
    <Card className={cn(mech.hp <= 0 && "ring-rose-500/30")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-4 shrink-0 text-primary" />
          <CommitInput aria-label="Mech name" value={mech.name} onCommit={(v) => edit("Rename mech", (m) => { m.name = v || m.name; })} className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-0 text-base font-semibold dark:bg-transparent" />
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          <Pill tone={tone}>{status}</Pill>
          <Pill>{tierName(mech.tier)} {s.chassis.name}</Pill>
          <Pill>Noise: {s.chassis.noise}</Pill>
          {mech.external && <Pill tone="warn">Secured outside</Pill>}
          {s.expert && <Pill tone="good">Mech Expert: +1 slot, +4 HP</Pill>}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Mech HP</span>
            <span className="font-mono">{Math.max(0, mech.hp)}<span className="text-muted-foreground">/{s.maxHp}</span></span>
          </div>
          <Meter value={Math.max(0, mech.hp)} max={s.maxHp} tone="hull" segmented={s.maxHp <= 24} />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Stepper value={Math.max(0, mech.hp)} min={0} max={s.maxHp} size="xs" label="mech HP" onChange={(v) => edit(`${mech.name} HP`, (m) => { m.hp = v; return `${m.name} HP set to ${v}/${s.maxHp}.`; })} />
            <MechDamageDialog mech={mech} />
            <RepairDialog mech={mech} />
          </div>
        </div>

        {s.maxArmor > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Armor plating</span>
              <span className="font-mono">{s.armor}<span className="text-muted-foreground">/{s.maxArmor}</span></span>
            </div>
            <Meter value={s.armor} max={s.maxArmor} tone="armor" segmented />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Stepper value={s.armor} min={0} max={s.maxArmor} size="xs" label="armor plating" onChange={(v) => edit(`${mech.name} Armor`, (m) => { m.armor = v; return `${m.name}'s Armor plating is at ${v}/${s.maxArmor}.`; })} />
              {s.armor < s.maxArmor && (
                <Button size="xs" variant="outline" onClick={() => edit("Replate mech", (m) => { m.armor = s.maxArmor; return `${m.name}'s plating is replaced: Armor back to ${s.maxArmor}.`; })}><WrenchIcon /> Replate to {s.maxArmor}</Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Ablative: each hit it absorbs costs 1 point. At 0 the plating is spent and protects nothing until it&apos;s replaced.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
          {[
            [s.frame, "Frame STR"],
            [s.frame, "Frame CON"],
            [`${s.armor}/${s.maxArmor}`, "Armor"],
            [`${s.usedSlots}/${s.slots}`, "Slots"],
            [`${s.usedHardpoints}/${s.hardpoints}`, "Hardpoints"],
            [`+${s.inventory}`, "Inventory"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-muted/40 p-2"><p className="font-mono text-base">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Resistance:</span>
          {resist.length ? resist.map((t) => <Pill key={t} tone="info">{t}</Pill>) : <span className="text-muted-foreground">none</span>}
        </div>
        <p className="text-xs text-muted-foreground"><b className="text-foreground">{s.chassis.ability}.</b> {s.chassis.abilityText.join(" ")}</p>

        <div className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">Pilot</Label>
            <Select value={mech.pilotId ?? "none"} onValueChange={(v) => edit("Assign pilot", (m, g) => { m.pilotId = v === "none" ? null : (v as string); if (!m.pilotId) m.deployed = false; const who = g.characters.find((c) => c.id === m.pilotId); return who ? `${who.name} is assigned to pilot ${m.name}.` : `${m.name} has no pilot.`; })}>
              <SelectTrigger size="sm" className="w-44"><SelectValue>{pilot?.name ?? "No pilot"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No pilot</SelectItem>
                {game.characters.filter((c) => !c.dead).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.specialty === "Mech Expert" ? " (Mech Expert)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {mech.deployed ? (
              <div className="ml-auto flex gap-1.5">
                <Button size="xs" variant="outline" disabled={!cells} title={cells ? undefined : `Needs ${needCells}`} onClick={() => edit("Extra deployment day", (m, g) => { const used = burnMechCells(g, m.tier, s.cells); return used ? `${m.name} stays out another day and burns ${cellList(used)}.` : undefined; })}><BatteryIcon /> Another day</Button>
                <Button size="xs" variant="outline" onClick={() => edit("Recall mech", (m) => { m.deployed = false; return `${m.name} returns to its berth.`; })}><UndoIcon /> Return</Button>
              </div>
            ) : (
              <Button
                size="xs"
                className="ml-auto"
                disabled={!pilot || s.offline || !cells}
                title={!pilot ? "Assign a pilot first" : s.offline ? "An Offline mech can't deploy" : !cells ? `Needs ${needCells}` : undefined}
                onClick={() => edit("Deploy mech", (m, g) => {
                  const used = burnMechCells(g, m.tier, s.cells);
                  if (!used) return undefined;
                  for (const other of g.mechs) if (other.id !== m.id && other.pilotId === m.pilotId) other.deployed = false;
                  m.deployed = true;
                  return `🚀 ${pilot?.name} deploys in ${m.name}, burning ${cellList(used)}. Group Stealth −3d6 while it's active; attacks against the pilot gain +3d6.`;
                })}
              >
                <RocketIcon /> Deploy ({needCells})
              </Button>
            )}
          </div>
          {mech.deployed && pilot && (
            <p className="text-[11px] text-muted-foreground">
              {pilot.name} uses Frame Strength {s.frame} for lifting, carrying, bracing, forced movement, mech Physical attacks, and breaking structures, and Frame Constitution {s.frame} against vacuum, heat, cold, and hazards the chassis absorbs. Carry slots +{s.inventory}. Suppressed cybernetics are marked on their sheet.
            </p>
          )}
          {!mech.deployed && !cells && <p className="text-[11px] text-amber-200/80">Deploying takes {needCells}, and the hold doesn&apos;t have enough.</p>}
        </div>

        <div className="grid gap-1.5">
          <SectionTitle action={<AddModuleDialog mech={mech} />}>Modules</SectionTitle>
          {mods.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No modules installed. Reconfigure before each expedition to match the threats ahead.</p>
          ) : (
            mods.map(({ inst, def }) => (
              <div key={inst.id} className={cn("flex items-start gap-2 rounded-md border bg-background/40 p-2", inst.damaged && "border-rose-500/30")}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {def.name}
                    <span className="text-xs font-normal text-muted-foreground">{tierName(def.tier)} · {def.slots} slot{def.slots === 1 ? "" : "s"}{def.weapon ? ` · ${def.weapon}` : ""}</span>
                    {inst.damaged && <Pill tone="danger">Damaged</Pill>}
                  </p>
                  <p className="text-xs text-muted-foreground">{def.effect}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button size="icon-xs" variant="ghost" aria-label={inst.damaged ? `Repair ${def.name}` : `Damage ${def.name}`} title={inst.damaged ? "Mark repaired" : "Mark damaged"} onClick={() => edit("Module damage", (m) => { const x = m.modules.find((y) => y.id === inst.id)!; x.damaged = !x.damaged; return `${def.name} on ${m.name} is ${x.damaged ? "damaged and provides no benefit" : "repaired"}.`; })}><WrenchIcon /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Remove ${def.name}`} title="Remove to the hold" onClick={() => edit("Remove module", (m, g) => { m.modules = m.modules.filter((y) => y.id !== inst.id); if (!inst.damaged) stockItem(g, moduleItemName(def), 1, { category: "Equipment", heavy: true, tier: def.tier === 1 ? "Tier I" : def.tier === 2 ? "Tier II" : "Tier III", notes: def.effect }); m.hp = Math.min(m.hp, mechStats(g, m).maxHp); m.armor = mechStats(g, m).armor; return `${def.name} is removed from ${m.name}${inst.damaged ? " and scrapped" : " and stored in the hold"}.`; })}><Trash2Icon /></Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs">Conditions</Label>
          <div className="flex flex-wrap gap-1">
            {MECH_CONDITIONS.map((cond) => {
              const on = mech.conditions.includes(cond);
              return (
                <button
                  key={cond}
                  onClick={() => edit(`${cond} on ${mech.name}`, (m) => { m.conditions = on ? m.conditions.filter((x) => x !== cond) : [...m.conditions, cond]; return `${m.name} ${on ? "is no longer" : "becomes"} ${cond}.`; })}
                  className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-amber-400/50 bg-amber-500/15 text-amber-100" : "text-muted-foreground hover:border-foreground/30")}
                >
                  {cond}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
          <TierUpgradeDialog mech={mech} />
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <Switch checked={mech.external} onCheckedChange={(v) => edit("Mech storage", (m) => { m.external = v; return v ? `${m.name} is secured outside the hull. It may be damaged or lost during travel, collisions, or ship combat.` : `${m.name} moves into a mech berth.`; })} />
            Secured outside
          </label>
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => act("Dismantle mech", (g) => { g.mechs = g.mechs.filter((m) => m.id !== mech.id); return `${mech.name} is dismantled and no longer takes a berth.`; })}><Trash2Icon /> Dismantle</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MechsTab() {
  const game = useGame((s) => s.game);
  const { capacity, used } = mechCapacity(game);
  const over = used > capacity;
  const bay = game.ship.rooms.find((r) => r.module === "Storage Bay");

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BotIcon className="size-4 text-primary" /> Mech berths</CardTitle>
          <CardDescription>Every ship supports one assembled mech. A bigger Storage Bay adds berths. Stored modules, ammunition, plating, and blueprints don&apos;t count.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl">{used}<span className="text-muted-foreground">/{capacity}</span></span>
            <span className="text-sm text-muted-foreground">berths used{bay ? ` · ${bay.name}` : " · no Storage Bay"}</span>
            <div className="ml-auto"><NewMechDialog /></div>
          </div>
          <Meter value={used} max={Math.max(capacity, used)} tone={over ? "hp" : "good"} segmented />
          {over && (
            <p className="flex gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertTriangleIcon className="size-4 shrink-0" />
              More mechs than berths. Secure the extras outside, store them on another vessel, dismantle them, or abandon them.
            </p>
          )}
        </CardContent>
      </Card>

      <MechRequests />
      {game.mechs.length === 0 ? (
        <EmptyState title="No mechs yet" body="Start a Mech Frame Project on the Ship tab, then record the finished frame here with its chassis and tier." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">{game.mechs.map((m) => <MechCard key={m.id} mech={m} />)}</div>
      )}
    </div>
  );
}

