import { AFFLICTIONS, CONDITIONS } from "@/data/compendium";
import { FESTER_DAYS, SURGERY_WINDOW } from "./injuries";
import { ATTRIBUTE_NAMES, PRESSURE_STATES, SKILLS, STRESS_BANDS } from "./rules";

export type GlossaryEntry = { title: string; kind: string; text: string; ends?: string };

const MECHANICS: { terms: string[]; entry: GlossaryEntry }[] = [
  { terms: ["Routine Threshold"], entry: { title: "Routine Threshold", kind: "Tasks", text: "The skill level at which a task succeeds without a roll, given the right tools and no threat." } },
  { terms: ["Routine"], entry: { title: "Routine", kind: "Tasks", text: "At or above the Routine Threshold, with tools and no threat, the task succeeds without a roll. Overtaxed or Panicked characters must roll anyway." } },
  { terms: ["Skilled"], entry: { title: "Skilled task", kind: "Tasks", text: "Below the Routine Threshold: roll Attribute + Skill + Pressure dice. Any 6 succeeds." } },
  { terms: ["Crisis"], entry: { title: "Crisis task", kind: "Tasks", text: "Always rolled, even by experts. The GM says what failure will cause before the roll." } },
  { terms: ["Strong Success", "Strong Successes"], entry: { title: "Strong Success", kind: "Dice", text: "Two or more 6s. It only matters when the task lists a Strong Result." } },
  { terms: ["Push", "Pushing", "Pushes", "Pushed"], entry: { title: "Push", kind: "Dice", text: "Spend 1 Energy and gain 1 Pressure to reroll every failed die on one roll, or to take one extra task this segment. At 0 Energy it costs an Affliction instead." } },
  { terms: ["Pressure Dice"], entry: { title: "Pressure Dice", kind: "Dice", text: "Extra dice from your Pressure state, added to skill rolls (not flat rolls): Shaken +1, Pressured +2, Overtaxed +3, Panicked +4." } },
  { terms: ["Willpower"], entry: { title: "Willpower", kind: "Resource", text: "Spend 1 to prevent 1 Stress, contest a Mind Break, resist a Behavioral condition, reroll a death check, or stay conscious until the end of the round." } },
  { terms: ["Mind Break", "Mind Breaks"], entry: { title: "Mind Break", kind: "Stress", text: "A temporary loss of control, rolled on a d6 table. It lasts until the character falls unconscious, the danger ends, or someone stabilizes them." } },
  { terms: ["Affliction", "Afflictions"], entry: { title: "Affliction", kind: "Stress", text: "A lasting mental condition from Mind Breaks and high Stress. Rest and First Aid don't remove it; it takes an Affliction Treatment project or medication." } },
  { terms: ["Exhausted"], entry: { title: "Exhausted", kind: "Energy", text: "At 0 Energy. You can't begin an Energy-costing task unless you Push or an ability allows it." } },
  { terms: ["Armor Piercing", "Armor-Piercing"], entry: { title: "Armor Piercing", kind: "Damage", text: "Armor Piercing X ignores the first X points of protection, Cover first, then Armor." } },
  { terms: ["Partial Cover"], entry: { title: "Partial Cover", kind: "Damage", text: "1 Cover Armor against Ballistic hits. Cover applies before worn Armor and doesn't wear down." } },
  { terms: ["Strong Cover"], entry: { title: "Strong Cover", kind: "Damage", text: "2 Cover Armor against Ballistic hits. Cover applies before worn Armor and doesn't wear down." } },
  { terms: ["Full Cover"], entry: { title: "Full Cover", kind: "Damage", text: "You can't be targeted from that direction." } },
  { terms: ["Slow Action", "Slow Actions"], entry: { title: "Slow Action", kind: "Combat", text: "Attack, reload, sprint, overwatch, stop Bleeding, First Aid, repair, drag a body. One per turn, in place of a Fast Action." } },
  { terms: ["Fast Action", "Fast Actions"], entry: { title: "Fast Action", kind: "Combat", text: "Move 1 zone, stand or drop prone, draw an item, aim, take cover, disengage. A turn is one Slow and one Fast Action, or two Fast Actions." } },
  { terms: ["Reaction", "Reactions"], entry: { title: "Reaction", kind: "Combat", text: "One per round, such as Block or Dodge. An unused Reaction is lost at the start of your next turn." } },
  { terms: ["Expedition Turn", "Expedition Turns"], entry: { title: "Expedition Turn", kind: "Time", text: "About 20–40 minutes of careful activity. Eight make one day segment." } },
  { terms: ["Minor Injury", "Minor Injuries", "Minor injury", "Minor injuries"], entry: { title: "Minor injury", kind: "Injury", text: "−1d6 to the rolls it lists. First Aid treats it, and it can heal naturally on a Rest." } },
  { terms: ["Major Injury", "Major Injuries", "Major injury", "Major injuries"], entry: { title: "Major injury", kind: "Injury", text: `−2d6 to the rolls it lists, a condition until Surgery, Bleeding, and Pain (−1 Maximum Energy). Surgery turns it into a Treated Minor injury. Left ${FESTER_DAYS} days without Surgery, it Festers into a Deadly one.` } },
  { terms: ["Deadly Injury", "Deadly Injuries", "Deadly injury", "Deadly injuries"], entry: { title: "Deadly injury", kind: "Injury", text: `Surgery within ${SURGERY_WINDOW} segments or the character dies, or a permanent loss. Pain costs 1 Maximum Energy until Surgery. First Aid on it buys one more segment.` } },
  { terms: ["Pain"], entry: { title: "Pain", kind: "Injury", text: "Every Major or Deadly injury that hasn't had Surgery costs 1 Maximum Energy. The point comes back the moment that Surgery succeeds. First Aid doesn't ease it." } },
  { terms: ["Festering", "Festers", "Festered", "Fester"], entry: { title: "Festering", kind: "Injury", text: `A Major injury left ${FESTER_DAYS} days without Surgery, counting the day it happened, becomes a Deadly injury at that End of Day. Its ${SURGERY_WINDOW}-segment Surgery window opens from the next Morning.` } },
];

