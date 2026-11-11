"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BrainIcon, CpuIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CYBERNETICS,
  CYBER_LOAD,
  CYBER_SYSTEMS,
  DAMAGE_BOOST,
  DAMPENING_CAP,
  DAMPENING_STRESS_COST,
  FABRICATE_TASK,
  INTERFACE_MECH_ARMOR,
  LOAD_PER_DAMPENING,
  SURGERY_TASK,
  SYSTEM_ATTR_BONUS,
  TIER_LABEL,
  dampeningForLoad,
  type CyberTier,
} from "@/data/cybernetics";
import {
  CHASSIS,
  MECH_COMPLICATIONS,
  MECH_CONDITIONS,
  MECH_MODULES,
  MECH_ROOM_MODULES,
  MECH_SUPPORT_MODULES,
  MECH_TIERS,
  MODULE_BY_KEY,
  MODULE_CATEGORIES,
  MODULE_CRAFT_TASK,
} from "@/data/mechs";
import type { MechChassis } from "@/lib/types";
import { Pill, RuleTable } from "./common";
import { GlossaryText } from "./glossary";

const TIERS: CyberTier[] = [1, 2, 3];

/**
 * The two engineered paths, explained from the data that runs them.
 *
 * Written as panels rather than as a markdown chapter on purpose: every number here is read from the
 * same tables the app does the arithmetic with, so a rules page can't quietly go out of date behind
 * a balance change. The prose is the part a document would have given us, and the prose is the part
 * that actually needs saying — what each path is *for*.
 */

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const Lines = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1 pl-5 text-sm">{items.map((t, i) => <li key={i}><GlossaryText text={t} /></li>)}</ul>
);

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">{icon} {title}</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-2.5 [&>*]:min-w-0">{children}</CardContent>
    </Card>
  );
}

const named = (keys: string[]) => keys.flatMap((k) => (MODULE_BY_KEY[k] ? [MODULE_BY_KEY[k]] : []));

export function MechRules() {
  return (
    <Tabs defaultValue="frames">
      <TabsList>
        <TabsTrigger value="frames" className="px-3">How frames work</TabsTrigger>
        <TabsTrigger value="modules" className="px-3">Every module</TabsTrigger>
      </TabsList>
      <TabsContent value="frames" className="pt-3"><FrameRules /></TabsContent>
      <TabsContent value="modules" className="pt-3"><ModuleCatalogue /></TabsContent>
    </Tabs>
  );
}

/**
 * Every module there is, by category.
 *
 * The pages above pick out the handful that each make a point, which makes it look as though the rest
 * were thrown away. They weren't: this is the whole list, and it's read straight off `MECH_MODULES`,
 * so a module can't exist in the app and be missing from the rules.
 */
