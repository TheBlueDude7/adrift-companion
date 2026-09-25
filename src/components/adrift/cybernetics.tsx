"use client";

import { CpuIcon, FlaskConicalIcon, MoreHorizontalIcon, PlusIcon, WrenchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CYBERNETICS,
  CYBER_BY_KEY,
  CYBER_SYSTEMS,
  CYBER_SYSTEM_BY_KEY,
  FABRICATE_TASK,
  IMPLANT_RECIPES,
  SURGERY_TASK,
  TIER_LABEL,
  implantName,
  type CyberDef,
  type CyberSystem,
} from "@/data/cybernetics";
import {
  bodyLocations,
  cyberAttr,
  cyberLoad,
  dampening,
  freeLocations,
  installBlocker,
  installed,
  isUnlocked,
  mechTag,
  planInstall,
  researchCandidates,
  tier3Ready,
  upgradeTargets,
  type Installed,
} from "@/lib/cyber";
import { uid } from "@/lib/dice";
import { pilotedMech } from "@/lib/mechs";
import { ATTRIBUTES } from "@/lib/rules";
import { haveInStorage, recipeText, shortfalls, spend, stockItem, takeOne } from "@/lib/stock";
import { useGame } from "@/lib/store";
import type { Character, GameState } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { EmptyState, Pill } from "./common";

const char = (g: GameState, id: string) => g.characters.find((c) => c.id === id)!;

type Source = "storage" | "fabricate" | "untracked";

function MaterialsLine({ recipe, className }: { recipe: { name: string; qty: number }[]; className?: string }) {
  const game = useGame((s) => s.game);
  const short = shortfalls(game, recipe);
  return (
    <p className={cn("text-xs", className)}>
      {recipe.map((p, i) => {
        const miss = short.find((s) => s.name === p.name);
        return (
          <span key={p.name}>
            {i > 0 && ", "}
            <span className={miss ? "text-rose-300" : undefined}>{p.qty} {p.name}</span>
            {miss && <span className="text-muted-foreground"> (have {miss.have})</span>}
          </span>
        );
      })}
    </p>
  );
}

