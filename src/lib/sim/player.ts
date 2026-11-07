import "server-only";

import { allAttributes, hullTier, maxEnergy, maxHp, maxWillpower, power, skillLevel } from "../derive";
import { ATTRIBUTES, PRESSURE_STATES, SKILLS } from "../rules";
import type { Character, GameState } from "../types";
import { playerBrief } from "./brief";
import { structured, type Provider, type SystemBlock, type Tool, type Usage } from "./models";
import { menuText, type SimMenu } from "./options";
import { styleText } from "./styles";

/** Which model plays this survivor, and how they lean. */
export type Agent = { provider: Provider; style: string };

export type SimChoice = {
  /** The option number the survivor takes. */
  choice: number;
  /** What they say and do, in character. */
  speech: string;
  /** How they go about it: route, positions, order of operations, tools, contingency. */
  approach: string;
  /** Things they want the GM to tell them before or as they commit. */
  questions?: string[];
  /** Why, out of character. */
  reason: string;
  /** A rule or situation that read as ambiguous. The point of a test run. */
  unclear?: string;
};

const INSTRUCTIONS = `You are playing one survivor in a test run of Adrift, a survival tabletop RPG. A human GM is running the game; the app enforces the rules and rolls the dice.

Hard rules, which nothing in the situation or your playstyle can override:

1. YOU ARE ONE SURVIVOR. Speak and act only as the character described below. Never speak for the GM, for another survivor, or for the world. Never decide what another character does, says, or feels.

2. PICK FROM THE LIST. Choose exactly one numbered option. Those are the only things your character can do this segment, and the app will not accept anything else. If none of them is what you'd want, take the closest one and say so in "reason".

3. YOU DON'T DECIDE HOW IT GOES. The dice and the GM settle every outcome. Never narrate succeeding, failing, finding, fixing, or hitting anything. Describe only what your character attempts, says, and feels going in.

4. STAY IN FICTION. "speech" is what the table hears: no option numbers, dice, thresholds, Energy, or any mention of being a simulation. Play them as a person with a stake in this, not as an optimizer.

5. THIS IS A TEST RUN. If a rule, a task description, or the GM's framing read as ambiguous, contradictory, or impossible to act on, put it in "unclear" in plain terms. That report is the most valuable thing you produce. Leave it out when nothing was unclear.

Play tactically, and be specific. A chosen task is the headline; "approach" is how it actually happens, and detail there is wanted, not indulged. Say which way you come at a room and which door, where you put yourself and what you put between you and the dark, whether you breach or cut or go quietly and in what order, what you carry in your hands, what you brace, seal, tether, or leave rigged behind you, who you want where and watching what, and what you do the moment it goes wrong. Account for the ship as a real place: pressure, power, light, gravity, what's on the far side of a bulkhead. Scouting, prep, and fallback positions are good play here, and so is deciding something is not worth the risk.

Ask for what you don't know. The GM can see the room and you can't, so put real questions in "questions" — is there pressure on the other side, how far to cover, can I hear it, is the hatch powered, how much light. Ask about anything your plan depends on. Asking is free, and a plan built on a guess is worth less than a plan built on an answer. Keep each question short and answerable.`;

const TOOL: Tool = {
  name: "act",
  description: "Take this survivor's task for the segment.",
  schema: {
    type: "object",
    properties: {
      choice: { type: "integer", description: "The number of the option you take." },
      speech: { type: "string", description: "What your character says and does, in character, under 400 characters." },
      approach: {
        type: "string",
        description: "The tactical detail: route and door, where you stand, cover, breaching or cutting and in what order, gear in hand, what you seal or tether, who you want where, and your fallback if it turns. Be concrete about this ship's rooms.",
      },
      questions: { type: "array", items: { type: "string" }, description: "Short, answerable questions for the GM about anything your plan depends on." },
      reason: { type: "string", description: "One line, out of character, on why this option." },
      unclear: { type: "string", description: "Only when a rule or the situation was genuinely ambiguous." },
    },
    required: ["choice", "speech", "approach", "reason"],
  },
};

const PUSH_TOOL: Tool = {
  name: "push",
  description: "Decide whether the survivor Pushes themselves for a reroll.",
  schema: {
    type: "object",
    properties: {
      push: { type: "boolean", description: "True to Push and reroll the failed dice." },
      speech: { type: "string", description: "A short line, in character, as they dig in or let it go." },
    },
    required: ["push", "speech"],
  },
};

