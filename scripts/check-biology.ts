import { BIO_TEMP_HP, BIO_TIER_LABEL, STRESS_GATE, dampenSurge } from "../src/data/biology";
// Importing this installs the full catalogue into the registry, which is exactly what a server does.
// Everything below then reads it the way the game rules do, through `biologyCatalogue`.
import { allBiology, biologyFor } from "../src/lib/biology-server";
import { bioDef, biologyCatalogue, biologyReady, installBiology } from "../src/lib/bio-catalogue";

const BIOLOGY = biologyCatalogue();
const BIO_BY_KEY = Object.fromEntries(BIOLOGY.map((d) => [d.key, d]));
import { bioMaxEnergy, bioMaxHp, bioResearchBlocker, bioTempHp, bioTierReady, biologyInPlay, certaintyLive, expressionsLive, grown, growBlocker, hasBiologicalLab, isBioUnlocked, milestones, surgeDice, surgePool, tierThreeSurge } from "../src/lib/biology";
import { PROJECT_TEMPLATE_BY_NAME } from "../src/lib/rules";
import { CYBER_BY_KEY, DAMPENING_STRESS_COST, dampeningForLoad } from "../src/data/cybernetics";
import { cyberLoad, dampening, dampeningLeft } from "../src/lib/cyber";
import { maxEnergy, maxHp } from "../src/lib/derive";
import { uid } from "../src/lib/dice";
import { changePressure, changeStress, damageSteps, endScene } from "../src/lib/mechanics";
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
  // The whole catalogue is dark at the start: a crew knows nothing biological it hasn't grown, which
  // is the one rule that sets this path apart from cybernetics.
  check("a fresh crew knows nothing at all", BIOLOGY.filter((d) => isBioUnlocked(g, d)).length, 0);
  check("not even a Tier I", bioResearchBlocker(g, BIO_BY_KEY["redundant-tissue-mass"]), "Needs a Tier I Adaptive cultivation project");
  check("a Tier II wants two Tier Is first", bioResearchBlocker(g, BIO_BY_KEY["ripper-tendons"]), "Needs two Tier I Adaptive augmentations cultivated first");
  check("and a Tier III wants two Tier IIs first", bioResearchBlocker(g, BIO_BY_KEY["apex-carapace"]), "Needs two Tier II Adaptive augmentations cultivated first");
  check("Tier I is the only one that needs no ladder", ([1, 2, 3] as const).map((t) => bioTierReady(g, "adaptive", t)), [true, false, false]);

  g.research.biology = ["redundant-tissue-mass", "hypercoagulation-mesh"];
  check("two Tier Is open Tier II", bioTierReady(g, "adaptive", 2), true);
  check("and then it only wants the project", bioResearchBlocker(g, BIO_BY_KEY["ripper-tendons"]), "Needs a Tier II Adaptive cultivation project");
  check("the other tree is untouched by it", bioTierReady(g, "utility", 2), false);
  check("one Tier II is not two", bioTierReady({ ...g, research: { ...g.research, biology: [...g.research.biology, "ripper-tendons"] } }, "adaptive", 3), false);

  g.research.biology = [...g.research.biology, "ripper-tendons", "reactive-carapace"];
  check("two Tier IIs open Tier III", bioTierReady(g, "adaptive", 3), true);
  g.research.biology = [...g.research.biology, "apex-carapace"];
  check("a cultivated augmentation is unlocked", isBioUnlocked(g, BIO_BY_KEY["apex-carapace"]), true);
  check("all three projects are on the Project list", ([1, 2, 3] as const).every((t) => !!PROJECT_TEMPLATE_BY_NAME[`Biological Cultivation (${BIO_TIER_LABEL[t]})`]), true);
}
{
  const g = createInitialState();
  g.research.biology = ["ripper-tendons", "distributed-vitality"];
  const c = survivor(["ripper-tendons"]);
  check("an augmentation they have can't be grown twice", growBlocker(g, c, BIO_BY_KEY["ripper-tendons"]), "They already have it");
  check("anything the crew has found can be, with no cap", growBlocker(g, c, BIO_BY_KEY["distributed-vitality"]), null);
  check("and anything it hasn't found can't", growBlocker(g, c, BIO_BY_KEY["apex-carapace"]), "Needs two Tier II Adaptive augmentations cultivated first");
  check("not even a Tier I it hasn't found", growBlocker(g, c, BIO_BY_KEY["redundant-tissue-mass"]), "Needs a Tier I Adaptive cultivation project");
  c.dead = true;
  check("the dead grow nothing", growBlocker(g, c, BIO_BY_KEY["ripper-tendons"]), "They're dead");
  check("an unknown key is simply not there", grown(survivor(["no-such-thing"])).length, 0);
  check("and a survivor with no biology at all is fine", [grown(undefined).length, bioMaxHp(newCharacter("X", null, null, "gm"))], [0, 0]);
}

