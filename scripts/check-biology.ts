import { BIOLOGY, BIO_BY_KEY, BIO_TEMP_HP, STRESS_GATE, dampenSurge } from "../src/data/biology";
import { bioMaxEnergy, bioMaxHp, bioResearchBlocker, bioTempHp, bioTierThreeReady, certaintyLive, expressionsLive, grown, growBlocker, isBioUnlocked, milestones, surgeDice, surgePool, tierThreeSurge } from "../src/lib/biology";
import { PROJECT_TEMPLATE_BY_NAME } from "../src/lib/rules";
import { CYBER_BY_KEY } from "../src/data/cybernetics";
import { dampening } from "../src/lib/cyber";
import { maxEnergy, maxHp } from "../src/lib/derive";
import { uid } from "../src/lib/dice";
import { damageSteps } from "../src/lib/mechanics";
import { createInitialState, newCharacter } from "../src/lib/seed";
import type { Character } from "../src/lib/types";

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

/** One survivor with no background, so nothing quietly moves a number behind a case. */
function survivor(keys: string[] = []): Character {
  const c = newCharacter("Vale", null, null, "gm");
  c.biology = keys.map((key) => ({ id: uid(), key, choice: "" }));
  return c;
}
const chrome = (c: Character, keys: string[]) => {
  c.cybernetics = keys.map((key) => ({ id: uid(), key, location: CYBER_BY_KEY[key].name, replacement: false, damaged: false, lineage: [], choice: "" }));
  return c;
};

// The catalogue itself, as the document has it.
{
  const t = (tree: string, tier: number) => BIOLOGY.filter((d) => d.tree === tree && d.tier === tier).length;
  check("the adaptive tree is 15, 16 and 14", [t("adaptive", 1), t("adaptive", 2), t("adaptive", 3)], [15, 16, 14]);
  check("the utility tree is 10, 10 and 9", [t("utility", 1), t("utility", 2), t("utility", 3)], [10, 10, 9]);
  check("seventy-four in all", BIOLOGY.length, 74);
  const keys = BIOLOGY.map((d) => d.key);
  check("no two share a key", keys.filter((k, i) => keys.indexOf(k) !== i), []);
  check("every one of them has an effect", BIOLOGY.filter((d) => d.effects.length === 0).map((d) => d.name), []);
  check("every one has a category", BIOLOGY.filter((d) => d.categories.length === 0).map((d) => d.name), []);
  // In the adaptive tree an Expression is always a bargain: every one of them is paid for by a
  // Backlash. The utility tree is where the document hands several out for nothing, which is worth
  // knowing rather than assuming, since it is the asymmetry between fighting and working.
  check("every adaptive Expression is paid for", BIOLOGY.filter((d) => d.tree === "adaptive" && d.expression && !d.backlash).map((d) => d.name), []);
  check("while sixteen utility ones are free", BIOLOGY.filter((d) => d.tree === "utility" && d.expression && !d.backlash).length, 16);
  check("and everything carrying a Backlash can trigger one", BIOLOGY.filter((d) => d.backlash && !d.expression).map((d) => d.name), ["Micro-Rest Cortex", "Distributed Musculature", "Hypermetabolic Hands", "Hyperplastic Hands", "Emergency Organ Bloom"]);
  check("the merged entries survived the merge", [BIO_BY_KEY["distributed-vitality"].tree, BIO_BY_KEY["glycogen-reservoir"].tree], ["adaptive", "utility"]);
  check("and Distributed Vitality carries both halves", BIO_BY_KEY["distributed-vitality"].effects.length, 4);
}

