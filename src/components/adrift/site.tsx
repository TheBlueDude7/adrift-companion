"use client";

import { useState } from "react";
import { CrosshairIcon, DoorOpenIcon, EyeIcon, EyeOffIcon, FootprintsIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { movePlan, moveTo, neighbours, scout, setBorderState, zoneOf } from "@/lib/expedition";
import { BORDER_STATES, type BorderState } from "@/lib/rules";
import { useGame } from "@/lib/store";
import type { Border, Expedition, GameState, Zone } from "@/lib/types";
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
        {isGM && zone.secrets?.search && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <SearchIcon className="mt-0.5 size-3.5 shrink-0" />
            {zone.searched ? <span className="line-through">{zone.secrets.search}</span> : zone.secrets.search}
          </p>
        )}

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
