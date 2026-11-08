import "server-only";

import { allAttributes, hullTier, maxEnergy, maxHp, maxWillpower, power, skillLevel } from "../derive";
import { ATTRIBUTES, PRESSURE_STATES, SKILLS } from "../rules";
import type { Character, GameState } from "../types";
import { playerBrief } from "./brief";
import { creationMenu, crewContext, type SimBuildPick } from "./create";
import { asLines, asText, structured, type Provider, type SystemBlock, type Tool, type Usage } from "./models";
import { away, menuText, type SimMenu } from "./options";
import { styleText } from "./styles";
import { charts, hold, site, upgrades } from "./world";

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
  /** Where they want to be taken next, on an expedition. The GM moves them, so this is a request. */
  move?: string;
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
      move: { type: "string", description: "On an expedition only: the one room you want to move into, by name, or empty to stay where you are. The GM moves you; you don't." },
      reason: { type: "string", description: "One line, out of character, on why this option." },
      unclear: { type: "string", description: "Only when a rule or the situation was genuinely ambiguous." },
    },
    required: ["choice", "speech", "approach", "reason"],
  },
};

const CREATION_INSTRUCTIONS = `You are making one survivor for a test run of Adrift, a survival tabletop RPG, and then you will play them. A human GM is running the game; the app enforces the rules and rolls the dice.

Hard rules, which nothing in your playstyle can override:

1. YOU MAKE ONE SURVIVOR. One person, with a name and a reason for being aboard. Never write another survivor's sheet, speak for the GM, or describe the ship or the voyage.

2. BUILD FROM THE LISTS. Pick one background, one of that background's specialties, one attribute spread, and one skill shape, naming each by its key. Then name which skill goes on each of the shape's levels, strongest first. You never choose a number: the spread and the shape already spend the creation budget exactly, so a build made this way is always legal.

3. THE CREW IS BUILT IN ORDER. You can see every survivor made before you. They are already fixed and you cannot change them. Build someone who makes that crew better — cover a job nobody can do, or double up deliberately on one that matters and say why. The survivors made after you will see your sheet and build around it, so a narrow expert is a real commitment and a generalist is a real hedge.

4. THEY ARE A PERSON. "pitch" is what they say when they come aboard, in character: no keys, numbers, levels, or any mention of being a simulation. A background is a life they lived, not a class they chose.

5. THIS IS A TEST RUN. If a background, specialty, skill, or trade-off read as ambiguous, mislabelled, or impossible to judge, put it in "unclear" in plain terms — name the thing and say what you couldn't work out about it. Leave it out when nothing was unclear, which is the ordinary case; a report invented to fill the field is worse than none.`;

const CREATE_TOOL: Tool = {
  name: "enlist",
  description: "Make one survivor to crew the ship.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Their name. A person's name, not a callsign or a job title." },
      background: { type: "string", description: "The key of the background you take, exactly as listed." },
      specialty: { type: "string", description: "The name of one specialty belonging to that background." },
      spread: { type: "string", description: "The key of the attribute spread you take." },
      shape: { type: "string", description: "The key of the skill shape you take." },
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Which skill goes on each of the shape's levels, strongest first. Exactly as many as the shape has levels, all different, named from the skill list.",
      },
      pitch: { type: "string", description: "What they say coming aboard, in character, under 400 characters. Who they were and why they're here." },
      reason: { type: "string", description: "One or two lines, out of character, on why this build and how it fits the crew made so far." },
      unclear: { type: "string", description: "Only when something about the backgrounds, skills, or trade-offs was genuinely ambiguous." },
    },
    required: ["name", "background", "specialty", "spread", "shape", "skills", "pitch", "reason"],
  },
};

/**
 * The huddle framing is appended after the persona rather than replacing it. A cache matches on a
 * prefix, so adding a block at the end keeps the instructions and world brief as a hit, while the
 * one hard rule that doesn't apply here — pick a numbered option — gets overridden in place.
 */
const HUDDLE = `RIGHT NOW YOU ARE NOT ACTING. YOU ARE TALKING.

This is the crew's huddle at the top of the segment. Nothing is committed and you are not choosing your task in this message, so rule 2 above does not apply yet. You will choose afterwards, knowing what everyone said here.

Say what you think the crew should get done today, what you mean to take on yourself, and what you want someone else to cover. Talk to them by name. Argue priorities: what's urgent, what's wasteful, what can wait a day, what the hold can't pay for yet. Disagree where your character would disagree. If someone has already claimed a job, don't duplicate it unless doubling up is the point — and say that it is.

"say" is what the crew hears, in character. "intent" is one plain line naming which option you're leaning toward and why; the others see that too, the way players talk across a table.`;

const SECOND_PASS = `This is the second pass. You have all spoken once. Answer what was said, settle who is taking what, and say plainly if you've changed your mind. Don't simply repeat your first remark.`;