// Dampening: the cybernetic answer to variance, and the one place the two paths pull against each other.
{
  check("the ladder runs the whole way up now", [0, 3, 6, 9, 12, 15, 18, 21].map(dampeningForLoad), [0, 1, 2, 3, 4, 5, 6, 6]);
  check("and a point of it is still worth half a Surge Die", [1, 2, 3, 4, 5, 6].map(dampenSurge), [0, 1, 1, 2, 2, 3]);

  // A point a level against Pressure, spent as it arrives rather than banked for one big discount.
  const c = chrome(newCharacter("Wire", null, null, "gm"), ["full-skeletal-lattice", "panoptic-sensorium", "autonomous-survival-core"]);
  const damp = dampening(c);
  check("three Tier III systems is Load 9 and Dampening 3", [cyberLoad(c), damp], [9, 3]);
  const out: string[] = [];
  const g = createInitialState();
  g.characters = [c];
  changePressure(g, c, 1, out);
  check("the first level of Pressure is held off entirely", c.pressure, 0);
  check("and the pool says so", dampeningLeft(c), damp - 1);
  check("the log tells the table what absorbed it", out.some((l) => /Dampening holds off 1 level of Pressure/.test(l)), true);

  // Stress costs two a point, so a shallow build can't filter it at all.
  const shallow = chrome(newCharacter("Thin", null, null, "gm"), ["cyber-limb"]);
  check("one Tier I implant is Load 1 and no Dampening", [cyberLoad(shallow), dampening(shallow)], [1, 0]);
  const said: string[] = [];
  changeStress(shallow, 1, said);
  check("so the Stress lands in full", shallow.stress, 1);

  const deep = chrome(newCharacter("Deep", null, null, "gm"), ["full-skeletal-lattice", "panoptic-sensorium", "autonomous-survival-core", "affective-partition"]);
  check("a fourth system reaches Load 12, which the old ladder flatly ignored", [cyberLoad(deep), dampening(deep)], [12, 4]);
  const before = dampeningLeft(deep);
  const heard: string[] = [];
  changeStress(deep, 1, heard);
  check("a deep build filters a point of Stress", deep.stress, 0);
  check("at twice the price of Pressure", before - dampeningLeft(deep), DAMPENING_STRESS_COST);

  // The pool is the Scene's, and the Scene is what gives it back.
  deep.dampeningUsed = dampening(deep);
  check("a spent pool stops absorbing", dampeningLeft(deep), 0);
  const scene = createInitialState();
  scene.characters = [deep];
  endScene(scene);
  check("and the Scene ending refills it", dampeningLeft(deep), dampening(deep));

  // Relief must not be charged for: losing Stress is not something wiring has to pay to allow.
  const relieved = chrome(newCharacter("Calm", null, null, "gm"), ["full-skeletal-lattice", "panoptic-sensorium", "autonomous-survival-core"]);
  relieved.stress = 4;
  changeStress(relieved, -2, said);
  check("and clearing Stress costs no Dampening", [relieved.stress, dampeningLeft(relieved)], [2, dampening(relieved)]);
}

// Nothing here disturbs a crew that never touches the path.
{
  const g = createInitialState();
  check("a seeded crew has no augmentations", g.characters.every((c) => grown(c).length === 0), true);
  check("nor any Temporary HP", g.characters.every((c) => !c.tempHp), true);
  check("and no Biological Lab, so the path isn't in play at all", [hasBiologicalLab(g), biologyInPlay(g)], [false, false]);

  // The tab arrives with the room that can grow something.
  g.ship.rooms.push({ ...g.ship.rooms[0], id: "lab", name: "Biological Lab", module: "Biological Lab", condition: "Operational" });
  check("building the lab puts it in play", [hasBiologicalLab(g), biologyInPlay(g)], [true, true]);
  g.ship.rooms = g.ship.rooms.map((r) => (r.id === "lab" ? { ...r, condition: "Destroyed" } : r));
  check("and a destroyed lab grows nothing", hasBiologicalLab(g), false);
  check("so a crew who never cultivated loses the tab with the room", biologyInPlay(g), false);

  // But it doesn't leave with the room, for a crew carrying what the room grew.
  g.research.biology = ["redundant-tissue-mass"];
  check("a crew who cultivated keeps it", biologyInPlay(g), true);
  g.research.biology = [];
  g.characters = [{ ...newCharacter("Vale", null, null, "gm"), biology: [{ id: "x", key: "apex-carapace", choice: "" }] }];
  check("and so does one still carrying a graft", biologyInPlay(g), true);
}

// What leaves the server for a client. This is the part that keeps the trees dark, so it is the part
// worth being sure of: a player is handed strains, not a catalogue.
{
  const g = createInitialState();
  check("the catalogue is installed where the rules can read it", [biologyReady(), BIOLOGY.length], [true, 74]);
  check("a GM is sent all of it", biologyFor(g, true).length, 74);
  check("a player of a crew that has grown nothing is sent nothing", biologyFor(g, false), []);

  g.research.biology = ["redundant-tissue-mass", "hypercoagulation-mesh"];
  check("and then exactly what the lab grew", biologyFor(g, false).map((d) => d.key), ["redundant-tissue-mass", "hypercoagulation-mesh"]);
  check("which is not the tier, only the strain", biologyFor(g, false).length < BIOLOGY.filter((d) => d.tier === 1).length, true);

  // A GM may force a graft of something the crew never cultivated. If that strain weren't sent, the
  // player's copy of the sheet would quietly stop counting its Maximum HP, so it goes along too.
  g.characters = [{ ...newCharacter("Vale", null, null, "gm"), biology: [{ id: "x", key: "apex-carapace", choice: "" }] }];
  check("plus anything a survivor is actually carrying", biologyFor(g, false).map((d) => d.key).includes("apex-carapace"), true);
  check("and no more than that", biologyFor(g, false).length, 3);

  // The redacted catalogue has to be enough for a player's client to do its own arithmetic.
  const asPlayer = biologyFor(g, false);
  installBiology(asPlayer);
  check("a player's client can still add up what it carries", grown(g.characters[0]).map((x) => x.def.name), ["Apex Carapace"]);
  check("while the rest of the tree is simply not there", bioDef("survival-metamorphosis"), undefined);
  installBiology(allBiology());
  check("and the server is none the worse for having told them", biologyCatalogue().length, 74);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