function ModuleCatalogue() {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const [tier, setTier] = useState<CyberTier | null>(null);

  const shown = MECH_MODULES.filter(
    (m) => (!n || `${m.name} ${m.category} ${m.effect} ${m.weapon ?? ""}`.toLowerCase().includes(n)) && (!tier || m.tier === tier),
  );

  return (
    <div className="grid gap-4">
      <Search q={q} setQ={setQ} placeholder="Search every mech module…" />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="xs" variant={tier === null ? "default" : "outline"} onClick={() => setTier(null)}>All tiers</Button>
        {TIERS.map((t) => (
          <Button key={t} size="xs" variant={tier === t ? "default" : "outline"} onClick={() => setTier(t)}>{TIER_LABEL[t]}</Button>
        ))}
        <span className="ml-1 text-xs text-muted-foreground">{shown.length} of {MECH_MODULES.length}</span>
      </div>

      {MODULE_CATEGORIES.map((cat) => {
        const list = shown.filter((m) => m.category === cat);
        if (!list.length) return null;
        return (
          <Panel key={cat} title={cat} icon={<CpuIcon className="size-4 text-muted-foreground" />}>
            <RuleTable
              head={["Module", "Tier", "Slots", "Effect"]}
              rows={list.map((m) => [
                <span key="n">
                  {m.name}
                  {m.weapon && <span className="text-muted-foreground"> · {m.weapon}</span>}
                </span>,
                TIER_LABEL[m.tier],
                m.slots === 0 ? "—" : m.slots,
                m.effect,
              ])}
            />
          </Panel>
        );
      })}

      {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">No module matches that.</p>}
    </div>
  );
}

function FrameRules() {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const matches = (s: string) => !n || s.toLowerCase().includes(n);

  const room = named(MECH_ROOM_MODULES).filter((m) => matches(`${m.name} ${m.effect}`));
  const support = named(MECH_SUPPORT_MODULES).filter((m) => matches(`${m.name} ${m.effect}`));
  const chassis = (Object.keys(CHASSIS) as MechChassis[]).filter((k) => matches(`${CHASSIS[k].name} ${CHASSIS[k].ability} ${CHASSIS[k].abilityText.join(" ")}`));

  return (
    <div className="grid gap-4">
      <Search q={q} setQ={setQ} placeholder="Search the mech rules…" />

      <Panel title="What a frame is for" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
        <Note>
          Surgery changes the person and a graft changes the body. A mech changes the <em>room</em>. Three things no implant and no strain can do:
        </Note>
        <Lines
          items={[
            "Decide where the ways in and out are. A frame seals a border, collapses one, or tears a shut one open without a Task.",
            "Build cover. Cover belongs to the room rather than to a sheet, so a barricade shelters anyone standing in it, including whoever arrives later.",
            "Leave something standing in a zone. A hazard a frame plants keeps working on every creature's own turn, including the ones that walk in after it left.",
          ]}
        />
      </Panel>

      {chassis.length > 0 && (
        <Panel title="Chassis" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <RuleTable
            head={["Frame", "HP", "Cargo", "Hardpoints", "Noise", "Built-in"]}
            rows={chassis.map((k) => {
              const c = CHASSIS[k];
              return [c.name, c.hp, c.inventory, c.hardpoints, c.noise, <span key="a"><span className="font-medium">{c.ability}</span> — {c.abilityText.join(" ")}</span>];
            })}
          />
        </Panel>
      )}

      {!n && (
        <Panel title="Tiers, slots, and berths" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <RuleTable
            head={["Tier", "Module slots", "Frame", "Bonus HP", "Armor", "Resistance picks", "Power cells"]}
            rows={TIERS.map((t) => {
              const m = MECH_TIERS[t];
              return [TIER_LABEL[t], m.slots, m.frame, `+${m.hpBonus}`, m.armor, m.resistPicks, m.cells];
            })}
          />
          <Lines
            items={[
              "Maximum Mech HP is the chassis HP plus the Tier's bonus, plus anything a Defensive module adds. A pilot's Interface system adds to it as well.",
              "Modules cost slots; weapons also need a hardpoint, and the chassis decides how many of those there are.",
              "Every ship supports one assembled mech. Each Cargo Bay Grade supports one more. A frame over capacity rides outside and may not survive the trip.",
              `Building a module: ${MODULE_CRAFT_TASK[1]} for Tier I, up through ${MODULE_CRAFT_TASK[3]} for Tier III.`,
            ]}
          />
        </Panel>
      )}

      {room.length > 0 && (
        <Panel title="Owning the room" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <Note>
            Everything here edits the site rather than the frame, and the Site tab is where it lands: borders have a state, rooms have a Cover level, and standing
            hazards are tracked, so the app charges the toll rather than the table remembering to.
          </Note>
          <RuleTable head={["Module", "Tier", "Slots", "What it does to the room"]} rows={room.map((m) => [m.name, TIER_LABEL[m.tier], m.slots, m.effect])} />
        </Panel>
      )}

      {support.length > 0 && (
        <Panel title="Carrying the crew" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <Note>
            A frame is a large machine with four crew&apos;s worth of lifting in it. These spend that on somebody other than the pilot.
          </Note>
          <RuleTable head={["Module", "Tier", "Slots", "What the crew gets"]} rows={support.map((m) => [m.name, TIER_LABEL[m.tier], m.slots, m.effect])} />
        </Panel>
      )}

      {!n && (
        <Panel title="Piloting, and what it costs" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <Lines
            items={[
              "A frame suppresses most cybernetics and most biology while you're inside it. A Cybernetic Integration Port keeps one named implant live; a Biological Accommodation Chamber keeps one passive strain working; an Alien Symbiosis Core keeps one working properly, at a price.",
              "Mech damage is the frame's, not the pilot's — until the frame is Breached, at which point the pilot is exposed to everything the mech was keeping out.",
              "A Damaged mech rolls at a penalty unless a Neural Interface is fitted.",
            ]}
          />
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Conditions a frame can take</p>
            <div className="flex flex-wrap gap-1.5">{MECH_CONDITIONS.map((c) => <Pill key={c}>{c}</Pill>)}</div>
          </div>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Complications when one goes badly wrong</p>
            <Lines items={MECH_COMPLICATIONS} />
          </div>
          <Note>
            All {MECH_MODULES.length} modules are under &ldquo;Every module&rdquo; above, in {MODULE_CATEGORIES.length} categories: {MODULE_CATEGORIES.join(", ")}.
            Fitting them to a frame is done on the Mechs tab.
          </Note>
        </Panel>
      )}
    </div>
  );
}

export function CyberRules() {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const matches = (s: string) => !n || s.toLowerCase().includes(n);

  const systems = CYBER_SYSTEMS.filter((s) => matches(`${s.name} ${s.focus} ${s.attr ?? ""} ${s.mech}`));
  // The ladder as the players meet it: every step of Load that is worth a point.
  const ladder = useMemo(
    () => Array.from({ length: DAMPENING_CAP }, (_, i) => (i + 1) * LOAD_PER_DAMPENING),
    [],
  );

  return (
    <div className="grid gap-4">
      <Search q={q} setQ={setQ} placeholder="Search the cybernetic rules…" />

      <Panel title="What wiring is for" icon={<BrainIcon className="size-4 text-muted-foreground" />}>
        <Note>
          Cybernetics don&apos;t make a good day better. They make a bad day shorter. Everything the path does is a narrowing of the range: the Attribute floor
          rises, the damage type stops mattering, the fear doesn&apos;t land, and the roll you were dreading is one you&apos;ve already made before.
        </Note>
        <Lines
          items={[
            "Known technology. Unlike alien biology, the crew start knowing the whole tree — Tier I needs no research at all. What stops them is materials, a Workshop, a Medical Bay, and a surgeon.",
            "Load is the price. Each system contributes its deepest Tier, and the total is what the body is carrying.",
            "Load is also what buys Dampening, so depth pays for itself in a way breadth doesn't.",
          ]}
        />
      </Panel>

      {!n && (
        <Panel title="Dampening" icon={<BrainIcon className="size-4 text-muted-foreground" />}>
          <Note>
            Dampening is a number of points a wired character gets at the start of every Scene, and spends over the course of it to stop Pressure and Stress from
            landing on them. How many depends on nothing but Cybernetic Load.
          </Note>
          <RuleTable head={["Cybernetic Load", "Dampening"]} rows={ladder.map((l) => [`${l}+`, dampeningForLoad(l)])} />
          <Note>
            One point for every {LOAD_PER_DAMPENING} Load, stopping at {DAMPENING_CAP}. Load {DAMPENING_CAP * LOAD_PER_DAMPENING} is a Tier III system in all six
            branches, so {DAMPENING_CAP} is as far as anyone gets.
          </Note>
          <p className="text-sm font-medium">What the points buy</p>
          <RuleTable
            head={["To stop", "Costs"]}
            rows={[
              ["1 level of Pressure", "1 point"],
              ["1 point of Stress", `${DAMPENING_STRESS_COST} points`],
            ]}
          />
          <Lines
            items={[
              "They are a pool, not a discount. Dampening 4 can stop four levels of Pressure, or two points of Stress, or two levels and one point — whatever the Scene throws, until the four are gone.",
              "They are spent as the Pressure or Stress arrives, automatically, and the log says what was absorbed and what's left. Nothing is held in reserve and nothing has to be declared.",
              "Pressure is dampened after Strained adds its extra level, so a Strained character pays a point for that level too.",
              "Losing Pressure or Stress costs nothing. Dampening only ever pays to stop it arriving.",
              "Stress that can't be paid for lands in full — there is no partial absorption, so a character with 1 point left takes the whole point of Stress.",
              "The pool refills when the Scene ends, and at no other time. A Rest in the middle of a Scene does not restore it.",
            ]}
          />
          <Note>
            Half of a character&apos;s Dampening, rounded down, also comes off their Surge Dice: the Surge the flesh feeds on is the same Pressure the wiring is
            filtering out.
          </Note>
        </Panel>
      )}

      {systems.length > 0 && (
        <Panel title="The six systems" icon={<BrainIcon className="size-4 text-muted-foreground" />}>
          <RuleTable
            head={["System", "Attribute", "What it covers", "Inside a mech"]}
            rows={systems.map((s) => [s.name, s.attr ?? "—", s.focus, s.mech])}
          />
          <Lines
            items={[
              `The deepest implant in a system raises its Attribute: ${TIERS.map((t) => `${TIER_LABEL[t]} +${SYSTEM_ATTR_BONUS[t]}`).join(", ")}.`,
              `Interface has no Attribute, because what it improves isn't the body. It lends Armor Points to a mech its owner is piloting instead: ${TIERS.map((t) => `${TIER_LABEL[t]} +${INTERFACE_MECH_ARMOR[t]}`).join(", ")}. They arrive with the pilot and leave with them.`,
              `A Damage system adds a share of your own hits of its type, rounded up and never less than 1: ${TIERS.map((t) => `${TIER_LABEL[t]} +${Math.round(DAMAGE_BOOST[t] * 100)}%`).join(", ")}. It also halves incoming damage of that type.`,
            ]}
          />
        </Panel>
      )}

      {!n && (
        <Panel title="Getting one fitted" icon={<BrainIcon className="size-4 text-muted-foreground" />}>
          <RuleTable
            head={["Tier", "Load", "Fabrication", "Surgery"]}
            rows={TIERS.map((t) => [TIER_LABEL[t], CYBER_LOAD[t], FABRICATE_TASK[t], SURGERY_TASK[t]])}
          />
          <Lines
            items={[
              "Three rooms, in order. The Cybernetics Lab makes a Cybernetic Core, which every implant recipe needs. A Fabricate Implant task at the Workshop turns one into an implant, which sits in the hold as an item anyone can carry, trade, or lose. A Surgery in the Medical Bay puts it in.",
              "Surgery is always a Crisis task, so experience never removes the roll. The implant leaves the hold only when the operation succeeds; a failure costs the segment and the patient's HP and leaves the implant intact.",
              "The implant's tier sets the room: Tier I anywhere a surgeon can work, Tier II an Operational Medical Bay, Tier III a Medical Bay built up to Advanced Care.",
              "An Enhancement adds its bonuses. A Replacement restores what an Injury took and gives no bonus, and it's cheaper to build.",
              "A damaged implant stops giving its bonus until it's repaired, which is Engineering rather than medicine.",
              `There are ${CYBERNETICS.length} implants, and every one of them is on the Cybernetics tab from the first day of the campaign.`,
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

function Search({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-8" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
  );
}
