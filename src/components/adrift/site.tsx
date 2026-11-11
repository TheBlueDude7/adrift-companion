"use client";

import { useState } from "react";
import { CrosshairIcon, DoorOpenIcon, EyeIcon, EyeOffIcon, FlameIcon, FootprintsIcon, LightbulbIcon, PlusIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FIND_BY } from "@/data/sites";
import { addFind, findByLabel, findsWaiting, movePlan, moveTo, neighbours, revealFind, scout, setBorderState, zoneOf } from "@/lib/expedition";
import { clearHazard, HAZARD_PRESETS, hazardLine, hazardsIn, hazardTollAll, plantHazard, PRESET_BY_KEY } from "@/lib/hazards";
import { BORDER_STATES, type BorderState } from "@/lib/rules";
import { useGame } from "@/lib/store";
import type { Border, Expedition, FindBy, GameState, Zone } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { EmptyState, Pill, SectionTitle } from "./common";

const COVER_LABEL = { none: "No cover", partial: "Partial Cover", strong: "Strong Cover" } as const;

/** Whether a door is a door or a problem, in a word. */
const BORDER_TONE: Record<BorderState, "muted" | "warn" | "danger" | "good"> = {
  open: "good",
  closed: "muted",
  destroyed: "muted",
  hazardous: "warn",
  locked: "danger",
  sealed: "danger",
  blocked: "danger",
};

const occupants = (g: GameState, e: Expedition, zoneId: string) => e.crew.filter((id) => e.at[id] === zoneId).map((id) => g.characters.find((c) => c.id === id)).filter((c) => !!c);

