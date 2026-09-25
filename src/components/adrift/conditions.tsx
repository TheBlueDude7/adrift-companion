"use client";

import { ClapperboardIcon, PlusIcon, RotateCwIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONDITIONS } from "@/data/compendium";
import { applyCondition, endRound, endScene, findChar } from "@/lib/mechanics";
import {
  BENEFICIAL_CONDITIONS,
  COMMON_CONDITIONS,
  CONDITION_DURATIONS,
  CONDITION_GROUPS,
  INSTANT_CONDITIONS,
  MIND_BREAK_BY_NAME,
  defaultDuration,
  type ConditionDuration,
} from "@/lib/rules";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import type { Character } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tip } from "./common";

const effectOf = (name: string): { effect: string; removal?: string } | undefined =>
  CONDITIONS.find((c) => c.name === name) ??
  (MIND_BREAK_BY_NAME[name] && { effect: MIND_BREAK_BY_NAME[name].effect, removal: "Lasts until the immediate danger ends (the scene), or the GM clears it." });

export function conditionTip(name: string) {
  const e = effectOf(name);
  if (!e) return null;
  return (
    <span className="grid gap-1">
      <span className="font-semibold">{MIND_BREAK_BY_NAME[name] ? `Mind Break: ${name}` : name}</span>
      <span>{e.effect}</span>
      {e.removal && <span className="opacity-80">Removal: {e.removal}</span>}
    </span>
  );
}

function chipTone(name: string, active: boolean) {
  if (!active) return "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground";
  if (BENEFICIAL_CONDITIONS.has(name)) return "border-emerald-400/60 bg-emerald-500/15 text-emerald-100";
  if (name === "Bleeding" || name === "Burning" || MIND_BREAK_BY_NAME[name]) return "border-rose-400/60 bg-rose-500/15 text-rose-100";
  return "border-amber-300/60 bg-amber-400/15 text-amber-100";
}

export function ConditionChips({ c, size = "sm" }: { c: Character; size?: "sm" | "xs" }) {
  const act = useGame((s) => s.act);
  const canEdit = usePerms().canEditCharacter(c.id);
  if (c.conditions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {c.conditions.map((k) => (
        <Tip key={k.id} content={conditionTip(k.name)}>
        <span
          className={cn("inline-flex cursor-help items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2", size === "xs" ? "text-[11px]" : "text-xs", chipTone(k.name, true))}
        >
          {k.name}
          <span className="opacity-60">· {k.duration}</span>
          <button
            disabled={!canEdit}
            className="rounded-full p-0.5 hover:bg-black/30 disabled:hidden"
            aria-label={`Remove ${k.name} from ${c.name}`}
            onClick={(e) => {
              e.stopPropagation();
              act(`Remove ${k.name}`, (g) => {
                const x = findChar(g, c.id);
                x.conditions = x.conditions.filter((i) => i.id !== k.id);
                return `${x.name} is no longer ${k.name}.`;
              });
            }}
          >
            <XIcon className="size-3" />
          </button>
        </span>
        </Tip>
      ))}
    </div>
  );
}

/** One-click toggles for the most common conditions on a single character. */
export function QuickConditions({ c }: { c: Character }) {
  const act = useGame((s) => s.act);
  return (
    <div className="flex flex-wrap gap-1">
      {COMMON_CONDITIONS.map((name) => {
        const active = c.conditions.some((x) => x.name === name);
        return (
          <Tip key={name} content={conditionTip(name)}>
          <button
            onClick={() =>
              act(`${name} → ${c.name}`, (g) => {
                const x = findChar(g, c.id);
                if (active) {
                  x.conditions = x.conditions.filter((k) => k.name !== name);
                  return `${x.name} is no longer ${name}.`;
                }
                const out: string[] = [];
                applyCondition(g, x, name, defaultDuration(name), out);
                return out;
              }, active ? "info" : "danger")
            }
            className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", chipTone(name, active))}
          >
            {active ? "✓ " : "+ "}
            {name}
          </button>
          </Tip>
        );
      })}
    </div>
  );
}