// Surge Dice: the pool is built out of how badly its owner is coping.
{
  const c = survivor();
  check("a calm survivor surges nothing", surgeDice(c).dice, 0);
  c.pressure = 1;
  check("Shaken is one die", surgeDice(c).dice, 1);
  c.pressure = 2;
  check("Pressured is two", surgeDice(c).dice, 2);
  c.pressure = 3;
  check("Overtaxed is four", surgeDice(c).dice, 4);
  c.pressure = 4;
  check("and Panicked is six", surgeDice(c).dice, 6);
  check("the breakdown says where it came from", surgeDice(c).parts, ["Pressure 6"]);
}
{
  // Every Affliction is worth a die, which is the path rewarding a mind that has already given way.
  const c = survivor();
  c.pressure = 2;
  c.afflictions = [
    { id: uid(), code: "1-1", name: "Claustrophobia", effect: "", notes: "" },
    { id: uid(), code: "2-1", name: "Hypervigilance", effect: "", notes: "" },
  ];
  check("two Afflictions add two dice", surgeDice(c).dice, 4);
  check("and are named in the breakdown", surgeDice(c).parts, ["Pressure 2", "2 Afflictions 2"]);
}
{
  // Dampening is the cross-path term: one die for every two points of it.
  check("two Dampening costs one die", dampenSurge(2), 1);
  check("three costs one as well", dampenSurge(3), 1);
  check("four costs two", dampenSurge(4), 2);
  check("and one costs nothing", dampenSurge(1), 0);

  const c = chrome(survivor(), ["cyber-limb", "cyber-eye", "cyber-heart"]);
  c.pressure = 4;
  check("three implants is Load 3, which is Dampening 1", [dampening(c)], [1]);
  check("so Panicked still surges six", surgeDice(c).dice, 6);
  const deep = chrome(survivor(), ["full-skeletal-lattice", "panoptic-sensorium", "autonomous-survival-core"]);
  deep.pressure = 4;
  check("a heavily chromed body is Dampening 3", dampening(deep), 3);
  check("and loses a die for it", surgeDice(deep).dice, 5);
  check("which the breakdown admits to", surgeDice(deep).parts, ["Pressure 6", "Dampening −1"]);
  check("Dampening can never push the pool below nothing", surgeDice(chrome(survivor(), ["full-skeletal-lattice", "panoptic-sensorium", "autonomous-survival-core"])).dice, 0);
}

// Stress Resonance: the gates at 3, 5 and 6 Stress.
{
  const c = survivor(["living-ballista"]);
  check("Expressions are shut at 2 Stress", expressionsLive(c), false);
  c.stress = STRESS_GATE.expression;
  check("and open at 3", expressionsLive(c), true);
  check("the Tier III bonus waits for 5", tierThreeSurge(c), 0);
  c.stress = STRESS_GATE.tierThree;
  check("then pays two dice for one Tier III", tierThreeSurge(c), 2);
  check("certainty waits for 6", certaintyLive(c), false);
  c.stress = STRESS_GATE.certainty;
  check("and arrives there", certaintyLive(c), true);
}
{
  // The ceiling is on the Tier III bonus, not the whole pool: the Pressure ladder already reaches
  // six by itself at Panicked, so a cap on everything would make a Tier III do nothing where it
  // matters most.
  const c = survivor(["living-ballista", "apex-carapace", "furnace-bloom", "necrotic-foundry"]);
  c.stress = 5;
  check("four Tier IIIs would be eight, and the bonus caps at six", tierThreeSurge(c), 6);
  c.pressure = 4;
  check("so Panicked with four of them is twelve dice, not six", surgePool(c).dice, 12);
  check("and the breakdown separates the two", surgePool(c).parts, ["Pressure 6", "Tier III 6"]);
  const lesser = survivor(["ripper-tendons", "reactive-carapace"]);
  lesser.stress = 5;
  check("Tier IIs earn none of it", tierThreeSurge(lesser), 0);
}

// What stacking is worth, which is the whole endgame of the path.
{
  const bare = survivor();
  const one = survivor(["redundant-tissue-mass"]);
  check("one augmentation is 2 Maximum HP", bioMaxHp(one), 2);
  check("which reaches the sheet", maxHp(one) - maxHp(bare), 2);
  const stacked = survivor(["redundant-tissue-mass", "regenerative-colony", "regenerative-work-tissue", "distributed-vitality"]);
  check("the four HP entries together are 18", bioMaxHp(stacked), 18);
  check("and the sheet agrees", maxHp(stacked) - maxHp(bare), 18);

  check("Temporary HP is two for each of them", bioTempHp(stacked), 4 * BIO_TEMP_HP);
  check("a dozen augmentations open a fight with 24", bioTempHp(survivor(BIOLOGY.slice(0, 12).map((d) => d.key))), 24);

  check("two augmentations reach no milestone", milestones(survivor(["ripper-tendons", "reactive-carapace"])), 0);
  check("three reach one", milestones(stacked.biology!.length === 4 ? survivor(["ripper-tendons", "reactive-carapace", "apex-carapace"]) : stacked), 1);
  check("and nine reach three", milestones(survivor(BIOLOGY.slice(0, 9).map((d) => d.key))), 3);
  check("each milestone is worth a point of Maximum Energy", bioMaxEnergy(survivor(BIOLOGY.slice(0, 9).map((d) => d.key))) - BIOLOGY.slice(0, 9).reduce((s, d) => s + (d.bonus?.maxEnergy ?? 0), 0), 3);
  const energetic = survivor(["perpetual-metabolism", "dense-caloric-tissue", "glycogen-reservoir"]);
  check("stated Energy bonuses count on top of the milestone", bioMaxEnergy(energetic), 3 + 1 + 1);
  check("and the sheet reads it", maxEnergy(energetic) - maxEnergy(survivor()), 5);
}

