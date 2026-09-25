"use client";

import { READ_ONLY, usePerms } from "@/lib/use-perms";
import { AlertTriangleIcon, ArrowUpIcon, ChevronDownIcon, ChevronUpIcon, CrosshairIcon, HammerIcon, PencilIcon, PlusIcon, PowerIcon, SproutIcon, Trash2Icon, ZapIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { rollPool, sixes, uid } from "@/lib/dice";
import { hullTier, power, roomWorks } from "@/lib/derive";
import {
  FACILITY_GRADES,
  HULL_TIERS,
  MODULE_CONDITIONS,
  MODULE_CONDITION_EFFECTS,
  MODULE_PRESETS,
  OVERLOAD_BONUS,
  PROJECT_TEMPLATES,
  REPAIR_PROGRESS,
  type FacilityGrade,
} from "@/lib/rules";
import { FACILITIES, ladderFor } from "@/data/ship-upgrades";
import { upgradeThreshold } from "@/data/tasks";
import { advanceProject } from "@/lib/actions";
import { CROP_DAYS, CROP_LEVEL_NAMES, CROP_YIELD, cropOf, cropStall, growCrops, hydroponicsLevel } from "@/lib/crops";
import { roomFromPreset } from "@/lib/seed";
import { recipeText, shortfalls, spend } from "@/lib/stock";
import { useGame } from "@/lib/store";
import type { Crop, GameState, Project, Room } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CommitInput } from "./commit-input";
import { Dice, EmptyState, Meter, Pill, SectionTitle, Stepper } from "./common";
import { CyberResearchCard } from "./cybernetics";
import { PowerCells } from "./power";

const CONDITION_TONE = {
  Operational: "good",
  Damaged: "warn",
  Critical: "danger",
  Offline: "danger",
  Destroyed: "danger",
} as const;

function worsen(r: Room) {
  const i = MODULE_CONDITIONS.indexOf(r.condition);
  r.condition = MODULE_CONDITIONS[Math.min(MODULE_CONDITIONS.length - 1, i + 1)];
}

function restore(r: Room) {
  const i = MODULE_CONDITIONS.indexOf(r.condition);
  if (r.condition === "Destroyed") return;
  r.condition = MODULE_CONDITIONS[Math.max(0, i - 1)];
}

