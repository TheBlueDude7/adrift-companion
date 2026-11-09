import { BORDER_STATES, COVER_POINTS, type BorderState, type Cover } from "@/lib/rules";
import type { FindBy } from "@/lib/types";
import tanager from "../../content/sites/tanager.json";

/**
 * A site the GM has written up in advance, as `content/sites/<id>.json`.
 *
 * Zones name each other by readable slug here, because a file a person edits should read like one.
 * Those slugs never reach the campaign: `instantiate` swaps them for generated ids, so a zone the
 * crew hasn't seen can be mentioned to them — "there's a door there" — without its name leaking
 * through its identifier.
 *
 * Add a site by dropping a file beside the others and listing it in `SITES` below.
 */
export type SiteZone = {
  id: string;
  name: string;
  /** What anyone standing in it can see. */
  look?: string;
  cover?: Cover;
  /** The GM's note on the zone: threat placement, pacing, anything never read out. */
  note?: string;
  /**
   * What there is to learn here, handed to the crew one piece at a time.
   *
   * A bare string is something they come by with a Search, since that's most of them. `by` says how
   * it normally comes to light: `look` for what a careful look round gives up, `search` for a
   * Search, `task` for anything that takes a Breach, an Analyze, or the GM's own ruling.
   */
  finds?: (string | { text: string; by?: FindBy })[];
};

export type SiteBorder = {
  from: string;
  to: string;
  /** Open when unsaid: most ways between rooms are just ways between rooms. */
  state?: BorderState;
  note?: string;
};

export type SiteDefinition = {
  id: string;
  name: string;
  /** Salvage bundles the site holds: 1–2 for a wreckage pocket, 3–4 for a minor derelict, 5–8 for a large one. */
  capacity: number;
  /** The GM's notes on the site as a whole. Never sent to a player. */
  notes?: string;
  /** Where the crew comes in. The first zone, when unsaid. */
  entrance?: string;
  zones: SiteZone[];
  borders: SiteBorder[];
};

export const SITES: SiteDefinition[] = [tanager as SiteDefinition];

export const SITE_BY_ID = Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<string, SiteDefinition>;

export const entranceOf = (s: SiteDefinition) => s.entrance ?? s.zones[0]?.id;

export const FIND_BY: readonly FindBy[] = ["look", "search", "task"];

/**
 * Everything wrong with an authored site, in words its author can act on.
 *
 * The reachability check is the one that earns its keep: a zone nothing borders is a room the crew
 * can never walk into, and it's the mistake that survives proofreading.
 */
export function siteProblems(s: SiteDefinition): string[] {
  const out: string[] = [];
  if (!s.id?.trim()) out.push("The site needs an id.");
  if (!s.name?.trim()) out.push("The site needs a name.");
  if (!Number.isInteger(s.capacity) || s.capacity < 0) out.push(`Salvage Capacity should be a whole number, not ${JSON.stringify(s.capacity)}.`);
  if (!Array.isArray(s.zones) || !s.zones.length) {
    out.push("The site needs at least one zone.");
    return out;
  }
  const seen = new Set<string>();
  for (const z of s.zones) {
    if (!z.id?.trim()) out.push(`A zone is missing its id (${z.name ?? "unnamed"}).`);
    else if (seen.has(z.id)) out.push(`Two zones share the id "${z.id}".`);
    else seen.add(z.id);
    if (!z.name?.trim()) out.push(`Zone "${z.id}" needs a name.`);
    if (z.cover !== undefined && !(z.cover in COVER_POINTS)) out.push(`Zone "${z.id}" has cover "${z.cover}", which isn't none, partial, or strong.`);
    for (const f of z.finds ?? []) {
      const { text, by } = typeof f === "string" ? { text: f, by: undefined } : f;
      if (!text?.trim()) out.push(`Zone "${z.id}" has a find with nothing in it.`);
      if (by !== undefined && !FIND_BY.includes(by)) out.push(`Zone "${z.id}" has a find found by "${by}", which isn't a look, a search, or a task.`);
    }
  }
  const borders = Array.isArray(s.borders) ? s.borders : [];
  for (const b of borders) {
    for (const end of [b.from, b.to]) if (!seen.has(end)) out.push(`A border names "${end}", which is no zone of this site.`);
    if (b.from === b.to) out.push(`Zone "${b.from}" borders itself.`);
    if (b.state !== undefined && !BORDER_STATES.includes(b.state)) out.push(`The border between "${b.from}" and "${b.to}" is "${b.state}", which is no border state.`);
  }
  const entrance = entranceOf(s);
  if (!entrance || !seen.has(entrance)) out.push(`The entrance "${s.entrance}" is no zone of this site.`);
  else {
    // A Set visits whatever is added while it's being iterated, which walks the whole graph in one pass.
    const reached = new Set([entrance]);
    for (const id of reached) for (const b of borders) {
      if (b.from === id) reached.add(b.to);
      if (b.to === id) reached.add(b.from);
    }
    for (const z of s.zones) if (!reached.has(z.id)) out.push(`Zone "${z.id}" can't be reached from the entrance.`);
  }
  return out;
}
