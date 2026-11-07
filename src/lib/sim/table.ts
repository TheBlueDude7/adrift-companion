import "server-only";

import type { GameState } from "../types";
import { addUsage, configuredProviders, isProvider, PROVIDERS, PROVIDER_KEYS, reason, type Provider, type Usage } from "./models";
import { runSegment, type SegmentOptions, type SimTurn } from "./run";
import { type Style } from "./styles";

/** A seat as a caller describes it: anything may be missing, and nothing is trusted. */
export type Seat = { characterId?: unknown; provider?: unknown; style?: unknown };

/** A seat once it's been checked: this survivor, played by this model, leaning this way. */
export type Player = { characterId: string; name: string; provider: Provider; style: string };

export type SimReport = { turns: SimTurn[]; failed: string[]; usage: Usage };

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

/** The whole table's segment. One survivor at a time, so a later one can Assist what an earlier one planned. */
export async function runCrew(base: string, code: string, table: Player[], situation: string, opts: SegmentOptions = {}): Promise<SimReport> {
  return withCampaignLock(code, async () => {
    const report: SimReport = { turns: [], failed: [], usage: { input: 0, cached: 0, output: 0 } };
    for (const seat of table) {
      try {
        const turn = await runSegment(base, code, seat.characterId, seat.name, situation, { provider: seat.provider, style: seat.style }, opts);
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
