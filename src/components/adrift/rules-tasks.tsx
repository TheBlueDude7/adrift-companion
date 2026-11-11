"use client";

import { useState, type ReactNode } from "react";
import { ListChecksIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  EXPERT_MARGIN,
  LABOR_EXPERT_MARGIN,
  LABOR_PRACTICED_MARGIN,
  PRACTICED_MARGIN,
  SHIPBOARD_TASKS,
  TASK_GROUPS,
  type ShipboardTask,
  type TaskMode,
} from "@/data/tasks";
import { attributeValue, skillLevel } from "@/lib/derive";
import { taskRequirement } from "@/lib/glossary";
import { ATTRIBUTE_NAMES, SKILL_BY_KEY } from "@/lib/rules";
import type { Character } from "@/lib/types";
import { Pill } from "./common";
import { GlossaryText } from "./glossary";
import { CharacterSelect, useRulesCharacters } from "./rules-tryit";

/**
 * Every task in one place, read from `SHIPBOARD_TASKS`, which is the same table the Actions planner
 * prices and resolves with. Pick a survivor and each card says where they stand on it.
 */

const MODES: { mode: TaskMode; label: string; tone: "good" | "warn" | "danger" }[] = [
  { mode: "routine", label: "Routine", tone: "good" },
  { mode: "skilled", label: "Skilled", tone: "warn" },
  { mode: "crisis", label: "Crisis", tone: "danger" },
];
const MODE_BY_KEY = Object.fromEntries(MODES.map((m) => [m.mode, m])) as Record<TaskMode, (typeof MODES)[number]>;

const skillNames = (t: ShipboardTask) => t.skills.map((k) => SKILL_BY_KEY[k].name);

/** The best level and pool this survivor brings to the task, before Pressure, injuries and gear. */
function bestFor(c: Character, t: ShipboardTask) {
  if (t.labor) {
    const str = attributeValue(c, "STR");
    return { level: str, pool: str, using: "Strength" };
  }
  const options = t.skills.map((k) => {
    const level = skillLevel(c, k);
    const attr = t.attr ?? SKILL_BY_KEY[k].attr;
    return { level, pool: level + attributeValue(c, attr), using: `${ATTRIBUTE_NAMES[attr]} + ${SKILL_BY_KEY[k].name}` };
  });
  return options.sort((a, b) => b.level - a.level || b.pool - a.pool)[0] ?? null;
}

function standing(c: Character, t: ShipboardTask): { text: string; tone: "good" | "warn" | "danger" | "info" | "muted" } | null {
  const best = bestFor(c, t);
  if (!best) return null;
  const pool = `${best.pool}d6 (${best.using})`;
  if (t.mode === "crisis") return { text: `Always rolled: ${c.name} rolls ${pool}.`, tone: "danger" };
  if (t.mode === "skilled" || !t.threshold) return { text: `Rolled: ${c.name} rolls ${pool}.`, tone: "warn" };
  const practiced = t.labor ? LABOR_PRACTICED_MARGIN : PRACTICED_MARGIN;
  const expert = t.expertAt ?? (t.labor ? LABOR_EXPERT_MARGIN : EXPERT_MARGIN);
  if (best.level < t.threshold) return { text: `Rolled: ${c.name} has ${best.level} of the ${t.threshold} needed for Routine, so rolls ${pool}.`, tone: "warn" };
  const margin = best.level - t.threshold;
  const cheaper = margin >= practiced && t.energy > 0;
  if (margin >= expert && t.strong) return { text: `Expert: Routine for ${c.name}, who gets the Strong Result without rolling${cheaper ? " and spends 1 less Energy" : ""}.`, tone: "good" };
  if (cheaper) return { text: `Practiced: Routine for ${c.name}, and it costs 1 less Energy.`, tone: "good" };
  return { text: `Routine for ${c.name}: it succeeds without a roll, given tools and no threat.`, tone: "good" };
}

