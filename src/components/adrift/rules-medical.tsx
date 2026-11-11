"use client";

import type { ReactNode } from "react";
import { ActivityIcon, HeartPulseIcon, HourglassIcon, StethoscopeIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { INJURY_PENALTY } from "@/data/injuries";
import { TASK_BY_NAME } from "@/data/tasks";
import { MEDKITS } from "@/lib/actions";
import { FESTER_DAYS, SURGERY_WINDOW } from "@/lib/injuries";
import { PREP_DICE, SURGICAL_TOOLS, THEATRES } from "@/lib/surgery";
import { RuleTable } from "./common";
import { GlossaryText } from "./glossary";

/**
 * The medical rules, read from the same tables `surgery.ts`, `injuries.ts` and the task list resolve
 * with, so a change to a theatre or a tool shows up here without anyone editing prose.
 */

const SURGERY = TASK_BY_NAME["Surgery"];
const PREP = TASK_BY_NAME["Prep for Surgery"];
const THEATRE_NAMES = ["No Medical Bay, or Base Setup", "Field Setup, or a Mobile Surgical Cradle", "Operational", "Sterile Suite", "Advanced Care"];

const dice = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${Math.abs(n)}d6`);
const share = (k: number) => (k === 1 / 2 ? "½ Max HP" : k === 3 / 4 ? "¾ Max HP" : `${Math.round(k * 100)}% Max HP`);

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">{icon} {title}</CardTitle></CardHeader>
      <CardContent className="grid min-w-0 gap-2.5 [&>*]:min-w-0">{children}</CardContent>
    </Card>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

const Lines = ({ items }: { items: string[] }) => (
  <ul className="grid list-disc gap-1 pl-5 text-sm">{items.map((t, i) => <li key={i}><GlossaryText text={t} /></li>)}</ul>
);

const icon = (I: typeof HeartPulseIcon) => <I className="size-4 text-muted-foreground" />;

export function MedicalRules() {
  return (
    <div className="grid gap-4">
      <Panel title="Stabilise, then repair" icon={icon(HeartPulseIcon)}>
        <Note>
          First Aid keeps a survivor alive. Surgery repairs them. Nothing else turns a Major or Deadly injury into a Minor one, and every day without it costs
          something.
        </Note>
        <RuleTable
          head={["Severity", "Penalty", "Until Surgery", "Clock"]}
          rows={[
            ["Minor", `−${INJURY_PENALTY.Minor}d6 to the rolls it lists`, "—", "Heals on a Rest once Treated"],
            ["Major", `−${INJURY_PENALTY.Major}d6 to the rolls it lists`, "Its condition, Bleeding when it lands, Pain", `Festers into Deadly after ${FESTER_DAYS} days`],
            ["Deadly", `−${INJURY_PENALTY.Deadly}d6 to the rolls it lists`, "Bleeding when it lands, Pain", `Dies after ${SURGERY_WINDOW} segments, or a permanent loss`],
          ]}
        />
        <Lines items={["Every Untreated injury costs 1 HP at End of Day, whatever its severity.", "A Treated Minor injury heals on a Rest (natural recovery). A permanent loss never does."]} />
      </Panel>

      <Panel title="What waiting costs" icon={icon(HourglassIcon)}>
        <Lines
          items={[
            "Pain: every Major or Deadly injury that hasn't had Surgery costs 1 Maximum Energy. The point comes back the moment the Surgery succeeds. First Aid doesn't ease it.",
            `Festering: a Major injury left ${FESTER_DAYS} days without Surgery, counting the day it happened, festers at that End of Day. It becomes a Deadly injury, and its ${SURGERY_WINDOW}-segment Surgery window opens from the next Morning.`,
            `The Deadly clock: a Deadly injury that demands Surgery kills once its window passes — the segment it happened in and the ${SURGERY_WINDOW - 1} after it, rolling into the next day if it must.`,
          ]}
        />
      </Panel>

      <Panel title="First Aid: stabilise" icon={icon(ActivityIcon)}>
        <Note>A free action that spends one medkit and is always a Skilled roll. The patient&apos;s player has to agree. In combat it&apos;s a Slow Action.</Note>
        <Lines
          items={[
            "The first 6 treats an Untreated injury of any severity, so it stops costing HP at End of Day.",
            "Treating a Deadly injury buys one more segment on its Surgery deadline.",
            "Every other 6 heals 1 HP or clears a condition, such as Bleeding.",
            "It never makes a Major or Deadly injury Minor, and it doesn't stop Pain or Festering.",
          ]}
        />
        <RuleTable head={["Medkit", "Bonus", "Heals"]} rows={MEDKITS.map((k) => [k.name, dice(k.dice), `${k.heal} HP`])} />
      </Panel>

      <Panel title="Surgery: repair" icon={icon(StethoscopeIcon)}>
        <Note>
          Always a Crisis task, on one named Major or Deadly injury, for {SURGERY.energy} Energy. The patient spends that segment on the table and takes no Task of
          their own. Nobody operates on themselves.
        </Note>
        <Lines
          items={[
            "Requirements: Surgical Tools, in the surgeon's pack or, aboard, in ship storage. Nothing else.",
            "Each Surgery spends one use of the best set to hand, success or fail.",
          ]}
        />
        <RuleTable head={["Tools", "Bonus", "Energy"]} rows={SURGICAL_TOOLS.map((t) => [t.name, dice(t.dice), t.free ? 0 : SURGERY.energy])} />
        <Note>
          The theatre sets the penalty and how far the patient&apos;s HP drops when the operation begins. The drop only applies if they&apos;re above it, and never takes
          them below 1 HP. The Medical Bay only counts aboard; a working Mobile Surgical Cradle counts as a Field Setup wherever its mech is.
        </Note>
        <RuleTable
          head={["Where", "Roll", "HP on success", "HP on failure"]}
          rows={THEATRES.map((t, i) => [THEATRE_NAMES[i], dice(t.dice), t.keep ? share(t.keep.success) : "No drop", t.keep ? share(t.keep.failure) : "No drop"])}
        />
        <Lines
          items={[
            `Prep for Surgery (${PREP.mode === "routine" ? "Routine" : PREP.mode}, First Aid ${PREP.threshold}${PREP.facility ? `, ${PREP.facility.label}` : ""}): a success adds +${PREP_DICE}d6 to the patient's Surgery later that day.`,
            "Success: the injury becomes a Treated Minor injury. Its condition, its Pain and its deadline all end.",
            `Strong Result: ${SURGERY.strong}`,
            "Failure: the injury is exactly as it was. The Energy, the tool use and the HP drop are spent anyway, so a second attempt starts from lower HP.",
          ]}
        />
      </Panel>
    </div>
  );
}
