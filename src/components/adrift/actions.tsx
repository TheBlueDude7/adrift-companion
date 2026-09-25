"use client";

import { CheckIcon, ClipboardListIcon, DicesIcon, FlameIcon, HandIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SHIPBOARD_TASKS, TASK_GROUPS } from "@/data/tasks";
import { TRAINING_BANDS } from "@/data/training";
import { actionsNow, canPush, craftList, energyShort, masterPilotReady, needsPermission, newAction, overdueActions, playerResolves, rolledStatus, scanRadius, taskPool, trainingCost, resolveAction, targetName, taskFor, taskTerms, whenLabel, type Resolution } from "@/lib/actions";
import { sixes } from "@/lib/dice";
import { craftBlocker, FABRICATE_LIMIT, FABRICATE_RECIPES, fabricateCost, fabricateLimit, RECIPE_BY_NAME, recipeSkills } from "@/lib/crafting";
import { maxEnergy, skillLevel } from "@/lib/derive";
import { SPACE_TILES, SPACE_TILE_BY_KEY, cellKey, tileDistance, tileLabel } from "@/lib/maps";
import { planMove, shipMap } from "@/lib/power";
import { PRESSURE_STATES, SEGMENTS, SKILL_BY_KEY, SKILLS, xpForNextLevel, type SkillKey } from "@/lib/rules";
import { haveInStorage, recipeText, shortfalls, toolkitCharges } from "@/lib/stock";
import { useGame } from "@/lib/store";
import { resolveOwnTask, type TaskStep } from "@/lib/sync/client";
import type { Character, SegmentAction, SpaceTile, StarMap, TilePos } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { Dice, EmptyState, Pill, Stepper } from "./common";
import { DiceRoller } from "./dice-roller";
import { PowerCells } from "./power";

const MODE_TONE = { routine: "good", skilled: "warn", crisis: "danger" } as const;

const STATUS_LABEL: Record<SegmentAction["status"], string> = { planned: "Planned", success: "Success", strong: "Strong success", failed: "Failed", cancelled: "Called off" };
const STATUS_TONE = { planned: "info", success: "good", strong: "good", failed: "danger", cancelled: "muted" } as const;

function TermsPills({ a }: { a: SegmentAction }) {
  const game = useGame((s) => s.game);
  const t = taskTerms(game, a);
  return (
    <span className="flex flex-wrap gap-1">
      <Pill tone={t.routine ? "good" : MODE_TONE[t.mode === "routine" ? "skilled" : t.mode]}>{t.routine ? "Routine" : t.mode === "crisis" ? "Crisis" : "Skilled"}</Pill>
      <Pill>{t.energy} Energy</Pill>
      {t.skill && <Pill tone="info">{t.routine ? `${t.poolLabel.split(" + ")[1]} ≥ ${t.threshold}` : `Roll ${t.dice}d6 · ${t.poolLabel}`}</Pill>}
      {t.perks.map((p) => <Pill key={p} tone="good">{p}</Pill>)}
      {t.blocker && <Pill tone="warn">{t.blocker}</Pill>}
    </span>
  );
}

/** Tiles a course or scan can aim for: charted contacts and the tiles around the ship. */
function tileOptions(map: StarMap) {
  const out: { pos: TilePos; label: string }[] = [];
  const at = map.shipAt;
  for (const n of map.nodes) {
    if (at && n.x === at.x && n.y === at.y) continue;
    out.push({ pos: { x: n.x, y: n.y }, label: `${n.name} · ${at ? `${tileDistance(at, n)} away` : tileLabel(map, n)}` });
  }
  if (at) {
    const dirs: [number, number, string][] = [[0, -1, "North"], [1, -1, "Northeast"], [1, 0, "East"], [1, 1, "Southeast"], [0, 1, "South"], [-1, 1, "Southwest"], [-1, 0, "West"], [-1, -1, "Northwest"]];
    for (const [dx, dy, name] of dirs) {
      const pos = { x: at.x + dx, y: at.y + dy };
      if (pos.x < 0 || pos.y < 0 || pos.x >= map.size || pos.y >= map.size) continue;
      if (out.some((o) => o.pos.x === pos.x && o.pos.y === pos.y)) continue;
      const tile = map.tiles[cellKey(pos.x, pos.y)];
      out.push({ pos, label: `${name} (${tileLabel(map, pos)}) · ${tile ? SPACE_TILE_BY_KEY[tile].name : "Unscanned"}` });
    }
  }
  return out;
}

