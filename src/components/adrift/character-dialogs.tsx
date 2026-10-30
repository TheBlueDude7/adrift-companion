"use client";

import { BandageIcon, DicesIcon, HeartCrackIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AFFLICTIONS, CONDITIONS, INJURIES, type TableEntry } from "@/data/compendium";
import { firstAidPool, giveFirstAid } from "@/lib/actions";
import { uid } from "@/lib/dice";
import { addInjuryFromRoll, applyDamage, findChar, injuryFor, rollAffliction, type InjuryRoll } from "@/lib/mechanics";
import { CONDITION_DURATIONS, INJURY_SEVERITIES, severityFromRoll, type ConditionDuration, type InjurySeverity } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import type { Character } from "@/lib/types";
import { Stepper } from "./common";

export type RollDraft = { severity: string; injury: string };
export const EMPTY_ROLL: RollDraft = { severity: "", injury: "" };

export function parseRoll(r: RollDraft): InjuryRoll | null {
  const severity = Number(r.severity);
  const injury = Number(r.injury);
  if (!Number.isInteger(severity) || !Number.isInteger(injury) || severity < 1 || severity > 6 || injury < 1 || injury > 10) return null;
  return { severity, injury };
}

/** The table rolls 1d6 for Severity and 1d10 for the Injury out loud; this just records the result. */
export function InjuryRollFields({ value, onChange }: { value: RollDraft; onChange: (v: RollDraft) => void }) {
  const roll = parseRoll(value);
  const entry = roll ? injuryFor(roll) : undefined;
  const field = (key: keyof RollDraft, label: string, max: number) => (
    <div className="grid gap-1">
      <Label htmlFor={`injury-${key}`} className="text-xs text-muted-foreground">{label}</Label>
      <Input
        id={`injury-${key}`}
        inputMode="numeric"
        placeholder={`1–${max}`}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value.replace(/\D/g, "").slice(0, 2) })}
        className="h-8 w-20 text-center tabular"
      />
    </div>
  );
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        {field("severity", "Severity (d6)", 6)}
        {field("injury", "Injury (d10)", 10)}
      </div>
      <p className="text-xs text-muted-foreground">
        {entry && roll ? (
          <>
            <span className="font-medium text-foreground">{severityFromRoll(roll.severity)}: {entry.name}.</span> {entry.effect}
          </>
        ) : value.severity || value.injury ? (
          "Severity is 1–6 and Injury is 1–10."
        ) : (
          "Roll at the table, then enter both dice."
        )}
      </p>
    </div>
  );
}

