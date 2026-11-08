import type { GameState, Threat } from "../types";

/**
 * What a player is allowed to receive.
 *
 * Hiding a threat's numbers in the interface would be theatre: the whole `GameState` is broadcast,
 * so anything a player's browser holds, a player can read — and a simulated player reads the
 * snapshot directly, so it would know what the thing is immune to before swinging at it. The
 * numbers are therefore removed here, at the one point where state leaves the server for a player,
 * and nothing downstream has to be trusted to keep the secret.
 *
 * This costs a player nothing, because the server referees the fight: they send who they shot at
 * and from where, and the arithmetic happens where the numbers still are.
 *
 * The fields are copied one by one rather than deleted, so a field added to `Threat` later stays
 * hidden until someone decides it should be public. Forgetting leaks nothing.
 */
export function playerView(game: GameState): GameState {
  const threats: Threat[] = game.threats.map((t) => ({ id: t.id, name: t.name, band: t.band, conditions: t.conditions, known: t.known }));
  return { ...game, threats, log: game.log.filter((e) => !e.gm) };
}