function CyberRow({ x, c, suppressed }: { x: Installed; c: Character; suppressed: boolean }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const { inst, def } = x;
  const tag = mechTag(x);
  const off = suppressed && (tag === "Suppressed" || tag === "GM decides");
  const edit = (label: string, fn: (g: GameState) => string) => act(label, fn);
  const upgradeCost = IMPLANT_RECIPES[1].map((p, i) => ({ name: p.name, qty: Math.max(0, p.qty - IMPLANT_RECIPES.replacement[i].qty) })).filter((p) => p.qty > 0);
  const upgradeShort = shortfalls(game, upgradeCost);

  function remove(keep: boolean) {
    edit(keep ? "Remove cybernetic" : "Discard cybernetic", (g) => {
      const who = char(g, c.id);
      who.cybernetics = (who.cybernetics ?? []).filter((i) => i.id !== inst.id);
      if (keep && !inst.damaged) stockItem(g, implantName(def, inst.replacement), 1, { category: "Equipment", notes: `${TIER_LABEL[def.tier]} ${CYBER_SYSTEM_BY_KEY[def.system].name} cybernetic.` });
      return keep
        ? `${who.name}'s ${def.name} (${inst.location}) is surgically removed${inst.damaged ? "; it's too damaged to keep" : " and stored in the hold"}.`
        : `${who.name}'s ${def.name} (${inst.location}) is removed and scrapped.`;
    });
  }

  return (
    <div className={cn("grid gap-1.5 rounded-lg border bg-background/40 p-3", inst.damaged && "border-rose-500/30", off && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{def.name}</span>
        <Pill tone="info">{TIER_LABEL[def.tier]}</Pill>
        <Pill>{inst.location}</Pill>
        {inst.replacement && <Pill>Replacement</Pill>}
        {inst.damaged && <Pill tone="danger">Damaged</Pill>}
        {suppressed && <Pill tone={off ? "warn" : "good"}>{off ? (tag === "GM decides" ? "In mech: GM decides" : "Suppressed in mech") : "Works in mech"}</Pill>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={`${def.name} actions`}><MoreHorizontalIcon /></Button>} />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => edit(inst.damaged ? "Repair cybernetic" : "Damage cybernetic", (g) => {
              const i = char(g, c.id).cybernetics!.find((y) => y.id === inst.id)!;
              i.damaged = !i.damaged;
              return i.damaged ? `${c.name}'s ${def.name} is damaged and stops working until repaired.` : `${c.name}'s ${def.name} is repaired.`;
            })}>
              <WrenchIcon /> {inst.damaged ? "Mark repaired" : "Mark damaged"}
            </DropdownMenuItem>
            {inst.replacement && (
              <DropdownMenuItem disabled={!isGM && upgradeShort.length > 0} onClick={() => edit("Enhance cybernetic", (g) => {
                const i = char(g, c.id).cybernetics!.find((y) => y.id === inst.id)!;
                const short = shortfalls(g, upgradeCost);
                if (!short.length) spend(g, upgradeCost);
                i.replacement = false;
                return `${c.name}'s ${def.name} is upgraded from a Replacement to an Enhanced implant${short.length ? " (materials not tracked)" : ` (${recipeText(upgradeCost)})`}.`;
              })}>
                <PlusIcon /> Upgrade to Enhanced
                <span className={cn("ml-auto text-[10px]", upgradeShort.length ? "text-rose-300" : "text-muted-foreground")}>{upgradeShort.length ? "Short on materials" : recipeText(upgradeCost)}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => remove(true)}>Remove and store implant</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => remove(false)}>Remove and scrap</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {inst.replacement ? (
        <p className="text-xs text-muted-foreground">{def.replacement ?? "Restores normal function."} No Enhanced abilities, no Cybernetic Load.</p>
      ) : (
        <ul className="grid gap-0.5 text-xs text-muted-foreground">
          {def.effects.map((e) => <li key={e} className="flex gap-1.5"><span className="text-primary/70">•</span>{e}</li>)}
          {inst.choice && <li className="text-foreground/80">Choice: {inst.choice}</li>}
        </ul>
      )}
      {inst.lineage.length > 0 && (
        <p className="text-[11px] text-muted-foreground/80">Built on {inst.lineage.map((k) => CYBER_BY_KEY[k]?.name ?? k).join(", ")}.</p>
      )}
      {def.note && <p className="text-[11px] text-amber-200/80">{def.note}</p>}
    </div>
  );
}

export function CyberneticsPanel({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const list = installed(c);
  const load = cyberLoad(c);
  const damp = dampening(c);
  const mech = pilotedMech(game, c.id);
  const bonuses = ATTRIBUTES.map((a) => [a, cyberAttr(c, a)] as const).filter(([, n]) => n);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={load >= 6 ? "warn" : "muted"}>Cybernetic Load {load}</Pill>
        <Pill tone={damp ? "info" : "muted"}>Dampening {damp}</Pill>
        {bonuses.map(([a, n]) => <Pill key={a} tone="good">+{n} {a}</Pill>)}
        {mech && <Pill tone="warn">Piloting {mech.name}</Pill>}
        <div className="ml-auto"><InstallDialog c={c} /></div>
      </div>
      {damp > 0 && <p className="text-xs text-muted-foreground">Once per Scene, when {c.name.split(" ")[0]} would gain Pressure, reduce it by {damp} (minimum 0).</p>}
      {list.length === 0 ? (
        <EmptyState title="No cybernetics" body="Tier I implants are available from the start. Install them through Surgery in a Medical Bay." />
      ) : (
        <div className="grid gap-2">{list.map((x) => <CyberRow key={x.inst.id} x={x} c={c} suppressed={!!mech} />)}</div>
      )}
    </div>
  );
}

function InstallDialog({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [system, setSystem] = useState<CyberSystem>("structural");
  const [key, setKey] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [replacement, setReplacement] = useState(false);
  const [replaceId, setReplaceId] = useState("none");
  const [choice, setChoice] = useState("");
  const [source, setSource] = useState<Source>("fabricate");
  const { isGM } = usePerms();

  const def = key ? CYBER_BY_KEY[key] : null;
  const defs = CYBERNETICS.filter((d) => d.system === system);
  const blocker = def ? installBlocker(game, c, def) : null;
  const force = isGM && !!blocker;
  const free = def ? freeLocations(c, def) : [];
  const sides = def && force && free.length === 0 ? bodyLocations(def) : free;
  const targets = def ? upgradeTargets(c, def) : [];
  const recipe = def ? IMPLANT_RECIPES[replacement ? "replacement" : def.tier] : [];
  const itemName = def ? implantName(def, replacement) : "";
  const inStorage = def ? haveInStorage(game, itemName) : 0;
  const plan = def ? planInstall(c, def, { location, replaceId: replaceId === "none" ? undefined : replaceId }) : null;

  function pick(d: CyberDef) {
    setKey(d.key);
    setReplacement(false);
    setChoice("");
    setLocation(freeLocations(c, d)[0] ?? bodyLocations(d)[0] ?? "");
    const t = upgradeTargets(c, d);
    setReplaceId(t[0]?.inst.id ?? "none");
    setSource(haveInStorage(game, implantName(d)) > 0 ? "storage" : isGM && installBlocker(game, c, d) ? "untracked" : "fabricate");
  }

  function install() {
    if (!def || !plan) return;
    act(`Install ${def.name}`, (g) => {
      const who = char(g, c.id);
      const out: string[] = [];
      if (source === "storage") takeOne(g, itemName);
      if (source === "fabricate") spend(g, recipe);
      const absorbed = (who.cybernetics ?? []).filter((i) => plan.removes.includes(i.id));
      who.cybernetics = [
        ...(who.cybernetics ?? []).filter((i) => !plan.removes.includes(i.id)),
        { id: uid(), key: def.key, location: plan.location, replacement, damaged: false, lineage: plan.lineage, choice: choice.trim() },
      ];
      out.push(`${who.name} receives a ${replacement ? "Replacement " : ""}${def.name} (${TIER_LABEL[def.tier]}, ${plan.location}) through Surgery.`);
      if (force) out.push(`The GM forced the install (${blocker}).`);
      if (absorbed.length) out.push(`It ${def.tier === 3 ? "integrates" : "replaces"} ${absorbed.map((i) => CYBER_BY_KEY[i.key]?.name ?? i.key).join(", ")}.`);
      if (source === "storage") out.push(`Used the ${itemName} from the hold.`);
      if (source === "fabricate") out.push(`Fabricated from ${recipeText(recipe)}.`);
      return out;
    });
    setOpen(false);
  }

  const short = shortfalls(game, recipe);
  const canInstall = !!def && (!blocker || force) && (def.tier === 1 ? sides.length > 0 : true) && (source !== "storage" || inStorage > 0) && (source !== "fabricate" || short.length === 0) && (source !== "untracked" || isGM);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setKey(null); }}>
      <DialogTrigger render={<Button size="sm" variant="outline"><CpuIcon /> Install cybernetic</Button>} />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Install a cybernetic</DialogTitle>
          <DialogDescription>Tier I technology is available from the start. Tier II and III need crew research first. Upgrades replace or integrate the implants they build on.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {CYBER_SYSTEMS.map((s) => (
            <Button key={s.key} size="xs" variant={system === s.key ? "default" : "outline"} onClick={() => { setSystem(s.key); setKey(null); }}>{s.name}</Button>
          ))}
        </div>
        <div className="grid min-h-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ScrollArea className="h-56 pr-3 sm:h-96">
            <div className="grid gap-1">
              {defs.map((d) => {
                const why = installBlocker(game, c, d);
                return (
                  <button
                    key={d.key}
                    onClick={() => pick(d)}
                    className={cn("grid gap-0.5 rounded-md border px-3 py-2 text-left hover:border-primary/50", key === d.key ? "border-primary bg-primary/10" : "bg-background/40", why && "opacity-70")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Pill tone={isUnlocked(game, d) ? "info" : "muted"}>{TIER_LABEL[d.tier]}</Pill>
                    </span>
                    <span className={cn("text-[11px]", why ? "text-muted-foreground" : "text-emerald-300")}>{why ?? "Ready to install"}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="grid content-start gap-3 rounded-lg border bg-muted/20 p-3">
            {!def ? (
              <p className="text-sm text-muted-foreground">{CYBER_SYSTEM_BY_KEY[system].focus}. Pick an implant to see what it does.</p>
            ) : (
              <>
                <div>
                  <p className="font-medium">{def.name}</p>
                  <ul className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                    {def.effects.map((e) => <li key={e}>• {e}</li>)}
                  </ul>
                  {def.requires && <p className="mt-1.5 text-xs">Requires: {def.requires.map((r) => r.label).join(" and ")}</p>}
                  {def.note && <p className="mt-1 text-xs text-amber-200/80">{def.note}</p>}
                </div>
                {force && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-100">{blocker}. As GM you can force install it anyway.</p>}
                {blocker && !force ? (
                  <p className="rounded-md bg-rose-500/10 p-2 text-xs text-rose-200">{blocker}.{blocker === "Not researched yet" && " Record the discovery under Cybernetic research on the Ship tab."}</p>
                ) : (
                  <>
                    {def.tier === 1 && sides.length > 1 && (
                      <div className="grid gap-1.5">
                        <Label>Location</Label>
                        <Select value={location} onValueChange={(v) => setLocation(v as string)}>
                          <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>{sides.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {def.tier === 1 && (
                      <label className="flex items-start gap-2 text-xs">
                        <Checkbox checked={replacement} onCheckedChange={(v) => { setReplacement(!!v); setSource(haveInStorage(game, implantName(def, !!v)) > 0 ? "storage" : "fabricate"); }} />
                        <span>
                          Standard Replacement: restores normal function only.{def.replacement && ` ${def.replacement}`} No Enhanced abilities or Load, half the materials, and it can&apos;t be upgraded to Tier II until it&apos;s made Enhanced.
                        </span>
                      </label>
                    )}
                    {targets.length > 0 && (
                      <div className="grid gap-1.5">
                        <Label>Upgrades</Label>
                        <Select value={replaceId} onValueChange={(v) => setReplaceId(v as string)}>
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue>{replaceId === "none" ? "Install alongside (don't replace)" : `${targets.find((t) => t.inst.id === replaceId)?.def.name} (${targets.find((t) => t.inst.id === replaceId)?.inst.location})`}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {targets.map((t) => <SelectItem key={t.inst.id} value={t.inst.id}>{t.def.name} ({t.inst.location})</SelectItem>)}
                            <SelectItem value="none">Install alongside (don&apos;t replace)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">The Tier I implant becomes part of the upgrade, and its own abilities are replaced.</p>
                      </div>
                    )}
                    {plan && plan.removes.length > 0 && def.tier === 3 && (
                      <p className="text-xs">Integrates {plan.removes.map((id) => CYBER_BY_KEY[c.cybernetics!.find((i) => i.id === id)!.key].name).join(", ")}. Only this system&apos;s Load counts, and they can&apos;t be removed separately.</p>
                    )}
                    {(def.key === "multispectrum-vision" || def.tier === 1 && def.location === "limb") && (
                      <div className="grid gap-1.5">
                        <Label htmlFor="cyber-choice">{def.key === "multispectrum-vision" ? "Sensor modes (choose two)" : "Notes"}</Label>
                        <Input id="cyber-choice" value={choice} onChange={(e) => setChoice(e.target.value)} placeholder={def.key === "multispectrum-vision" ? "Thermal, Low-light" : "Optional"} className="h-8" />
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <Label>Implant</Label>
                      <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue>{source === "storage" ? `Use ${itemName} from the hold` : source === "fabricate" ? "Fabricate it now from ship storage" : "Don't track materials"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="storage" disabled={inStorage === 0}>Use {itemName} from the hold ({inStorage})</SelectItem>
                          <SelectItem value="fabricate">Fabricate it now from ship storage</SelectItem>
                          {isGM && <SelectItem value="untracked">Don&apos;t track materials</SelectItem>}
                        </SelectContent>
                      </Select>
                      {source === "fabricate" && <MaterialsLine recipe={recipe} />}
                      {source === "fabricate" && def.tier > 1 && <p className="text-[11px] text-muted-foreground">Fabricate: {FABRICATE_TASK[def.tier]}.</p>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Install: {SURGERY_TASK[def.tier]}. On failure the implant stays intact.</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!canInstall} onClick={install}>{force ? "Force install" : "Install"} {def?.name ?? "cybernetic"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordDiscoveryDialog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<2 | 3>(2);
  const [system, setSystem] = useState<CyberSystem>("structural");
  const [prototype, setPrototype] = useState(true);
  const candidates = useMemo(() => researchCandidates(game, system, tier, CYBERNETICS), [game, system, tier]);
  const gated = tier === 3 && !tier3Ready(game, system, CYBERNETICS);

  function record(d: CyberDef) {
    act("Record research", (g) => {
      g.research.cybernetics.push(d.key);
      if (prototype) stockItem(g, implantName(d), 1, { category: "Equipment", notes: `${TIER_LABEL[d.tier]} ${CYBER_SYSTEM_BY_KEY[d.system].name} cybernetic. Research prototype.` });
      return `🔬 Cybernetic research breakthrough: ${d.name} (${TIER_LABEL[d.tier]} ${CYBER_SYSTEM_BY_KEY[d.system].name}) is unlocked for the whole crew${prototype ? ". A prototype implant goes into the hold" : ""}.`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><FlaskConicalIcon /> Record discovery</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete a research project</DialogTitle>
          <DialogDescription>Choose the tier and category you researched, roll at the table, and pick the matching result. Technologies you already have are left out, so reroll anything that isn&apos;t listed.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Select value={String(tier)} onValueChange={(v) => setTier(Number(v) as 2 | 3)}>
            <SelectTrigger className="w-full"><SelectValue>{TIER_LABEL[tier]}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="2">Tier II</SelectItem><SelectItem value="3">Tier III</SelectItem></SelectContent>
          </Select>
          <Select value={system} onValueChange={(v) => setSystem(v as CyberSystem)}>
            <SelectTrigger className="w-full"><SelectValue>{CYBER_SYSTEM_BY_KEY[system].name}</SelectValue></SelectTrigger>
            <SelectContent>{CYBER_SYSTEMS.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={prototype} onCheckedChange={(v) => setPrototype(!!v)} /> Put the completed prototype implant in the hold</label>
        {gated ? (
          <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-100">
            {system === "damage" ? "Tier III Damage research needs a Tier II Damage system of the same type unlocked first." : `Tier III ${CYBER_SYSTEM_BY_KEY[system].name} research needs two Tier II ${CYBER_SYSTEM_BY_KEY[system].name} technologies unlocked first.`}
          </p>
        ) : candidates.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Everything in this category and tier is already unlocked.</p>
        ) : (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Roll 1d{candidates.length} (or any die, rerolling blanks):</p>
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
        )}
      </DialogContent>
    </Dialog>
  );
}

function FabricateImplantDialog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(CYBERNETICS[0].key);
  const [replacement, setReplacement] = useState(false);
  const def = CYBER_BY_KEY[key];
  const available = CYBERNETICS.filter((d) => isUnlocked(game, d));
  const recipe = IMPLANT_RECIPES[replacement && def.tier === 1 ? "replacement" : def.tier];
  const short = shortfalls(game, recipe);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline"><WrenchIcon /> Fabricate implant</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fabricate a cybernetic implant</DialogTitle>
          <DialogDescription>Every implant of the same tier uses the same recipe. The finished implant goes to the hold until someone installs it.</DialogDescription>
        </DialogHeader>
        <Select value={key} onValueChange={(v) => { setKey(v as string); setReplacement(false); }}>
          <SelectTrigger className="w-full"><SelectValue>{def.name}</SelectValue></SelectTrigger>
          <SelectContent>
            {available.map((d) => <SelectItem key={d.key} value={d.key}>{d.name} · {TIER_LABEL[d.tier]} {CYBER_SYSTEM_BY_KEY[d.system].name}</SelectItem>)}
          </SelectContent>
        </Select>
        {def.tier === 1 && <label className="flex items-center gap-2 text-sm"><Checkbox checked={replacement} onCheckedChange={(v) => setReplacement(!!v)} /> Standard Replacement (half materials)</label>}
        <div className="grid gap-1 rounded-lg bg-muted/40 p-3">
          <MaterialsLine recipe={recipe} />
          <p className="text-[11px] text-muted-foreground">{FABRICATE_TASK[def.tier]}.</p>
        </div>
        <DialogFooter>
          <Button
            disabled={short.length > 0}
            onClick={() => {
              act("Fabricate implant", (g) => {
                spend(g, recipe);
                stockItem(g, implantName(def, replacement), 1, { category: "Equipment", notes: `${TIER_LABEL[def.tier]} ${CYBER_SYSTEM_BY_KEY[def.system].name} cybernetic.` });
                return `Fabricated a ${implantName(def, replacement)} from ${recipeText(recipe)}.`;
              });
              setOpen(false);
            }}
          >
            {short.length ? "Missing materials" : "Fabricate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CyberResearchCard() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const unlocked = game.research.cybernetics.map((k) => CYBER_BY_KEY[k]).filter(Boolean);
  const lab = game.ship.rooms.some((r) => r.module === "Cybernetics Lab" && r.condition !== "Destroyed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FlaskConicalIcon className="size-4 text-primary" /> Cybernetic research</CardTitle>
        <CardDescription>Research is crew-wide: once a technology is unlocked, anyone eligible can receive it and it can be fabricated again and again.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!lab && <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-100">No Cybernetics Lab aboard. The lab is needed for Cybernetic Research and for crafting Cybernetic Cores. Build one from the Ship tab.</p>}
        <div className="flex flex-wrap gap-1.5">
          <RecordDiscoveryDialog />
          <FabricateImplantDialog />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CYBER_SYSTEMS.map((s) => {
            const mine = unlocked.filter((d) => d.system === s.key);
            return (
              <div key={s.key} className="rounded-lg border bg-background/40 p-2.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.name}</p>
                {mine.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground/70">Tier I only</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {mine.map((d) => (
                      <span key={d.key} className="group inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
                        {d.name}
                        <span className="text-muted-foreground">{d.tier === 3 ? "III" : "II"}</span>
                        <button
                          aria-label={`Forget ${d.name}`}
                          className="text-muted-foreground/60 hover:text-rose-300"
                          onClick={() => act("Forget research", (g) => { g.research.cybernetics = g.research.cybernetics.filter((k) => k !== d.key); return `${d.name} is removed from the crew's research.`; })}
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

