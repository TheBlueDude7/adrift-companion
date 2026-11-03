"use client";

import { useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONDITIONS } from "@/data/compendium";
import { INJURY_BY_CODE, INJURY_PENALTY } from "@/data/injuries";
import { characterAlerts, maxEnergy, maxHp, maxWillpower } from "@/lib/derive";
import { effectiveSeverity } from "@/lib/injuries";
import { activeStressBands, ATTRIBUTE_NAMES, MIND_BREAK_BY_NAME, pressureFloor, PRESSURE_STATES, SEGMENTS, SKILL_BY_KEY } from "@/lib/rules";
import { useGame } from "@/lib/store";
import type { Character, Injury } from "@/lib/types";
import { Pill } from "./common";
import { GlossaryText } from "./glossary";
import { CharacterSelect, useRulesCharacters } from "./rules-tryit";

type Row = { name: ReactNode; tag?: string; text: ReactNode; tone?: "warn" | "danger" | "good" };

function Group({ title, rows, empty }: { title: string; rows: Row[]; empty?: string }) {
  if (!rows.length && !empty) return null;
  return (
    <div className="grid gap-2">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h4>
      {rows.length ? (
        rows.map((r, i) => (
          <div key={i} className={`border-l-2 pl-3 text-sm ${r.tone === "danger" ? "border-l-rose-400/70" : r.tone === "warn" ? "border-l-amber-300/70" : r.tone === "good" ? "border-l-emerald-400/70" : "border-l-border"}`}>
            <p className="font-medium">{r.name}{r.tag && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.tag}</span>}</p>
            <div className="text-muted-foreground">{r.text}</div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function injuryRow(i: Injury, segment: number, day: number): Row {
  const def = i.location ? INJURY_BY_CODE[i.code] : undefined;
  const sev = effectiveSeverity(i);
  const hits = def ? [...(def.skills ?? []).map((k) => SKILL_BY_KEY[k].name), ...(def.attrs ?? []).map((a) => `${ATTRIBUTE_NAMES[a]} rolls`)] : [];
  const notes: string[] = [];
  if (i.legacy) notes.push("Old-table injury: apply its effect by hand.");
  else if (hits.length) notes.push(`−${INJURY_PENALTY[sev]}d6 to ${hits.join(", ")}.`);
  if (i.state === "Untreated") notes.push("Untreated: costs 1 HP at End of Day.");
  if (!i.legacy && !i.operated && sev !== "Minor") notes.push("Needs Surgery to become Minor.");
  if (i.deadline) {
    const due = day > i.deadline.day || (day === i.deadline.day && segment >= i.deadline.segment);
    notes.push(due ? "Surgery is overdue: without it, the character dies." : `Surgery by the end of ${SEGMENTS[i.deadline.segment]}, or the character dies.`);
  }
  if (def?.permanent) notes.push("Permanent: won't heal naturally.");
  else if (sev === "Minor" && i.state === "Treated") notes.push("Can heal on a Rest (natural recovery).");
  return {
    name: i.name,
    tag: `${i.legacy ? i.severity : sev}${i.location ? ` ${i.location}` : ""} · ${i.state}${i.operated ? " · after Surgery" : ""}`,
    text: (
      <>
        <p><GlossaryText text={i.effect} /></p>
        {notes.length > 0 && <p className="mt-0.5 text-foreground/80">{notes.join(" ")}</p>}
      </>
    ),
    tone: i.deadline || i.state === "Untreated" ? "danger" : "warn",
  };
}

function Affecting({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const p = PRESSURE_STATES[c.pressure];
  const floor = pressureFloor(c.stress);
  const alerts = characterAlerts(game, c);

  const status: Row[] = [
    {
      name: <>Pressure: <GlossaryText text={p.name} /></>,
      tag: p.dice ? `+${p.dice}d6 on skill rolls` : "no Pressure Dice",
      text: <>On a failed roll: {p.failure}{floor > 0 && ` Stress ${c.stress} keeps Pressure at ${PRESSURE_STATES[floor].name} or higher.`}</>,
      tone: c.pressure >= 3 ? "danger" : c.pressure >= 1 ? "warn" : undefined,
    },
    ...activeStressBands(c.stress).map((b): Row => ({
      name: <>Stress {c.stress}: {b.name}</>,
      tag: b.min === b.max ? `Stress ${b.min}` : `Stress ${b.min}–${b.max}`,
      text: <GlossaryText text={b.effect} />,
      tone: b.min >= 7 ? "danger" : b.min >= 3 ? "warn" : undefined,
    })),
  ];
  if (c.survival.energyPenalty) status.push({ name: `Max Energy −${c.survival.energyPenalty} today`, text: "From missed Food, Water or sleep at the last End of Day.", tone: "warn" });
  if (c.survival.restBlocked) status.push({ name: "Rest restores no Energy today", text: "From going without Food.", tone: "warn" });

  const conditions = c.conditions.map((x): Row => {
    const def = CONDITIONS.find((d) => d.name === x.name);
    const mb = MIND_BREAK_BY_NAME[x.name];
    return {
      name: mb ? `Mind Break: ${x.name}` : x.name,
      tag: [x.duration, x.notes].filter(Boolean).join(" · "),
      text: (
        <>
          <p><GlossaryText text={def?.effect ?? mb?.effect ?? "No description."} skip={x.name} /></p>
          {def?.removal && <p className="text-xs">Ends: {def.removal}</p>}
        </>
      ),
      tone: mb || x.name === "Bleeding" ? "danger" : "warn",
    };
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill>HP {c.hp}/{maxHp(c)}</Pill>
        <Pill>Energy {c.energy}/{maxEnergy(c)}</Pill>
        <Pill>Willpower {c.willpower}/{maxWillpower(c)}</Pill>
        {alerts.map((a) => <Pill key={a.text} tone={a.tone} tip={a.tip}>{a.text}</Pill>)}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Group title="Pressure and Stress" rows={status} />
        <Group title="Conditions" rows={conditions} empty="No conditions." />
        <Group title="Injuries" rows={c.injuries.map((i) => injuryRow(i, game.segment, game.day))} empty="No injuries." />
        <Group title="Afflictions" rows={c.afflictions.map((a) => ({ name: a.name, tag: a.code, text: <GlossaryText text={a.effect} />, tone: "warn" as const }))} empty="No Afflictions." />
      </div>
    </div>
  );
}

/** Every rule currently in effect on one survivor, in plain words. */
export function AffectingPanel() {
  const { alive, initial } = useRulesCharacters();
  const [who, setWho] = useState(initial);
  const c = alive.find((x) => x.id === who) ?? alive[0];
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>What&apos;s affecting {c ? c.name : "a survivor"}</CardTitle>
        {alive.length > 1 && <div className="w-48"><CharacterSelect value={c?.id ?? ""} onChange={setWho} characters={alive} /></div>}
      </CardHeader>
      <CardContent>{c ? <Affecting c={c} /> : <p className="text-sm text-muted-foreground">No living survivors yet. Add one on the Crew tab.</p>}</CardContent>
    </Card>
  );
}