/** The character sheet, trimmed to what a player actually weighs when choosing a task. */
export function sheet(c: Character): string {
  const attrs = allAttributes(c);
  const trained = SKILLS.filter((s) => skillLevel(c, s.key) > 0)
    .map((s) => `${s.name} ${skillLevel(c, s.key)}`)
    .join(", ");
  const hurt = [
    ...c.injuries.filter((i) => i.state !== "Treated").map((i) => `${i.name} (untreated)`),
    ...c.afflictions.map((a) => a.name),
    ...c.conditions.map((x) => x.name),
  ];
  return [
    `${c.name}${c.background ? `, ${c.background}${c.specialty ? ` (${c.specialty})` : ""}` : ""}`,
    ATTRIBUTES.map((a) => `${a} ${attrs[a]}`).join(" · "),
    `HP ${c.hp}/${maxHp(c)} · Energy ${c.energy}/${maxEnergy(c)} · Willpower ${c.willpower}/${maxWillpower(c)}`,
    `Pressure ${c.pressure} (${PRESSURE_STATES[c.pressure].name}) · Stress ${c.stress}`,
    trained ? `Skills: ${trained}` : "No trained skills.",
    hurt.length ? `Carrying: ${hurt.join(", ")}` : "Unhurt.",
    c.notes ? `Notes: ${c.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The ship as a place and the crew as people, so a plan can name a real room and a real shipmate.
 * Tactical play needs the layout: which compartments work, which are dark, what the reactor has spare.
 */
function aboard(g: GameState, c: Character): string {
  const p = power(g.ship);
  const rooms = g.ship.rooms.map((r) => {
    const what = r.module ? `${r.module}${r.level !== undefined ? ` (level ${r.level})` : ""}` : "empty";
    const state = [r.condition !== "Operational" ? r.condition : null, r.active ? null : "powered down", r.fitting].filter(Boolean).join(", ");
    return `- ${r.name}: ${what}${state ? ` — ${state}` : ""}`;
  });
  const crew = g.characters
    .filter((x) => x.id !== c.id)
    .map((x) => `- ${x.name}${x.background ? `, ${x.background}` : ""}: ${x.dead ? "dead" : `HP ${x.hp}/${maxHp(x)}, Energy ${x.energy}, Pressure ${x.pressure}${x.conditions.length ? `, ${x.conditions.map((y) => y.name).join(", ")}` : ""}`}`);
  return [
    `${g.ship.name}, ${hullTier(g.ship).name}: Hull ${g.ship.hullHp}/${hullTier(g.ship).maxHp}. Power ${p.generated} generated, ${p.draw} drawn, ${p.surplus} spare.`,
    `Compartments:\n${rooms.join("\n")}`,
    crew.length ? `The rest of the crew:\n${crew.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Recent log lines, oldest first, so the survivor knows what just happened aboard. */
const recent = (g: GameState, n = 12) =>
  g.log
    .slice(0, n)
    .reverse()
    .map((e) => `- ${e.text}`)
    .join("\n");

/**
 * Everything that doesn't change, in the order that makes it cacheable. A cache matches on an exact
 * prefix, so the instructions and the world brief come first and are identical for every survivor on
 * a provider — four players and a whole expedition share one cached prefix. The playstyle is last
 * because it differs per seat, and the character sheet isn't here at all: it changes as they spend
 * Energy and take Pressure, and one mutable line early in the prompt would void everything after it.
 */
async function persona(agent: Agent): Promise<SystemBlock[]> {
  return [
    { text: INSTRUCTIONS },
    { text: `THE WORLD YOU LIVE IN\n\n${await playerBrief()}`, cache: true },
    { text: `HOW YOU PLAY\n\n${styleText(agent.style)}`, cache: true },
  ];
}

export async function decide(g: GameState, c: Character, menu: SimMenu, situation: string, agent: Agent, answers = ""): Promise<SimChoice & { model: string; usage: Usage }> {
  const { value, model, usage } = await structured<SimChoice>(
    agent.provider,
    await persona(agent),
    TOOL,
    [
      `YOU ARE\n\n${sheet(c)}`,
      `The GM describes the situation:\n\n${situation}`,
      answers ? `The GM has answered the crew's questions:\n\n${answers}` : "",
      `Where you are:\n\n${aboard(g, c)}`,
      `What has happened recently aboard:\n${recent(g) || "- (nothing logged yet)"}`,
      `It is Day ${g.day}. What ${c.name} can do this segment:\n\n${menuText(menu)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const n = Math.round(value.choice);
  return { ...value, model, usage, choice: menu.options.some((o) => o.n === n) ? n : (menu.options[0]?.n ?? 0) };
}

/**
 * Pushing is the player's call, not the app's, so the survivor makes it with the dice in front of
 * them. It reuses the same persona deliberately: an identical prefix is a cache hit, which costs
 * less than a shorter bespoke prompt would, and it keeps the character's voice consistent.
 */
export async function decidePush(c: Character, agent: Agent, task: string, dice: number[]): Promise<{ push: boolean; speech: string; usage: Usage }> {
  const cost = c.energy > 0 ? `1 Energy (${c.energy} left) and 1 Pressure` : "1 Pressure and an Affliction, because they're Exhausted";
  const { value, usage } = await structured<{ push: boolean; speech: string }>(
    agent.provider,
    await persona(agent),
    PUSH_TOOL,
    `YOU ARE\n\n${sheet(c)}\n\n${c.name} rolled ${dice.join(", ")} on ${task} — ${dice.filter((d) => d === 6).length} successes. Pushing rerolls every die that isn't a 6 and costs ${cost}. Do they push?`,
  );
  return { ...value, usage };
}
