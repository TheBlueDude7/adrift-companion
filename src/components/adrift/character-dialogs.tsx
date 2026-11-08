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
import { AFFLICTIONS, CONDITIONS, type TableEntry } from "@/data/compendium";
import { INJURY_BY_CODE, INJURY_TABLE } from "@/data/injuries";
import { firstAidPool, giveFirstAid, medkitsFor } from "@/lib/actions";
import { maxHp } from "@/lib/derive";
import { uid } from "@/lib/dice";
import { addInjury, addInjuryFromRoll, injuryFor, resolveInjuryRoll, type InjuryRoll } from "@/lib/injuries";
import { markDamage, marksNeedingType, marksOn } from "@/lib/marks";
import { applyDamage, damageSteps, findChar, rollAffliction } from "@/lib/mechanics";
import { CONDITION_DURATIONS, DAMAGE_TYPES, type ConditionDuration, type DamageType } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Stepper } from "./common";

export type RollDraft = { severity: string; location: string };
export const EMPTY_ROLL: RollDraft = { severity: "", location: "" };

const isDie = (n: number) => Number.isInteger(n) && n >= 1 && n <= 6;

export function parseRoll(r: RollDraft): InjuryRoll | null {
  const severity = Number(r.severity);
  const location = Number(r.location);
  return isDie(severity) && isDie(location) ? { severity, location } : null;
}

/**
 * The table rolls two d6 out loud, Severity then Location; this records them. With a `character`, it shows
 * what they'll actually get once duplicates and the injury cap make it worse.
 */
export function InjuryRollFields({ value, onChange, character }: { value: RollDraft; onChange: (v: RollDraft) => void; character?: Character }) {
  const roll = parseRoll(value);
  const resolved = roll && character ? resolveInjuryRoll(character, roll) : null;
  const entry = resolved?.entry ?? (roll ? injuryFor(roll) : undefined);
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
        {field("location", "Location (d6)", 6)}
      </div>
      <p className="text-xs text-muted-foreground">
        {entry && roll ? (
          <>
            <span className="font-medium text-foreground">{entry.severity} {entry.location}: {entry.name}.</span> {entry.effect}
            {resolved?.reasons.length ? <span className="mt-1 block text-amber-300">Rolled {resolved.rolled.name}, but {character?.name} {resolved.reasons.join(" and ")}, so it&apos;s one step worse.</span> : null}
          </>
        ) : value.severity || value.location ? (
          "Both dice are 1–6."
        ) : (
          "Roll two d6 at the table: Severity (1–3 Minor, 4–5 Major, 6 Deadly), then Location (Head, Senses, Arms, Legs, Torso, Internal)."
        )}
      </p>
    </div>
  );
}

const COVER = [
  { points: 0, label: "None" },
  { points: 1, label: "Partial (1)" },
  { points: 2, label: "Strong (2)" },
];

