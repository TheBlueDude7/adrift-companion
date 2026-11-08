import { d } from "./dice";
import { applyCondition, endRound } from "./mechanics";
import type { Combatant, Fight, GameState, Line } from "./types";

/** Ten Initiative cards, numbered 1 to 10. The lowest acts first. */
export const DECK_SIZE = 10;

/** A turn buys two of these between them, and only one may be the Slow one. */
export type ActionKind = "slow" | "fast";

export type FightStart = {
  crew: string[];
  threats: string[];
  /** One card for every threat between them, which is how several minor enemies act together. */
  threatsShareCard?: boolean;
  /** Which side detected the other: that side ambushes, and the other is Surprised. */
  ambush?: "none" | "crew" | "threats";
};

/** Whose name the log uses for a combatant, whichever side they're on. */
export const combatantName = (g: GameState, x: Combatant) =>
  (x.kind === "crew" ? g.characters.find((c) => c.id === x.id)?.name : g.threats.find((t) => t.id === x.id)?.name) ?? "Something";

export const combatantOf = (g: GameState, id: string) => g.fight?.order.find((x) => x.id === id);

/** Everyone holding the card now acting. More than one of them means a group of minor enemies. */
export const upNow = (f: Fight) => f.order.filter((x) => x.card === f.card);

/** Actions spent this turn. Two is the whole turn, however they were spent. */
export const spent = (x: Combatant) => (x.slow ? 1 : 0) + x.fast;

/**
 * Deal one card off the deck, or two keeping the higher when the drawer ambushed.
 *
 * The card not kept goes back, since only one was drawn into: ten cards means ten participants
 * either way. Note that keeping the *higher* card puts an ambusher later in the Round, which is
 * what the rulebook says and reads oddly for a side that got the jump.
 */
function deal(deck: number[], ambusher: boolean): number {
  const take = () => deck.splice(d(deck.length) - 1, 1)[0]!;
  const first = take();
  if (!ambusher || !deck.length) return first;
  const second = take();
  deck.push(Math.min(first, second));
  return Math.max(first, second);
}

export function startFight(g: GameState, start: FightStart): (string | Line)[] {
  if (g.fight) return ["A fight is already under way. End that one first."];
  const crew = start.crew.map((id) => g.characters.find((c) => c.id === id)).filter((c) => !!c).filter((c) => !c.dead);
  const threats = start.threats.map((id) => g.threats.find((t) => t.id === id)).filter((t) => !!t);
  if (!crew.length && !threats.length) return ["Nobody is in this fight."];
  const share = !!start.threatsShareCard && threats.length > 1;
  const cards = crew.length + (share ? 1 : threats.length);
  if (cards > DECK_SIZE) return [`That's ${cards} cards and the deck holds ${DECK_SIZE}. Let the minor enemies share one.`];

  const ambush = start.ambush ?? "none";
  const deck = Array.from({ length: DECK_SIZE }, (_, i) => i + 1);
  const order: Combatant[] = crew.map((c) => ({ id: c.id, kind: "crew" as const, card: deal(deck, ambush === "crew"), slow: false, fast: 0 }));
  const shared = share ? deal(deck, ambush === "threats") : 0;
  for (const t of threats) order.push({ id: t.id, kind: "threat", card: share ? shared : deal(deck, ambush === "threats"), slow: false, fast: 0 });

  const f: Fight = { round: 1, card: Math.min(...order.map((x) => x.card)), order };
  g.fight = f;

  const out: (string | Line)[] = ["⚔ Initiative is drawn."];
  // Which cards the enemy drew is the GM's business until the players see where it acts.
  for (const x of order.filter((y) => y.kind === "crew")) out.push(`${combatantName(g, x)} draws ${x.card}.`);
  const enemy = order.filter((y) => y.kind === "threat");
  if (enemy.length) out.push({ text: share ? `${enemy.length} minor enemies share card ${shared}.` : enemy.map((x) => `${combatantName(g, x)} draws ${x.card}`).join(", ") + ".", gm: true });
  if (ambush === "crew") {
    out.push("The crew has the jump: each of them takes a free Slow Action before the first Round.");
    for (const t of threats) out.push({ text: `${t.name} is Surprised.`, gm: true });
  }
  if (ambush === "threats") {
    const said: string[] = [];
    for (const c of crew) applyCondition(g, c, "Surprised", "Brief", said);
    out.push("The crew is caught out, and whatever found them acts first.", ...said);
  }
  out.push(...upLine(g, f));
  return out;
}

const upLine = (g: GameState, f: Fight): (string | Line)[] => {
  const up = upNow(f);
  if (!up.length) return [];
  // A card nothing the players can see is holding is still their cue to wait, so the card is public.
  if (up.every((x) => x.kind === "threat")) return [`Card ${f.card} is up: not the crew's turn.`, { text: `${up.map((x) => combatantName(g, x)).join(", ")} acts.`, gm: true }];
  return [`Card ${f.card} is up: ${up.map((x) => combatantName(g, x)).join(", ")}.`];
};