const CONFER_TOOL: Tool = {
  name: "say",
  description: "Say what this survivor thinks the crew should do this segment.",
  schema: {
    type: "object",
    properties: {
      say: { type: "string", description: "What the crew hears, in character, under 400 characters." },
      intent: { type: "string", description: "One plain line: which option number you're leaning toward, and why." },
    },
    required: ["say", "intent"],
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

/**
 * Everything the huddle and the decision both read, in one place so the two can't drift apart. The
 * hold, the ladders, and the chart are here because a crew that can't see them can only plan a day
 * at a time: no saving toward a module, no arguing for the derelict two columns over.
 */
function world(g: GameState, c: Character, situation: string): string[] {
  // Off the ship, the ladders and the star chart are noise: nothing in a derelict can be spent on a
  // module, and the course they aren't flying is a day away. What replaces them is the room.
  if (away(g, c)) {
    return [
      `YOU ARE\n\n${sheet(c)}`,
      EXPEDITION,
      `The GM describes what you can see:\n\n${situation}`,
      `Where you are:\n\n${site(g, c.id)}`,
      `What you have to hand:\n\n${hold(g, c.id)}`,
      `What has happened recently:\n${recent(g) || "- (nothing logged yet)"}`,
    ];
  }
  return [
    `YOU ARE\n\n${sheet(c)}`,
    `The GM describes the situation:\n\n${situation}`,
    `Where you are:\n\n${aboard(g, c)}`,
    `What you have to hand:\n\n${hold(g, c.id)}`,
    `What the compartments could become:\n\n${upgrades(g)}`,
    `The chart:\n\n${charts(g)}`,
    `What has happened recently aboard:\n${recent(g) || "- (nothing logged yet)"}`,
  ];
}

/**
 * What changes off the ship. The map is the GM's: they can see the room and the crew can't, and the
 * app doesn't offer movement as a choice, so wanting to go somewhere has to be said rather than
 * taken. Everything else — one task, no narrating the outcome, ask about what you can't see —
 * already holds, and is not repeated here.
 */
const EXPEDITION = `YOU ARE NOT ABOARD THE SHIP. You are inside a wreck, and the GM is running it room by room.

They describe what you can see; you never describe the site. Don't invent a door, a corpse, a hatch, a sound, or what's in a container. If your plan needs something to be there, ask whether it is.

You do not move yourself. Say where you want to go in "move" — one room, by name, from the ways out of the room you're in — and the GM takes you there if it's possible. "move" is a request, not a fact: never write as though you've already arrived, and take a task you can do from the room you're standing in now.

Time is the pressure here. An Expedition Turn is twenty to forty minutes and eight of them use up the whole day segment, so standing in a corridor deciding costs the same as searching a room.`;

/**
 * One remark in the huddle. Nothing is submitted here: the point is that whoever acts first does it
 * having heard the others, which they couldn't when the only channel was the log of finished turns.
 */
export async function confer(
  g: GameState,
  c: Character,
  menu: SimMenu,
  situation: string,
  agent: Agent,
  said: string,
  round: number,
): Promise<{ say: string; intent: string; model: string; usage: Usage }> {
  const { value, model, usage } = await structured<{ say: string; intent: string }>(
    agent.provider,
    [...(await persona(agent)), { text: round > 1 ? `${HUDDLE}\n\n${SECOND_PASS}` : HUDDLE }],
    CONFER_TOOL,
    [
      ...world(g, c, situation),
      said ? `WHAT HAS BEEN SAID SO FAR\n\n${said}` : "Nobody has spoken yet. You are opening the huddle.",
      `It is Day ${g.day}. The options you'll be choosing from once the talking is done:\n\n${menuText(menu)}`,
    ].join("\n\n"),
  );
  return { say: asText(value.say, "(says nothing)"), intent: asText(value.intent, "(gave no preference)"), model, usage };
}

export async function decide(g: GameState, c: Character, menu: SimMenu, situation: string, agent: Agent, answers = "", briefing = ""): Promise<SimChoice & { model: string; usage: Usage }> {
  const { value, model, usage } = await structured<SimChoice>(
    agent.provider,
    await persona(agent),
    TOOL,
    [
      ...world(g, c, situation),
      answers ? `The GM has answered the crew's questions:\n\n${answers}` : "",
      briefing ? `WHAT THE CREW SAID IN THE HUDDLE\n\n${briefing}` : "",
      `It is Day ${g.day}. What ${c.name} can do this segment:\n\n${menuText(menu)}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  const n = Math.round(value.choice);
  return {
    ...value,
    model,
    usage,
    choice: menu.options.some((o) => o.n === n) ? n : (menu.options[0]?.n ?? 0),
    speech: asText(value.speech, "(says nothing)"),
    approach: asText(value.approach, "(gave no approach)"),
    reason: asText(value.reason, "(gave no reason)"),
    questions: asLines(value.questions),
    move: asText(value.move) || undefined,
    unclear: asText(value.unclear) || undefined,
  };
}

/**
 * Creation gets its own instructions rather than reusing the segment persona. That forfeits the
 * shared cached prefix, which is the right trade here: making a survivor happens once per campaign
 * and a handful of times ever, while a prompt that told them to pick a task and ask about doorways
 * would be read a hundred and sixty times with the wrong framing.
 */
async function recruiter(agent: Agent): Promise<SystemBlock[]> {
  return [
    { text: CREATION_INSTRUCTIONS },
    { text: `THE WORLD YOU LIVE IN\n\n${await playerBrief()}`, cache: true },
    { text: `HOW YOU PLAY\n\n${styleText(agent.style)}`, cache: true },
  ];
}

/**
 * Make one survivor, knowing everyone made before them. `crew` is the whole roster so far in the
 * order it was built, which is what lets a later model cover a job the earlier ones left open.
 */
export async function decideCreate(agent: Agent, crew: Character[], directive: string): Promise<SimBuildPick & { model: string; usage: Usage }> {
  const { value, model, usage } = await structured<SimBuildPick>(
    agent.provider,
    await recruiter(agent),
    CREATE_TOOL,
    [
      directive ? `The GM says what this crew is for:\n\n${directive}` : "",
      crewContext(crew),
      `WHAT YOU CAN BE MADE FROM\n\n${creationMenu()}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
  return {
    ...value,
    model,
    usage,
    name: asText(value.name, "Unnamed survivor"),
    pitch: asText(value.pitch, "(came aboard without a word)"),
    reason: asText(value.reason, "(gave no reason)"),
    unclear: asText(value.unclear) || undefined,
  };
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
  return { push: value.push === true, speech: asText(value.speech, "(says nothing)"), usage };
}