export function DamageDialog({ character }: { character: Character }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(2);
  const [useArmor, setUseArmor] = useState(true);
  const [pierce, setPierce] = useState(0);
  const [cover, setCover] = useState(0);
  const [resistant, setResistant] = useState(false);
  const [vulnerable, setVulnerable] = useState(false);
  const [pressureChoice, setPressure] = useState<boolean | null>(null);
  const [injuryChoice, setInjury] = useState<boolean | null>(null);
  const [roll, setRoll] = useState<RollDraft>(EMPTY_ROLL);
  const [type, setType] = useState<DamageType | "">("");
  const injuryRoll = parseRoll(roll);
  // Brittle waits for a Physical or Ballistic hit and Conductive for an Electric one, so those need
  // the hit to have a type. Fortified and Corroded meet it the same either way, so they don't ask.
  const waiting = marksNeedingType(character);
  const marks = marksOn(character, type || null);
  const steps = damageSteps(character, { amount: amount + marks.bonus, useArmor, pierce, cover, resistant, vulnerable, marks });
  const pressure = pressureChoice ?? steps.lost >= 2;
  const injury = injuryChoice ?? (steps.lost >= 3 || (steps.lost > 0 && steps.lost >= character.hp));

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setRoll(EMPTY_ROLL); setPressure(null); setInjury(null); setResistant(false); setVulnerable(false); setType(""); } }}>
      <DialogTrigger render={<Button size="sm" variant="destructive"><HeartCrackIcon /> Damage</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Apply damage to {character.name}</DialogTitle>
          <DialogDescription>Armor is ablative: it absorbs 1 damage and loses 1 point per hit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <Label>Incoming damage</Label>
            <Stepper value={amount} onChange={setAmount} min={1} max={20} label="damage" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={resistant} onCheckedChange={(v) => setResistant(!!v)} />
              Resistant (half)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={vulnerable} onCheckedChange={(v) => setVulnerable(!!v)} />
              Vulnerable (+half)
            </label>
          </div>
          {waiting.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Damage type ({waiting.join(", ")} {waiting.length === 1 ? "is" : "are"} waiting on this hit)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {["", ...DAMAGE_TYPES].map((x) => (
                  <button key={x || "any"} type="button" onClick={() => setType(x as DamageType | "")} className={cn("rounded-md border py-1 text-xs", type === x ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40")}>
                    {x || "Unsaid"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Cover (Ballistic attacks only)</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {COVER.map((x) => (
                <button key={x.points} type="button" onClick={() => setCover(x.points)} className={cn("rounded-md border py-1 text-xs", cover === x.points ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40")}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useArmor} onCheckedChange={(v) => setUseArmor(!!v)} disabled={character.armor <= 0} />
            Armor protects ({character.armor} Armor)
          </label>
          {(cover > 0 || (useArmor && character.armor > 0)) && (
            <div className="flex items-center justify-between">
              <Label>Armor Piercing</Label>
              <Stepper value={pierce} onChange={setPierce} min={0} max={5} label="armor piercing" size="xs" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {[
              marks.bonus > 0 && `${marks.names.join(" and ")} adds ${marks.bonus}`,
              steps.scaled !== amount + marks.bonus && `${steps.scaled > amount + marks.bonus ? "Vulnerability raises" : "Resistance halves"} it to ${steps.scaled}`,
              steps.cover && `Cover absorbs ${steps.cover}`,
              steps.temp && "Fortified absorbs 1",
              steps.armor && "Armor absorbs 1",
              !steps.armor && steps.stripped && "Corroded leaves Armor stopping nothing",
              steps.stripped > 1 && `${steps.stripped} points of Armor go`,
              steps.pierced && "Armor is pierced",
            ].filter(Boolean).join(", ") || "Nothing absorbs it"}: {character.name} loses <span className="font-medium text-foreground">{steps.lost} HP</span>
            {marks.dice ? `, plus whatever Marked's ${marks.dice}d4 rolls` : ""}.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={pressure} onCheckedChange={(v) => setPressure(!!v)} />
            Gain 1 Pressure (lost 2+ HP; at most once per round)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={injury} onCheckedChange={(v) => setInjury(!!v)} />
            Suffers an Injury (lost 3+ HP from one hit, or dropped to 0)
          </label>
          {injury && <InjuryRollFields value={roll} onChange={setRoll} character={character} />}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={injury && !injuryRoll}
            onClick={() => {
              act(`Damage ${character.name}`, (g) => {
                const c = findChar(g, character.id);
                // Marked's dice are rolled here rather than in the preview, so what's shown doesn't
                // keep changing while the dialog is open.
                const m = marksOn(c, type || null);
                const mark = markDamage(m);
                const out = [...mark.lines];
                applyDamage(g, c, { amount: amount + mark.extra, useArmor, pierce, cover, resistant, vulnerable, gainPressure: pressure, injury: injury ? injuryRoll : null, marks: m }, out);
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

const NO_INJURY = "none";

/** First Aid is a free action: the sheet's character spends a medkit to treat or heal anyone, any time. */
export function FirstAidDialog({ character }: { character: Character }) {
  const act = useGame((s) => s.act);
  const game = useGame((s) => s.game);
  const { isGM } = usePerms();
  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState(character.id);
  const [injuryPick, setInjuryPick] = useState("");
  const [kitPick, setKitPick] = useState("");
  const [clear, setClear] = useState<string[]>([]);
  const patients = game.characters.filter((c) => !c.dead);
  const patient = patients.find((c) => c.id === patientId) ?? patients[0];
  const wounds = patient?.injuries.filter((i) => i.state === "Untreated") ?? [];
  const injury = injuryPick === NO_INJURY ? undefined : (wounds.find((i) => i.id === injuryPick) ?? wounds[0]);
  const kits = medkitsFor(game, character.id);
  const kitKey = (k: { name: string; location: string }) => `${k.location}:${k.name}`;
  const kit = kits.find((k) => kitKey(k) === kitPick) ?? kits[0];
  const pool = firstAidPool(game, character);
  const offers = game.firstAidOffers ?? [];
  const asks = !!patient && !isGM && patient.id !== character.id;
  const offered = !!patient && offers.some((o) => o.healerId === character.id && o.patientId === patient.id);
  const clearing = clear.filter((id) => patient?.conditions.some((x) => x.id === id));
  const kitLabel = (k: (typeof kits)[number]) => `${k.name} (${k.location === "ship" ? "ship storage" : "carried"}, ${k.qty}) · heals ${k.heal}${k.dice ? `, +${k.dice}d6` : ""}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setPatientId(character.id); setInjuryPick(""); setKitPick(""); setClear([]); } }}>
      <DialogTrigger render={<Button size="sm" variant="outline" disabled={character.dead}><BandageIcon /> First Aid</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{character.name} gives First Aid</DialogTitle>
          <DialogDescription>A free skilled roll, no Energy, that uses up a medkit. The kit heals its HP and adds its dice. Treating an Untreated injury takes the first 6 (Major and Deadly injuries still need Surgery afterward); every other 6 heals 1 HP or clears a condition.</DialogDescription>
        </DialogHeader>
        {!kits.length ? (
          <p className="text-sm text-muted-foreground">{character.name} needs a medkit, carried or in ship storage.</p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Patient</Label>
              <Select value={patient?.id ?? ""} onValueChange={(v) => { setPatientId(String(v)); setInjuryPick(""); setClear([]); }}>
                <SelectTrigger className="w-full"><SelectValue>{patient ? `${patient.name}${patient.id === character.id ? " (self)" : ""} · ${patient.hp}/${maxHp(patient)} HP` : "Pick a patient"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {patients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.id === character.id ? " (self)" : ""} · {c.hp}/{maxHp(c)} HP</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Treat</Label>
              <Select value={injury?.id ?? NO_INJURY} onValueChange={(v) => setInjuryPick(String(v))}>
                <SelectTrigger className="w-full"><SelectValue>{injury ? injury.name : "No injury: just heal"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {wounds.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.severity})</SelectItem>)}
                  <SelectItem value={NO_INJURY}>No injury: just heal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Medkit</Label>
              <Select value={kit ? kitKey(kit) : ""} onValueChange={(v) => setKitPick(String(v))}>
                <SelectTrigger className="w-full"><SelectValue>{kit ? kitLabel(kit) : "Pick a medkit"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {kits.map((k) => <SelectItem key={kitKey(k)} value={kitKey(k)}>{kitLabel(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">Rolls {pool.dice + (kit?.dice ?? 0)} dice ({pool.label}{kit?.dice ? ` + ${kit.name} ${kit.dice}` : ""}).</p>
            {patient && patient.conditions.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">6s clear these first, in the order checked. The rest heal HP.</Label>
                {patient.conditions.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={clear.includes(x.id)} onCheckedChange={(v) => setClear((cur) => (v ? [...cur, x.id] : cur.filter((id) => id !== x.id)))} />
                    {x.name}
                    {clear.includes(x.id) && <span className="text-xs text-muted-foreground">#{clearing.indexOf(x.id) + 1}</span>}
                  </label>
                ))}
              </div>
            )}
            {asks && <p className="text-xs text-muted-foreground">{patient.name}&apos;s player (or the GM) accepts before it&apos;s rolled.</p>}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!patient || !kit || offered}
            onClick={() => {
              if (!patient || !kit) return;
              const source = { name: kit.name, location: kit.location };
              if (asks) {
                act(`${character.name} offers First Aid`, (g) => {
                  (g.firstAidOffers ??= []).push({ id: uid(), healerId: character.id, patientId: patient.id, injuryId: injury?.id ?? null, kit: source, clear: clearing });
                  return `🩹 ${character.name} offers ${patient.name} First Aid${injury ? ` for ${injury.name}` : ""}.`;
                });
              } else act(`${character.name} gives First Aid`, (g) => giveFirstAid(g, character.id, patient.id, injury?.id ?? null, source, clearing));
              setOpen(false);
            }}
          >
            {offered ? "Already offered" : asks && patient ? `Offer to ${patient.name}` : "Roll First Aid"}
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
      if (how === "accept") return o.kit ? giveFirstAid(g, o.healerId, o.patientId, o.injuryId, o.kit, o.clear) : "That offer needs a medkit now. Make a new one.";
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
            <span><span className="font-medium">{name(o.healerId)}</span> offers <span className="font-medium">{name(o.patientId)}</span> First Aid{injury ? ` for ${injury.name}` : ""}{o.kit ? ` with a ${o.kit.name}` : ""}.</span>
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
  const [duration, setDuration] = useState<ConditionDuration>("Scene");
  const [roll, setRoll] = useState<RollDraft>(EMPTY_ROLL);
  const injuryRoll = parseRoll(roll);

  const entries = useMemo(() => {
    const list: { code: string; name: string; effect: string; group: string }[] =
      kind === "condition"
        ? CONDITIONS.map((c) => ({ code: c.name, name: c.name, effect: c.effect, group: c.removal ? `Removal: ${c.removal}` : "" }))
        : kind === "injury"
          ? INJURY_TABLE.map((e) => ({ code: e.code, name: e.name, effect: e.effect, group: `${e.code} · ${e.severity} ${e.location}` }))
          : AFFLICTIONS.map((e: TableEntry) => ({ code: e.code, name: e.name, effect: e.effect, group: `${e.code} · ${e.categoryName}` }));
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((e) => e.name.toLowerCase().includes(needle) || e.effect.toLowerCase().includes(needle)) : list;
  }, [kind, q]);

  const title = kind === "injury" ? "Add Injury" : kind === "affliction" ? "Add Affliction" : "Add Condition";

  function add(code: string) {
    act(`${title}: ${character.name}`, (g) => {
      const c = findChar(g, character.id);
      if (kind === "injury") {
        const e = INJURY_BY_CODE[code];
        const out = [`${c.name} gains a ${e.severity} ${e.location} Injury: ${e.name}.`];
        addInjury(g, c, e, out);
        return out;
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
            {kind === "injury" && "Roll two d6 at the table, Severity then Location, and enter them, or pick an injury from the table. Picking skips the injury cap."}
            {kind === "affliction" && "Roll 1d6 for the category and 1d10 for the Affliction. Duplicates are rerolled."}
            {kind === "condition" && "Reapplying a condition refreshes its duration."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Search by name or effect…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
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
            <InjuryRollFields value={roll} onChange={setRoll} character={character} />
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