function TargetPicker({ value, onChange, move }: { value: TilePos | null; onChange: (v: TilePos | null) => void; move: boolean }) {
  const game = useGame((s) => s.game);
  const map = shipMap(game);
  const [custom, setCustom] = useState(false);
  if (!map) return <p className="text-xs text-muted-foreground">No star map yet. The GM can chart the system on the Map tab.</p>;
  const options = tileOptions(map);
  const key = value ? cellKey(value.x, value.y) : "";
  const known = options.some((o) => cellKey(o.pos.x, o.pos.y) === key);
  const east = value ? value.x - map.star.x : 0;
  const north = value ? map.star.y - value.y : 0;
  const clamp = (n: number) => Math.max(0, Math.min(map.size - 1, n));
  return (
    <div className="grid gap-1.5">
      <Label>Destination</Label>
      <Select
        value={custom || (value && !known) ? "custom" : key || "none"}
        onValueChange={(v) => {
          if (v === "custom") { setCustom(true); if (!value && map.shipAt) onChange({ ...map.shipAt }); return; }
          setCustom(false);
          const o = options.find((x) => cellKey(x.pos.x, x.pos.y) === v);
          onChange(o ? o.pos : null);
        }}
      >
        <SelectTrigger className="w-full"><SelectValue>{custom || (value && !known) ? `Coordinates ${value ? tileLabel(map, value) : ""}` : (options.find((o) => cellKey(o.pos.x, o.pos.y) === key)?.label ?? "Pick a tile")}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Pick a tile</SelectItem>
          {options.map((o) => <SelectItem key={cellKey(o.pos.x, o.pos.y)} value={cellKey(o.pos.x, o.pos.y)}>{o.label}</SelectItem>)}
          <SelectItem value="custom">Coordinates…</SelectItem>
        </SelectContent>
      </Select>
      {(custom || (value && !known)) && (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">East (+) / West (−)<Input type="number" value={east} onChange={(e) => onChange({ x: clamp(map.star.x + Number(e.target.value)), y: value?.y ?? map.star.y })} /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">North (+) / South (−)<Input type="number" value={north} onChange={(e) => onChange({ x: value?.x ?? map.star.x, y: clamp(map.star.y - Number(e.target.value)) })} /></label>
        </div>
      )}
      {value && map.shipAt && (move ? <MovePreview map={map} to={value} /> : <p className="text-[11px] text-muted-foreground">{tileDistance(map.shipAt, value)} tiles from the ship · the sensors reach {scanRadius(game)}.</p>)}
    </div>
  );
}

function MovePreview({ map, to }: { map: StarMap; to: TilePos }) {
  const game = useGame((s) => s.game);
  const plan = planMove(game, map, to);
  const tile = map.tiles[cellKey(to.x, to.y)];
  return (
    <p className={cn("text-[11px]", plan.blocker ? "text-amber-300" : "text-muted-foreground")}>
      {plan.dist} tile{plan.dist === 1 ? "" : "s"} from the ship · {tile ? SPACE_TILE_BY_KEY[tile].name : "Unscanned"}
      {plan.blocker ? `. ${plan.blocker}.` : plan.cell ? `. Moving there burns a ${plan.cell.name}.` : ""}
    </p>
  );
}

const CRAFT_CATEGORIES = Array.from(new Set(FABRICATE_RECIPES.map((r) => r.category)));