// Temporary HP is spent before the body is.
{
  const c = survivor(["redundant-tissue-mass", "regenerative-colony"]);
  c.armor = 0;
  c.tempHp = bioTempHp(c);
  check("it starts at 4 for two augmentations", c.tempHp, 4);
  const small = damageSteps(c, { amount: 3, useArmor: true, pierce: 0 });
  check("a 3-point hit is paid for entirely out of it", [small.tempHp, small.lost], [3, 0]);
  const big = damageSteps(c, { amount: 7, useArmor: true, pierce: 0 });
  check("a 7-point hit spends all 4 and the body takes 3", [big.tempHp, big.lost], [4, 3]);
  const none = survivor();
  none.armor = 0;
  check("a survivor with none of it takes the whole hit", damageSteps(none, { amount: 3, useArmor: true, pierce: 0 }).lost, 3);
  // Resistance and Armor come first, so Temporary HP only pays for what gets through them.
  c.armor = 2;
  const armored = damageSteps(c, { amount: 4, useArmor: true, pierce: 0, resistant: true });
  check("Resistance halves it and Armor takes its point before Temporary HP sees it", [armored.scaled, armored.armor, armored.tempHp, armored.lost], [2, 1, 1, 0]);
}

// Finding one, then growing it.
{
  const g = createInitialState();
  check("Tier I is every crew's from the start", isBioUnlocked(g, BIO_BY_KEY["ripper-tendons"]) === false && isBioUnlocked(g, BIO_BY_KEY["redundant-tissue-mass"]), true);
  check("a Tier II wants a project", bioResearchBlocker(g, BIO_BY_KEY["ripper-tendons"]), "Needs a Tier II Adaptive cultivation project");
  check("and a Tier III wants two Tier IIs first", bioResearchBlocker(g, BIO_BY_KEY["apex-carapace"]), "Needs two Tier II Adaptive augmentations cultivated first");
  g.research.biology = ["ripper-tendons", "reactive-carapace"];
  check("two of them open the tier", bioTierThreeReady(g, "adaptive"), true);
  check("and then it only wants the project", bioResearchBlocker(g, BIO_BY_KEY["apex-carapace"]), "Needs a Tier III Adaptive cultivation project");
  check("the other tree is untouched by it", bioTierThreeReady(g, "utility"), false);
  g.research.biology = [...g.research.biology, "apex-carapace"];
  check("a cultivated augmentation is unlocked", isBioUnlocked(g, BIO_BY_KEY["apex-carapace"]), true);
  check("the two projects are on the Project list", ["Biological Cultivation (Tier II)", "Biological Cultivation (Tier III)"].every((n) => !!PROJECT_TEMPLATE_BY_NAME[n]), true);
}
{
  const g = createInitialState();
  g.research.biology = ["ripper-tendons", "distributed-vitality"];
  const c = survivor(["ripper-tendons"]);
  check("an augmentation they have can't be grown twice", growBlocker(g, c, BIO_BY_KEY["ripper-tendons"]), "They already have it");
  check("anything the crew has found can be, with no cap", growBlocker(g, c, BIO_BY_KEY["distributed-vitality"]), null);
  check("and anything it hasn't found can't", growBlocker(g, c, BIO_BY_KEY["apex-carapace"]), "Needs two Tier II Adaptive augmentations cultivated first");
  check("Tier I never needs finding", growBlocker(g, c, BIO_BY_KEY["redundant-tissue-mass"]), null);
  c.dead = true;
  check("the dead grow nothing", growBlocker(g, c, BIO_BY_KEY["redundant-tissue-mass"]), "They're dead");
  check("an unknown key is simply not there", grown(survivor(["no-such-thing"])).length, 0);
  check("and a survivor with no biology at all is fine", [grown(undefined).length, bioMaxHp(newCharacter("X", null, null, "gm"))], [0, 0]);
}

// Nothing here disturbs a crew that never touches the path.
{
  const g = createInitialState();
  check("a seeded crew has no augmentations", g.characters.every((c) => grown(c).length === 0), true);
  check("nor any Temporary HP", g.characters.every((c) => !c.tempHp), true);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
