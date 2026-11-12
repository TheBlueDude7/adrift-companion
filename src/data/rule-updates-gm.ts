import "server-only";

import type { RuleUpdate } from "./rule-updates";

/**
 * Rule updates about the biological path, which only the GM may read.
 *
 * They live apart from `RULE_UPDATES` for the same reason the catalogue lives in `biology-defs.ts`:
 * that list is in the browser bundle and seeds the Discord rulings, so anything in it is readable by
 * every player. These reach a client only through `/api/rules`, and only when it asks as the GM.
 */
export const GM_RULE_UPDATES: RuleUpdate[] = [
  { id: "biology-path", title: "The biological path", text: "Seventy-four biological augmentations across two trees, Adaptive and Utility, three tiers each. The trees are independent, and there is no cap on how many anyone carries. Adaptive covers fighting: regeneration, grown armour, integrated weapons, and control of a room. Utility covers the voyage: Energy, Food and Water, Rest, Projects, and working in hostile places. Nothing biological is known until the lab grows it, so the catalogue starts dark. Biological Cultivation is a Ship Project at every tier (Wits + Biology in a Biological Lab, committing Scrapped Biomass and Chemical Mixture at the start, and an extracted Research Trait from Tier II up), and two cultivations in a tree open the tier above it. A cultivation belongs to the whole crew, and grafting one is Surgery in a Medical Bay that takes hold over a full Rest. Players see only what their own lab has grown: the server sends the GM the whole catalogue and each player only the grown strains plus anything their survivor carries. A device playing alone receives the whole catalogue. Augmentations pay off through Surge Dice: 0, 1, 2, 4 and 6 dice up the Pressure ladder, plus one per Affliction, minus one for every 2 Cybernetic Dampening. Stress Expressions are live at 3+ Stress, and most are paid for with a Backlash on a failed flat Constitution roll. At 5+ Stress each Tier III augmentation adds 2 Surge Dice, up to +12. At 6+ Stress, once per Scene, one Surge Die can be made a 6 after rolling, and the Backlash lands regardless. Each augmentation is worth +2 Temporary HP when a fight starts, up to half the character's Maximum HP, and every third one is worth +1 Maximum Energy, up to +4. Regeneration never carries anyone past half their Maximum HP. Record cultivations on the Ship tab, graft from the Crew tab, and read the trees on the Biology tab." },
  { id: "temp-hp", title: "Temporary HP", text: "A character can carry Temporary HP. Damage spends it after Resistance, Cover Armor, a Fortified point, and worn Armor, and only what remains reaches real HP. It is never repaired, only granted again, and whatever is left when the fighting stops is gone. Biological augmentation grants it fresh at the start of every fight." },
  { id: "bio-ceilings", title: "Biological limits", text: "Temporary HP is +2 per augmentation, up to half the character's Maximum HP. The Maximum Energy milestone arrives every third augmentation and grants its regrowth every time, but its Energy stops at +4. The Tier III Surge bonus is +2 Surge Dice each at 5+ Stress, up to +12. The Biology tab says when a character's Temporary HP is capped by their Maximum HP." },
];
