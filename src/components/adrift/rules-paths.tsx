"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BrainIcon, CpuIcon, SearchIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CYBERNETICS,
  CYBER_LOAD,
  CYBER_SYSTEMS,
  DAMAGE_BOOST,
  DAMPENING_CAP,
  DAMPENING_STRESS_COST,
  FABRICATE_TASK,
  INTERFACE_MECH_HP,
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
          Surgery changes the person and a graft changes the body. A mech is the only path that changes the <em>room</em>, and that is what it should be bought
          for. Three things no implant and no strain can do:
        </Note>
        <Lines
          items={[
            "Decide where the ways in and out are. A frame seals a border, collapses one, or tears a shut one open without a Task, which means it decides what the fight's shape is before the shooting starts.",
            "Build cover for everyone. Cover belongs to the room, not to a sheet, so a barricade shelters the crew who arrive next turn as much as the pilot who raised it.",
            "Hold a whole zone hostage. A hazard a frame leaves behind keeps hurting things on their turns, which is the only damage in the game that costs nobody an Action.",
          ]}
        />
        <Note>
          That last one is why frames scale into the endgame. Everyone is capped at one attack a turn, so a crew clearing a room full of xenos is not out-damaging
          them — it is making the room do some of the killing, and standing somewhere the room can&apos;t reach back.
        </Note>
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
            Everything here edits the site rather than the frame. The GM&apos;s Site tab is where it lands: borders have a state, rooms have a Cover level, and
            standing hazards are real, so the app charges the toll instead of the table remembering to.
          </Note>
          <RuleTable head={["Module", "Tier", "Slots", "What it does to the room"]} rows={room.map((m) => [m.name, TIER_LABEL[m.tier], m.slots, m.effect])} />
        </Panel>
      )}

      {support.length > 0 && (
        <Panel title="Carrying the crew" icon={<CpuIcon className="size-4 text-muted-foreground" />}>
          <Note>
            A frame is a large machine with four crew&apos;s worth of lifting in it, and that should be worth something to the four crew. These spend the mech&apos;s
            size on somebody else: the Downed, the overloaded, and the one who needed a second shot this Round.
          </Note>
          <RuleTable head={["Module", "Tier", "Slots", "What the crew gets"]} rows={support.map((m) => [m.name, TIER_LABEL[m.tier], m.slots, m.effect])} />
          <Note>
            An Overwatch Relay is the exception worth naming twice. The action economy gives everyone one Slow and one Fast a turn, which means one attack and no
            more; Overwatch is the only way to shoot outside your own turn, and this is the only thing in the game that hands it out for free.
          </Note>
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
            The full module list, by category, is on the Mech tab: {MODULE_CATEGORIES.join(", ")}. There are {MECH_MODULES.length} of them.
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
            "Load is also the reward: it buys Dampening, which is the one resource in the game that removes variance rather than adding power.",
          ]}
        />
      </Panel>

      {!n && (
        <Panel title="Dampening" icon={<BrainIcon className="size-4 text-muted-foreground" />}>
          <Note>
            One point per {LOAD_PER_DAMPENING} Cybernetic Load, up to {DAMPENING_CAP} — which is a Tier III system in all six branches, and the deepest anyone
            legally goes.
          </Note>
          <RuleTable head={["Cybernetic Load", "Dampening"]} rows={ladder.map((l) => [`${l}+`, dampeningForLoad(l)])} />
          <Lines
            items={[
              "It is a pool for the whole Scene, not a discount used once.",
              "A point holds off one level of Pressure. It is spent after Strained has added its extra level, so a Strained character pays the wiring an extra point rather than slipping past it.",
              `${DAMPENING_STRESS_COST} points hold off one point of Stress, because quieting the mind is harder than quieting the body — and that price is why only a deep build filters Stress at all.`,
              "The app spends it automatically as the fear arrives and says so in the log. Clearing Pressure or Stress costs nothing.",
              "It refreshes when the Scene ends, and nothing refills it sooner.",
            ]}
          />
          <Note>
            Dampening also halves itself into Surge Dice: a biological survivor with wiring gets fewer of them, because the Surge the flesh feeds on is the same
            Pressure the wiring is filtering out. Depth in both paths is a real trade, not a stack.
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
              `Interface has no Attribute, because what it improves isn't the body. It adds to a piloted mech's Maximum HP instead: ${TIERS.map((t) => `${TIER_LABEL[t]} +${INTERFACE_MECH_HP[t]}`).join(", ")}.`,
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
              "Two steps: build the implant as an item, then install it with a Surgery Task. Surgery is always a Crisis task, so experience never removes the roll.",
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