function TaskCard({ t, who }: { t: ShipboardTask; who?: Character }) {
  const mode = MODE_BY_KEY[t.mode];
  const req = taskRequirement(t);
  const me = who && standing(who, t);
  return (
    <div className="grid gap-1.5 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-medium">{t.name}</span>
        <Pill tone={mode.tone}>{mode.label}</Pill>
        <Pill>{t.energy ? `${t.energy} Energy` : "No Energy"}</Pill>
        {req && <Pill>{req}</Pill>}
        {t.free && <Pill tone="info">Free action</Pill>}
        {t.anywhere && <Pill tone="info">Works off the ship</Pill>}
        {t.facility && <Pill tone="warn">Needs {t.facility.label}</Pill>}
        {t.gmResolves && <Pill>GM resolves</Pill>}
      </div>
      <p className="text-muted-foreground"><GlossaryText text={t.result} skip={t.name} /></p>
      {t.strong && !t.noStrong && <p className="text-xs"><span className="font-medium">Strong Result:</span> <span className="text-muted-foreground"><GlossaryText text={t.strong} skip={t.name} /></span></p>}
      {me && <p className="text-xs"><Pill tone={me.tone}>{me.text}</Pill></p>}
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <Button size="xs" variant={on ? "default" : "outline"} onClick={onClick}>{children}</Button>;
}

export function TaskRules() {
  const { alive, initial } = useRulesCharacters();
  const [who, setWho] = useState(initial);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [mode, setMode] = useState<TaskMode | null>(null);
  const [offShip, setOffShip] = useState(false);
  const character = alive.find((c) => c.id === who);
  const n = q.trim().toLowerCase();

  const shown = SHIPBOARD_TASKS.filter(
    (t) =>
      (!group || t.group === group) &&
      (!mode || t.mode === mode) &&
      (!offShip || t.anywhere || t.group === "Expedition") &&
      (!n || `${t.name} ${t.group} ${t.result} ${t.strong ?? ""} ${skillNames(t).join(" ")} ${t.facility?.label ?? ""}`.toLowerCase().includes(n)),
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListChecksIcon className="size-4 text-muted-foreground" /> How a task works</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <ul className="grid list-disc gap-1 pl-5">
            {[
              "Each segment, a survivor takes one task. It costs the Energy listed, and Pushing buys one more.",
              "Routine: at or above the task's threshold, with the right tools and no threat, it succeeds without a roll. Below it, the task is Skilled and rolls Attribute + Skill + Pressure Dice; any 6 succeeds.",
              `Practiced: ${PRACTICED_MARGIN}+ levels above the threshold costs 1 less Energy. Expert: ${EXPERT_MARGIN}+ above earns the Strong Result without rolling.`,
              "Skilled tasks always roll. Crisis tasks always roll even for experts, and the GM says what failure will cost first.",
              `Labor tasks need no training: Strength stands in for the Skill Level, with Practiced at ${LABOR_PRACTICED_MARGIN}+ and Expert at ${LABOR_EXPERT_MARGIN}+ above the threshold.`,
              "Most tasks need the ship. Ones marked \"Works off the ship\", and the Expedition tasks, can be taken away on an expedition.",
            ].map((s, i) => <li key={i}><GlossaryText text={s} /></li>)}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search tasks, skills, or rooms…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-56"><CharacterSelect value={who} onChange={setWho} characters={alive} none="No survivor" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle on={group === null} onClick={() => setGroup(null)}>All</Toggle>
          {TASK_GROUPS.map((g) => <Toggle key={g} on={group === g} onClick={() => setGroup(group === g ? null : g)}>{g}</Toggle>)}
          <span className="mx-1 h-4 w-px bg-border" />
          {MODES.map((m) => <Toggle key={m.mode} on={mode === m.mode} onClick={() => setMode(mode === m.mode ? null : m.mode)}>{m.label}</Toggle>)}
          <Toggle on={offShip} onClick={() => setOffShip(!offShip)}>Works off the ship</Toggle>
          <span className="ml-1 text-xs text-muted-foreground">{shown.length} of {SHIPBOARD_TASKS.length}</span>
        </div>
      </div>

      {TASK_GROUPS.map((g) => {
        const list = shown.filter((t) => t.group === g);
        if (!list.length) return null;
        return (
          <Card key={g} className="min-w-0">
            <CardHeader><CardTitle className="text-base">{g}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 lg:grid-cols-2">{list.map((t) => <TaskCard key={t.name} t={t} who={character} />)}</CardContent>
          </Card>
        );
      })}

      {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">No task matches that.</p>}
    </div>
  );
}