/**
 * Why this character can't take an act costing these actions, or null if they can. An aimed shot
 * costs both kinds, so it's asked about as one thing rather than refused half way through.
 *
 * Null whenever no fight is running or they aren't in one: the rules count actions only once
 * precise order matters, so nothing outside a fight is refused for want of a Fast Action.
 */
export function actionBlocker(g: GameState, id: string, ...kinds: ActionKind[]): string | null {
  const f = g.fight;
  const x = f?.order.find((y) => y.id === id);
  if (!f || !x) return null;
  const name = combatantName(g, x);
  if (x.card !== f.card) return `It isn't ${name}'s turn: card ${f.card} is up and they hold ${x.card}.`;
  if (kinds.includes("slow") && x.slow) return `${name} has already taken a Slow Action this turn.`;
  const left = 2 - spent(x);
  if (kinds.length > left) return left === 0 ? `${name} has spent both actions this turn.` : `${name} has one action left this turn, and that needs two.`;
  if (kinds.includes("fast") && !x.acted && g.characters.find((c) => c.id === id)?.conditions.some((y) => y.name === "Surprised"))
    return `${name} is Surprised and has no Fast Action until the end of their turn.`;
  return null;
}

/** Spend actions, having already checked `actionBlocker`. Silent when there's no fight to spend in. */
export function spendAction(g: GameState, id: string, ...kinds: ActionKind[]): string | null {
  const x = combatantOf(g, id);
  if (!x || !kinds.length) return null;
  for (const kind of kinds) {
    if (kind === "slow") x.slow = true;
    else x.fast += 1;
  }
  const left = 2 - spent(x);
  const what = kinds.map((k) => (k === "slow" ? "a Slow" : "a Fast")).join(" and ");
  return `${combatantName(g, x)} spends ${what} Action: ${left === 0 ? "nothing left this turn" : `${left} left`}.`;
}

/** Hold a Fast Action back for a Block, a Dodge, or whatever else the fiction allows. */
export function reserveReaction(g: GameState, id: string): (string | Line)[] {
  const x = combatantOf(g, id);
  if (!x) return ["They aren't in this fight."];
  if (x.reaction) return [`${combatantName(g, x)} has already ${x.reaction === "used" ? "used a Reaction" : "reserved one"} this Round.`];
  const why = actionBlocker(g, id, "fast");
  if (why) return [why];
  x.fast += 1;
  x.reaction = "reserved";
  return [`${combatantName(g, x)} holds a Fast Action back as a Reaction.`];
}

export function takeReaction(g: GameState, id: string): (string | Line)[] {
  const x = combatantOf(g, id);
  if (!x) return ["They aren't in this fight."];
  if (x.reaction !== "reserved") return [`${combatantName(g, x)} has no Reaction reserved.`];
  x.reaction = "used";
  return [`${combatantName(g, x)} takes their Reaction.`];
}

/** Drop anyone who has left the campaign, so a stale id can't hold up the order. */
const prune = (g: GameState, f: Fight) =>
  (f.order = f.order.filter((x) => (x.kind === "crew" ? g.characters.some((c) => c.id === x.id) : g.threats.some((t) => t.id === x.id))));

/**
 * End the acting card's turn and move up the order. When the highest card has acted the Round ends:
 * lingering conditions resolve, Brief ones expire, and everyone's actions come back.
 */
export function nextTurn(g: GameState): (string | Line)[] {
  const f = g.fight;
  if (!f) return ["No fight is under way."];
  const out: (string | Line)[] = [];
  for (const x of upNow(f)) {
    x.acted = true;
    // Surprise ends after the surprised character's first turn, which is sooner than the Round.
    const c = x.kind === "crew" ? g.characters.find((y) => y.id === x.id) : undefined;
    const caught = c?.conditions.find((y) => y.name === "Surprised");
    if (c && caught) {
      c.conditions = c.conditions.filter((y) => y.id !== caught.id);
      out.push(`${c.name} has their wits back: Surprised ends.`);
    }
  }
  prune(g, f);
  if (!f.order.length) {
    delete g.fight;
    return [...out, "Nobody is left in the fight, so it's over."];
  }
  const above = f.order.map((x) => x.card).filter((n) => n > f.card);
  if (above.length) {
    f.card = Math.min(...above);
    return [...out, ...upLine(g, f)];
  }
  f.round += 1;
  f.card = Math.min(...f.order.map((x) => x.card));
  for (const x of f.order) {
    x.slow = false;
    x.fast = 0;
    delete x.reaction;
    delete x.acted;
  }
  return [...out, ...endRound(g), `— Round ${f.round} —`, ...upLine(g, f)];
}

export function endFight(g: GameState): (string | Line)[] {
  if (!g.fight) return ["No fight is under way."];
  const rounds = g.fight.round;
  delete g.fight;
  return [`The fighting stops after ${rounds} Round${rounds === 1 ? "" : "s"}. Initiative no longer applies.`];
}
