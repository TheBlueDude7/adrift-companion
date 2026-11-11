import "server-only";

import { BIO_DEFS } from "@/data/biology-defs";
import type { BioDef } from "@/data/biology";
import { installBiology } from "./bio-catalogue";
import type { GameState } from "./types";

// The server knows all of them. Installed at import so any module graph that reaches the game rules
// has the catalogue before the first character sheet is added up.
installBiology(BIO_DEFS);

/** Every augmentation there is. Server-side only, by the whole point of this file. */
export const allBiology = (): BioDef[] => BIO_DEFS;

/**
 * What a client is entitled to be told, which is the one place that decision is made.
 *
 * A GM gets the catalogue. A player gets what their lab has grown, plus anything a survivor is
 * actually carrying — because a GM may force a graft of something the crew never cultivated, and a
 * sheet that can't name what it carries would quietly stop counting its Maximum HP.
 */
export function biologyFor(game: GameState, isGM: boolean): BioDef[] {
  if (isGM) return BIO_DEFS;
  const allowed = new Set([...(game.research.biology ?? []), ...game.characters.flatMap((c) => (c.biology ?? []).map((i) => i.key))]);
  return BIO_DEFS.filter((d) => allowed.has(d.key));
}
