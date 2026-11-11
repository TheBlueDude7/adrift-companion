"use client";

import { DicesIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INJURY_LOCATIONS, INJURY_PENALTY } from "@/data/injuries";
import { rollBreakdown } from "@/lib/derive";
import { rollPool, sixes } from "@/lib/dice";
import { injuryFor, resolveInjuryRoll } from "@/lib/injuries";
import { damageSteps } from "@/lib/mechanics";
import { ATTRIBUTES, ATTRIBUTE_NAMES, PRESSURE_STATES, SKILLS, SKILL_BY_KEY, type Attribute, type SkillKey } from "@/lib/rules";
import { useGame } from "@/lib/store";
import type { Character } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { Dice, Stepper } from "./common";

/** A collapsible sandbox inside a quick-reference card. Nothing here changes the game. */
export function TryIt({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-dashed bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-primary select-none group-open:border-b group-open:border-dashed">
        Try it <span className="text-muted-foreground">· nothing is changed or logged</span>
      </summary>
      <div className="grid gap-3 p-3 text-xs">{children}</div>
    </details>
  );
}

/** Living characters, with the viewer's own first. */
export function useRulesCharacters() {
  const characters = useGame((s) => s.game.characters);
  const { myCharacterId } = usePerms();
  const alive = characters.filter((c) => !c.dead);
  return { alive, initial: alive.find((c) => c.id === myCharacterId)?.id ?? alive[0]?.id ?? "" };
}

const NONE = "__none";

export function CharacterSelect({ value, onChange, characters, none }: { value: string; onChange: (id: string) => void; characters: Character[]; none?: string }) {
  const name = characters.find((c) => c.id === value)?.name ?? none ?? "Choose a survivor";
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(!v || v === NONE ? "" : v)}>
      <SelectTrigger size="sm" className="w-full"><SelectValue>{name}</SelectValue></SelectTrigger>
      <SelectContent>
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {characters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex items-center justify-between gap-2">
    <span className="text-muted-foreground">{label}</span>
    {children}
  </label>
);

const Step = ({ children, muted }: { children: ReactNode; muted?: boolean }) => <li className={muted ? "text-muted-foreground" : undefined}>{children}</li>;

const COVER = [
  { value: 0, label: "None" },
  { value: 1, label: "Partial (1)" },
  { value: 2, label: "Strong (2)" },
];

