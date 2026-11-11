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
import { hullTier, power, roomDraw, roomWorks } from "@/lib/derive";
import {
  FACILITY_GRADES,
  HULL_TIERS,
  MODULE_CONDITIONS,
  MODULE_CONDITION_EFFECTS,
  MODULE_PRESETS,
  OVERLOAD_BONUS,
  PROJECT_COSTS,
  PROJECT_TEMPLATES,
  REPAIR_PROGRESS,
  type FacilityGrade,
} from "@/lib/rules";
import { FACILITIES, FACILITY_BY_NAME, ladderFor, ROOM_FITTINGS, SOLAR_FUEL_PER_DAY, SOLAR_PANELS } from "@/data/ship-upgrades";
import { upgradeThreshold } from "@/data/tasks";
import { advanceProject, projectBill } from "@/lib/actions";
import { CROP_DAYS, CROP_KINDS, CROP_KIND_BY_KEY, CROP_LEVEL_NAMES, XENO_STRAINS, type CropKindDef, cropKindOf, cropKindsFor, cropOf, cropStall, cropTending, cropYield, doseYield, growCrops, hydroponicsLevel, nextCropKind, readyTotal, strainLabel, strainOf } from "@/lib/crops";
import { installLevels, moduleCost, nextRoomLevel, setRoomLevel, solarRooms } from "@/lib/modules";
import { roomFromPreset } from "@/lib/seed";
import { recipeText, shortfalls, spend } from "@/lib/stock";
import { useGame } from "@/lib/store";
import type { Crop, GameState, Project, ProjectRequest, Room } from "@/lib/types";
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
  const solarSets = solarRooms(game).length;

  function shed() {
    act("Shed load", (g) => {
      const out: string[] = [];
      const candidates = g.ship.rooms.filter((r) => roomWorks(r) && !r.essential && roomDraw(r) > 0).sort((a, b) => roomDraw(b) - roomDraw(a));
      for (const r of candidates) {
        if (power(g.ship).surplus >= 0) break;
        r.active = false;
        out.push(`${r.name} powered down to save ${roomDraw(r)} Power.`);
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
        {solarSets > 0 && <p className="text-xs text-amber-200">☀ {solarSets} set{solarSets > 1 ? "s" : ""} of solar panels: +{solarSets * SOLAR_FUEL_PER_DAY} Fuel Unit{solarSets * SOLAR_FUEL_PER_DAY > 1 ? "s" : ""} into the hold at End of Day.</p>}
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
  const waiting = readyTotal(crop);
  if (level < 0 && !crop.growing && !waiting) return null;
  const stall = cropStall(game);
  const tending = cropTending(game);
  const tendedToday = crop.tended.includes(game.day);
  const kind = cropKindOf(game);
  const sowing = nextCropKind(game);
  const piles = CROP_KINDS.filter((k) => (crop.ready[k.key] ?? 0) > 0);
  // Xenoflora doses are sealed straight into the hold, so there's never a pile of them for the GM to edit.
  const manual = kind.key === "xeno" ? CROP_KIND_BY_KEY.food : kind;
  const strain = strainOf(crop.nextStrain);
  /** A damage strain yields half as many doses, so the counts shown have to follow the tuning. */
  const yieldOf = (k: CropKindDef) => (k.key === "xeno" ? doseYield(strain.name, level) : cropYield(k, level));
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
          {level < 0 ? "No working Hydroponics aboard." : `${CROP_LEVEL_NAMES[level]}: ${level >= 1 ? `one crop every ${CROP_DAYS} days.` : "no production."}`} {tending.rule} Maintain Crops sows an empty module and tends a growing one; End of Day grows; Harvest Hydroponics collects.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xl">{crop.growing ? crop.day : "—"}<span className="text-muted-foreground">/{CROP_DAYS}</span></span>
          <span className="text-sm text-muted-foreground">{crop.growing ? `days grown · ${crop.kind === "xeno" ? `${crop.strain} strain` : kind.name}` : "nothing planted"}</span>
          {crop.growing && <Pill tone={tending.urgent ? "warn" : tending.due ? "info" : "good"}>{tending.status}</Pill>}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {piles.length === 0 ? <Pill tone="muted">Nothing ready</Pill> : piles.map((k) => <Pill key={k.key} tone="good">{crop.ready[k.key]} {k.item} ready</Pill>)}
          </span>
        </div>
        <Meter value={crop.growing ? crop.day : 0} max={CROP_DAYS} tone="good" segmented />
        <p className={cn("text-xs", stall ? "text-amber-300" : "text-muted-foreground")}>
          {stall
            ? crop.kind === "xeno" && crop.growing
              ? `Tonight: the ${crop.strain} strain slips containment and the crop is lost. ${stall}.`
              : `Tonight: the crops won't grow. ${stall}.`
            : crop.growing
              ? crop.day + 1 >= CROP_DAYS
                ? "Tonight: the crop finishes."
                : "Tonight: the crop grows a day."
              : level >= 4
                ? sowing.key === "xeno"
                  ? "The beds stay empty tonight: the ship won't sow an alien strain unasked."
                  : "A new crop starts on its own tonight."
                : ""}
          {/* Operational crops stall on their last day, so say so while there's still time to assign the task. */}
          {!stall && tending.due && <span className="text-amber-300"> It still needs Maintain Crops before it ripens, or it loses that growth.</span>}
        </p>
        {level >= 1 && (
          <div className="grid gap-1.5 border-t pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{crop.growing ? "Sow next:" : "Sow:"}</span>
              {cropKindsFor(game).map((k) => (
                <Button
                  key={k.key}
                  size="xs"
                  variant={k.key === sowing.key ? "default" : "outline"}
                  disabled={k.key === "xeno" && level < 3}
                  onClick={() => update(`Sow ${k.name}`, (c) => ({ ...c, next: k.key }), `The beds are given over to ${k.name}: ${yieldOf(k)} ${k.key === "xeno" ? "doses" : k.item} a crop.`)}
                >
                  {k.name} · {yieldOf(k)}
                </Button>
              ))}
            </div>
            {/* A strain is tuned against one thing, and the choice is locked in once it's in the ground. */}
            {sowing.key === "xeno" &&
              (["condition", "damage"] as const).map((group) => (
                <div key={group} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">{group === "condition" ? "Resist a condition:" : "Resist damage:"}</span>
                  {XENO_STRAINS.filter((s) => s.kind === group).map((s) => (
                    <Button
                      key={s.name}
                      size="xs"
                      variant={s.name === strain.name ? "default" : "outline"}
                      onClick={() => update(`Tune the strain to ${s.name}`, (c) => ({ ...c, nextStrain: s.name }), `The strain is tuned for ${strainLabel(s.name)}: ${doseYield(s.name, level)} doses a crop.`)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              ))}
            <p className="text-[11px] text-muted-foreground">
              {crop.growing && sowing.key !== kind.key && `This ${kind.name} crop finishes first. `}
              {sowing.key === "xeno"
                ? `Xenoflora: ${yieldOf(sowing)} doses of ${strainLabel(strain.name)} every ${CROP_DAYS} days${level < 3 ? ", and it needs Expanded Hydroponics to take root" : ""}. ${strain.kind === "damage" ? "Halving a damage type is worth more than shrugging off a condition, so a damage strain yields half as many. " : ""}${sowing.note}`
                : `${sowing.name}: ${cropYield(sowing, level)} ${sowing.item} every ${CROP_DAYS} days. ${sowing.note}`}
            </p>
          </div>
        )}
        {isGM && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="text-[11px] text-muted-foreground">GM:</span>
            {!crop.growing ? (
              <Button
                size="xs"
                variant="outline"
                disabled={sowing.key === "xeno" && level < 3}
                onClick={() => {
                  const sown = sowing.key === "xeno" ? strain.name : undefined;
                  update(
                    "Sow crops",
                    (c) => ({ ...c, growing: true, day: 0, plantedDay: game.day, tended: [game.day], kind: sowing.key, next: undefined, strain: sown }),
                    sown ? `☣ The GM puts a ${sown} strain in the Hydroponics beds.` : `🌱 The GM sows a ${sowing.name} crop in Hydroponics.`,
                  );
                }}
              >
                Sow
              </Button>
            ) : (
              <>
                <Button size="xs" variant="outline" onClick={() => update(tendedToday ? "Untend crops" : "Tend crops", (c) => ({ ...c, tended: tendedToday ? c.tended.filter((d) => d !== game.day) : [...c.tended, game.day] }))}>{tendedToday ? "Unmark tended" : "Mark tended"}</Button>
                <Button size="xs" variant="outline" onClick={() => act("Grow crops", (g) => { const out: string[] = []; const t = cropOf(g); if (!t.tended.includes(g.day)) g.ship.crop = { ...t, tended: [...t.tended, g.day] }; growCrops(g, out); return out; })}>Grow a day</Button>
                <Button size="xs" variant="ghost" onClick={() => update("Clear crops", (c) => ({ ...c, growing: false, day: 0, tended: [], strain: undefined }), "The crops in Hydroponics are cleared.")}>Clear crop</Button>
              </>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              {manual.item} ready
              <Stepper value={crop.ready[manual.key] ?? 0} min={0} max={99} size="xs" label={`${manual.item} ready`} onChange={(v) => update("Ready produce", (c) => ({ ...c, ready: { ...c.ready, [manual.key]: v } }))} />
            </span>
          </div>
        )}
        {/* Alien life is the GM's to hand out. Until they do, the crew can't even attempt the project. */}
        {isGM && !game.research.xenoflora && (
          <label className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Checkbox
              checked={!!game.research.xenofloraAllowed}
              onCheckedChange={(v) =>
                act("Xenoflora specimen", (g) => {
                  g.research.xenofloraAllowed = !!v;
                  return v
                    ? "☣ The crew has a viable alien specimen. Xenoflora Cultivation can be started as a Project."
                    : "The alien specimen is no longer viable. Xenoflora Cultivation can't be started.";
                })
              }
            />
            <span>
              The crew has a viable alien specimen.
              <span className="block text-[11px]">Lets them start the Xenoflora Cultivation project, which is what actually unlocks growing strains.</span>
            </span>
          </label>
        )}
      </CardContent>
    </Card>
  );
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
      setRoomLevel(r, (r.level ?? 0) + 1);
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
  // A fitting needs a room with a free spare slot; anything else can be a new room of its own.
  const hosts = game.ship.rooms.filter((r) => !f.fitting || !r.fitting);
  const host = hosts.find((r) => r.id === roomId);
  const homeless = !!f.fitting && !host;

  function choose(name: string) {
    const next = FACILITIES.find((x) => x.name === name)!;
    setPick(name);
    setRoomId(next.fitting ? (game.ship.rooms.find((r) => !r.fitting)?.id ?? "none") : "new");
  }

  function build(pay: boolean) {
    act(`Build ${f.name}`, (g) => {
      if (pay) spend(g, f.cost, f.toolkit);
      const host = g.ship.rooms.find((r) => r.id === roomId);
      if (host && f.fitting) host.fitting = f.name;
      else if (host) host.notes = [host.notes, `${f.name}: ${f.effect}`].filter(Boolean).join("\n");
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
          <DialogDescription>One-off installations from the ship upgrade sheet. Build one as a new room, or add it to an existing room. Solar panels and defenses instead fill the spare slot in a room, one apiece.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={pick} onValueChange={(v) => choose(v as string)}>
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
            <Select value={f.fitting ? (host?.id ?? "none") : roomId} onValueChange={(v) => setRoomId(v as string)}>
              <SelectTrigger className="w-full"><SelectValue>{f.fitting ? (host ? `${host.name}'s spare slot` : "No room with a free slot") : roomId === "new" ? "A new room" : game.ship.rooms.find((r) => r.id === roomId)?.name}</SelectValue></SelectTrigger>
              <SelectContent>
                {f.fitting ? <SelectItem value="none" disabled>No room with a free slot</SelectItem> : <SelectItem value="new">A new room</SelectItem>}
                {hosts.map((r) => <SelectItem key={r.id} value={r.id}>{f.fitting ? `Fit in ${r.name}` : `Add to ${r.name}`}</SelectItem>)}
              </SelectContent>
            </Select>
            {homeless && <p className="text-[11px] text-amber-300">Every spare slot aboard is taken. Clear one on its room card first.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={homeless} onClick={() => build(false)}>Add without spending</Button>
          <Button disabled={short.length > 0 || homeless} onClick={() => build(true)}>{short.length ? "Missing materials" : "Spend and build"}</Button>
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
  const fittingDraw = room.fitting ? (FACILITY_BY_NAME[room.fitting]?.powerDraw ?? 0) : 0;
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
            {room.fitting && <Pill tone={room.fitting === SOLAR_PANELS ? "good" : "info"}>{room.fitting}</Pill>}
          </div>
        </fieldset>
        <Switch aria-label="Powered" checked={room.active} onCheckedChange={(v) => edit(`${room.name} power`, (r) => { r.active = v; return `${r.name} ${v ? "powered up" : "powered down"}.`; })} />
      </div>

      <fieldset disabled={!isGM} className={cn("grid min-w-0 gap-3", !isGM && READ_ONLY)} title={isGM ? undefined : "Only the GM changes rooms. Crew can power them on and off."}>
      <div className="grid grid-cols-2 gap-2">
        <Select value={room.module ?? "none"} onValueChange={(v) => edit("Module", (r) => { const preset = MODULE_PRESETS.find((m) => m.name === v); r.module = v === "none" ? null : (v as string); r.powerDraw = preset?.powerDraw ?? 0; r.powerOutput = preset?.powerOutput ?? 0; r.level = ladderFor(r.module) ? 0 : undefined; if (r.level !== undefined) setRoomLevel(r, 0); return `${r.name} now houses ${r.module ?? "no module"}.`; })}>
          <SelectTrigger size="sm" className="w-full"><SelectValue>{room.module ?? "Empty room"}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Empty room</SelectItem>
            {MODULE_PRESETS.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {ladder ? (
          <Select value={room.level === undefined ? "unset" : String(room.level)} onValueChange={(v) => edit("Upgrade level", (r) => { setRoomLevel(r, Number(v)); return `${r.name} is set to ${ladder.levels[Number(v)].name}.`; })}>
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

      <div className="grid gap-1.5">
        <Select value={room.fitting ?? "none"} onValueChange={(v) => edit("Room fitting", (r) => { r.fitting = v === "none" ? undefined : (v as string); return r.fitting ? `${r.name} is fitted with ${r.fitting}.` : `${r.name}'s spare slot is cleared.`; })}>
          <SelectTrigger size="sm" className="w-full" aria-label="Spare slot"><SelectValue>{room.fitting ?? "Spare slot: empty"}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Spare slot: empty</SelectItem>
            {ROOM_FITTINGS.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {room.fitting && <p className="text-[11px] text-muted-foreground">{FACILITY_BY_NAME[room.fitting]?.effect}</p>}
      </div>
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
        <span className="flex items-center gap-1">
          <PowerIcon className="size-3" /> Draw <Stepper value={room.powerDraw} min={0} max={8} size="xs" label="power draw" onChange={(v) => edit("Power draw", (r) => { r.powerDraw = v; })} />
          {fittingDraw > 0 && <span>+{fittingDraw} for the {room.fitting}</span>}
        </span>
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

/** Projects that can be started. Xenoflora Cultivation is off the list until the GM says there's something to cultivate. */
export const projectTemplates = (game: GameState) =>
  PROJECT_TEMPLATES.filter((p) => p.name !== "Xenoflora Cultivation" || (game.research.xenofloraAllowed && !game.research.xenoflora));

/**
 * Starting a project, whether the GM thought of it or the crew asked for it.
 *
 * An accepted request opens this same dialog with the template and room already chosen, so the
 * materials, the patient and the module ladder are all settled the way they always were — the ask
 * decides what the crew wanted, never what the ship gets. The request is cleared by starting it.
 */
function AddProjectDialog({ request }: { request?: ProjectRequest }) {
  const { game, act } = useGame();
  const [open, setOpen] = useState(false);
  const [tpl, setTpl] = useState(() => Math.max(0, projectTemplates(game).findIndex((p) => p.name === request?.template)));
  const [roomId, setRoomId] = useState(request?.roomId ?? "none");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [moduleName, setModuleName] = useState<string | null>(null);
  const [startLevel, setStartLevel] = useState(0);
  const { isGM } = usePerms();
  const templates = projectTemplates(game);
  const t = templates[tpl] ?? templates[0];
  const needsPatient = t.name === "Stress Recovery";
  const patient = game.characters.find((c) => c.id === patientId);
  const inRecovery = new Set(game.ship.projects.filter((p) => !p.done && p.patientId).map((p) => p.patientId));
  const installing = t.name === "Install Module";
  const upgrading = t.name === "Upgrade Module";
  const rooms = installing ? game.ship.rooms.filter((r) => !r.module) : upgrading ? game.ship.rooms.filter((r) => nextRoomLevel(r)) : game.ship.rooms;
  const room = rooms.find((r) => r.id === roomId);
  const next = upgrading && room ? nextRoomLevel(room) : undefined;
  const levels = installing && moduleName ? installLevels(moduleName) : [];
  const plan = installing && room && moduleName ? { name: moduleName, level: levels.length ? startLevel : undefined } : next && room?.module ? { name: room.module, level: next.index } : null;
  // A module project is priced from its own upgrade ladder; every other template that commits
  // materials up front lists them on the sheet. Either way they come out of the hold at the start.
  const { cost, toolkit } = plan ? moduleCost(plan.name, plan.level) : { cost: PROJECT_COSTS[t.name]?.upfront ?? [], toolkit: 0 };
  const paid = cost.length > 0 || toolkit > 0;
  const short = shortfalls(game, cost, toolkit);
  const threshold = upgrading && next ? upgradeThreshold(next.index) : t.threshold;
  const blocked = (needsPatient && !patient) || ((installing || upgrading) && !plan);

  function pickTemplate(i: number) {
    setTpl(i);
    setRoomId("none");
    setModuleName(null);
  }

  function pickModule(m: string) {
    setModuleName(m);
    setStartLevel(Math.max(0, installLevels(m).length - 1));
  }

  function start(pay: boolean) {
    act("New project", (g) => {
      const room = g.ship.rooms.find((r) => r.id === roomId);
      if (paid && pay) spend(g, cost, toolkit);
      const levelName = plan?.level === undefined ? undefined : ladderFor(plan.name)?.levels[plan.level].name;
      const p: Project = {
        id: uid(),
        name:
          installing && plan && room ? `Install ${plan.name}${levelName ? ` (${levelName})` : ""} in ${room.name}`
          : upgrading && room && levelName ? `Upgrade ${room.name} to ${levelName}`
          : t.name === "Custom Project" ? "New Project"
          : room && t.name === "Module Repair" ? `Repair ${room.name}`
          : needsPatient && patient ? `Stress Recovery: ${patient.name}`
          : t.name,
        skill: t.skill,
        threshold,
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
        materials: plan ? `${paid ? `${recipeText(cost, toolkit)}${pay ? ", spent when the project started" : ", not spent"}.` : "No listed materials."} It applies itself when complete.` : t.materials,
        roomId: room?.id ?? null,
        ...(needsPatient && patient ? { patientId: patient.id } : {}),
        ...(plan ? { module: plan } : {}),
        notes: "",
        done: false,
      };
      g.ship.projects.push(p);
      if (request) g.projectRequests = (g.projectRequests ?? []).filter((x) => x.id !== request.id);
      const asked = request ? g.characters.find((c) => c.id === request.by)?.name : null;
      return `Project started: ${p.name} (0/${p.required})${paid && pay ? `, using ${recipeText(cost, toolkit)}` : ""}${asked ? `, as ${asked} asked` : ""}.`;
    });
    setOpen(false);
    setPatientId(null);
    setModuleName(null);
    setRoomId("none");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={request ? <Button size="xs" variant="outline">Start it</Button> : <Button size="sm"><HammerIcon /> New project</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a Project</DialogTitle>
          <DialogDescription>Routine contributions add 1 Progress automatically; successful Skilled contributions add 1 Progress.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={String(tpl)} onValueChange={(v) => pickTemplate(Number(v))}>
            <SelectTrigger className="w-full"><SelectValue>{t.name}</SelectValue></SelectTrigger>
            <SelectContent>{templates.map((p, i) => <SelectItem key={p.name} value={String(i)}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="rounded-lg bg-muted/40 p-3 text-xs">
            <p><span className="text-muted-foreground">Skill:</span> {t.skill || "—"} · Routine {threshold}</p>
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
            <Label>{installing ? "Empty room" : upgrading ? "Room to upgrade" : "Room / workspace"}</Label>
            {(installing || upgrading) && rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {installing ? "No empty rooms aboard. Finish an Expand Ship project first, or ask the GM to add one." : "No rooms have an upgrade left."}
              </p>
            ) : (
              <Select value={roomId} onValueChange={(v) => setRoomId(v as string)}>
                <SelectTrigger className="w-full"><SelectValue>{room?.name ?? (installing || upgrading ? "Pick a room" : "None")}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{installing || upgrading ? "Pick a room" : "None"}</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{upgrading && nextRoomLevel(r) ? ` · ${ladderFor(r.module)!.levels[r.level!].name} → ${nextRoomLevel(r)!.step.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {installing && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>Module</Label>
                <Select value={moduleName ?? "none"} onValueChange={(v) => v !== "none" && pickModule(v as string)}>
                  <SelectTrigger className="w-full"><SelectValue>{moduleName ?? "Pick a module"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Pick a module</SelectItem>
                    {MODULE_PRESETS.map((m) => <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {levels.length > 1 && (
                <div className="grid gap-1.5">
                  <Label>Starts at</Label>
                  <Select value={String(startLevel)} onValueChange={(v) => setStartLevel(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue>{levels[startLevel]?.name}</SelectValue></SelectTrigger>
                    <SelectContent>{levels.map((l, i) => <SelectItem key={l.name} value={String(i)}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {(plan || paid) && (
            <div className="grid gap-1 rounded-lg border p-3 text-sm">
              {plan?.level !== undefined && <p className="text-xs">{ladderFor(plan.name)?.levels[plan.level].effect}</p>}
              <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Materials, spent when it starts</p>
              {!paid && <p className="text-xs text-muted-foreground">None listed. The GM can note any in the project.</p>}
              {cost.map((part: { name: string; qty: number }) => {
                const miss = short.find((x) => x.name === part.name);
                return <p key={part.name} className={miss ? "text-rose-300" : undefined}>{part.qty} {part.name}{miss && <span className="text-xs text-muted-foreground"> (have {miss.have})</span>}</p>;
              })}
              {toolkit > 0 && <p className={short.some((x) => x.name === "Toolkit charges") ? "text-rose-300" : undefined}>{toolkit} charges of any toolkit</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          {paid && isGM && <Button variant="ghost" onClick={() => start(false)}>Start without spending</Button>}
          <Button disabled={blocked || short.length > 0} onClick={() => start(true)}>
            {short.length ? "Missing materials" : paid ? "Spend and start" : "Start project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the crew has asked for and nobody has opened yet.
 *
 * Shown to everyone, because the crew knows what it asked: a player who can see their own request
 * sitting there doesn't ask twice. Only the GM can answer one, and the answer is either the ordinary
 * New Project dialog or a refusal — the ask itself never becomes work on its own.
 */
function ProjectRequests() {
  const { game, act } = useGame();
  const { isGM } = usePerms();
  const requests = game.projectRequests ?? [];
  if (!requests.length) return null;
  return (
    <div className="mb-3 grid gap-2">
      {requests.map((r) => {
        const who = game.characters.find((c) => c.id === r.by)?.name ?? "Someone";
        const room = r.roomId ? game.ship.rooms.find((x) => x.id === r.roomId)?.name : null;
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-foreground/90"><span className="text-amber-200/90">{who} asks for</span> {r.template}{room ? ` · ${room}` : ""}</p>
              {r.note && <p className="mt-0.5 text-muted-foreground">“{r.note}”</p>}
            </div>
            {isGM && <AddProjectDialog request={r} />}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => act("Answer project request", (g) => { g.projectRequests = (g.projectRequests ?? []).filter((x) => x.id !== r.id); return `${isGM ? "Turned down" : "Withdrew"} the request for ${r.template}.`; })}
            >
              {isGM ? "Turn it down" : "Withdraw"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function ProjectRow({ p }: { p: Project }) {
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const rooms = useGame((s) => s.game.ship.rooms);
  const room = rooms.find((r) => r.id === p.roomId);
  const patient = useGame((s) => s.game.characters.find((c) => c.id === p.patientId));
  const bill = useGame((s) => projectBill(s.game, p));
  const edit = (label: string, fn: (x: Project, g: GameState) => void | string | string[]) =>
    act(label, (g) => fn(g.ship.projects.find((x) => x.id === p.id)!, g));

  return (
    <div className={cn("grid gap-2 rounded-lg border bg-background/40 p-3", p.done && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset disabled={!isGM} className="h-7 min-w-40 flex-1">
          <CommitInput aria-label="Project name" value={p.name} onCommit={(v) => edit("Rename project", (x) => { x.name = v || x.name; })} className="h-7 w-full border-transparent bg-transparent px-0 font-medium dark:bg-transparent" />
        </fieldset>
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
      {bill.text && !p.done && (
        <p className={cn("text-[11px]", bill.short.length ? "text-amber-300" : "text-muted-foreground")}>
          Takes {bill.text}
          {bill.short.length > 0 && ` · the hold is short ${bill.short.map((s) => `${s.need - s.have} ${s.name}`).join(", ")}`}
        </p>
      )}
      <fieldset
        disabled={!isGM}
        className={cn("flex flex-wrap gap-1.5", !isGM && READ_ONLY)}
        title={isGM ? undefined : "Only the GM changes a project's Progress. Crew add Progress with the Work on a project task."}
      >
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
      </fieldset>
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
        <SectionTitle action={isGM && <AddProjectDialog />}>Projects · {projects.filter((p) => !p.done).length} active</SectionTitle>
        <ProjectRequests />
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