function TakeHitDialog() {
  const { game, act } = useGame();
  const ship = game.ship;
  const tier = hullTier(ship);
  const [open, setOpen] = useState(false);
  const [damage, setDamage] = useState(1);
  const [roomId, setRoomId] = useState("none");
  const [result, setResult] = useState<{ dice: number[]; prevented: number } | null>(null);

  function resolve() {
    const dice = rollPool(tier.armorDice);
    const prevented = Math.min(damage, sixes(dice));
    setResult({ dice, prevented });
    act("Ship takes a Hit", (g) => {
      const s = g.ship;
      const out = [`The ship takes a Hit for ${damage} Hull Damage. Armor ${tier.armorDice}d6 [${dice.join(", ") || "—"}] prevents ${prevented}.`];
      let remaining = damage - prevented;
      if (s.tempHull > 0) {
        const absorbed = Math.min(remaining, s.tempHull);
        remaining -= absorbed;
        out.push(`Temporary patch absorbs ${absorbed} and gives way.`);
        s.tempHull = 0;
      }
      if (remaining > 0) {
        if (s.hullHp <= 0) {
          if (s.catastrophicEvents >= 1) {
            s.destroyed = true;
            out.push("☠ A second unprevented Hit at Critical Integrity — the ship is destroyed.");
          } else {
            s.catastrophicEvents += 1;
            out.push("⚠ Unprevented Hit at Critical Integrity — a Catastrophic Event occurs! Another Hit before repairs destroys the ship.");
          }
        } else {
          s.hullHp = Math.max(0, s.hullHp - remaining);
          out.push(`Hull HP ${s.hullHp}/${tier.maxHp}.`);
          if (s.hullHp === 0) out.push("⚠ Hull HP 0 — the ship enters Critical Integrity.");
        }
      } else out.push("No structural damage gets through.");
      if (roomId !== "none") {
        const r = s.rooms.find((x) => x.id === roomId);
        if (r) {
          worsen(r);
          out.push(`${r.name} is hit and becomes ${r.condition}.`);
        }
      }
      return out;
    }, "danger");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null); }}>
      <DialogTrigger render={<Button size="sm" variant="destructive"><CrosshairIcon /> Take a Hit</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Resolve a Hit</DialogTitle>
          <DialogDescription>Roll {tier.armorDice}d6 Armor Dice ({tier.name}). Each 6 prevents 1 Hull Damage.</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            <Dice dice={result.dice} />
            <p className="text-sm">Prevented <b>{result.prevented}</b> of {damage}. Check the log for the outcome.</p>
            <DialogFooter><Button onClick={() => { setOpen(false); setResult(null); }}>Done</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              <div className="flex items-center justify-between"><Label>Incoming Hull Damage</Label><Stepper value={damage} onChange={setDamage} min={1} max={10} /></div>
              <div className="grid gap-1.5">
                <Label>Module damaged by the Hit</Label>
                <Select value={roomId} onValueChange={(v) => setRoomId(v as string)}>
                  <SelectTrigger className="w-full"><SelectValue>{roomId === "none" ? "None" : ship.rooms.find((r) => r.id === roomId)?.name}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ship.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.condition})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button variant="destructive" onClick={resolve}>Roll Armor &amp; apply</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HullCard() {
  const { game, act } = useGame();
  const ship = game.ship;
  const tier = hullTier(ship);
  const critical = ship.hullHp <= 0;
  const { isGM } = usePerms();
  const setShip = (label: string, fn: (s: GameState["ship"]) => void | string) => act(label, (g) => fn(g.ship));

  return (
    <Card className={cn(critical && "ring-rose-500/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isGM ? (
            <>
              <CommitInput aria-label="Ship name" title="Rename ship" value={ship.name} maxLength={60} onCommit={(v) => setShip("Rename ship", (s) => { const old = s.name; s.name = v.trim() || s.name; return s.name === old ? undefined : `${old} is renamed ${s.name}.`; })} className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold hover:border-input focus-visible:border-ring dark:bg-transparent" />
              <PencilIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          ) : (
            <span className="text-lg font-semibold">{ship.name}</span>
          )}
        </CardTitle>
        <CardDescription>
          <CommitInput aria-label="Ship location" placeholder="Current tile / location" value={ship.location} onCommit={(v) => setShip("Location", (s) => { s.location = v; return `Ship location: ${v}.`; })} className="h-7 text-xs" />
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {ship.destroyed && <div className="rounded-lg bg-rose-500/15 p-3 text-sm text-rose-200">The ship has been destroyed. Everyone aboard dies unless an escape method is available.</div>}
        {critical && !ship.destroyed && (
          <div className="flex gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <p><b>Critical Integrity.</b> Hull repair and movement are Crisis work, expansion is impossible, and every unprevented Hit causes a Catastrophic Event. {ship.catastrophicEvents > 0 && "A Catastrophic Event has already occurred — one more unprevented Hit destroys the ship."}</p>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label>Hull tier</Label>
          <Select value={String(ship.hullTier)} onValueChange={(v) => setShip("Hull tier", (s) => { s.hullTier = Number(v); s.hullHp = Math.min(s.hullHp, HULL_TIERS[s.hullTier].maxHp); return `Hull upgraded to ${HULL_TIERS[s.hullTier].name}.`; })}>
            <SelectTrigger className="w-full"><SelectValue>{tier.name}</SelectValue></SelectTrigger>
            <SelectContent>{HULL_TIERS.map((t, i) => <SelectItem key={t.name} value={String(i)}>{t.name} · {t.maxHp} HP · {t.armorDice}d6 armor</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Hull HP</span>
            <span className="font-mono">{ship.hullHp}<span className="text-muted-foreground">/{tier.maxHp}</span>{ship.tempHull > 0 && <span className="text-sky-300"> +{ship.tempHull} temp</span>}</span>
          </div>
          <Meter value={ship.hullHp} max={tier.maxHp} tone="hull" segmented />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Stepper
              value={ship.hullHp}
              min={0}
              max={tier.maxHp}
              label="hull HP"
              onChange={(v) => setShip(`Hull HP → ${v}`, (s) => { const up = v > s.hullHp; s.hullHp = v; if (v > 0) s.catastrophicEvents = 0; return `${up ? "Hull repaired" : "Hull damaged"}: ${v}/${tier.maxHp}.`; })}
            />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Temp patch
              <Stepper value={ship.tempHull} min={0} max={Math.max(0, 1 - ship.hullHp)} size="xs" label="temporary hull" onChange={(v) => setShip("Temporary patch", (s) => { s.tempHull = v; return `Improvised patch: ${v} temporary Hull HP.`; })} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm">
          <span>Armor Dice <b className="font-mono">{tier.armorDice}d6</b></span>
          <TakeHitDialog />
        </div>
      </CardContent>
    </Card>
  );
}

function PowerCard() {
  const { game, act } = useGame();
  const ship = game.ship;
  const p = power(ship);
  const reactorCritical = ship.rooms.some((r) => r.powerOutput > 0 && r.condition === "Critical");
  const over = p.surplus < 0;

  function shed() {
    act("Shed load", (g) => {
      const out: string[] = [];
      const candidates = g.ship.rooms.filter((r) => roomWorks(r) && !r.essential && r.powerDraw > 0).sort((a, b) => b.powerDraw - a.powerDraw);
      for (const r of candidates) {
        if (power(g.ship).surplus >= 0) break;
        r.active = false;
        out.push(`${r.name} powered down to save ${r.powerDraw} Power.`);
      }
      if (power(g.ship).surplus < 0) out.push("Still over capacity — essential systems must be cut or the grid overloaded.");
      return out;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ZapIcon className="size-4 text-primary" /> Power grid</CardTitle>
        <CardDescription>Compared at the start of each day. Unpowered modules are Inactive, not damaged.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PowerCells />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/40 p-2"><p className="font-mono text-2xl">{p.generated}</p><p className="text-[11px] text-muted-foreground">Generated</p></div>
          <div className="rounded-lg bg-muted/40 p-2"><p className="font-mono text-2xl">{p.draw}</p><p className="text-[11px] text-muted-foreground">Draw</p></div>
          <div className={cn("rounded-lg p-2", over ? "bg-rose-500/15 text-rose-200" : "bg-emerald-500/10 text-emerald-200")}><p className="font-mono text-2xl">{p.surplus > 0 ? "+" : ""}{p.surplus}</p><p className="text-[11px] opacity-80">{over ? "Over capacity" : "Spare"}</p></div>
        </div>
        <Meter value={p.draw} max={Math.max(p.generated, p.draw, 1)} tone={over ? "hp" : "energy"} />
        {ship.tuned && <p className="text-xs text-emerald-300">Reactor tuned: +1 Power Unit until the end of the day.</p>}
        {over && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-200">
            <span>Demand exceeds generation. Deactivate modules until within capacity.</span>
            <Button size="xs" variant="outline" onClick={shed}>Power down non-essentials</Button>
          </div>
        )}
        <label className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">Overload the Grid</span>
            <span className="block text-xs text-muted-foreground">+{OVERLOAD_BONUS} Power for one segment. Reactor counts as Critical, powered-system Tasks become Crisis, then roll Engineering.</span>
            {reactorCritical && <span className="mt-1 block text-xs text-rose-300">A Critical Reactor cannot safely overload — risk of catastrophic failure.</span>}
          </span>
          <Switch checked={ship.overloaded} onCheckedChange={(v) => act("Overload", (g) => { g.ship.overloaded = v; return v ? "⚡ The grid is overloaded for this segment." : "The overload ends."; }, v ? "danger" : "info")} />
        </label>
      </CardContent>
    </Card>
  );
}

function HydroponicsCard() {
  const { game, act } = useGame();
  const { isGM } = usePerms();
  const level = hydroponicsLevel(game);
  const crop = cropOf(game);
  if (level < 0 && !crop.growing && !crop.ready) return null;
  const stall = cropStall(game);
  const tendedToday = crop.tended.includes(game.day);
  const update = (label: string, fn: (c: Crop) => Crop | void, line?: string) =>
    act(label, (g) => {
      const next = fn({ ...cropOf(g), tended: [...cropOf(g).tended] });
      if (next) g.ship.crop = next;
      return line;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SproutIcon className="size-4 text-emerald-300" /> Hydroponics</CardTitle>
        <CardDescription>
          {level < 0 ? "No working Hydroponics aboard." : `${CROP_LEVEL_NAMES[level]}: ${level >= 1 ? `${CROP_YIELD[level]} Raw Food every ${CROP_DAYS} days.` : "no food production."}`} Maintain Crops seeds and tends; End of Day grows; Harvest Hydroponics collects.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xl">{crop.growing ? crop.day : "—"}<span className="text-muted-foreground">/{CROP_DAYS}</span></span>
          <span className="text-sm text-muted-foreground">{crop.growing ? "days grown" : "nothing planted"}</span>
          {crop.growing && <Pill tone={tendedToday ? "good" : "muted"}>{tendedToday ? "Tended today" : "Not tended today"}</Pill>}
          <Pill tone={crop.ready ? "good" : "muted"} className="ml-auto">{crop.ready} Raw Food ready</Pill>
        </div>
        <Meter value={crop.growing ? crop.day : 0} max={CROP_DAYS} tone="good" segmented />
        <p className={cn("text-xs", stall ? "text-amber-300" : "text-muted-foreground")}>
          {stall ? `Tonight: the crops won't grow. ${stall}.` : crop.growing ? (crop.day + 1 >= CROP_DAYS ? "Tonight: the crop finishes." : "Tonight: the crop grows a day.") : level >= 4 ? "A new crop starts on its own tonight." : ""}
        </p>
        {isGM && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="text-[11px] text-muted-foreground">GM:</span>
            {!crop.growing ? (
              <Button size="xs" variant="outline" onClick={() => update("Seed crops", (c) => ({ ...c, growing: true, day: 0, plantedDay: game.day, tended: [game.day] }), "🌱 The GM seeds a new crop in Hydroponics.")}>Seed</Button>
            ) : (
              <>
                <Button size="xs" variant="outline" onClick={() => update(tendedToday ? "Untend crops" : "Tend crops", (c) => ({ ...c, tended: tendedToday ? c.tended.filter((d) => d !== game.day) : [...c.tended, game.day] }))}>{tendedToday ? "Unmark tended" : "Mark tended"}</Button>
                <Button size="xs" variant="outline" onClick={() => act("Grow crops", (g) => { const out: string[] = []; const t = cropOf(g); if (!t.tended.includes(g.day)) g.ship.crop = { ...t, tended: [...t.tended, g.day] }; growCrops(g, out); return out; })}>Grow a day</Button>
                <Button size="xs" variant="ghost" onClick={() => update("Clear crops", (c) => ({ ...c, growing: false, day: 0, tended: [] }), "The crops in Hydroponics are cleared.")}>Clear crop</Button>
              </>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              Ready
              <Stepper value={crop.ready} min={0} max={99} size="xs" label="ready food" onChange={(v) => update("Ready food", (c) => ({ ...c, ready: v }))} />
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function setLevel(r: Room, index: number) {
  const ladder = ladderFor(r.module);
  if (!ladder) return;
  r.level = index;
  const grade = ladder.levels[index].grade;
  if (grade) r.grade = grade;
}

function UpgradeRoomDialog({ room }: { room: Room }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const ladder = ladderFor(room.module)!;
  const next = ladder.levels[(room.level ?? 0) + 1];
  const short = shortfalls(game, next.cost, next.toolkit);

  function upgrade(pay: boolean) {
    act(`Upgrade ${room.name}`, (g) => {
      const r = g.ship.rooms.find((x) => x.id === room.id)!;
      if (pay) spend(g, next.cost, next.toolkit);
      setLevel(r, (r.level ?? 0) + 1);
      return `🔧 ${r.name} is upgraded to ${next.name}${pay ? `, using ${recipeText(next.cost, next.toolkit)}` : ""}. ${next.effect}`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline" className="justify-self-start"><ArrowUpIcon /> Upgrade to {next.name}</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Upgrade {room.name} to {next.name}</DialogTitle>
          <DialogDescription>{next.effect}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Upgrade Module work: Engineering {upgradeThreshold((room.level ?? 0) + 1)} is Routine.</p>
        <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Upgrade cost</p>
          {next.cost.map((p) => {
            const miss = short.find((x) => x.name === p.name);
            return <p key={p.name} className={miss ? "text-rose-300" : undefined}>{p.qty} {p.name}{miss && <span className="text-xs text-muted-foreground"> (have {miss.have})</span>}</p>;
          })}
          {next.toolkit > 0 && <p className={short.some((x) => x.name === "Toolkit charges") ? "text-rose-300" : undefined}>{next.toolkit} charges of any toolkit</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => upgrade(false)}>Set level only</Button>
          <Button disabled={short.length > 0} onClick={() => upgrade(true)}>{short.length ? "Missing materials" : "Spend and upgrade"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BuildFacilityDialog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(FACILITIES[0].name);
  const [roomId, setRoomId] = useState("new");
  const f = FACILITIES.find((x) => x.name === pick)!;
  const short = shortfalls(game, f.cost, f.toolkit);

  function build(pay: boolean) {
    act(`Build ${f.name}`, (g) => {
      if (pay) spend(g, f.cost, f.toolkit);
      const host = g.ship.rooms.find((r) => r.id === roomId);
      if (host) host.notes = [host.notes, `${f.name}: ${f.effect}`].filter(Boolean).join("\n");
      else g.ship.rooms.push({ ...roomFromPreset(f.name), powerDraw: f.powerDraw, notes: f.effect });
      return `🏗 ${f.name} is built${host ? ` in ${host.name}` : ""}${pay ? ` from ${recipeText(f.cost, f.toolkit)}` : ""}.`;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline"><HammerIcon /> Build facility</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Build a facility</DialogTitle>
          <DialogDescription>One-off installations from the ship upgrade sheet. Build one as a new room, or add it to an existing room.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={pick} onValueChange={(v) => setPick(v as string)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{FACILITIES.map((x) => <SelectItem key={x.name} value={x.name}>{x.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-sm">{f.effect}</p>
          <div className="grid gap-1 rounded-lg bg-muted/40 p-3 text-sm">
            {f.cost.map((p) => {
              const miss = short.find((x) => x.name === p.name);
              return <p key={p.name} className={miss ? "text-rose-300" : undefined}>{p.qty} {p.name}{miss && <span className="text-xs text-muted-foreground"> (have {miss.have})</span>}</p>;
            })}
          </div>
          <div className="grid gap-1.5">
            <Label>Where</Label>
            <Select value={roomId} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue>{roomId === "new" ? "A new room" : game.ship.rooms.find((r) => r.id === roomId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">A new room</SelectItem>
                {game.ship.rooms.map((r) => <SelectItem key={r.id} value={r.id}>Add to {r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => build(false)}>Add without spending</Button>
          <Button disabled={short.length > 0} onClick={() => build(true)}>{short.length ? "Missing materials" : "Spend and build"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomCard({ room }: { room: Room }) {
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const edit = (label: string, fn: (r: Room) => void | string) =>
    act(label, (g) => {
      const r = g.ship.rooms.find((x) => x.id === room.id)!;
      return fn(r);
    });
  const works = roomWorks(room);
  const repair = REPAIR_PROGRESS[room.condition];
  const ladder = ladderFor(room.module);
  const level = ladder && room.level !== undefined ? ladder.levels[room.level] : undefined;
  const next = ladder && room.level !== undefined ? ladder.levels[room.level + 1] : undefined;

  return (
    <div className={cn("grid gap-3 rounded-xl border bg-card p-3", !room.active && "opacity-70", (room.condition === "Offline" || room.condition === "Destroyed") && "border-rose-500/30")}>
      <div className="flex items-start justify-between gap-2">
        <fieldset disabled={!isGM} className="min-w-0 flex-1">
          <CommitInput aria-label="Room name" value={room.name} onCommit={(v) => edit("Rename room", (r) => { r.name = v || r.name; })} className="h-7 border-transparent bg-transparent px-0 font-medium dark:bg-transparent" />
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill tone={CONDITION_TONE[room.condition]}>{room.condition}</Pill>
            {!room.active && <Pill>Inactive</Pill>}
            {room.essential && <Pill tone="info">Essential</Pill>}
          </div>
        </fieldset>
        <Switch aria-label="Powered" checked={room.active} onCheckedChange={(v) => edit(`${room.name} power`, (r) => { r.active = v; return `${r.name} ${v ? "powered up" : "powered down"}.`; })} />
      </div>

      <fieldset disabled={!isGM} className={cn("grid min-w-0 gap-3", !isGM && READ_ONLY)} title={isGM ? undefined : "Only the GM changes rooms. Crew can power them on and off."}>
      <div className="grid grid-cols-2 gap-2">
        <Select value={room.module ?? "none"} onValueChange={(v) => edit("Module", (r) => { const preset = MODULE_PRESETS.find((m) => m.name === v); r.module = v === "none" ? null : (v as string); r.powerDraw = preset?.powerDraw ?? 0; r.powerOutput = preset?.powerOutput ?? 0; r.level = ladderFor(r.module) ? 0 : undefined; if (r.level !== undefined) setLevel(r, 0); return `${r.name} now houses ${r.module ?? "no module"}.`; })}>
          <SelectTrigger size="sm" className="w-full"><SelectValue>{room.module ?? "Empty room"}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Empty room</SelectItem>
            {MODULE_PRESETS.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {ladder ? (
          <Select value={room.level === undefined ? "unset" : String(room.level)} onValueChange={(v) => edit("Upgrade level", (r) => { setLevel(r, Number(v)); return `${r.name} is set to ${ladder.levels[Number(v)].name}.`; })}>
            <SelectTrigger size="sm" className="w-full" aria-label="Upgrade level"><SelectValue>{level ? level.name : "Set level…"}</SelectValue></SelectTrigger>
            <SelectContent>{ladder.levels.map((l, i) => <SelectItem key={l.name} value={String(i)}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <Select value={room.grade} onValueChange={(v) => edit("Grade", (r) => { r.grade = v as FacilityGrade; return `${r.name} is now ${v}.`; })}>
            <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{FACILITY_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {ladder && (
        <div className="grid gap-1.5 rounded-lg bg-muted/30 p-2">
          <p className="text-xs">{level ? level.effect : "Pick the module's current upgrade level."}{level?.grade && <span className="text-muted-foreground"> Counts as a {level.grade} facility.</span>}</p>
          {next && <UpgradeRoomDialog room={room} />}
          {!next && level && <p className="text-[11px] text-muted-foreground">Fully upgraded.</p>}
        </div>
      )}
      {room.notes && <p className="text-[11px] whitespace-pre-line text-muted-foreground">{room.notes}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="xs" variant="outline" disabled={room.condition === "Destroyed"} onClick={() => edit(`${room.name} worsens`, (r) => { worsen(r); return `${r.name} worsens to ${r.condition}.`; })}><ChevronDownIcon /> Worsen</Button>
          <Button size="xs" variant="outline" disabled={room.condition === "Operational" || room.condition === "Destroyed"} onClick={() => edit(`${room.name} repaired`, (r) => { restore(r); return `${r.name} repaired to ${r.condition}.`; })}><ChevronUpIcon /> Repair</Button>
        </div>
        {room.condition === "Destroyed" && <Button size="xs" variant="ghost" onClick={() => edit("Rebuilt", (r) => { r.condition = "Operational"; return `${r.name} rebuilt.`; })}>Rebuilt</Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {MODULE_CONDITION_EFFECTS[room.condition]}
        {repair && ` Repair: ${repair} Progress.`}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><PowerIcon className="size-3" /> Draw <Stepper value={room.powerDraw} min={0} max={8} size="xs" label="power draw" onChange={(v) => edit("Power draw", (r) => { r.powerDraw = v; })} /></span>
        {(room.powerOutput > 0 || room.module === "Fusion Reactor") && (
          <span className={cn("flex items-center gap-1", works ? "text-primary" : "")}><ZapIcon className="size-3" /> Output <Stepper value={room.powerOutput} min={0} max={20} size="xs" label="power output" onChange={(v) => edit("Power output", (r) => { r.powerOutput = v; })} /></span>
        )}
        <label className="flex items-center gap-1"><Checkbox checked={room.essential} onCheckedChange={(v) => edit("Essential", (r) => { r.essential = !!v; })} /> Essential</label>
        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${room.name}`} onClick={() => act("Remove room", (g) => { g.ship.rooms = g.ship.rooms.filter((r) => r.id !== room.id); return `${room.name} was removed from the ship.`; })}><Trash2Icon /></Button>
      </div>
      </fieldset>
    </div>
  );
}

function AddProjectDialog() {
  const { game, act } = useGame();
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(0);
  const [roomId, setRoomId] = useState("none");
  const [patientId, setPatientId] = useState<string | null>(null);
  const t = PROJECT_TEMPLATES[tpl];
  const needsPatient = t.name === "Stress Recovery";
  const patient = game.characters.find((c) => c.id === patientId);
  const inRecovery = new Set(game.ship.projects.filter((p) => !p.done && p.patientId).map((p) => p.patientId));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><HammerIcon /> New project</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a Project</DialogTitle>
          <DialogDescription>Routine contributions add 1 Progress automatically; successful Skilled contributions add 1 Progress.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={String(tpl)} onValueChange={(v) => setTpl(Number(v))}>
            <SelectTrigger className="w-full"><SelectValue>{t.name}</SelectValue></SelectTrigger>
            <SelectContent>{PROJECT_TEMPLATES.map((p, i) => <SelectItem key={p.name} value={String(i)}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-lg bg-muted/40 p-3 text-xs">
            <p><span className="text-muted-foreground">Skill:</span> {t.skill || "—"} · Routine {t.threshold}</p>
            <p><span className="text-muted-foreground">Progress:</span> {t.required} · up to {t.contributorLimit} contributors · {t.energy} Energy each</p>
            {t.facility && <p><span className="text-muted-foreground">Facility:</span> {t.facility}</p>}
            {t.materials && <p className="mt-1">{t.materials}</p>}
          </div>
          {needsPatient && (
            <div className="grid gap-1.5">
              <Label>Patient</Label>
              <Select value={patientId ?? "none"} onValueChange={(v) => setPatientId(v === "none" ? null : (v as string))}>
                <SelectTrigger className="w-full" aria-label="Patient"><SelectValue>{patient ? `${patient.name} · Stress ${patient.stress}` : "Pick a patient"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pick a patient</SelectItem>
                  {game.characters.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={inRecovery.has(c.id)}>
                      {c.name} · Stress {c.stress}{inRecovery.has(c.id) ? " · already in recovery" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Stress drops only when the project is complete.</p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>Room / workspace</Label>
            <Select value={roomId} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue>{roomId === "none" ? "None" : game.ship.rooms.find((r) => r.id === roomId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {game.ship.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={needsPatient && !patient}
            onClick={() => {
              act("New project", (g) => {
                const room = g.ship.rooms.find((r) => r.id === roomId);
                const p: Project = {
                  id: uid(),
                  name: t.name === "Custom Project" ? "New Project" : room && t.name === "Module Repair" ? `Repair ${room.name}` : needsPatient && patient ? `Stress Recovery: ${patient.name}` : t.name,
                  skill: t.skill,
                  threshold: t.threshold,
                  progress: 0,
                  required:
                    t.name === "Module Repair" && room
                      ? REPAIR_PROGRESS[room.condition] ?? 1
                      : t.name === "Hull Repair"
                        ? Math.max(1, HULL_TIERS[g.ship.hullTier].maxHp - g.ship.hullHp)
                        : t.required,
                  contributorLimit: t.contributorLimit,
                  energy: t.energy,
                  facility: t.facility,
                  materials: t.materials,
                  roomId: room?.id ?? null,
                  ...(needsPatient && patient ? { patientId: patient.id } : {}),
                  notes: "",
                  done: false,
                };
                g.ship.projects.push(p);
                return `Project started: ${p.name} (0/${p.required}).`;
              });
              setOpen(false);
              setPatientId(null);
            }}
          >
            Start project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectRow({ p }: { p: Project }) {
  const act = useGame((s) => s.act);
  const rooms = useGame((s) => s.game.ship.rooms);
  const room = rooms.find((r) => r.id === p.roomId);
  const patient = useGame((s) => s.game.characters.find((c) => c.id === p.patientId));
  const edit = (label: string, fn: (x: Project, g: GameState) => void | string | string[]) =>
    act(label, (g) => fn(g.ship.projects.find((x) => x.id === p.id)!, g));

  return (
    <div className={cn("grid gap-2 rounded-lg border bg-background/40 p-3", p.done && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <CommitInput aria-label="Project name" value={p.name} onCommit={(v) => edit("Rename project", (x) => { x.name = v || x.name; })} className="h-7 min-w-40 flex-1 border-transparent bg-transparent px-0 font-medium dark:bg-transparent" />
        {room && <Pill>{room.name}</Pill>}
        {p.patientId && <Pill tone={patient ? "info" : "danger"}>{patient ? `Patient: ${patient.name} · Stress ${patient.stress}` : "Patient gone"}</Pill>}
        {p.done && <Pill tone="good">Complete</Pill>}
        <span className="tabular font-mono text-sm">{p.progress}/{p.required}</span>
      </div>
      <Meter value={p.progress} max={p.required} tone="progress" segmented />
      <p className="text-[11px] text-muted-foreground">
        {p.skill && `${p.skill} · Routine ${p.threshold} · `}{p.contributorLimit} contributor{p.contributorLimit > 1 ? "s" : ""} · {p.energy} Energy each{p.facility && ` · ${p.facility}`}
      </p>
      {p.materials && <p className="text-[11px] text-muted-foreground">{p.materials}</p>}
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="xs"
          disabled={p.done}
          onClick={() =>
            edit(`${p.name} +1`, (x, g) => advanceProject(g, x.id, 1))
          }
        >
          <PlusIcon /> Progress
        </Button>
        <Button size="xs" variant="outline" disabled={p.progress <= 0} onClick={() => edit(`${p.name} −1`, (x) => { x.progress -= 1; x.done = false; return `${x.name} loses 1 Progress (${x.progress}/${x.required}).`; })}>Lose progress</Button>
        <Stepper value={p.required} min={1} max={30} size="xs" label="required progress" onChange={(v) => edit("Required", (x) => { x.required = v; x.done = x.progress >= v; })} />
        <Button size="xs" variant="ghost" className="ml-auto" onClick={() => act("Remove project", (g) => { g.ship.projects = g.ship.projects.filter((x) => x.id !== p.id); return `${p.done ? "Archived" : "Abandoned"} project: ${p.name}.`; })}>
          <Trash2Icon /> {p.done ? "Archive" : "Abandon"}
        </Button>
      </div>
    </div>
  );
}

export function ShipTab() {
  const { game, act } = useGame();
  const { isGM } = usePerms();
  const [preset, setPreset] = useState("none");
  const projects = game.ship.projects;
  return (
    <div className="grid gap-5">
      <fieldset disabled={!isGM} className={cn("grid min-w-0 gap-5 lg:grid-cols-2", !isGM && READ_ONLY)} title={isGM ? undefined : "Only the GM can change hull and power"}>
        <HullCard />
        <PowerCard />
      </fieldset>
      <HydroponicsCard />

      <section>
        <SectionTitle
          action={
            isGM && <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Select value={preset} onValueChange={(v) => setPreset(v as string)}>
                <SelectTrigger size="sm" className="w-44"><SelectValue>{preset === "none" ? "Empty room" : preset}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Empty room</SelectItem>
                  {MODULE_PRESETS.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => act("Add room", (g) => { const r = roomFromPreset(preset === "none" ? null : preset); g.ship.rooms.push(r); return `Added room: ${r.name}.`; })}><PlusIcon /> Add room</Button>
              <BuildFacilityDialog />
            </div>
          }
        >
          Rooms &amp; modules · {game.ship.rooms.length}
        </SectionTitle>
        {game.ship.rooms.length === 0 ? (
          <EmptyState title="No rooms recorded" body="Add each room aboard the ship and the module it houses." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {game.ship.rooms.map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        )}
      </section>

      <section>
        <SectionTitle action={<AddProjectDialog />}>Projects · {projects.filter((p) => !p.done).length} active</SectionTitle>
        {projects.length === 0 ? (
          <EmptyState title="No projects underway" body="Track room construction, module installs, hull repairs, and Stress Recovery here." />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {projects.map((p) => <ProjectRow key={p.id} p={p} />)}
          </div>
        )}
      </section>

      <CyberResearchCard />
    </div>
  );
}
