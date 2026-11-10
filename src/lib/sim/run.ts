import "server-only";

import { canPush, taskFor, whenLabel } from "../actions";
import { pushLog } from "../log";
import type { GameState, LogEntry, SegmentAction } from "../types";
import { createSimClient } from "./client";
import { addUsage, PROVIDERS, type Usage } from "./models";
import { combineCrafts, legalOptions, optionLabel, projectAsk } from "./options";
import { decide, decidePush, type Agent } from "./player";

export type SimTurn = {
  character: string;
  /** Who played them: the provider's name, the model that answered, and the leaning it was given. */
  player: { provider: string; model: string; style: string };
  /** Tokens this survivor's turn cost. A high `cached` share means the prefix is being reused. */
  usage: Usage;
  /** What the table hears. */
  speech: string;
  /** Route, positions, breaching order, gear, fallback. */
  approach: string;
  /** What they want the GM to tell them. Answer these and feed them back in to commit the turn. */
  questions: string[];
  /** The room they'd like to be taken to next, on an expedition. Yours to allow: the app won't move them. */
  move?: string;
  /** Why they chose it, out of character. */
  reason: string;
  task: string;
  /** Rules or framing the simulated player couldn't read cleanly. The real output of a test run. */
  unclear?: string;
  /** A project they've asked the GM to open. Free, and separate from their task. */
  asked?: { template: string; note: string };
  /** The log the server wrote while the task resolved: the rolls and their consequences. */
  outcome: string[];
  /** Tasks the sim couldn't offer, so the GM can see where it falls short of a real player. */
  skipped: string[];
};

/** Lines the server logged since `since`, in the order the app's Log tab shows them: newest batch first, each headed by its summary. */
const added = (log: LogEntry[], since: string | undefined) => {
  const fresh: string[] = [];
  for (const e of log) {
    if (e.id === since) break;
    fresh.push(e.text);
  }
  return fresh;
};

export type SegmentOptions = {
  /** The GM's replies to questions asked on an earlier, uncommitted pass. */
  answers?: string;
  /** False to hear the plan and its questions without submitting anything. */
  commit?: boolean;
  /** What the crew said in the huddle, so whoever acts first isn't choosing blind. */
  briefing?: string;
};

/**
 * One survivor's segment, start to finish: read the state, work out what's legal, let the model
 * choose and speak, then submit and resolve through the ordinary player endpoints. Every rule and
 * every die is the server's, so the worst a bad choice can do is waste the segment.
 */
export async function runSegment(base: string, code: string, characterId: string, name: string, situation: string, agent: Agent, opts: SegmentOptions = {}): Promise<SimTurn> {
  // `join` hands a returning player their old slot by name, so each simulated player needs a name of
  // their own: one provider playing two survivors must not inherit the other's character.
  const client = createSimClient(base, code, characterId, `${PROVIDERS[agent.provider].label} · ${name}`);
  // Reading the campaign is also what enrols this simulated player, so it has to come before claiming.
  const game = await client.snapshot();
  await client.claim(characterId);
  const c = game.characters.find((x) => x.id === characterId);
  if (!c) throw new Error("That character is no longer in the campaign.");

  const menu = legalOptions(game, c);
  if (!menu.options.length) throw new Error(`${c.name} has nothing they can legally do this segment.`);
  const choice = await decide(game, c, menu, situation, agent, opts.answers, opts.briefing);
  const option = menu.options.find((o) => o.n === choice.choice)!;
  // A Fabricate task makes more than one item, so the crafter may have named others off the same
  // bench. Anything the hold or the allowance won't cover is dropped here and reported, not sent.
  const bench = combineCrafts(game, c, menu, option, choice.with ?? []);

  const turn: SimTurn = {
    character: c.name,
    player: { provider: PROVIDERS[agent.provider].label, model: choice.model, style: agent.style },
    usage: choice.usage,
    speech: choice.speech,
    approach: choice.approach,
    questions: choice.questions ?? [],
    move: choice.move,
    reason: choice.reason,
    task: `${optionLabel(option)}${bench.added.length ? `, and on the same bench: ${bench.added.join(", ")}` : ""}`,
    unclear: choice.unclear,
    outcome: [],
    skipped: [...menu.skipped, ...bench.refused.map((r) => `Not made alongside: ${r}`)],
  };
  if (opts.commit === false) {
    turn.outcome.push("Not submitted: answer the questions and run it again to commit.");
    return turn;
  }

  // The plan goes on the task where a player's own words go, so the GM reads it in the app.
  const planned: SegmentAction = { ...bench.action, detail: `${choice.speech}\n\n${choice.approach}`.slice(0, 500) };
  const ask = projectAsk(game, c, choice.propose, choice.proposeWhy);
  await client.change((g) => {
    g.actions.push(planned);
    if (ask) g.projectRequests = [...(g.projectRequests ?? []), ask];
    pushLog(g, `${c.name} plans for ${whenLabel(planned)}: ${planned.task} (“${choice.speech}”).`, "info", PROVIDERS[agent.provider].label);
    if (ask) pushLog(g, `${c.name} asks the GM to open a project: ${ask.template}${ask.note ? ` — “${ask.note}”` : ""}.`, "info", PROVIDERS[agent.provider].label);
  });
  if (ask) turn.asked = { template: ask.template, note: ask.note };
  else if (choice.propose) turn.skipped.push(`Not asked for: no project template called ${choice.propose}`);

  if (taskFor(planned).gmResolves) {
    turn.outcome.push("Planned, and waiting on the GM to resolve it.");
    return turn;
  }

  const head = (await client.snapshot()).log[0]?.id;
  await client.resolveStep(planned.id, option.routine ? "routine" : "roll");
  let after: GameState = await client.snapshot();

  // A roll that leaves the task unsettled is one the survivor may Push. That call is theirs, not ours.
  const rolled = after.actions.find((x) => x.id === planned.id);
  if (rolled?.status === "planned" && rolled.roll && canPush(after, rolled)) {
    const pushed = await decidePush(c, agent, planned.task, rolled.roll.dice);
    turn.speech += `\n\n${pushed.speech}`;
    turn.usage = addUsage(turn.usage, pushed.usage);
    await client.resolveStep(planned.id, pushed.push ? "push" : "accept");
    after = await client.snapshot();
  }
  turn.outcome = added(after.log, head);
  return turn;
}