function ZoneCard({ zone, mover }: { zone: Zone; mover: string | null }) {
  const { game, act } = useGame();
  const { isGM } = usePerms();
  const e = game.expedition!;
  const here = occupants(game, e, zone.id);
  const lurking = game.threats.filter((t) => t.zone === zone.id && t.band !== "down");
  const movingFrom = mover ? zoneOf(e, mover)?.id : undefined;
  const who = mover ? game.characters.find((c) => c.id === mover) : null;
  // Whether that's a step, a Sprint, or out of the question is the same question the move itself
  // asks, so the button offers exactly what the move would allow and says why when it wouldn't.
  const plan = mover && movingFrom !== zone.id ? movePlan(game, mover, zone.id) : null;
  const blocked = plan && "blocked" in plan ? plan.blocked : null;
  const allowed = plan && !("blocked" in plan) ? plan : null;
  const sprint = allowed?.kind === "sprint" ? allowed : null;

  return (
    <Card className={zone.seen ? undefined : "border-dashed opacity-70"}>
      <CardHeader className="gap-1">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {zone.seen ? zone.name : "Unexplored"}
          {zone.seen && zone.cover !== "none" && <Pill tone="info">{COVER_LABEL[zone.cover]}</Pill>}
          {zone.secured && <Pill tone="good">Secured</Pill>}
          {zone.searched && <Pill tone="muted">Searched</Pill>}
        </CardTitle>
        {zone.seen && zone.look && <p className="text-sm text-muted-foreground">{zone.look}</p>}
      </CardHeader>
      <CardContent className="grid gap-3">
        {here.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm">
            <FootprintsIcon className="size-3.5 text-amber-500" />
            {here.map((c) => c.name).join(", ")}
          </p>
        )}
        {lurking.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-rose-300">
            <CrosshairIcon className="size-3.5" />
            {lurking.map((t) => `${t.name} (${t.band})`).join(", ")}
          </p>
        )}
        {isGM && zone.secrets?.note && <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-sm">{zone.secrets.note}</p>}
        {(hazardsIn(zone).length > 0 || (isGM && zone.seen)) && <Hazards zone={zone} />}
        {(zone.finds.length > 0 || (isGM && zone.seen)) && <Finds zone={zone} />}

        {zone.seen && (
          <div className="grid gap-1.5">
            <Label className="text-xs">Ways on</Label>
            {neighbours(e, zone.id).map(({ border: b, zone: other }) =>
              other ? <BorderRow key={b.a + b.b} border={b} other={other} /> : null,
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {mover && movingFrom !== zone.id && (
            <Button
              size="sm"
              variant="outline"
              disabled={!!blocked}
              title={blocked ?? allowed?.warning ?? (sprint ? `Two zones at a run, through the ${sprint.via!.seen ? sprint.via!.name : "zone between"}: a Slow Action` : "One zone: a Fast Action in a fight, and free outside one")}
              onClick={() => act(`Move to ${zone.seen ? zone.name : "the next zone"}`, (g) => moveTo(g, mover, zone.id), "day")}
            >
              <FootprintsIcon /> {sprint ? "Sprint" : "Move"} {who?.name.split(" ")[0] ?? "here"} in
            </Button>
          )}
          {isGM && !zone.seen && (
            <Button size="sm" variant="ghost" onClick={() => act("Scout ahead", (g) => scout(g, zone.id), "day")}>
              <EyeIcon /> Reveal
            </Button>
          )}
          {isGM && zone.seen && (
            <>
              <Button size="sm" variant="ghost" onClick={() => act(`${zone.secured ? "Unsecure" : "Secure"} ${zone.name}`, (g) => {
                const z = g.expedition?.zones.find((x) => x.id === zone.id);
                if (!z) return;
                z.secured = !z.secured;
                return z.secured ? `The ${z.name} is Secured.` : `The ${z.name} isn't secure any more.`;
              }, "day")}>
                <ShieldCheckIcon /> {zone.secured ? "Not secure" : "Secured"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act(`Mark ${zone.name} searched`, (g) => {
                const z = g.expedition?.zones.find((x) => x.id === zone.id);
                if (!z) return;
                z.searched = !z.searched;
                return z.searched ? `The ${z.name} has been searched.` : `The ${z.name} is open to a fresh Search.`;
              }, "day")}>
                <SearchIcon /> {zone.searched ? "Unsearch" : "Searched"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What the crew has learned in a room, and — for the GM — what it still has to give up.
 *
 * Everyone reads the same list. The difference is that the GM sees the unfound entries too, marked
 * with how each would normally come to light, and hands them over when the crew earns them.
 */
function Finds({ zone }: { zone: Zone }) {
  const { act } = useGame();
  const { isGM } = usePerms();
  const found = zone.finds.filter((f) => f.found);
  const waiting = isGM ? findsWaiting(zone) : [];
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">What they know{isGM && waiting.length > 0 && <span className="ml-1 font-normal text-muted-foreground">· {waiting.length} still here</span>}</Label>
      {found.length === 0 && waiting.length === 0 && <p className="text-xs text-muted-foreground">Nothing here they haven&apos;t already seen.</p>}
      {found.map((f) => (
        <p key={f.id} className="flex items-start gap-1.5 text-sm">
          <LightbulbIcon className="mt-0.5 size-3.5 shrink-0 text-amber-400/80" />
          {f.text}
        </p>
      ))}
      {waiting.map((f) => (
        <div key={f.id} className="flex flex-wrap items-start gap-1.5 rounded-md border border-dashed p-1.5 text-sm text-muted-foreground">
          <EyeOffIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300/80" />
          <span className="min-w-40 flex-1">{f.text}</span>
          <Button size="xs" variant="ghost" className="ml-auto" title={`Normally found by ${findByLabel(f.by)}`} onClick={() => act("Hand over a find", (g) => revealFind(g, zone.id, f.id), "day")}>
            Tell them
          </Button>
        </div>
      ))}
      {isGM && zone.seen && <AddFindDialog zone={zone} />}
    </div>
  );
}

/**
 * What is standing in the room doing damage on its own. Shown to the crew as well as the GM, because
 * a burning room is not a secret, and it is the one thing on the sheet that hurts people between turns.
 */
function Hazards({ zone }: { zone: Zone }) {
  const { act } = useGame();
  const { isGM } = usePerms();
  const list = hazardsIn(zone);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">Standing hazards</Label>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing in here is burning.</p>
      ) : (
        list.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-md border border-orange-500/30 bg-orange-500/5 p-2">
            <FlameIcon className="size-3.5 shrink-0 text-orange-400" />
            <p className="min-w-0 flex-1 text-xs">
              <span className="font-medium">{h.name}</span> — {hazardLine(h)}, when someone walks in and again if they end their turn here.
              <span className="text-muted-foreground"> {h.rounds === undefined ? "Stands until it's dealt with." : `${h.rounds} Round${h.rounds === 1 ? "" : "s"} left.`} ({h.source})</span>
            </p>
            {isGM && (
              <Button size="xs" variant="ghost" onClick={() => act(`Clear ${h.name}`, (g) => clearHazard(g, zone.id, h.id), "day")}>
                Put out
              </Button>
            )}
          </div>
        ))
      )}
      {isGM && zone.seen && <PlantHazardDialog zone={zone} />}
    </div>
  );
}

/** The GM leaving something in a room: a frame's incendiary, a colony's spores, or the site burning. */
function PlantHazardDialog({ zone }: { zone: Zone }) {
  const { act } = useGame();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(HAZARD_PRESETS[0].key);
  const [source, setSource] = useState("");
  const [toll, setToll] = useState(true);
  const preset = PRESET_BY_KEY[key];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setKey(HAZARD_PRESETS[0].key); setSource(""); setToll(true); } }}>
      <DialogTrigger render={<Button size="xs" variant="ghost" className="justify-self-start"><FlameIcon /> Leave a hazard here</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{zone.name}: leave something standing</DialogTitle>
          <DialogDescription>It catches anyone who walks in, and anyone still here when their turn ends. It works on the threats&apos; turns too, which is the point of it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">What it is</Label>
            <Select value={key} onValueChange={(v) => setKey(v ?? key)}>
              <SelectTrigger size="sm"><SelectValue>{preset.name}</SelectValue></SelectTrigger>
              <SelectContent>{HAZARD_PRESETS.map((h) => <SelectItem key={h.key} value={h.key}>{h.name} — {hazardLine(h)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{preset.from}. {preset.rounds === undefined ? "Stands until the crew deals with it." : `Lasts ${preset.rounds} Rounds.`}</p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="hazard-source">What left it</Label>
            <Input id="hazard-source" value={source} onChange={(ev) => setSource(ev.target.value)} placeholder={preset.from.split(",")[0]} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={toll} onCheckedChange={(v) => setToll(!!v)} />
            Catch everyone already standing here
          </label>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              act(`Leave ${preset.name.toLowerCase()} in ${zone.name}`, (g) => {
                const out = plantHazard(g, zone.id, { name: preset.name, damage: preset.damage, type: preset.type, conditions: preset.conditions, rounds: preset.rounds, source: source.trim() || preset.from.split(",")[0] });
                return toll ? [...out, ...hazardTollAll(g, zone.id)] : out;
              }, "day");
              setOpen(false);
            }}
          >
            Leave it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Something the crew turned up that nobody wrote in advance, which is most of what a site gives up. */
function AddFindDialog({ zone }: { zone: Zone }) {
  const { act } = useGame();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [by, setBy] = useState<FindBy>("look");
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setText(""); setBy("look"); } }}>
      <DialogTrigger render={<Button size="xs" variant="ghost" className="justify-self-start"><PlusIcon /> Something else they found</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{zone.name}: what they found</DialogTitle>
          <DialogDescription>Told to the crew as soon as you add it, and it stays on the room for them to read again.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Textarea autoFocus placeholder="A handprint on the inside of the locker door, too large to be a hand." value={text} onChange={(ev) => setText(ev.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {FIND_BY.map((k) => (
              <Button key={k} size="xs" variant={by === k ? "default" : "outline"} onClick={() => setBy(k)}>{findByLabel(k)}</Button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!text.trim()} onClick={() => { act("A find", (g) => addFind(g, zone.id, text, by), "day"); setOpen(false); }}>Tell them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One way out of a zone: what's in the way, and the GM's control for changing that. */
function BorderRow({ border, other }: { border: Border; other: Zone }) {
  const { act } = useGame();
  const { isGM } = usePerms();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
      <DoorOpenIcon className="size-3.5 text-muted-foreground" />
      <span className={other.seen ? undefined : "text-muted-foreground italic"}>{other.seen ? other.name : "somewhere else"}</span>
      <Pill tone={BORDER_TONE[border.state]}>{border.state}</Pill>
      {border.note && <span className="text-xs text-muted-foreground">{border.note}</span>}
      {isGM && (
        <Select
          value={border.state}
          onValueChange={(v) => act(`Set a border ${v}`, (g) => setBorderState(g, border.a, border.b, v as BorderState), "day")}
        >
          <SelectTrigger size="sm" className="ml-auto h-7 w-28 text-xs"><SelectValue>{border.state}</SelectValue></SelectTrigger>
          <SelectContent>
            {BORDER_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function SiteTab() {
  const { game } = useGame();
  const { isGM } = usePerms();
  const e = game.expedition;
  const [mover, setMover] = useState<string | null>(null);

  if (!e) return <EmptyState title="Nobody is off the ship" body="Start an expedition from the campaign menu, and the site's zones show up here." />;
  if (!e.zones.length)
    return (
      <EmptyState
        title={`${e.site} has no map`}
        body="This expedition was started without an authored site, so there are no zones to move between. Author one in content/sites and start a fresh expedition to use it."
      />
    );

  const crew = e.crew.map((id) => game.characters.find((c) => c.id === id)).filter((c) => !!c);
  const shown = e.zones.filter((z) => z.seen || isGM || e.borders.some((b) => (b.a === z.id || b.b === z.id) && e.zones.find((x) => x.id === (b.a === z.id ? b.b : b.a))?.seen));

  return (
    <div className="grid gap-3">
      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Moving</Label>
            <Select value={mover ?? "none"} onValueChange={(v) => setMover(v === "none" ? null : v)}>
              <SelectTrigger size="sm" className="w-40"><SelectValue>{crew.find((c) => c.id === mover)?.name ?? "Nobody"}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nobody</SelectItem>
                {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      >
        {e.site}
      </SectionTitle>
      {/* The site's own briefing, which the GM shouldn't have to dig back out of the log. */}
      {isGM && e.secrets && (
        <div className="grid gap-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <EyeOffIcon className="size-3 shrink-0 text-amber-300/80" />
            {e.secrets.capacity ? `${e.secrets.capacity} salvage bundle${e.secrets.capacity === 1 ? "" : "s"} left to find here.` : "Nothing ordinary left to salvage here."}
          </p>
          {e.secrets.notes && <p className="pl-4.5">{e.secrets.notes}</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((z) => <ZoneCard key={z.id} zone={z} mover={mover} />)}
      </div>
    </div>
  );
}
