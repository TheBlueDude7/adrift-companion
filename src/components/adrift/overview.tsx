"use client";

import { AlertTriangleIcon, PlusIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { characterAlerts, hullTier, maxEnergy, maxHp, power } from "@/lib/derive";
import { PRESSURE_STATES, pressureTip, stressBand } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { EmptyState, Meter, Pill, SectionTitle, StarshipIcon, Tip } from "./common";
import { ApplyConditionDialog, ConditionChips, SceneControls } from "./conditions";
import { ProjectRow } from "./ship";
import { SupplyStrip } from "./storage";

export function OverviewTab({ onOpenCharacter, onGo }: { onOpenCharacter: (id: string) => void; onGo: (tab: string) => void }) {
  const game = useGame((s) => s.game);
  const perms = usePerms();
  const ship = game.ship;
  const tier = hullTier(ship);
  const p = power(ship);
  const troubled = ship.rooms.filter((r) => r.condition !== "Operational");
  const active = game.ship.projects.filter((x) => !x.done);

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><StarshipIcon className="size-4 text-primary" /> {ship.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{ship.location || "Location unknown"}</p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1.5 flex justify-between text-xs"><span className="text-muted-foreground">Hull · {tier.name}</span><span className="font-mono">{ship.hullHp}/{tier.maxHp}</span></div>
                <Meter value={ship.hullHp} max={tier.maxHp} tone="hull" segmented />
                <p className="mt-1 text-[11px] text-muted-foreground">Armor {tier.armorDice}d6</p>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-xs"><span className="flex items-center gap-1 text-muted-foreground"><ZapIcon className="size-3" /> Power</span><span className={cn("font-mono", p.surplus < 0 && "text-rose-300")}>{p.draw}/{p.generated}</span></div>
                <Meter value={p.draw} max={Math.max(p.generated, p.draw, 1)} tone={p.surplus < 0 ? "hp" : "energy"} />
                <p className={cn("mt-1 text-[11px]", p.surplus < 0 ? "text-rose-300" : "text-muted-foreground")}>{p.surplus < 0 ? `${-p.surplus} over capacity` : `${p.surplus} spare`}{ship.overloaded && " · overloaded"}</p>
              </div>
            </div>
            {ship.hullHp <= 0 && <div className="flex items-center gap-2 rounded-lg bg-rose-500/15 p-2.5 text-xs text-rose-200"><AlertTriangleIcon className="size-4" /> Critical Integrity</div>}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Systems needing attention</p>
              {troubled.length === 0 ? (
                <p className="text-sm text-emerald-300">All modules operational.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {troubled.map((r) => (
                    <button key={r.id} onClick={() => onGo("ship")}>
                      <Pill tone={r.condition === "Damaged" ? "warn" : "danger"}>{r.name}: {r.condition}</Pill>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Supplies in the hold</CardTitle></CardHeader>
          <CardContent><SupplyStrip /></CardContent>
        </Card>
      </div>

      <section>
        <SectionTitle action={game.characters.length > 0 && <SceneControls />}>Crew status</SectionTitle>
        {game.characters.length === 0 ? (
          <EmptyState title="No survivors yet" body="Head to the Crew tab to create characters or load a sample crew." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {game.characters.map((c) => {
              const alerts = characterAlerts(game, c);
              return (
                <div key={c.id} className={cn("flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40", c.dead && "opacity-50")}>
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => onOpenCharacter(c.id)} className="text-left font-medium hover:text-primary">{c.name}</button>
                    <Pill tone={c.pressure >= 3 ? "danger" : c.pressure >= 1 ? "warn" : "good"} tip={pressureTip(c.pressure)}>{PRESSURE_STATES[c.pressure].name}</Pill>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2"><span className="w-12">HP</span><Meter value={c.hp} max={maxHp(c)} tone="hp" className="flex-1" /><span className="tabular w-8 text-right">{c.hp}/{maxHp(c)}</span></div>
                    <div className="flex items-center gap-2"><span className="w-12">Energy</span><Meter value={c.energy} max={maxEnergy(c)} tone="energy" className="flex-1" /><span className="tabular w-8 text-right">{c.energy}/{maxEnergy(c)}</span></div>
                    <div className="flex items-center gap-2"><span className="w-12">Stress</span><Meter value={c.stress} max={10} tone="stress" className="flex-1" /><span className="tabular w-8 text-right">{c.stress}</span></div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground"><Tip content={stressBand(c.stress).effect}><span className="cursor-help underline decoration-dotted underline-offset-2">{stressBand(c.stress).name}</span></Tip>{c.afflictions.length > 0 && ` · ${c.afflictions.length} affliction${c.afflictions.length > 1 ? "s" : ""}`}</p>
                  {alerts.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{alerts.map((a) => <Pill key={a.text} tone={a.tone} tip={a.tip}>{a.text}</Pill>)}</div>}
                  <div className="mt-3 flex flex-1 flex-wrap items-end gap-1 border-t pt-3">
                    <div className="flex-1"><ConditionChips c={c} size="xs" /></div>
                    {!c.dead && perms.canEditCharacter(c.id) && <ApplyConditionDialog targets={[c.id]} trigger={<Button size="xs" variant="ghost" aria-label={`Apply condition to ${c.name}`}><PlusIcon /> Condition</Button>} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent>
            <SectionTitle>Active projects</SectionTitle>
            {active.length === 0 ? <p className="text-sm text-muted-foreground">Nothing under construction. Start projects from the Ship tab.</p> : <div className="grid gap-2">{active.map((x) => <ProjectRow key={x.id} p={x} />)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SectionTitle action={<ApplyConditionDialog />}>Conditions in play</SectionTitle>
            <ConditionsBoard />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConditionsBoard() {
  const characters = useGame((s) => s.game.characters);
  const afflicted = characters.filter((c) => !c.dead && c.conditions.length > 0);
  if (afflicted.length === 0) return <p className="text-sm text-muted-foreground">Nobody is under a condition right now. Use the Condition button in the header to apply one to several survivors at once.</p>;
  return (
    <div className="grid gap-3">
      {afflicted.map((c) => (
        <div key={c.id} className="grid gap-1.5">
          <p className="text-xs font-medium">{c.name}</p>
          <ConditionChips c={c} size="xs" />
        </div>
      ))}
    </div>
  );
}
