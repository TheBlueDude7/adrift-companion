import type { Expedition, GameState, Threat } from "../types";

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
  // A threat placed in a room the crew hasn't reached yet is not news they have, so it isn't sent.
  // One with no zone at all is in the fight in front of them, which is how threats worked before sites.
  const unseen = new Set(game.expedition?.zones.filter((z) => !z.seen).map((z) => z.id) ?? []);
  const threats: Threat[] = game.threats
    .filter((t) => !t.zone || !unseen.has(t.zone))
    .map((t) => ({ id: t.id, name: t.name, band: t.band, conditions: t.conditions, known: t.known, ...(t.zone ? { zone: t.zone } : {}) }));
  const view: GameState = { ...game, threats, log: game.log.filter((e) => !e.gm) };
  // Left absent rather than set to undefined, so no expedition stays no key and the diff stays quiet.
  if (view.expedition) view.expedition = publicExpedition(view.expedition);
  // Initiative is public at the table, but a card held by something the crew hasn't met would
  // announce it. Those entries come out, which leaves a gap in the numbers and nothing more.
  // What a threat is waiting for is the GM's plan rather than the order of play, so that comes out
  // too: the crew can see something standing still, not what it's standing still for.
  if (view.fight) {
    const sent = new Set(threats.map((t) => t.id));
    view.fight = {
      ...view.fight,
      order: view.fight.order
        .filter((x) => x.kind === "crew" || sent.has(x.id))
        .map(({ overwatch, ...rest }) => (rest.kind === "threat" || !overwatch ? rest : { ...rest, overwatch })),
    };
  }
  return view;
}

/**
 * The crew knows where they are, who came, and what time it is. The site's contents are the GM's.
 *
 * Zones are the interesting part. A zone the crew has walked into or scouted goes over whole, minus
 * the GM's note and minus every find they haven't been handed yet. A zone they haven't goes over as
 * a door and nothing else: standing in a room tells you there's a way out of it, and that's all it
 * tells you. Even the name is withheld, which is why zone ids are generated rather than the readable
 * slugs the site was authored with.
 */
function publicExpedition(e: Expedition): Expedition {
  const seen = new Set(e.zones.filter((z) => z.seen).map((z) => z.id));
  const edge = new Set(e.borders.filter((b) => seen.has(b.a) !== seen.has(b.b)).map((b) => (seen.has(b.a) ? b.b : b.a)));
  const zones = e.zones
    .filter((z) => seen.has(z.id) || edge.has(z.id))
    .map((z) =>
      z.seen
        // Hazards are not a secret: a crew standing in a burning room can see that it is burning.
        ? { id: z.id, name: z.name, look: z.look, cover: z.cover, seen: true, secured: z.secured, searched: z.searched, finds: z.finds.filter((f) => f.found), ...(z.hazards?.length ? { hazards: z.hazards } : {}) }
        : { id: z.id, name: "Somewhere else", look: "", cover: "none" as const, seen: false, secured: false, searched: false, finds: [] },
    );
  return {
    site: e.site,
    started: e.started,
    turn: e.turn,
    crew: e.crew,
    zones,
    borders: e.borders.filter((b) => seen.has(b.a) || seen.has(b.b)),
    at: e.at,
  };
}
