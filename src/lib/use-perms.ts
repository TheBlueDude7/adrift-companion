"use client";

import { actorOf, realActorOf, useGame } from "./store";

// base-ui buttons and select triggers don't always match :disabled inside a disabled fieldset.
export const READ_ONLY =
  "[&_:is(button,input,textarea,[role=combobox],[data-slot=button])]:pointer-events-none [&_:is(button,input,textarea,[role=combobox],[data-slot=button])]:opacity-50";

export function usePerms() {
  const session = useGame((s) => s.session);
  const me = useGame((s) => s.me);
  const people = useGame((s) => s.people);
  const viewAs = useGame((s) => s.viewAs);
  const actor = actorOf({ session, me, people, viewAs });
  const isGM = actor.role === "gm";
  return {
    shared: !!session,
    isGM,
    /** The device belongs to the GM, even while they're viewing as a player. */
    realGM: realActorOf({ session, me, people }).role === "gm",
    viewAs,
    myCharacterId: actor.characterId,
    canEditCharacter: (id: string) => isGM || id === actor.characterId,
    canUseLocation: (location: string) => isGM || location === "ship" || location === actor.characterId,
    playerOf: (characterId: string) => people.find((p) => p.characterId === characterId),
  };
}
