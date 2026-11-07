import "server-only";

import type { GameState } from "../types";
import { createSimClient } from "./client";
import { addUsage, configuredProviders, isProvider, PROVIDERS, PROVIDER_KEYS, reason, type Provider, type Usage } from "./models";
import { legalOptions } from "./options";
import { confer } from "./player";
import { runSegment, type SegmentOptions, type SimTurn } from "./run";
import { type Style } from "./styles";

/** A seat as a caller describes it: anything may be missing, and nothing is trusted. */
export type Seat = { characterId?: unknown; provider?: unknown; style?: unknown };

/** A seat once it's been checked: this survivor, played by this model, leaning this way. */
export type Player = { characterId: string; name: string; provider: Provider; style: string };

/** One thing a survivor said in the huddle, before anyone committed to anything. */
export type Remark = { round: number; character: string; player: string; say: string; intent: string; usage: Usage };

export type SimReport = { briefing: Remark[]; turns: SimTurn[]; failed: string[]; usage: Usage };

/** Leanings handed out when the GM doesn't name one, so a default crew argues with itself. */
const DEFAULT_STYLES: Style[] = ["cautious", "bold", "specialist", "caretaker"];

export const noProvidersMessage = () => `No model keys are set. Configure any of: ${PROVIDER_KEYS.map((p) => PROVIDERS[p].keyEnv).join(", ")}.`;

/**
 * Work out who plays whom. Unseated survivors take the configured providers in turn, so four keys
 * put four models on one crew without the caller naming anything.
 */
export function seatCrew(game: GameState, seats?: Seat[]): { table: Player[] } | { error: string; status: number } {
  const ready = configuredProviders();
  if (!ready.length) return { error: noProvidersMessage(), status: 409 };

  const wanted: Seat[] = seats ?? game.characters.filter((c) => !c.dead).map((c) => ({ characterId: c.id }));
  const table: Player[] = [];
  for (const [i, seat] of wanted.entries()) {
    const c = game.characters.find((x) => x.id === seat.characterId);
    if (!c) return { error: `No survivor with id ${String(seat.characterId)}.`, status: 400 };
    if (c.dead) return { error: `${c.name} is dead.`, status: 409 };
    if (seat.provider !== undefined && !isProvider(seat.provider)) return { error: `Unknown model '${String(seat.provider)}'. Pick one of: ${PROVIDER_KEYS.join(", ")}.`, status: 400 };
    if (seat.style !== undefined && (typeof seat.style !== "string" || seat.style.length > 1000)) return { error: "A playstyle is a name from the list or a short description.", status: 400 };
    const provider = (seat.provider as Provider | undefined) ?? ready[i % ready.length];
    if (!ready.includes(provider)) return { error: `${PROVIDERS[provider].label} has no API key: set ${PROVIDERS[provider].keyEnv}.`, status: 409 };
    table.push({ characterId: c.id, name: c.name, provider, style: (seat.style as string | undefined) ?? DEFAULT_STYLES[i % DEFAULT_STYLES.length] });
  }
  if (!table.length) return { error: "No living survivors to play.", status: 409 };
  return { table };
}

/** Campaigns with a segment already running, so a second trigger can't plan two tasks at once. */
const g = globalThis as unknown as { __adriftSimRunning?: Set<string> };
const running = (g.__adriftSimRunning ??= new Set());
export const simRunning = (code: string) => running.has(code);

/**
 * One simulated run per campaign at a time. Everything the sim does reads the state, decides, and
 * writes back, so two runs at once would each plan against a campaign the other is already changing.
 */
export async function withCampaignLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
  if (running.has(code)) throw new Error("A simulated run is already going for this campaign. Wait for it to finish.");
  running.add(code);
  try {
    return await fn();
  } finally {
    running.delete(code);
  }
}

/** The huddle as the crew reads it back: what was said, and who was leaning which way. */
const spoken = (remarks: Remark[]) => remarks.map((r) => `${r.character}: “${r.say}”\n  (leaning: ${r.intent})`).join("\n\n");

/**
 * Two passes of table talk before anyone commits. The state can't change while it happens, so one
 * read serves every remark, and it's taken under the first seat's identity to avoid enrolling a
 * phantom player in the campaign's roster. A survivor who can't speak simply doesn't; the huddle
 * failing is not a reason for nobody to take a turn.
 */
async function huddle(base: string, code: string, table: Player[], situation: string): Promise<{ remarks: Remark[]; usage: Usage }> {
  const first = table[0];
  const reader = createSimClient(base, code, first.characterId, `${PROVIDERS[first.provider].label} · ${first.name}`);
  const game = await reader.snapshot();
  const remarks: Remark[] = [];
  let usage: Usage = { input: 0, cached: 0, output: 0 };
  for (const round of [1, 2]) {
    for (const seat of table) {
      const c = game.characters.find((x) => x.id === seat.characterId);
      if (!c) continue;
      const menu = legalOptions(game, c);
      if (!menu.options.length) continue;
      try {
        const said = await confer(game, c, menu, situation, { provider: seat.provider, style: seat.style }, spoken(remarks), round);
        remarks.push({ round, character: c.name, player: PROVIDERS[seat.provider].label, say: said.say, intent: said.intent, usage: said.usage });
        usage = addUsage(usage, said.usage);
      } catch (e) {
        console.error("[adrift] a survivor couldn't join the huddle", seat.name, e);
      }
    }
  }
  return { remarks, usage };
}

/** The whole table's segment: they talk it over, then act one at a time so a later one can Assist. */
export async function runCrew(base: string, code: string, table: Player[], situation: string, opts: SegmentOptions = {}): Promise<SimReport> {
  return withCampaignLock(code, async () => {
    const report: SimReport = { briefing: [], turns: [], failed: [], usage: { input: 0, cached: 0, output: 0 } };
    if (!table.length) return report;

    const talk = await huddle(base, code, table, situation);
    report.briefing = talk.remarks;
    report.usage = addUsage(report.usage, talk.usage);
    const briefing = spoken(talk.remarks);

    for (const seat of table) {
      try {
        const turn = await runSegment(base, code, seat.characterId, seat.name, situation, { provider: seat.provider, style: seat.style }, { ...opts, briefing });
        report.turns.push(turn);
        report.usage = addUsage(report.usage, turn.usage);
      } catch (e) {
        console.error("[adrift] simulated survivor failed", seat.name, e);
        report.failed.push(`${seat.name} (${PROVIDERS[seat.provider].label}): ${reason(e)}`);
      }
    }
    return report;
  });
}
