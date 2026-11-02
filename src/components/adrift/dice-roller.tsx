"use client";

import { DicesIcon, FlameIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { rollPool, sixes } from "@/lib/dice";
import { attributeValue, skillLevel } from "@/lib/derive";
import { injuryPenalty } from "@/lib/injuries";
import { changePressure, changeStress, clampVitals, findChar, mindBreak, payPush } from "@/lib/mechanics";
import { ATTRIBUTES, ATTRIBUTE_NAMES, PRESSURE_STATES, SKILLS, type Attribute, type SkillKey } from "@/lib/rules";
import { useGame } from "@/lib/store";
import type { Character } from "@/lib/types";
import { Dice, Pill, Stepper } from "./common";

type RollResult = { dice: number[]; pressure: number; pushed: boolean; label: string; combat: boolean };

const COMBAT_FAILURE = [
  "No additional consequence.",
  "No automatic consequence.",
  "Lose 1 current Energy.",
  "Lose all current Energy and gain 1 Pressure.",
  "Lose all current Energy, suffer 2 HP damage, gain 1 Stress, and trigger a Mind Break.",
];

export function DiceRoller({ character, initialSkill, trigger }: { character: Character; initialSkill?: SkillKey; trigger?: React.ReactElement }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<string>(initialSkill ?? "firstAid");
  const [modifier, setModifier] = useState(0);
  const [assist, setAssist] = useState(0);
  const [combat, setCombat] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);

  const flat = what.startsWith("flat:");
  const attr: Attribute = flat ? (what.slice(5) as Attribute) : SKILLS.find((s) => s.key === what)!.attr;
  const skill = flat ? 0 : skillLevel(character, what as SkillKey);
  const attrVal = attributeValue(character, attr);
  const pressureDice = flat ? 0 : PRESSURE_STATES[character.pressure].dice;
  const hurt = injuryPenalty(character, flat ? null : (what as SkillKey), attr);
  const pool = Math.max(0, attrVal + skill + pressureDice + modifier + assist - hurt.dice);
  const label = flat ? `flat ${ATTRIBUTE_NAMES[attr]}` : SKILLS.find((s) => s.key === what)!.name;

  const successes = result ? sixes(result.dice) : 0;
  const outcome = useMemo(() => {
    if (!result) return null;
    if (successes === 0) return { text: "Failure", tone: "danger" as const };
    if (successes === 1) return { text: "Success", tone: "good" as const };
    return { text: `Strong Success · ${successes - 1} extra`, tone: "info" as const };
  }, [result, successes]);

  function roll() {
    const dice = rollPool(pool);
    const r = { dice, pressure: character.pressure, pushed: false, label, combat };
    setResult(r);
    const n = sixes(dice);
    act(
      `${character.name} rolled ${label}`,
      () => `${character.name} rolls ${label} (${pool}d6): [${dice.join(", ")}] — ${n === 0 ? "failure" : n === 1 ? "success" : `${n} successes`}.`,
      "roll",
    );
  }

  function push() {
    if (!result || result.pushed) return;
    const before = character.pressure;
    const out: string[] = [];
    let newPressure = before;
    act(
      `${character.name} pushes`,
      (g) => {
        const c = findChar(g, character.id);
        payPush(g, c, out);
        newPressure = c.pressure;
        const extra = flat ? 0 : Math.max(0, PRESSURE_STATES[c.pressure].dice - PRESSURE_STATES[before].dice);
        const kept = result.dice.filter((v) => v === 6);
        const rerolled = rollPool(result.dice.length - kept.length + extra);
        const dice = [...kept, ...rerolled];
        setResult({ ...result, dice, pressure: newPressure, pushed: true });
        const n = sixes(dice);
        return [
          ...out,
          `Reroll: [${dice.join(", ")}] — ${n === 0 ? "failure" : n === 1 ? "success" : `${n} successes`}.`,
        ];
      },
      "roll",
    );
  }

  function applyFailure() {
    if (!result) return;
    act(
      `${character.name} failure consequence`,
      (g) => {
        const c = findChar(g, character.id);
        const out: string[] = [];
        const p = c.pressure;
        if (result.combat) {
          if (p === 2) c.energy = Math.max(0, c.energy - 1);
          if (p === 3) {
            c.energy = 0;
            changePressure(g, c, 1, out);
          }
        } else {
          if (p === 1) c.pressure = 2;
          if (p === 2) {
            c.energy = Math.max(0, c.energy - 1);
            changeStress(c, 1, out);
          }
          if (p === 3) {
            c.energy = 0;
            changePressure(g, c, 1, out);
            changeStress(c, 1, out);
          }
        }
        if (p === 4) {
          c.energy = 0;
          c.hp = Math.max(0, c.hp - 2);
          changeStress(c, 1, out);
          out.push(mindBreak(c));
        }
        clampVitals(c);
        return [`${c.name} suffers the ${PRESSURE_STATES[p].name} failure consequence.`, ...out];
      },
      "danger",
    );
    toast.warning(`${PRESSURE_STATES[character.pressure].name} consequence applied`);
    setResult(null);
  }

  const failureText = combat ? COMBAT_FAILURE[character.pressure] : PRESSURE_STATES[character.pressure].failure;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setResult(null);
        if (o && initialSkill) setWhat(initialSkill);
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <DicesIcon /> Roll
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skill roll · {character.name}</DialogTitle>
          <DialogDescription>Roll Attribute + Skill + Pressure dice. Each 6 is a success.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Roll</Label>
            <Select value={what} onValueChange={(v) => { setWhat(v as string); setResult(null); }}>
              <SelectTrigger className="w-full">
                <SelectValue>{label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SKILLS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.name} <span className="text-muted-foreground">({s.attr} {attributeValue(character, s.attr)} + {skillLevel(character, s.key)})</span>
                  </SelectItem>
                ))}
                {ATTRIBUTES.map((a) => (
                  <SelectItem key={a} value={`flat:${a}`}>
                    Flat {ATTRIBUTE_NAMES[a]} roll
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Modifier dice</Label>
              <Stepper value={modifier} onChange={setModifier} min={-6} max={6} label="modifier" />
            </div>
            <div className="grid gap-1.5">
              <Label>Assistant&apos;s skill</Label>
              <Stepper value={assist} onChange={setAssist} min={0} max={4} label="assist" />
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
            <span>Combat roll <span className="text-muted-foreground">(uses combat Pressure table)</span></span>
            <Switch checked={combat} onCheckedChange={setCombat} />
          </label>

          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{attr} {attrVal}</span>
              {!flat && <span>+ skill {skill}</span>}
              {pressureDice > 0 && <span className="text-amber-300">+ {PRESSURE_STATES[character.pressure].name} {pressureDice}</span>}
              {modifier !== 0 && <span>{modifier > 0 ? "+" : "−"} mod {Math.abs(modifier)}</span>}
              {assist > 0 && <span>+ assist {assist}</span>}
              {hurt.sources.map((s) => <span key={s} className="text-rose-300">{s}</span>)}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {pool > 0 ? `${pool}d6` : "No dice — the task cannot succeed"}
            </div>
          </div>

          {result && outcome && (
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Pill tone={outcome.tone} className="text-sm">{outcome.text}</Pill>
                {result.pushed && <Pill tone="warn">Pushed</Pill>}
              </div>
              <Dice dice={result.dice} />
              {successes === 0 && character.pressure > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="text-amber-300">{PRESSURE_STATES[character.pressure].name}:</span> {failureText}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!result.pushed && successes < result.dice.length && (
                  <Button size="sm" variant="outline" onClick={push}>
                    <FlameIcon /> {character.energy > 0 ? "Push (−1 Energy, +1 Pressure)" : "Push while Exhausted (Affliction, +1 Pressure)"}
                  </Button>
                )}
                {successes === 0 && character.pressure > 0 && (
                  <Button size="sm" variant="destructive" onClick={applyFailure}>
                    Apply failure consequence
                  </Button>
                )}
              </div>
            </div>
          )}

          <Button onClick={roll} disabled={pool <= 0} size="lg">
            <DicesIcon /> {result ? "Roll again" : "Roll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