export function DamageDialog({ character }: { character: Character }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(2);
  const [useArmor, setUseArmor] = useState(true);
  const [pierce, setPierce] = useState(0);
  const [pressure, setPressure] = useState(true);
  const [injury, setInjury] = useState(false);
  const [roll, setRoll] = useState<RollDraft>(EMPTY_ROLL);
  const injuryRoll = parseRoll(roll);

  const setAmt = (v: number) => {
    setAmount(v);
    setPressure(v >= 2);
    setInjury(v >= 2);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setRoll(EMPTY_ROLL); }}>
      <DialogTrigger render={<Button size="sm" variant="destructive"><HeartCrackIcon /> Damage</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply damage to {character.name}</DialogTitle>
          <DialogDescription>Armor is ablative: it absorbs 1 damage and loses 1 point per hit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>Incoming damage</Label>
            <Stepper value={amount} onChange={setAmt} min={1} max={20} label="damage" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useArmor} onCheckedChange={(v) => setUseArmor(!!v)} disabled={character.armor <= 0} />
            Armor protects ({character.armor} Armor)
          </label>
          {useArmor && character.armor > 0 && (
            <div className="flex items-center justify-between">
              <Label>Armor Piercing</Label>
              <Stepper value={pierce} onChange={setPierce} min={0} max={5} label="armor piercing" size="xs" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={pressure} onCheckedChange={(v) => setPressure(!!v)} />
            Gain 1 Pressure (lost 2+ HP)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={injury} onCheckedChange={(v) => setInjury(!!v)} />
            Suffers an Injury (lost 2+ HP from one source)
          </label>
          {injury && <InjuryRollFields value={roll} onChange={setRoll} />}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={injury && !injuryRoll}
            onClick={() => {
              act(`Damage ${character.name}`, (g) => {
                const out: string[] = [];
                applyDamage(g, findChar(g, character.id), { amount, useArmor, pierce, gainPressure: pressure, injury: injury ? injuryRoll : null }, out);
                return out;
              }, "danger");
              setOpen(false);
            }}
          >
            Apply {amount} damage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** First Aid is a free action: the sheet's character treats anyone's Untreated Minor injury, any time. */
export function FirstAidDialog({ character }: { character: Character }) {
  const act = useGame((s) => s.act);
  const game = useGame((s) => s.game);
  const { isGM } = usePerms();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [clear, setClear] = useState<string[]>([]);
  const wounds = game.characters
    .filter((c) => !c.dead)
    .flatMap((c) => c.injuries.filter((i) => i.severity === "Minor" && i.state === "Untreated").map((i) => ({ key: `${c.id}:${i.id}`, patient: c, injury: i })));
  const chosen = wounds.find((w) => w.key === pick) ?? wounds[0];
  const pool = firstAidPool(game, character);
  const offers = game.firstAidOffers ?? [];
  const asks = !!chosen && !isGM && chosen.patient.id !== character.id;
  const offered = !!chosen && offers.some((o) => o.injuryId === chosen.injury.id && o.healerId === character.id);
  const clearing = clear.filter((id) => chosen?.patient.conditions.some((x) => x.id === id));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPick(""); setClear([]); } }}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={character.dead}><BandageIcon /> First Aid</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{character.name} gives First Aid</DialogTitle>
          <DialogDescription>A free skilled roll, no Energy. The first 6 treats one Untreated Minor injury. Each 6 after it heals 1 HP or clears a condition.</DialogDescription>
        </DialogHeader>
        {wounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has an Untreated Minor injury.</p>
        ) : (
          <div className="grid gap-3">
            <Select value={chosen?.key ?? ""} onValueChange={(v) => { setPick(String(v)); setClear([]); }}>
              <SelectTrigger className="w-full"><SelectValue>{chosen ? `${chosen.patient.name}: ${chosen.injury.name}` : "Pick an injury"}</SelectValue></SelectTrigger>
              <SelectContent>
                {wounds.map((w) => <SelectItem key={w.key} value={w.key}>{w.patient.name}: {w.injury.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Rolls {pool.dice} dice ({pool.label}).</p>
            {chosen && chosen.patient.conditions.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Extra 6s clear these first, in the order checked. The rest heal HP.</Label>
                {chosen.patient.conditions.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={clear.includes(x.id)} onCheckedChange={(v) => setClear((cur) => (v ? [...cur, x.id] : cur.filter((id) => id !== x.id)))} />
                    {x.name}
                    {clear.includes(x.id) && <span className="text-xs text-muted-foreground">#{clearing.indexOf(x.id) + 1}</span>}
                  </label>
                ))}
              </div>
            )}
            {asks && <p className="text-xs text-muted-foreground">{chosen.patient.name}&apos;s player (or the GM) accepts before it&apos;s rolled.</p>}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!chosen || offered}
            onClick={() => {
              if (!chosen) return;
              if (asks) {
                act(`${character.name} offers First Aid`, (g) => {
                  (g.firstAidOffers ??= []).push({ id: uid(), healerId: character.id, patientId: chosen.patient.id, injuryId: chosen.injury.id, clear: clearing });
                  return `🩹 ${character.name} offers ${chosen.patient.name} First Aid for ${chosen.injury.name}.`;
                });
              } else act(`${character.name} gives First Aid`, (g) => giveFirstAid(g, character.id, chosen.patient.id, chosen.injury.id, clearing));
              setOpen(false);
            }}
          >
            {offered ? "Already offered" : asks ? `Offer to ${chosen.patient.name}` : "Roll First Aid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** First Aid offered to or by this character, waiting for the patient's player (or the GM) to accept. */
export function FirstAidOffers({ character }: { character: Character }) {
  const act = useGame((s) => s.act);
  const game = useGame((s) => s.game);
  const { isGM, myCharacterId } = usePerms();
  const offers = (game.firstAidOffers ?? []).filter((o) => o.patientId === character.id || o.healerId === character.id);
  if (!offers.length) return null;
  const name = (id: string) => game.characters.find((c) => c.id === id)?.name ?? "Someone";
  const answer = (id: string, how: "accept" | "decline" | "withdraw") =>
    act(how === "accept" ? "Accept First Aid" : how === "decline" ? "Decline First Aid" : "Withdraw First Aid", (g) => {
      const o = (g.firstAidOffers ?? []).find((x) => x.id === id);
      g.firstAidOffers = (g.firstAidOffers ?? []).filter((x) => x.id !== id);
      if (!o) return "";
      if (how === "accept") return giveFirstAid(g, o.healerId, o.patientId, o.injuryId, o.clear);
      return how === "decline" ? `${name(o.patientId)} declines ${name(o.healerId)}'s First Aid.` : `${name(o.healerId)} withdraws their First Aid offer.`;
    });

  return (
    <div className="grid gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/5 p-2.5">
      {offers.map((o) => {
        const injury = game.characters.find((c) => c.id === o.patientId)?.injuries.find((i) => i.id === o.injuryId);
        const canAnswer = isGM || o.patientId === myCharacterId;
        return (
          <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
            <BandageIcon className="size-4 text-sky-400" />
            <span><span className="font-medium">{name(o.healerId)}</span> offers <span className="font-medium">{name(o.patientId)}</span> First Aid for {injury?.name ?? "an injury"}.</span>
            <span className="ml-auto flex gap-1.5">
              {canAnswer && <Button size="xs" variant="outline" onClick={() => answer(o.id, "decline")}>Decline</Button>}
              {canAnswer && <Button size="xs" onClick={() => answer(o.id, "accept")}>Accept</Button>}
              {!canAnswer && o.healerId === myCharacterId && <Button size="xs" variant="ghost" onClick={() => answer(o.id, "withdraw")}>Withdraw</Button>}
              {!canAnswer && o.healerId !== myCharacterId && <span className="self-center text-[11px] text-muted-foreground">Waiting for {name(o.patientId)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type PickerKind = "injury" | "affliction" | "condition";

export function CompendiumPicker({ character, kind }: { character: Character; kind: PickerKind }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<InjurySeverity | "auto">("auto");
  const [duration, setDuration] = useState<ConditionDuration>("Scene");
  const [roll, setRoll] = useState<RollDraft>(EMPTY_ROLL);
  const injuryRoll = parseRoll(roll);

  const entries = useMemo(() => {
    const list: { code: string; name: string; effect: string; group: string }[] =
      kind === "condition"
        ? CONDITIONS.map((c) => ({ code: c.name, name: c.name, effect: c.effect, group: c.removal ? `Removal: ${c.removal}` : "" }))
        : (kind === "injury" ? INJURIES : AFFLICTIONS).map((e: TableEntry) => ({ code: e.code, name: e.name, effect: e.effect, group: `${e.code} · ${e.categoryName}` }));
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((e) => e.name.toLowerCase().includes(needle) || e.effect.toLowerCase().includes(needle)) : list;
  }, [kind, q]);

  const title = kind === "injury" ? "Add Injury" : kind === "affliction" ? "Add Affliction" : "Add Condition";

  function add(code: string) {
    act(`${title}: ${character.name}`, (g) => {
      const c = findChar(g, character.id);
      if (kind === "injury") {
        const e = INJURIES.find((x) => x.code === code)!;
        const sev = severity === "auto" ? severityFromRoll(e.category) : severity;
        c.injuries.push({ id: uid(), code, name: e.name, effect: e.effect, severity: sev, state: "Untreated", dayReceived: g.day, notes: "" });
        return `${c.name} gains a ${sev} Injury: ${e.name}.`;
      }
      if (kind === "affliction") {
        const e = AFFLICTIONS.find((x) => x.code === code)!;
        c.afflictions.push({ id: uid(), code, name: e.name, effect: e.effect, notes: "" });
        return `${c.name} gains the Affliction ${e.name}.`;
      }
      const e = CONDITIONS.find((x) => x.name === code)!;
      const existing = c.conditions.find((x) => x.name === e.name);
      if (existing) {
        existing.duration = duration;
        return `${c.name}'s ${e.name} is refreshed (${duration}).`;
      }
      c.conditions.push({ id: uid(), name: e.name, duration, notes: "" });
      return `${c.name} is now ${e.name} (${duration}).`;
    }, kind === "condition" ? "info" : "danger");
    setOpen(false);
  }

  function addRolledInjury() {
    if (!injuryRoll) return;
    act(`Add Injury: ${character.name}`, (g) => {
      const out: string[] = [];
      addInjuryFromRoll(g, findChar(g, character.id), injuryRoll, out);
      return out;
    }, "danger");
    setOpen(false);
  }

  function rollRandom() {
    act(`Roll ${kind}: ${character.name}`, (g) => {
      const c = findChar(g, character.id);
      const out: string[] = [];
      const r = rollAffliction(c);
      if (!r) return `${c.name} has no Afflictions left to roll.`;
      if (r.entry.name.startsWith("No Affliction")) return `${c.name} rolls an Affliction (${r.cat}, ${r.n}): No Affliction Here! Scot-free.`;
      c.afflictions.push({ id: uid(), code: r.entry.code, name: r.entry.name, effect: r.entry.effect, notes: "" });
      out.push(`${c.name} rolls an Affliction (${r.cat}, ${r.n}): ${r.entry.name}.`);
      if (r.entry.name === "Catastrophic Dissociation") out.push("Catastrophic Dissociation: roll two additional Afflictions.");
      return out;
    }, "danger");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); else setRoll(EMPTY_ROLL); }}>
      <DialogTrigger render={<Button size="xs" variant="outline"><PlusIcon /> Add</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title} · {character.name}</DialogTitle>
          <DialogDescription>
            {kind === "injury" && "Roll 1d6 for Severity and 1d10 for the Injury at the table and enter them, or pick one from the compendium."}
            {kind === "affliction" && "Roll 1d6 for the category and 1d10 for the Affliction. Duplicates are rerolled."}
            {kind === "condition" && "Reapplying a condition refreshes its duration."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Search by name or effect…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          {kind === "injury" && (
            <Select value={severity} onValueChange={(v) => setSeverity(v as InjurySeverity | "auto")}>
              <SelectTrigger className="w-36"><SelectValue>{severity === "auto" ? "Severity: by roll" : severity}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Severity: by roll</SelectItem>
                {INJURY_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {kind === "condition" && (
            <Select value={duration} onValueChange={(v) => setDuration(v as ConditionDuration)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_DURATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {kind === "affliction" && (
            <Button variant="secondary" onClick={rollRandom}><DicesIcon /> Roll random</Button>
          )}
        </div>
        {kind === "injury" && (
          <div className="grid gap-2">
            <InjuryRollFields value={roll} onChange={setRoll} />
            <Button disabled={!injuryRoll} onClick={addRolledInjury}><DicesIcon /> Add rolled Injury</Button>
          </div>
        )}
        <ScrollArea className="h-[50vh] pr-3">
          <div className="grid gap-1.5">
            {entries.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</p>}
            {entries.map((e) => (
              <button
                key={e.code}
                onClick={() => add(e.code)}
                className="rounded-lg border bg-background/40 p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  {kind !== "condition" && <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.code}</span>}
                </div>
                <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{e.effect}</p>
                {kind !== "condition" && <p className="mt-1 text-[11px] text-muted-foreground/70">{e.group.split(" · ")[1]}</p>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
