import type { BioDef } from "@/data/biology";

/**
 * Whichever biological augmentations the code running here is allowed to know about.
 *
 * The catalogue is server-held, because the shape of the trees is a spoiler and a crew knows no
 * biology it hasn't grown. That leaves a problem: the same arithmetic — Maximum HP, the Surge pool,
 * Temporary HP — has to run on the server, where all seventy-four exist, and in a player's browser,
 * where only a handful do. So nothing imports the catalogue directly. Everything asks here, and what
 * is here is whatever was installed.
 *
 * The server installs all of them once, at import (see `biology-server.ts`). A client installs
 * whatever the server sent it, which is everything for a GM and only the grown strains for a player.
 * A client that hasn't been told yet holds none, and every reader below is written to mean something
 * sensible in that state rather than to throw: an augmentation nobody can name is an augmentation
 * that contributes nothing, which is exactly right for a page that hasn't loaded.
 */
let entries: BioDef[] = [];
let byKey: Record<string, BioDef> = {};

export function installBiology(defs: BioDef[]) {
  entries = defs;
  byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
}

/** Every augmentation this side is entitled to know about. */
export const biologyCatalogue = () => entries;

/** One augmentation by key, or undefined if this side has never been told about it. */
export const bioDef = (key: string) => byKey[key];

/** Whether anything has been installed yet, which is how the interface tells "none" from "not yet". */
export const biologyReady = () => entries.length > 0;