function build() {
  const byTerm = new Map<string, GlossaryEntry>();
  const add = (term: string, entry: GlossaryEntry) => {
    if (!byTerm.has(term)) byTerm.set(term, entry);
  };
  for (const p of PRESSURE_STATES) add(p.name, { title: p.name, kind: "Pressure state", text: `${p.dice ? `+${p.dice}d6 Pressure Dice.` : "No Pressure Dice."} On a failed roll: ${p.failure}` });
  for (const b of STRESS_BANDS) {
    if (b.name === "Stable" || b.name === "Breaking") continue;
    add(b.name, { title: b.name, kind: `Stress ${b.min === b.max ? b.min : `${b.min}–${b.max}`}`, text: b.effect });
  }
  for (const c of CONDITIONS) add(c.name, { title: c.name, kind: "Condition", text: c.effect, ends: c.removal });
  // Afflictions named after a keyword need their own entry, or the keyword alone gets highlighted inside the name.
  for (const a of AFFLICTIONS) if (/\bPain\b/.test(a.name)) add(a.name, { title: a.name, kind: "Affliction", text: a.effect });
  for (const s of SKILLS) add(s.name, { title: s.name, kind: `Skill · ${ATTRIBUTE_NAMES[s.attr]}`, text: `Rolled with ${ATTRIBUTE_NAMES[s.attr]} + ${s.name} + Pressure Dice.` });
  for (const m of MECHANICS) for (const t of m.terms) add(t, m.entry);
  return byTerm;
}

export const GLOSSARY = build();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches any glossary term as a whole word, longest first, case-sensitive (game terms are capitalized). */
export const GLOSSARY_PATTERN = new RegExp(
  `(?<![\\w-])(${[...GLOSSARY.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\w-])`,
  "g",
);