function CraftPicker({ c, value, onChange }: { c: Character; value: string[]; onChange: (v: string[]) => void }) {
  const game = useGame((s) => s.game);
  const limit = fabricateLimit(c.specialty);
  const cost = fabricateCost(value);
  const short = new Map(shortfalls(game, cost.inputs, cost.toolkit).map((s) => [s.name, s]));
  const blockers = Array.from(new Set(value.map((n) => RECIPE_BY_NAME[n] && craftBlocker(game, RECIPE_BY_NAME[n])).filter(Boolean)));
  const slots = Math.min(limit, value.length + 1);
  const setAt = (i: number, name: string | null) => {
    const next = [...value];
    if (name) next[i] = name;
    else next.splice(i, 1);
    onChange(next);
  };
  return (
    <div className="grid gap-1.5">
      <Label>Items to make</Label>
      {Array.from({ length: slots }, (_, i) => (
        <Select key={i} value={value[i] ?? "none"} onValueChange={(v) => setAt(i, v === "none" ? null : (v as string))}>
          <SelectTrigger className="w-full" aria-label={`Item ${i + 1}`}><SelectValue>{value[i] ?? (i === 0 ? "Pick an item" : "Add another item (optional)")}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{i === 0 ? "Pick an item" : "None"}</SelectItem>
            {CRAFT_CATEGORIES.map((cat) => (
              <SelectGroup key={cat}>
                <SelectLabel>{cat}</SelectLabel>
                {FABRICATE_RECIPES.filter((r) => r.category === cat).map((r) => (
                  <SelectItem key={r.name} value={r.name}>
                    {r.name}
                    <span className="text-muted-foreground">{r.tier ? ` · ${r.tier}` : ""} · {recipeSkills(r).map((s) => `${SKILL_BY_KEY[s.skill].name} ${s.threshold}`).join(" or ")}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ))}
      {value.length > 0 && (
        <div className="grid gap-0.5 rounded-md bg-muted/30 p-2 text-[11px]">
          <p className="text-muted-foreground">Draws from ship storage when the GM resolves it</p>
          {cost.inputs.map((p) => (
            <p key={p.name} className="flex justify-between">
              <span>{p.qty}× {p.name}</span>
              <span className={cn("font-mono", short.has(p.name) ? "text-rose-300" : "text-muted-foreground")}>{haveInStorage(game, p.name)} in hold</span>
            </p>
          ))}
          {cost.toolkit > 0 && (
            <p className="flex justify-between">
              <span>{cost.toolkit} toolkit charge{cost.toolkit > 1 ? "s" : ""}</span>
              <span className={cn("font-mono", short.has("Toolkit charges") ? "text-rose-300" : "text-muted-foreground")}>{toolkitCharges(game)} left</span>
            </p>
          )}
          {blockers.map((b) => <p key={b} className="text-amber-300">{b}.</p>)}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Up to {FABRICATE_LIMIT} items per segment, any mix, repeats allowed.{limit > FABRICATE_LIMIT ? " Redline Familiarity can overdrive the bench for a third, once per day." : ""} A failed item loses half its materials (rounded up) and its toolkit charges.
      </p>
    </div>
  );
}

function TrainPicker({ c, value, onChange }: { c: Character; value: SkillKey | undefined; onChange: (v: SkillKey) => void }) {
  const game = useGame((s) => s.game);
  const cost = value ? trainingCost(c, value) : null;
  const have = cost ? haveInStorage(game, cost.name) : 0;
  return (
    <div className="grid gap-1.5">
      <Label>Skill to train</Label>
      <Select value={value ?? "none"} onValueChange={(v) => v !== "none" && onChange(v as SkillKey)}>
        <SelectTrigger className="w-full" aria-label="Skill to train"><SelectValue>{value ? `${SKILL_BY_KEY[value].name} ${skillLevel(c, value)}` : "Pick a skill"}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Pick a skill</SelectItem>
          {SKILLS.map((s) => {
            const next = trainingCost(c, s.key);
            return (
              <SelectItem key={s.key} value={s.key} disabled={!next}>
                {s.name} {skillLevel(c, s.key)}
                <span className="text-muted-foreground"> · {next ? `1 ${next.name}` : "maxed"}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {value && cost && (
        <p className={cn("text-[11px]", have < 1 ? "text-rose-300" : "text-muted-foreground")}>
          Toward {SKILL_BY_KEY[value].name} {cost.next} ({TRAINING_BANDS[cost.band]}): uses 1 {cost.name} · {have} in hold · {c.skillXp[value]}/{xpForNextLevel(skillLevel(c, value))} XP
        </p>
      )}
    </div>
  );
}

function PlanDialog({ c, existing, trigger }: { c: Character; existing?: SegmentAction; trigger: React.ReactElement }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SegmentAction>(() => existing ?? newAction(game, c, "Rest"));
  const def = taskFor(draft);
  const short = energyShort(game, draft);
  const projects = game.ship.projects.filter((p) => !p.done);
  const assistable = actionsNow(game).filter((a) => a.characterId !== c.id && a.status === "planned" && taskFor(a).effect !== "assist");
  const set = (patch: Partial<SegmentAction>) => setDraft((d) => ({ ...d, ...patch }));
  const missing = (def.effect === "project" && !draft.projectId) || (def.effect === "course" && !draft.target) || (def.effect === "assist" && !draft.assists) || (def.effect === "craft" && !draft.crafts?.length) || (def.effect === "train" && !draft.trainSkill);

  function save(ask = false) {
    const d = { ...draft, detail: draft.detail.trim() };
    if (ask) d.approval = "pending";
    else if (isGM && short > 0) d.approval = "granted";
    else delete d.approval;
    if (def.effect !== "project") d.projectId = null;
    if (def.effect !== "course" && def.effect !== "scan") d.target = null;
    if (def.effect !== "assist") d.assists = null;
    if (def.effect !== "craft") delete d.crafts;
    if (def.effect !== "train") delete d.trainSkill;
    act(existing ? "Edit task" : "Plan task", (g) => {
      const i = g.actions.findIndex((a) => a.id === d.id);
      if (i >= 0) g.actions[i] = d;
      else g.actions.push(d);
      const where = targetName(g, d.target);
      const project = g.ship.projects.find((p) => p.id === d.projectId);
      return `${c.name} ${existing ? "changes their plan" : "plans"} for ${SEGMENTS[d.segment]}: ${d.task}${project ? ` on ${project.name}` : ""}${where ? ` toward ${where}` : ""}${d.crafts?.length ? `: ${craftList(d.crafts)}` : ""}${d.detail ? ` (“${d.detail}”)` : ""}.${ask ? ` They're ${short} Energy short and ask the GM for permission.` : ""}`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(existing ?? newAction(game, c, "Rest")); }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Change task" : "Plan a task"}: {c.name}</DialogTitle>
          <DialogDescription>{whenLabel(draft)}. Each survivor normally takes one task per segment. The GM resolves Routine tasks first, then rolls for Skilled and Crisis ones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Task</Label>
            <Select value={draft.task} onValueChange={(v) => set({ task: v as string })}>
              <SelectTrigger className="w-full" aria-label="Task"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_GROUPS.map((grp) => (
                  <SelectGroup key={grp}>
                    <SelectLabel>{grp}</SelectLabel>
                    {SHIPBOARD_TASKS.filter((x) => x.group === grp).map((x) => <SelectItem key={x.name} value={x.name}>{x.name}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{def.result}</p>
            {def.strong && <p className="text-xs text-muted-foreground"><span className="text-foreground/80">Strong Result:</span> {def.strong}</p>}
          </div>
          {def.effect === "project" && (
            <div className="grid gap-1.5">
              <Label>Project</Label>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open Projects. Start one on the Ship tab first.</p>
              ) : (
                <Select value={draft.projectId ?? "none"} onValueChange={(v) => set({ projectId: v === "none" ? null : (v as string) })}>
                  <SelectTrigger className="w-full" aria-label="Project"><SelectValue>{projects.find((p) => p.id === draft.projectId)?.name ?? "Pick a project"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick a project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.progress}/{p.required}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {def.effect === "train" && <TrainPicker c={c} value={draft.trainSkill} onChange={(v) => set({ trainSkill: v })} />}
          {def.effect === "craft" && <CraftPicker c={c} value={draft.crafts ?? []} onChange={(v) => set({ crafts: v })} />}
          {(def.effect === "course" || def.effect === "scan") && (
            <TargetPicker move={def.effect === "course"} value={draft.target ? { x: draft.target.x, y: draft.target.y } : null} onChange={(p) => { const m = shipMap(game); set({ target: p && m ? { mapId: m.id, ...p } : null }); }} />
          )}
          {def.effect === "assist" && (
            <div className="grid gap-1.5">
              <Label>Assisting</Label>
              {assistable.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nobody else has planned a task yet this segment.</p>
              ) : (
                <Select value={draft.assists ?? "none"} onValueChange={(v) => set({ assists: v === "none" ? null : (v as string) })}>
                  <SelectTrigger className="w-full" aria-label="Assisting"><SelectValue>{(() => { const a = assistable.find((x) => x.id === draft.assists); return a ? `${game.characters.find((x) => x.id === a.characterId)?.name}: ${a.task}` : "Pick a task"; })()}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick a task</SelectItem>
                    {assistable.map((a) => <SelectItem key={a.id} value={a.id}>{game.characters.find((x) => x.id === a.characterId)?.name}: {a.task}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="task-detail">What {c.name.split(" ")[0]} does</Label>
            <Textarea id="task-detail" placeholder={def.name === "Other" ? "Describe the task: what, where, and with what tools." : "Optional: approach, tools, or anything the GM should know."} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
            <TermsPills a={draft} />
            <span className={cn(c.energy < taskTerms(game, draft).energy ? "text-rose-300" : "text-muted-foreground")}>{c.energy}/{maxEnergy(c)} Energy</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:items-center">
          {!isGM && short > 0 ? (
            <>
              <span className="text-xs text-rose-300 sm:mr-auto">{c.name.split(" ")[0]} is {short} Energy short{c.energy >= taskTerms(game, draft).energy ? " after their other planned tasks" : ""}.</span>
              <Button variant="outline" disabled={missing || (def.name === "Other" && !draft.detail.trim())} onClick={() => save(true)}><HandIcon /> Ask the GM for permission</Button>
            </>
          ) : (
            <Button disabled={missing || (def.name === "Other" && !draft.detail.trim())} onClick={() => save()}>{existing ? "Save changes" : "Submit task"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_LABEL = { failed: "Failure", success: "Success", strong: "Strong Success" } as const;
const RESULT_TONE = { failed: "danger", success: "good", strong: "info" } as const;

/** A player's server-side roll for their task: the pool, then the dice, a Push, and the result they earn. */
function TaskRollPanel({ a, c, onStep }: { a: SegmentAction; c: Character; onStep: (s: TaskStep) => Promise<unknown> }) {
  const game = useGame((s) => s.game);
  const terms = taskTerms(game, a);
  const pool = taskPool(game, a);
  const [busy, setBusy] = useState(false);
  const step = async (s: TaskStep) => {
    setBusy(true);
    await onStep(s);
    setBusy(false);
  };
  if (!a.roll) {
    return (
      <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
        <p className="font-mono text-xs text-muted-foreground">{pool.parts.join(" + ")}</p>
        <Button disabled={busy || pool.dice <= 0} onClick={() => step("roll")}><DicesIcon /> {pool.dice > 0 ? `Roll ${pool.dice}d6` : "No dice: this can't succeed"}</Button>
        <p className="text-[11px] text-muted-foreground">
          Each 6 is a success; two or more earn the Strong Result. The dice decide the task as they land. If any fail, you can Push once{c.energy > 0 ? "" : ", but not while exhausted"}.
        </p>
      </div>
    );
  }
  const result = rolledStatus(a.roll, terms.routine);
  const pushable = canPush(game, a);
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <Pill tone={RESULT_TONE[result]} className="text-sm">{RESULT_LABEL[result]}{result === "success" && terms.routine && sixes(a.roll.dice) === 0 ? " (Routine)" : ""}</Pill>
        {a.roll.pushed && <Pill tone="warn">Pushed</Pill>}
      </div>
      <Dice dice={a.roll.dice} />
      {result === "failed" && c.pressure > 0 && (
        <p className="text-xs text-muted-foreground"><span className="text-amber-300">{PRESSURE_STATES[c.pressure].name}:</span> {PRESSURE_STATES[c.pressure].failure}</p>
      )}
      {pushable && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => step("push")} className="justify-self-start">
          <FlameIcon /> Push: reroll the failed dice (−1 Energy, +1 Pressure)
        </Button>
      )}
    </div>
  );
}

function ResolveDialog({ a }: { a: SegmentAction }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const [open, setOpen] = useState(false);
  const terms = taskTerms(game, a);
  const [energy, setEnergy] = useState(terms.energy);
  const [note, setNote] = useState("");
  const [scan, setScan] = useState<SpaceTile | "none">("none");
  const crafts = a.crafts ?? [];
  const [made, setMade] = useState<boolean[]>(() => crafts.map(() => true));
  const c = game.characters.find((x) => x.id === a.characterId);
  const def = taskFor(a);
  const map = a.target ? game.maps.find((m): m is StarMap => m.id === a.target!.mapId && m.kind === "star") : undefined;

  function resolve(status: Resolution["status"]) {
    const ok = status === "success" || status === "strong";
    act(`Resolve ${a.task}`, (g) => resolveAction(g, a.id, { status, energy: status === "cancelled" ? 0 : energy, outcome: note, scan: scan === "none" ? null : scan, crafted: ok ? made : undefined }), status === "failed" ? "danger" : "info");
    setOpen(false);
  }

  const playerStep = (step: TaskStep) => resolveOwnTask(a.id, step, { outcome: note, scan: scan === "none" ? null : scan, crafted: made });
  function finish(step: TaskStep) {
    void playerStep(step);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setEnergy(terms.energy); setNote(""); setScan("none"); setMade(crafts.map(() => true)); } }}>
      <DialogTrigger render={<Button size="xs" variant="outline">Resolve</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{c?.name}: {a.task}</DialogTitle>
          <DialogDescription>{def.result}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {a.detail && <p className="rounded-md bg-muted/40 p-2 text-sm">“{a.detail}”</p>}
          <TermsPills a={a} />
          {def.strong && <p className="text-xs text-muted-foreground"><span className="text-foreground/80">Strong Result:</span> {def.strong}</p>}
          {terms.routine && (
            <p className="text-[11px] text-muted-foreground">
              {terms.expert ? "An Expert gets the Strong Result without rolling." : "Routine: it can't fail on the dice. The survivor may still roll for upside, and two 6s make it a Strong Success."}
            </p>
          )}
          {def.effect === "course" && c && masterPilotReady(game, c, a) && <p className="text-[11px] text-emerald-300">Master Pilot: this move burns no Power Cell (once per day).</p>}
          {isGM
            ? terms.skill && c && <DiceRoller character={c} initialSkill={terms.skill} trigger={<Button size="sm" variant="outline"><DicesIcon /> Open the dice roller</Button>} />
            : c && <TaskRollPanel a={a} c={c} onStep={playerStep} />}
          {map && a.target && def.effect === "course" && <MovePreview map={map} to={a.target} />}
          {def.effect === "craft" && crafts.length > 0 && (
            <div className="grid gap-1.5">
              <Label>Items</Label>
              {crafts.map((name, i) => {
                const recipe = RECIPE_BY_NAME[name];
                const why = recipe ? (craftBlocker(game, recipe) ?? (shortfalls(game, recipe.inputs, recipe.toolkit).length ? "Hold is short on materials" : null)) : "Unknown recipe";
                return (
                  <label key={i} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={made[i] ?? true} onCheckedChange={(v) => setMade((m) => m.map((x, j) => (j === i ? !!v : x)))} aria-label={`${name} made`} />
                    <span className="grid">
                      <span>{name}{recipe && recipe.output > 1 ? ` ×${recipe.output}` : ""}</span>
                      <span className={cn("text-[11px]", why ? "text-amber-300" : "text-muted-foreground")}>{why ?? (recipe && recipeText(recipe.inputs, recipe.toolkit))}</span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[11px] text-muted-foreground">On a success, uncheck anything that still didn&apos;t come out right. Failed items lose half their materials and their toolkit charges.</p>
            </div>
          )}
          {def.effect === "scan" && (
            <div className="grid gap-1.5">
              <Label>{isGM ? "Scan result" : "If the scan succeeds, record"} for {targetName(game, a.target)}</Label>
              <Select value={scan} onValueChange={(v) => setScan(v as SpaceTile | "none")}>
                <SelectTrigger className="w-full"><SelectValue>{scan === "none" ? "Don't record" : SPACE_TILE_BY_KEY[scan].name}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don&apos;t record</SelectItem>
                  {SPACE_TILES.map((t) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Label>Energy spent</Label>
            {isGM ? <Stepper value={energy} onChange={setEnergy} min={0} max={10} label="energy" /> : <span className="font-mono text-sm">{terms.energy}</span>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="task-outcome">Outcome note</Label>
            <Input id="task-outcome" placeholder="Optional: what happened" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {isGM ? (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => resolve("cancelled")}>Call off</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => resolve("failed")}><XIcon /> Failed</Button>
              <Button variant="outline" onClick={() => resolve("strong")}>Strong</Button>
              <Button onClick={() => resolve("success")}><CheckIcon /> Success</Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter className="gap-2 sm:justify-between">
            {a.roll ? <span /> : <Button variant="ghost" onClick={() => finish("cancel")}>Call off</Button>}
            {a.roll ? (
              <Button onClick={() => finish("accept")}><CheckIcon /> Keep the result: {RESULT_LABEL[rolledStatus(a.roll, terms.routine)]}</Button>
            ) : (
              terms.routine && <Button variant="outline" onClick={() => finish("routine")}><CheckIcon /> {terms.expert ? "Expert: Strong Result" : "Routine: succeed without rolling"}</Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActionRow({ a, showWhen }: { a: SegmentAction; showWhen?: boolean }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM, canEditCharacter, myCharacterId } = usePerms();
  const c = game.characters.find((x) => x.id === a.characterId);
  const project = game.ship.projects.find((p) => p.id === a.projectId);
  const assisted = game.actions.find((x) => x.id === a.assists);
  const where = targetName(game, a.target);
  const terms = taskTerms(game, a);
  const planned = a.status === "planned";
  const canEdit = planned && canEditCharacter(a.characterId) && (isGM || !a.roll);
  const canResolve = isGM || playerResolves(a, myCharacterId);
  const blocked = !isGM && planned && canResolve && needsPermission(game, a);
  const short = energyShort(game, a);
  function decide(allow: boolean) {
    act(allow ? "Allow task" : "Refuse task", (g) => {
      const name = g.characters.find((x) => x.id === a.characterId)?.name ?? "Someone";
      if (!allow) {
        g.actions = g.actions.filter((x) => x.id !== a.id);
        return `The GM refuses ${name}'s plan to ${a.task.toLowerCase()} without the Energy for it.`;
      }
      const x = g.actions.find((y) => y.id === a.id);
      if (x) x.approval = "granted";
      return `The GM allows ${name} to ${a.task.toLowerCase()} despite being short on Energy.`;
    });
  }
  function askPermission() {
    act("Ask the GM", (g) => {
      const x = g.actions.find((y) => y.id === a.id);
      if (x) x.approval = "pending";
      return `${c?.name ?? "Someone"} is ${short} Energy short for ${a.task} and asks the GM for permission.`;
    });
  }
  function routine() {
    const status = terms.expert ? "strong" : "success";
    if (isGM) act(`Resolve ${a.task}`, (g) => resolveAction(g, a.id, { status, energy: terms.energy, outcome: "" }));
    else void resolveOwnTask(a.id, "routine");
  }

  return (
    <div className={cn("grid gap-1.5 rounded-lg border p-2.5", planned ? "bg-background/40" : "bg-muted/20")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{a.task}</span>
        {showWhen && <Pill>{whenLabel(a)}</Pill>}
        <Pill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Pill>
        {planned && a.approval === "pending" && <Pill tone="warn">Needs GM permission · {short} Energy short</Pill>}
        {planned && a.approval === "granted" && <Pill tone="info">GM allowed</Pill>}
        {canEdit && c && (
          <span className="ml-auto flex gap-0.5">
            <PlanDialog c={c} existing={a} trigger={<Button size="icon-xs" variant="ghost" aria-label={`Edit ${a.task}`}><PencilIcon /></Button>} />
            <Button size="icon-xs" variant="ghost" aria-label={`Withdraw ${a.task}`} onClick={() => act("Withdraw task", (g) => { g.actions = g.actions.filter((x) => x.id !== a.id); return `${c.name} withdraws their plan to ${a.task.toLowerCase()}.`; })}><Trash2Icon /></Button>
          </span>
        )}
      </div>
      {(project || where || assisted || a.crafts?.length || a.trainSkill) && (
        <p className="text-xs text-muted-foreground">
          {a.crafts?.length ? `Making ${craftList(a.crafts)}` : null}
          {a.trainSkill && c && (() => { const cost = trainingCost(c, a.trainSkill); return `Training ${SKILL_BY_KEY[a.trainSkill].name}${cost ? ` · uses 1 ${cost.name} (${haveInStorage(game, cost.name)} in hold)` : ""}`; })()}
          {project && `${project.name} · ${project.progress}/${project.required}`}
          {where && `Toward ${where}`}
          {assisted && `Helping ${game.characters.find((x) => x.id === assisted.characterId)?.name}: ${assisted.task}`}
        </p>
      )}
      {a.detail && <p className="text-xs">“{a.detail}”</p>}
      {a.roll && (
        <div className="flex flex-wrap items-center gap-2">
          <Dice dice={a.roll.dice} />
          {a.roll.pushed && <Pill tone="warn">Pushed</Pill>}
          {planned && <Pill tone={RESULT_TONE[rolledStatus(a.roll, terms.routine)]}>{RESULT_LABEL[rolledStatus(a.roll, terms.routine)]} so far</Pill>}
        </div>
      )}
      {planned ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <TermsPills a={a} />
          {isGM && a.approval === "pending" ? (
            <span className="ml-auto flex gap-1.5">
              <Button size="xs" variant="outline" onClick={() => decide(false)}><XIcon /> Refuse</Button>
              <Button size="xs" onClick={() => decide(true)}><CheckIcon /> Allow</Button>
            </span>
          ) : a.approval === "pending" ? (
            canEdit && <span className="ml-auto text-[11px] text-muted-foreground">Waiting for the GM&apos;s permission.</span>
          ) : blocked ? (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-rose-300">{short} Energy short</span>
              <Button size="xs" variant="outline" onClick={askPermission}><HandIcon /> Ask the GM</Button>
            </span>
          ) : canResolve ? (
            <span className="ml-auto flex gap-1.5">
              {terms.routine && !a.roll && (
                <Button size="xs" onClick={routine}><CheckIcon /> {terms.expert ? "Expert" : "Routine"}</Button>
              )}
              <ResolveDialog a={a} />
            </span>
          ) : (
            canEdit && <span className="ml-auto text-[11px] text-muted-foreground">The GM resolves this one.</span>
          )}
        </div>
      ) : (
        a.outcome && <p className="text-xs text-muted-foreground">{a.outcome}</p>
      )}
    </div>
  );
}

function CrewPlanCard({ c }: { c: Character }) {
  const game = useGame((s) => s.game);
  const { canEditCharacter } = usePerms();
  const mine = actionsNow(game).filter((a) => a.characterId === c.id);
  const busy = mine.filter((a) => a.status !== "cancelled").length;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">{c.name}</span>
          <span className="flex shrink-0 gap-1">
            <Pill tone={c.energy === 0 ? "danger" : "muted"}>{c.energy}/{maxEnergy(c)} Energy</Pill>
            {c.pressure > 0 && <Pill tone="warn">Pressure {c.pressure}</Pill>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {mine.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">No task planned yet.</p>}
        {mine.map((a) => <ActionRow key={a.id} a={a} />)}
        {busy > 1 && <p className="text-[11px] text-amber-300">More than one task this segment. Only Pushing grants an extra task, once per segment.</p>}
        {canEditCharacter(c.id) && (
          <PlanDialog c={c} trigger={<Button size="xs" variant={mine.length ? "ghost" : "outline"} className="justify-self-start"><PlusIcon /> {mine.length ? "Another task" : "Plan a task"}</Button>} />
        )}
      </CardContent>
    </Card>
  );
}

export function ActionsTab() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM, myCharacterId } = usePerms();
  const alive = game.characters.filter((c) => !c.dead);
  const now = actionsNow(game);
  const overdue = overdueActions(game);
  const planned = now.filter((a) => a.status === "planned");
  const routine = planned.filter((a) => taskTerms(game, a).routine);
  const ready = new Set(now.filter((a) => a.status !== "cancelled").map((a) => a.characterId));
  const ordered = [...alive].sort((x, y) => Number(y.id === myCharacterId) - Number(x.id === myCharacterId));

  function resolveRoutine() {
    act("Resolve Routine tasks", (g) => {
      const out: string[] = [];
      for (const a of actionsNow(g).filter((x) => x.status === "planned")) {
        const t = taskTerms(g, a);
        if (t.routine) out.push(...resolveAction(g, a.id, { status: t.expert ? "strong" : "success", energy: t.energy, outcome: "" }));
      }
      return out.length ? out : "No Routine tasks to resolve.";
    });
  }

  if (alive.length === 0) {
    return <EmptyState title="No survivors to plan for" body="Add survivors on the Crew tab, and each of them can commit to a task every segment." />;
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardListIcon className="size-4 text-primary" /> {SEGMENTS[game.segment]}, Day {game.day}: crew tasks</CardTitle>
          <CardDescription>
            Plan together, then commit one task per survivor. {isGM ? "Resolve Routine tasks automatically, roll for Skilled and Crisis ones, then move to the next segment." : "Roll and resolve your own tasks, Pushing if you dare. The GM resolves Salvage Ship and Other tasks."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={ready.size === alive.length ? "good" : "warn"}>{ready.size}/{alive.length} survivors committed</Pill>
            <Pill tone={planned.length ? "info" : "muted"}>{planned.length} waiting on the GM</Pill>
            {isGM && routine.length > 0 && (
              <Button size="sm" className="ml-auto" onClick={resolveRoutine}><CheckIcon /> Resolve {routine.length} Routine task{routine.length === 1 ? "" : "s"}</Button>
            )}
          </div>
          <PowerCells compact />
        </CardContent>
      </Card>

      {overdue.length > 0 && (
        <Card size="sm" className="ring-amber-500/30">
          <CardHeader>
            <CardTitle className="text-sm">Unresolved from earlier segments</CardTitle>
            <CardDescription>These were planned but never resolved. Resolve or call them off.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {overdue.map((a) => (
              <div key={a.id} className="grid gap-1">
                <p className="text-xs text-muted-foreground">{game.characters.find((c) => c.id === a.characterId)?.name ?? "Unknown"}</p>
                <ActionRow a={a} showWhen />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((c) => <CrewPlanCard key={c.id} c={c} />)}
      </div>
    </div>
  );
}