export function ApplyConditionDialog({ targets: initialTargets, trigger }: { targets?: string[]; trigger?: React.ReactElement }) {
  const characters = useGame((s) => s.game.characters);
  const act = useGame((s) => s.act);
  const perms = usePerms();
  const alive = characters.filter((c) => !c.dead && perms.canEditCharacter(c.id));
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [duration, setDuration] = useState<ConditionDuration | "default">("default");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CONDITION_GROUPS.map((grp) => ({
      ...grp,
      conditions: grp.conditions.filter((n) => !needle || n.toLowerCase().includes(needle) || (effectOf(n)?.effect ?? "").toLowerCase().includes(needle)),
    })).filter((g) => g.conditions.length > 0);
  }, [q]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function apply() {
    act("Apply conditions", (g) => {
      const out: string[] = [];
      for (const id of targets) {
        const c = g.characters.find((x) => x.id === id);
        if (!c) continue;
        for (const name of picked) applyCondition(g, c, name, duration === "default" ? defaultDuration(name) : duration, out);
      }
      return out;
    }, "danger");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTargets(initialTargets ?? []);
          setPicked([]);
          setDuration("default");
          setQ("");
        }
      }}
    >
      <DialogTrigger render={trigger ?? <Button size="sm" variant="outline"><PlusIcon /> Condition</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply conditions</DialogTitle>
          <DialogDescription>Pick survivors and conditions, then apply them all at once. Drained, Frightened, and repeat Bleeding or Burning resolve their effects automatically.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Survivors</span>
            <Button size="xs" variant="ghost" onClick={() => setTargets(targets.length === alive.length ? [] : alive.map((c) => c.id))}>
              {targets.length === alive.length ? "Clear" : "Everyone"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alive.length === 0 && <p className="text-sm text-muted-foreground">No living survivors.</p>}
            {alive.map((c) => (
              <button key={c.id} onClick={() => setTargets(toggle(targets, c.id))} className={cn("rounded-lg border px-3 py-1.5 text-sm transition-colors", targets.includes(c.id) ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40")}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search conditions or effects…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={duration} onValueChange={(v) => setDuration(v as ConditionDuration | "default")}>
            <SelectTrigger className="w-44"><SelectValue>{duration === "default" ? "Default duration" : duration}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default duration</SelectItem>
              {CONDITION_DURATIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-[38vh] pr-3">
          <div className="grid gap-3">
            {groups.map((grp) => (
              <div key={grp.name}>
                <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{grp.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {grp.conditions.map((n) => (
                    <Tip key={n} content={conditionTip(n)}>
                      <button onClick={() => setPicked(toggle(picked, n))} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", chipTone(n, picked.includes(n)))}>
                        {n}
                        {INSTANT_CONDITIONS.has(n) && <span className="ml-1 opacity-60">instant</span>}
                      </button>
                    </Tip>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No condition matches “{q}”.</p>}
          </div>
        </ScrollArea>

        {picked.length > 0 && (
          <div className="grid max-h-36 gap-1.5 overflow-y-auto rounded-lg bg-muted/40 p-3 text-xs">
            {picked.map((n) => (
              <p key={n}>
                <span className="font-medium text-foreground">{n}</span>
                <span className="text-muted-foreground"> · {INSTANT_CONDITIONS.has(n) ? "resolves immediately" : duration === "default" ? defaultDuration(n) : duration} — {effectOf(n)?.effect}</span>
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button disabled={targets.length === 0 || picked.length === 0} onClick={apply}>
            Apply {picked.length || ""} condition{picked.length === 1 ? "" : "s"} to {targets.length || ""} survivor{targets.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SceneControls() {
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  if (!isGM) return null;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="outline" title="Bleeding and Burning deal damage, Suffocating adds Pressure, Brief conditions end" onClick={() => act("End round", (g) => endRound(g), "danger")}>
        <RotateCwIcon /> End round
      </Button>
      <Button size="sm" variant="outline" title="Clears Brief and Scene conditions, resets once-per-combat abilities" onClick={() => act("End scene", (g) => endScene(g))}>
        <ClapperboardIcon /> End scene
      </Button>
    </div>
  );
}