export function DamageTry() {
  const [amount, setAmount] = useState(4);
  const [armor, setArmor] = useState(2);
  const [hp, setHp] = useState(8);
  const [cover, setCover] = useState(0);
  const [pierce, setPierce] = useState(0);
  const [resistant, setResistant] = useState(false);
  const [vulnerable, setVulnerable] = useState(false);
  const s = damageSteps({ armor, hp }, { amount, useArmor: true, pierce, cover, resistant, vulnerable });
  const after = hp - s.lost;

  return (
    <TryIt>
      <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-4">
        <Field label="Damage"><Stepper value={amount} onChange={setAmount} min={1} max={20} size="xs" /></Field>
        <Field label="Armor piercing"><Stepper value={pierce} onChange={setPierce} min={0} max={5} size="xs" /></Field>
        <Field label="Worn Armor"><Stepper value={armor} onChange={setArmor} min={0} max={10} size="xs" /></Field>
        <Field label="Current HP"><Stepper value={hp} onChange={setHp} min={1} max={30} size="xs" /></Field>
        <Field label="Cover (Ballistic)">
          <Select value={String(cover)} onValueChange={(v) => setCover(Number(v))}>
            <SelectTrigger size="sm" className="w-28"><SelectValue>{COVER.find((c) => c.value === cover)?.label}</SelectValue></SelectTrigger>
            <SelectContent>{COVER.map((c) => <SelectItem key={c.value} value={String(c.value)}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5"><Checkbox checked={resistant} onCheckedChange={(v) => setResistant(!!v)} /> Resistant</label>
          <label className="flex items-center gap-1.5"><Checkbox checked={vulnerable} onCheckedChange={(v) => setVulnerable(!!v)} /> Vulnerable</label>
        </div>
      </div>
      <ol className="grid list-decimal gap-0.5 pl-5">
        <Step>A {amount}-damage hit.</Step>
        <Step muted={s.scaled === amount}>
          {resistant && vulnerable ? "Resistance and Vulnerability cancel out." : vulnerable ? `Vulnerability adds half: ${s.scaled}.` : resistant ? `Resistance halves it: ${s.scaled}.` : "No Resistance or Vulnerability."}
        </Step>
        <Step muted={!cover}>{cover ? (pierce >= cover ? `Armor Piercing ${pierce} ignores the Cover.` : `Cover blocks ${s.cover}${pierce ? ` (${pierce} ignored by Armor Piercing)` : ""}; it doesn't wear down.`) : "No Cover."}</Step>
        <Step muted={!s.armor && !s.pierced}>
          {s.pierced ? "Armor Piercing gets past the Armor; it isn't worn down." : s.armor ? `Armor blocks 1 and drops from ${armor} to ${armor - 1}.` : armor ? "Nothing left for the Armor to block." : "No Armor."}
        </Step>
        <Step>Loses <span className="font-semibold">{s.lost} HP</span> ({hp} → {after}).</Step>
      </ol>
      <ul className="grid gap-0.5 border-t pt-2">
        <li className={s.lost >= 2 ? "text-amber-300" : "text-muted-foreground"}>{s.lost >= 2 ? "Gains 1 Pressure (at most once per round)." : "No Pressure (under 2 HP lost)."}</li>
        <li className={s.lost >= 3 || after <= 0 ? "text-rose-300" : "text-muted-foreground"}>{s.lost >= 3 || after <= 0 ? `Rolls an Injury (${after <= 0 ? "dropped to 0 HP" : "3+ HP from one hit"}).` : "No Injury (under 3 HP, still standing)."}</li>
        {after <= 0 && <li className="text-rose-300">Down: a flat Constitution death check at the end of each round.</li>}
      </ul>
    </TryIt>
  );
}

const FACES = [1, 2, 3, 4, 5, 6];
const d6 = () => 1 + Math.floor(Math.random() * 6);

export function InjuryTry() {
  const { alive, initial } = useRulesCharacters();
  const [who, setWho] = useState(initial);
  const [severity, setSeverity] = useState(4);
  const [location, setLocation] = useState(4);
  const c = alive.find((x) => x.id === who);
  const roll = { severity, location };
  const r = c ? resolveInjuryRoll(c, roll) : null;
  const entry = r?.entry ?? injuryFor(roll)!;
  const hits = [...(entry.skills ?? []).map((k) => SKILL_BY_KEY[k].name), ...(entry.attrs ?? []).map((a) => `${ATTRIBUTE_NAMES[a]} rolls`)];

  const die = (value: number, set: (n: number) => void, label: (n: number) => string) => (
    <Select value={String(value)} onValueChange={(v) => set(Number(v))}>
      <SelectTrigger size="sm" className="w-full"><SelectValue>{label(value)}</SelectValue></SelectTrigger>
      <SelectContent>{FACES.map((f) => <SelectItem key={f} value={String(f)}>{label(f)}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <TryIt>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end sm:gap-2">
        <div className="grid gap-1"><span className="text-muted-foreground">Who</span><CharacterSelect value={who} onChange={setWho} characters={alive} none="Nobody (no injuries yet)" /></div>
        <div className="grid gap-1"><span className="text-muted-foreground">Severity d6</span>{die(severity, setSeverity, (f) => `${f} · ${injuryFor({ severity: f, location: 1 })!.severity}`)}</div>
        <div className="grid gap-1"><span className="text-muted-foreground">Location d6</span>{die(location, setLocation, (f) => `${f} · ${INJURY_LOCATIONS[f - 1]}`)}</div>
        <Button size="sm" variant="outline" onClick={() => { setSeverity(d6()); setLocation(d6()); }}><DicesIcon /> Roll</Button>
      </div>
      <div className="grid gap-1">
        <p>
          <span className="font-semibold">{entry.name}</span> <span className="text-muted-foreground">· {entry.severity} {entry.location} ({entry.code})</span>
        </p>
        {r && r.reasons.length > 0 && <p className="text-amber-300">Rolled {r.rolled.name}, but {c!.name} {r.reasons.join(" and ")}, so it&apos;s one step worse.</p>}
        <p className="text-muted-foreground">{entry.effect}</p>
        <ul className="grid list-disc gap-0.5 pl-5">
          {hits.length > 0 && <li>−{INJURY_PENALTY[entry.severity]}d6 to {hits.join(", ")}, applied automatically.</li>}
          {entry.severity !== "Minor" && <li className="text-rose-300">Starts Bleeding.</li>}
          {entry.conditions?.map((n) => <li key={n}>{n} until Surgery.</li>)}
          {entry.deadline && <li className="text-rose-300">Needs Surgery within four segments, counting this one, or the character dies.</li>}
          {entry.permanent && <li>A permanent loss: it never heals naturally and needs a cybernetic or graft.</li>}
          <li className="text-muted-foreground">Untreated, it costs 1 HP at End of Day.</li>
        </ul>
      </div>
    </TryIt>
  );
}

export function PoolTry() {
  const { alive, initial } = useRulesCharacters();
  const [who, setWho] = useState(initial);
  const [what, setWhat] = useState<string>("firstAid");
  const [modifier, setModifier] = useState(0);
  const [dice, setDice] = useState<number[] | null>(null);
  const c = alive.find((x) => x.id === who);
  if (!c) return <TryIt><p className="text-muted-foreground">Add a survivor on the Crew tab to try their dice pools.</p></TryIt>;

  const flat = what.startsWith("flat:");
  const attr: Attribute = flat ? (what.slice(5) as Attribute) : SKILLS.find((s) => s.key === what)!.attr;
  const b = rollBreakdown(c, flat ? null : (what as SkillKey), attr, modifier);
  const label = flat ? `Flat ${ATTRIBUTE_NAMES[attr]}` : SKILLS.find((s) => s.key === what)!.name;
  const n = dice ? sixes(dice) : 0;

  return (
    <TryIt>
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:gap-2">
        <div className="grid gap-1"><span className="text-muted-foreground">Who</span><CharacterSelect value={who} onChange={(v) => { setWho(v); setDice(null); }} characters={alive} /></div>
        <div className="grid gap-1">
          <span className="text-muted-foreground">Roll</span>
          <Select value={what} onValueChange={(v) => { if (v) setWhat(v); setDice(null); }}>
            <SelectTrigger size="sm" className="w-full"><SelectValue>{label}</SelectValue></SelectTrigger>
            <SelectContent>
              {SKILLS.map((s) => <SelectItem key={s.key} value={s.key}>{s.name}</SelectItem>)}
              {ATTRIBUTES.map((a) => <SelectItem key={a} value={`flat:${a}`}>Flat {ATTRIBUTE_NAMES[a]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1"><span className="text-muted-foreground">Modifier</span><Stepper value={modifier} onChange={setModifier} min={-6} max={6} size="xs" /></div>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
        <span>{ATTRIBUTE_NAMES[attr]} {b.attrVal}</span>
        {!flat && <span>+ {label} {b.level}</span>}
        {b.pressure > 0 && <span className="text-amber-300">+ {PRESSURE_STATES[c.pressure].name} {b.pressure}</span>}
        {modifier !== 0 && <span>{modifier > 0 ? "+" : "−"} modifier {Math.abs(modifier)}</span>}
        {b.hurt.sources.map((s) => <span key={s} className="text-rose-300">{s}</span>)}
        <span className="font-semibold">= {b.dice}d6</span>
      </div>
      {flat && <p className="text-muted-foreground">Flat rolls skip the skill and Pressure Dice.</p>}
      {!flat && c.pressure > 0 && <p className="text-muted-foreground">A failure while {PRESSURE_STATES[c.pressure].name}: {PRESSURE_STATES[c.pressure].failure}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={b.dice <= 0} onClick={() => setDice(rollPool(b.dice))}><DicesIcon /> Practice roll</Button>
        {dice && <Dice dice={dice} />}
        {dice && <span className="font-medium">{n === 0 ? "Failure" : n === 1 ? "Success" : `Strong Success (${n} sixes)`}</span>}
      </div>
    </TryIt>
  );
}
