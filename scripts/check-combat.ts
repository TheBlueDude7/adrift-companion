import { newAction, taskPool } from "../src/lib/actions";
import { attackBlocker, attackPool, deathCheck, defenseOf, newThreat, resolveAttack, sightline, UNARMED, type AttackResult } from "../src/lib/combat";
import { damageResistance, maxHp } from "../src/lib/derive";
import { uid } from "../src/lib/dice";
import { movePlan, moveTo, scout, startExpedition, zoneDistance, zoneOf } from "../src/lib/expedition";
import { actionBlocker, clearOverwatch, DECK_SIZE, declareOverwatch, endFight, nextTurn, overwatchFor, reserveReaction, spendAction, spent, startFight, takeReaction } from "../src/lib/fight";
import { plantHazard, PRESET_BY_KEY } from "../src/lib/hazards";
import { pushLog } from "../src/lib/log";
import { marksOn } from "../src/lib/marks";
import { applyDamage } from "../src/lib/mechanics";
import { newCharacter, createInitialState, itemFromTemplate } from "../src/lib/seed";
import { mechStats, newMech } from "../src/lib/mechs";
import { CYBER_BY_KEY } from "../src/data/cybernetics";
import { DEFAULT_ITEM_TEMPLATES, PRESSURE_STATES, threatBand } from "../src/lib/rules";
import { playerView } from "../src/lib/sync/redact";
import type { Character, GameState, Line } from "../src/lib/types";

const tpl = (name: string) => DEFAULT_ITEM_TEMPLATES.find((t) => t.name === name)!;

/** Every die a 6, so a case tests the arithmetic rather than the luck. */
const allSixes = () => void (Math.random = () => 0.9);
/** Nothing but ones. */
const allOnes = () => void (Math.random = () => 0);
/** Real randomness again, for the cases about shuffling rather than arithmetic. */
const realRandom = Math.random;
const unrigged = () => void (Math.random = realRandom);

/** No background and no specialty, so nothing quietly adds dice behind a case. */
function world(): { g: GameState; shooterId: string } {
  const g = createInitialState();
  const shooter = newCharacter("Vale", null, null, "gm");
  shooter.skills.lightFirearms = 4;
  shooter.skills.closeCombat = 4;
  shooter.skills.heavyWeaponry = 4;
  g.characters.push(shooter);
  return { g, shooterId: shooter.id };
}

const bystander = (g: GameState, hp?: number) => {
  const c = newCharacter("Target", null, null, "gm");
  if (hp !== undefined) c.hp = hp;
  g.characters.push(c);
  return c;
};

function give(g: GameState, who: string, name: string) {
  const item = itemFromTemplate(tpl(name), 1, who);
  g.items.push(item);
  return item.id;
}

let failures = 0;
const text = (lines: (string | Line)[]) => lines.map((l) => (typeof l === "string" ? l : l.text));
const said = (lines: (string | Line)[], re: RegExp) => text(lines).some((t) => re.test(t));
/** Whatever an attack had to say, refusal or roll, as lines. */
const rolled = (r: AttackResult | { error: string }) => ("error" in r ? [r.error] : text(r.lines));

function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

// Weapon profiles came through the catalog at all.
check("rifle has a profile", tpl("Ballistic Rifle").weapon, { damage: 3, damageType: "Ballistic", range: "long", skill: "lightFirearms" });
check("fists are the fallback", UNARMED.damage, 1);

// Range gating, before any dice.
check("pistol at 6 zones", attackBlocker(tpl("Makeshift Pistol").weapon!, { zones: 6, cover: "none", aim: false, burst: false }), "That's 6 zones away and the weapon reaches 4.");
check("pistol at 5 zones is allowed", attackBlocker(tpl("Makeshift Pistol").weapon!, { zones: 5, cover: "none", aim: false, burst: false }), null);
check("cleaver across a zone", attackBlocker(tpl("Cleaver").weapon!, { zones: 2, cover: "none", aim: false, burst: false }), "That's 2 zones away and the weapon reaches only its own zone.");
check("burst on a bolt-action", attackBlocker(tpl("Ballistic Rifle").weapon!, { zones: 1, cover: "none", aim: false, burst: true }), "That weapon isn't automatic, so it can't Burst Fire.");
check("aiming a cleaver", attackBlocker(tpl("Cleaver").weapon!, { zones: 0, cover: "none", aim: true, burst: false }), "Aim helps a ranged attack, not a melee one.");
check("aiming a rifle", attackBlocker(tpl("Ballistic Rifle").weapon!, { zones: 2, cover: "none", aim: true, burst: false }), null);

const shot = { zones: 1, cover: "none" as const, aim: false, burst: false };

// 3 Ballistic into bare flesh.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Scavenger Drone", 10, 0);
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, shot);
  check("rifle on an unarmored drone", g.threats[0].stats!.hp, 7);
}

// Strong Cover is 2 points and only counts against Ballistic.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, { ...shot, cover: "strong" });
  check("rifle into Strong Cover", g.threats[0].stats!.hp, 9);
}

// Fire ignores Cover entirely.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, { ...shot, cover: "strong" });
  check("rocket ignores Cover", g.threats[0].stats!.hp, 4);
}

// Resistance halves, rounding down.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Hardened Drone", 10, 0);
  t.stats!.resist = ["Ballistic"];
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, shot);
  check("Resistance halves 3 to 1", g.threats[0].stats!.hp, 9);
}

// Plating is ablative: it stops 1 and loses a point.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  g.threats.push(newThreat("Plated Drone", 10, 2));
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("plating absorbs 1", [g.threats[0].stats!.hp, g.threats[0].stats!.armor], [8, 1]);
}

// "Pierces Armor" gets past the plating.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Chemical Injector");
  g.threats.push(newThreat("Plated Drone", 10, 2));
  resolveAttack(g, shooterId, g.threats[0].id, id, { ...shot, zones: 0 });
  check("injector pierces plating", [g.threats[0].stats!.hp, g.threats[0].stats!.armor], [9, 2]);
}

// Immunity is absolute.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  const t = newThreat("Fireproof Thing", 10, 0);
  t.stats!.immune = ["Fire"];
  g.threats.push(t);
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("immune to Fire", g.threats[0].stats!.hp, 10);
}

// A miss changes nothing.
{
  allOnes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  g.threats.push(newThreat("Drone", 10, 0));
  const r = resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("a miss leaves it untouched", [g.threats[0].stats!.hp, "hits" in r ? r.hits : -1], [10, 0]);
}

// What the players hear, versus what the GM reads.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  g.threats.push(newThreat("Plated Drone", 10, 2));
  const r = resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  const lines = "lines" in r ? r.lines : [];
  check("the numbers are marked for the GM alone", lines.filter((l) => l.gm).map((l) => l.text), ["Plated Drone's plating absorbs 1 (now 1).", "Plated Drone takes 2 Ballistic damage (HP 8/10)."]);
  check("and the crew hears how it went, not by how much", lines.filter((l) => !l.gm).map((l) => l.text)[1], "Plated Drone takes it, though less of it than you'd hoped.");
}
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Makeshift Pistol");
  // Named so the assertion below can't match the word "armor" in the threat's own name.
  const t = newThreat("Bulkhead Crawler", 10, 3);
  g.threats.push(t);
  const r = resolveAttack(g, shooterId, t.id, id, shot);
  const said = ("lines" in r ? r.lines : []).filter((l) => !l.gm).map((l) => l.text);
  check("fully absorbed reads as nothing happening", said[1], "The hit lands on Bulkhead Crawler and does nothing at all.");
  check("and never says why", said.some((x) => /plating|armor|absorb/i.test(x)), false);
}
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  const t = newThreat("Fireproof Thing", 10, 0);
  t.stats!.immune = ["Fire"];
  g.threats.push(t);
  const said = (() => { const r = resolveAttack(g, shooterId, t.id, id, shot); return ("lines" in r ? r.lines : []).filter((l) => !l.gm).map((l) => l.text); })();
  check("immunity isn't announced to the crew", said.some((x) => /immune/i.test(x)), false);
}

// The band, which is the whole of what a player learns about its health.
{
  const t = newThreat("Thing", 10, 0);
  const at = (hp: number) => { t.stats!.hp = hp; return threatBand(hp, 10); };
  check("bands by remaining HP", [at(10), at(9), at(6), at(5), at(1), at(0)], ["unhurt", "hurt", "hurt", "badly hurt", "badly hurt", "down"]);
}

// Redaction: what actually goes over the wire to a player.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Secret Drone", 10, 2);
  t.stats!.immune = ["Fire"];
  t.stats!.notes = "Guards the reactor door";
  g.threats.push(t);
  const r = resolveAttack(g, shooterId, t.id, id, shot);
  for (const line of ("lines" in r ? r.lines : [])) pushLog(g, line, "roll");
  const seen = playerView(g);
  check("a player's copy has no numbers", seen.threats[0].stats, undefined);
  check("but still has what it needs to be shot at", [seen.threats[0].name, seen.threats[0].band], ["Secret Drone", "hurt"]);
  check("no GM line survives the trip", seen.log.some((e) => e.gm), false);
  check("and nothing left in the log leaks a number", seen.log.some((e) => /HP \d+\/\d+|plating|immune/i.test(e.text)), false);
  check("while the GM keeps all of it", [g.threats[0].stats!.hp, g.log.filter((e) => e.gm).length], [8, 2]);
}

// An Analyze hands over one fact, truthfully.
{
  const t = newThreat("Thing", 10, 0);
  t.stats!.resist = ["Ballistic"];
  t.stats!.vulnerable = ["Electric"];
  check("what an Analyze would report", [defenseOf(t.stats!, "Ballistic"), defenseOf(t.stats!, "Electric"), defenseOf(t.stats!, "Fire")], ["resists", "vulnerable", "normal"]);
  t.known.defenses.push({ type: "Ballistic", effect: defenseOf(t.stats!, "Ballistic") });
  check("and it reaches the player view", playerView({ ...world().g, threats: [t] }).threats[0].known.defenses, [{ type: "Ballistic", effect: "resists" }]);
}

// Nonlethal can't take the last point.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Stun Baton");
  const victim = bystander(g, 3);
  resolveAttack(g, shooterId, victim.id, id, { ...shot, zones: 0 });
  check("4 nonlethal damage stops at 1 HP", g.characters[1].hp, 1);
}

// A real hit on a survivor: ablative Armor, then an Injury the server rolls.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  const victim = bystander(g);
  victim.armor = 2;
  const before = victim.hp;
  resolveAttack(g, shooterId, victim.id, id, shot);
  const after = g.characters[1];
  check("6 Fire past 2 Armor costs 5 HP and a point of plating", [before - after.hp, after.armor], [5, 1]);
  check("the server rolled the Injury", after.injuries.length, 1);
  check("and the Pressure that comes with it", after.pressure > 0, true);
}

// Charges come off the weapon.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Makeshift Explosive");
  g.threats.push(newThreat("Drone", 20, 0));
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("an explosive spends a use", g.items.find((i) => i.id === id)!.charges, 2);
}

// Refusals that aren't about dice.
{
  const { g, shooterId } = world();
  const other = bystander(g);
  const id = give(g, other.id, "Ballistic Rifle");
  g.threats.push(newThreat("Drone", 10, 0));
  const r = resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("can't fire someone else's rifle", "error" in r ? r.error : "", "Vale isn't carrying the Ballistic Rifle.");
}
{
  const { g, shooterId } = world();
  g.characters[0].hp = 0;
  g.threats.push(newThreat("Drone", 10, 0));
  const r = resolveAttack(g, shooterId, g.threats[0].id, null, shot);
  check("a downed survivor can't swing", "error" in r ? r.error : "", "Vale is down at 0 HP and can't act.");
}

// Death checks.
{
  allSixes();
  const { g } = world();
  g.characters[0].hp = 0;
  const lines = deathCheck(g.characters[0], false);
  check("a 6 holds on", [g.characters[0].dead, lines.length], [false, 1]);
}
{
  allOnes();
  const { g } = world();
  g.characters[0].hp = 0;
  g.characters[0].willpower = 0;
  deathCheck(g.characters[0], false);
  check("no 6 and no Willpower is death", g.characters[0].dead, true);
}
{
  allOnes();
  const { g } = world();
  g.characters[0].hp = 0;
  g.characters[0].willpower = 1;
  deathCheck(g.characters[0], true);
  check("Willpower buys one reroll and no more", [g.characters[0].dead, g.characters[0].willpower], [true, 0]);
}
{
  allOnes();
  const { g } = world();
  g.characters[0].hp = 0;
  g.characters[0].stabilized = true;
  deathCheck(g.characters[0], false);
  check("stabilized means no check at all", g.characters[0].dead, false);
}

// Conditions, which used to change nothing at all.
const condition = (c: Character, name: string) => void c.conditions.push({ id: name, name, duration: "Scene", notes: "" });

// Every weapon skill is Strength-based, so Poisoned reaches all of them.
{
  const { g } = world();
  const c = g.characters[0];
  const rifle = tpl("Ballistic Rifle").weapon!;
  const base = attackPool(c, rifle, shot).dice;
  const a = newAction(g, c, "Scan Nearby Tile");
  g.actions.push(a);
  const scanBase = taskPool(g, a).dice;
  condition(c, "Poisoned");
  check("Poisoned costs 2 on a Strength weapon", attackPool(c, rifle, shot).dice, base - 2);
  check("and nothing on a Wits task", taskPool(g, a).dice, scanBase);
}
{
  const { g } = world();
  const c = g.characters[0];
  const rifle = tpl("Ballistic Rifle").weapon!;
  const base = attackPool(c, rifle, shot).dice;
  condition(c, "Dissociation");
  check("a Mind Break costs 6 everywhere", attackPool(c, rifle, shot).dice, Math.max(0, base - 6));
}
{
  const { g } = world();
  const c = g.characters[0];
  const club = tpl("Makeshift Club").weapon!;
  const melee = { ...shot, zones: 0 };
  const base = attackPool(c, club, melee).dice;
  condition(c, "Enraged");
  check("Enraged pays for a Physical attack", attackPool(c, club, melee).dice, base + 2);
  const stun = tpl("Stun Baton").weapon!;
  check("and not an Electric one", attackPool(c, stun, melee).dice, attackPool(world().g.characters[0], stun, melee).dice);
}
{
  const { g } = world();
  const c = g.characters[0];
  const rifle = tpl("Ballistic Rifle").weapon!;
  condition(c, "Blinded");
  const asked = attackPool(c, rifle, shot);
  check("Blinded is asked, not assumed", asked.asks.map((a) => [a.condition, a.dice, a.key]), [["Blinded", -5, "Blinded:0"]]);
  check("so the pool is unchanged until answered", asked.dice, attackPool(world().g.characters[0], rifle, shot).dice);
  const answered = attackPool(c, rifle, { ...shot, answers: { "Blinded:0": true } });
  check("and costs 5 once it is", [answered.dice, answered.asks.length], [Math.max(0, asked.dice - 5), 0]);
}
{
  const { g } = world();
  condition(g.characters[0], "Freeze Response");
  const blocked = attackBlocker(tpl("Ballistic Rifle").weapon!, shot, g.characters[0]);
  check("a frozen survivor can't attack", blocked, "Vale Freeze Response: is frozen and can't act.");
}
{
  const { g } = world();
  condition(g.characters[0], "Surprised");
  check("Surprised has no Fast Action to Aim with", attackBlocker(tpl("Ballistic Rifle").weapon!, { ...shot, aim: true }, g.characters[0]), "Vale has no Fast Action to Aim with.");
}
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  condition(g.characters[0], "Weakened");
  g.threats.push(newThreat("Drone", 10, 0));
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("Weakened takes a point off the damage", g.threats[0].stats!.hp, 8);
}
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Drone", 10, 0);
  t.conditions.push({ id: "e", name: "Exposed", duration: "Scene", notes: "" });
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, { ...shot, cover: "strong" });
  check("Exposed means Strong Cover stops nothing", g.threats[0].stats!.hp, 7);
}

// Tasks see conditions too, which they never used to.
{
  const { g } = world();
  const c = g.characters[0];
  c.skills.navigation = 6;
  const a = newAction(g, c, "Scan Nearby Tile");
  g.actions.push(a);
  const base = taskPool(g, a).dice;
  check("the task has dice to lose", base > 6, true);
  condition(c, "Disoriented");
  check("Disoriented costs Navigation 4 and 1 more", taskPool(g, a).dice, base - 5);
  condition(c, "Blinded");
  check("and sight is still asked about", taskPool(g, a).asks.map((x) => x.condition), ["Blinded"]);
  condition(c, "Total Shutdown");
  check("and an unconscious survivor is refused outright", taskPool(g, a).blocked, "Total Shutdown: is unconscious.");
}
// A task with no attribute at all still can't be done by someone unconscious.
{
  const { g } = world();
  condition(g.characters[0], "Freeze Response");
  const a = newAction(g, g.characters[0], "Embark Expedition");
  g.actions.push(a);
  check("even a task that rolls nothing", taskPool(g, a).blocked, "Freeze Response: is frozen and can't act.");
}

// A site decides the range and the cover, whatever the client says about them.
{
  const { g, shooterId } = world();
  startExpedition(g, { site: "", crew: [shooterId], siteId: "tanager" });
  const e = g.expedition!;
  const zone = (name: string) => e.zones.find((z) => z.name === name)!;
  const place = (name: string) => {
    const t = newThreat(name, 10, 0);
    g.threats.push(t);
    return t;
  };

  const mess = place("Something in the mess");
  mess.zone = zone("Mess Deck").id;
  check("the map counts the zones between", sightline(g, shooterId, mess.id), { zones: 2, cover: "partial" });

  const ward = place("Something in the medbay");
  ward.zone = zone("Medical Bay").id;
  check("a shut door is no shot", sightline(g, shooterId, ward.id), { blocked: "There's no seeing where that is from the Docking Collar." });

  const hold = place("Something in the hold");
  hold.zone = zone("Cargo Hold").id;
  check("a way round the back is still a way to see", sightline(g, shooterId, hold.id), { zones: 4, cover: "partial" });

  const unplaced = place("Something underfoot");
  check("a threat in no zone leaves the numbers alone", sightline(g, shooterId, unplaced.id), null);

  // The dialog claimed point-blank. Two zones is what the site says, and a cleaver doesn't reach.
  allSixes();
  const cleaver = give(g, shooterId, "Cleaver");
  check(
    "the server doesn't take the client's word for the range",
    resolveAttack(g, shooterId, mess.id, cleaver, { ...shot, zones: 0 }),
    { error: "That's 2 zones away and the weapon reaches only its own zone." },
  );

  // Nor for the cover: the Mess Deck's partial cover absorbs a point of the rifle's Ballistic hit.
  const rifle = give(g, shooterId, "Ballistic Rifle");
  resolveAttack(g, shooterId, mess.id, rifle, { ...shot, zones: 0, cover: "none" });
  check("nor for the cover", mess.stats!.hp, 8);

  // And nothing about a creature in a room they haven't opened reaches the players.
  check("a threat in an unexplored zone isn't sent at all", playerView(g).threats.map((t) => t.name), ["Something underfoot"]);
  moveTo(g, shooterId, zone("Spinal Corridor").id);
  // One pace from the privacy door, and still no shot through it: walking and seeing count borders
  // differently, which is the whole point of counting them separately.
  check("standing next to a closed door is a step away", zoneDistance(e, zone("Spinal Corridor").id, zone("Medical Bay").id), 1);
  check("and still no shot through it", sightline(g, shooterId, ward.id), { blocked: "There's no seeing where that is from the Spinal Corridor." });
  scout(g, zone("Mess Deck").id);
  check("scouting the room hands it over", playerView(g).threats.map((t) => t.name), ["Something in the mess", "Something underfoot"]);
  check("with the zone it's standing in", playerView(g).threats[0].zone, zone("Mess Deck").id);
}

// Initiative, rounds, and what a turn buys.
{
  unrigged();
  const { g, shooterId } = world();
  const other = bystander(g);
  const pack = Array.from({ length: 9 }, () => newThreat("Rat", 4, 0));
  g.threats.push(...pack);
  const all = { crew: [shooterId, other.id], threats: pack.map((t) => t.id) };

  check("ten cards is the deck", DECK_SIZE, 10);
  check("and eleven participants won't fit in it", text(startFight(g, all)), ["That's 11 cards and the deck holds 10. Let the minor enemies share one."]);
  check("so no fight started", g.fight, undefined);

  startFight(g, { ...all, threatsShareCard: true });
  const f = g.fight!;
  check("everyone drew", f.order.length, 11);
  check("the rats share one card", new Set(pack.map((t) => f.order.find((x) => x.id === t.id)!.card)).size, 1);
  check("and no two others hold the same", new Set(f.order.map((x) => x.card)).size, 3);
  check("the lowest card is up first", f.card, Math.min(...f.order.map((x) => x.card)));
  check("on the first Round", f.round, 1);
  check("a second fight is refused", text(startFight(g, { crew: [shooterId], threats: [] })), ["A fight is already under way. End that one first."]);
}

// The budget: a Slow Action for the attack, and a Fast one if they Aimed first.
{
  allSixes();
  const { g, shooterId } = world();
  const t = newThreat("Drone", 20, 0);
  g.threats.push(t);
  const rifle = give(g, shooterId, "Ballistic Rifle");
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = () => f.order.find((x) => x.id === shooterId)!;
  f.card = me().card;

  check("shooting spends the Slow Action", said(rolled(resolveAttack(g, shooterId, t.id, rifle, shot)), /spends a Slow Action/), true);
  check("so a second shot is refused", resolveAttack(g, shooterId, t.id, rifle, shot), { error: "Vale has already taken a Slow Action this turn." });
  check("but a Fast Action is still theirs", actionBlocker(g, shooterId, "fast"), null);
  spendAction(g, shooterId, "fast");
  check("and then the turn is spent", actionBlocker(g, shooterId, "fast"), "Vale has spent both actions this turn.");

  // A fresh turn, where Aiming costs the Fast Action the attack would otherwise leave spare.
  nextTurn(g);
  f.card = me().card;
  check("an aimed shot needs both", said(rolled(resolveAttack(g, shooterId, t.id, rifle, { ...shot, aim: true })), /spends a Slow and a Fast Action/), true);
  check("and leaves nothing", 2 - spent(me()), 0);

  nextTurn(g);
  f.card = me().card;
  spendAction(g, shooterId, "fast");
  check("one action left can't buy an aimed shot", resolveAttack(g, shooterId, t.id, rifle, { ...shot, aim: true }), { error: "Vale has one action left this turn, and that needs two." });
  check("though an unaimed one fits", "error" in resolveAttack(g, shooterId, t.id, rifle, shot), false);
}

// Out of turn, and the Round turning over.
{
  const { g, shooterId } = world();
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  const rifle = give(g, shooterId, "Ballistic Rifle");
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = f.order.find((x) => x.id === shooterId)!;
  const beast = f.order.find((x) => x.id === t.id)!;
  f.card = beast.card;
  check("nobody acts out of turn", resolveAttack(g, shooterId, t.id, rifle, shot), { error: `It isn't Vale's turn: card ${beast.card} is up and they hold ${me.card}.` });
  check("and nothing outside a fight is refused for want of an action", actionBlocker(g, bystander(g).id, "slow"), null);

  // Ending the highest card's turn ends the Round, which is where lingering effects land.
  f.card = Math.max(...f.order.map((x) => x.card));
  for (const x of f.order) { x.slow = true; x.fast = 1; }
  const turned = text(nextTurn(g));
  check("the Round ends on the last card", g.fight!.round, 2);
  check("and says so", turned.some((l) => l === "— End of round —"), true);
  check("everyone's actions come back", 2 - spent(me), 2);
  check("and the lowest card is up again", g.fight!.card, Math.min(...f.order.map((x) => x.card)));
}

// Surprise: Shaken, no Fast Action, and over at the end of their own first turn.
{
  const { g, shooterId } = world();
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  startFight(g, { crew: [shooterId], threats: [t.id], ambush: "threats" });
  const c = g.characters[0];
  check("a surprised survivor is Shaken", PRESSURE_STATES[c.pressure].name, "Shaken");
  g.fight!.card = g.fight!.order.find((x) => x.id === shooterId)!.card;
  check("and has no Fast Action", actionBlocker(g, shooterId, "fast"), "Vale is Surprised and has no Fast Action until the end of their turn.");
  check("though the Slow one is theirs", actionBlocker(g, shooterId, "slow"), null);
  check("surprise ends with their turn", said(nextTurn(g), /Surprised ends/), true);
  check("and the condition is gone", c.conditions.some((x) => x.name === "Surprised"), false);
}

// A Reaction is the Fast Action, held back, and one per Round.
{
  const { g, shooterId } = world();
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = f.order.find((x) => x.id === shooterId)!;
  f.card = me.card;
  reserveReaction(g, shooterId);
  check("reserving costs the Fast Action", [me.fast, me.reaction], [1, "reserved"]);
  check("and only one is allowed", text(reserveReaction(g, shooterId)), ["Vale has already reserved one this Round."]);
  check("using it is noted", said(takeReaction(g, shooterId), /takes their Reaction/), true);
  check("and it can't be used twice", text(takeReaction(g, shooterId)), ["Vale has no Reaction reserved."]);
}

// Moving in a fight costs the Fast Action, out of a fight nothing.
{
  const { g, shooterId } = world();
  startExpedition(g, { site: "", crew: [shooterId], siteId: "tanager" });
  const e = g.expedition!;
  const zone = (name: string) => e.zones.find((z) => z.name === name)!;
  startFight(g, { crew: [shooterId], threats: [] });
  const f = g.fight!;
  f.card = f.order[0].card;
  check("a move spends a Fast Action", said(moveTo(g, shooterId, zone("Spinal Corridor").id), /spends a Fast Action/), true);
  spendAction(g, shooterId, "slow");
  check("and with the turn spent they stay put", text(moveTo(g, shooterId, zone("Mess Deck").id)), ["Vale has spent both actions this turn."]);
  check("so they really are still in the corridor", zoneOf(e, shooterId)?.name, "Spinal Corridor");
  endFight(g);
  check("with the fight over, moving is free again", said(moveTo(g, shooterId, zone("Mess Deck").id), /moves from the Spinal Corridor/), true);
}

// What a player is sent: the order, minus anything they haven't met.
{
  const { g, shooterId } = world();
  startExpedition(g, { site: "", crew: [shooterId], siteId: "tanager" });
  const hidden = newThreat("Something in the hold", 10, 0);
  hidden.zone = g.expedition!.zones.find((z) => z.name === "Cargo Hold")!.id;
  const seen = newThreat("Something at the hatch", 10, 0);
  g.threats.push(hidden, seen);
  startFight(g, { crew: [shooterId], threats: [hidden.id, seen.id] });
  check("the GM holds three cards", g.fight!.order.length, 3);
  check("the player is sent two", playerView(g).fight!.order.length, 2);
  check("and not the one in the unexplored room", playerView(g).fight!.order.some((x) => x.id === hidden.id), false);
  check("the Round and the card are public", [playerView(g).fight!.round, playerView(g).fight!.card], [1, g.fight!.card]);
}

// Sprint: two zones for the Slow Action, and not across anything that wants a Task.
{
  const { g, shooterId } = world();
  startExpedition(g, { site: "", crew: [shooterId], siteId: "tanager" });
  const e = g.expedition!;
  const zone = (name: string) => e.zones.find((z) => z.name === name)!;
  const plan = (name: string) => movePlan(g, shooterId, zone(name).id);
  const how = (name: string) => {
    const p = plan(name);
    return "blocked" in p ? p.blocked : `${p.kind} for a ${p.cost}${p.via ? ` through the ${p.via.name}` : ""}`;
  };

  check("next door is a step", how("Spinal Corridor"), "step for a fast");
  check("two doors down is a Sprint", how("Mess Deck"), "sprint for a slow through the Spinal Corridor");
  check("and a shut door is only a shove on the way", how("Medical Bay"), "sprint for a slow through the Spinal Corridor");
  check("four rooms off is too far for either", how("Cargo Hold"), "The Cargo Hold is 4 zones off, and a Sprint reaches two.");
  check("and a command lockout isn't a way at all", how("Bridge"), "There's no way from the Docking Collar to the Bridge at all.");

  // From the Mess Deck the hold is two away, but the second of them is a drop into the netting.
  moveTo(g, shooterId, zone("Spinal Corridor").id);
  moveTo(g, shooterId, zone("Mess Deck").id);
  check("the duct is a step", how("Maintenance Crawl"), "step for a fast");
  check("but a two-deck drop wants a Task, which a Sprint can't cross", how("Cargo Hold"), "Getting to the Cargo Hold means crossing something that wants a Task on the way, which a Sprint can't.");
  moveTo(g, shooterId, zone("Spinal Corridor").id);
  moveTo(g, shooterId, zone("Docking Collar").id);

  startFight(g, { crew: [shooterId], threats: [] });
  const f = g.fight!;
  f.card = f.order[0].card;
  const ran = text(moveTo(g, shooterId, zone("Mess Deck").id));
  check("the Sprint says where it went through", ran[0], "Vale sprints from the Docking Collar through the Spinal Corridor into the Mess Deck.");
  check("and spends the Slow Action for it", ran.some((l) => /spends a Slow Action/.test(l)), true);
  check("the room run through counts as seen", zone("Spinal Corridor").seen, true);
  check("with only the Fast one left, two zones is out", movePlan(g, shooterId, zone("Docking Collar").id), { blocked: "Vale has already taken a Slow Action this turn." });
  check("though one zone still fits", "kind" in movePlan(g, shooterId, zone("Spinal Corridor").id), true);
}

// The five one-shot conditions: what they add, what they strip, and when they're spent.
{
  const mark = (name: string) => ({ id: uid(), name, duration: "Brief" as const, notes: "" });

  check("Marked rolls two dice against a Ballistic hit", marksOn({ conditions: [mark("Marked")] }, "Ballistic").dice, 2);
  check("and one against anything else", marksOn({ conditions: [mark("Marked")] }, "Fire").dice, 1);
  check("Brittle waits for a Physical or Ballistic hit", marksOn({ conditions: [mark("Brittle")] }, "Fire").bonus, 0);
  check("and then adds one, and a point of Armor with it", [marksOn({ conditions: [mark("Brittle")] }, "Physical").bonus, marksOn({ conditions: [mark("Brittle")] }, "Physical").armorExtra], [1, 1]);
  check("Conductive waits for an Electric one", marksOn({ conditions: [mark("Conductive")] }, "Ballistic").applies, []);
  check("and brings Staggered with it", marksOn({ conditions: [mark("Conductive")] }, "Electric").applies, ["Staggered"]);
  check("with no type said, only the type-blind ones land", marksOn({ conditions: [mark("Brittle"), mark("Marked")] }, null).names, ["Marked"]);

  // A marked threat, shot. Every die is a 6, so Marked's 2d4 are 4s and the rifle's 3 becomes 11.
  allSixes();
  const { g, shooterId } = world();
  const t = newThreat("Drone", 20, 0);
  t.conditions.push(mark("Marked"));
  g.threats.push(t);
  const rifle = give(g, shooterId, "Ballistic Rifle");
  const lines = rolled(resolveAttack(g, shooterId, t.id, rifle, shot));
  check("Marked adds its roll to the damage", t.stats!.hp, 9);
  check("and says what it added", lines.some((l) => l === "Marked: 2d4 comes up [4, 4], so +8 damage."), true);
  check("then it's spent", t.conditions.length, 0);
  check("which the crew is told", lines.some((l) => l === "Marked is spent on that hit."), true);
}

// Corroded and Fortified wait on the Armor, and are only spent when the Armor was in it.
{
  allSixes();
  const { g, shooterId } = world();
  const victim = bystander(g);
  victim.armor = 2;
  victim.conditions.push({ id: uid(), name: "Corroded", duration: "Brief", notes: "" });
  const cleaver = give(g, shooterId, "Cleaver");
  const lines = rolled(resolveAttack(g, shooterId, victim.id, cleaver, { ...shot, zones: 0 }));
  check("Corroded leaves the Armor stopping nothing", lines.some((l) => /Armor stops nothing/.test(l)), true);
  check("and takes two points of it", victim.armor, 0);
  check("so all three of the cleaver's damage lands", victim.hp, maxHp(victim) - 3);
  check("and Corroded is done", victim.conditions.some((x) => x.name === "Corroded"), false);
}
{
  allSixes();
  const { g, shooterId } = world();
  const victim = bystander(g);
  victim.conditions.push({ id: uid(), name: "Fortified", duration: "Brief", notes: "" });
  const cleaver = give(g, shooterId, "Cleaver");
  const before = victim.hp;
  const lines = rolled(resolveAttack(g, shooterId, victim.id, cleaver, { ...shot, zones: 0 }));
  check("a Fortified point absorbs the cleaver", lines.some((l) => /temporary point of Armor absorbs 1/.test(l)), true);
  check("so three damage lands as two", before - victim.hp, 2);
  check("and the point is gone", victim.conditions.some((x) => x.name === "Fortified"), false);

  // Armor Piercing goes through a temporary point like any other, so there's nothing for it to do.
  victim.conditions.push({ id: uid(), name: "Fortified", duration: "Brief", notes: "" });
  const injector = give(g, shooterId, "Chemical Injector");
  const was = victim.hp;
  resolveAttack(g, shooterId, victim.id, injector, { ...shot, zones: 0 });
  check("a pierced hit lands whole", was - victim.hp, 1);
  check("and leaves Fortified standing for the next one", victim.conditions.some((x) => x.name === "Fortified"), true);
}

// Overwatch: a Slow Action now for one ranged shot later, out of turn.
{
  allSixes();
  const { g, shooterId } = world();
  const t = newThreat("Drone", 20, 0);
  g.threats.push(t);
  const rifle = give(g, shooterId, "Ballistic Rifle");
  const cleaver = give(g, shooterId, "Cleaver");
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = f.order.find((x) => x.id === shooterId)!;
  const beast = f.order.find((x) => x.id === t.id)!;

  f.card = beast.card;
  check("it can't be declared out of turn", text(declareOverwatch(g, shooterId, "the hatch", "when it opens")), [`It isn't Vale's turn: card ${beast.card} is up and they hold ${me.card}.`]);
  f.card = me.card;
  check("declaring it spends the Slow Action", said(declareOverwatch(g, shooterId, "the hatch", "when it opens"), /spends a Slow Action/), true);
  check("and it's held where the server can see it", me.overwatch, { watching: "the hatch", trigger: "when it opens" });
  check("twice is no", text(declareOverwatch(g, shooterId, "the door", "when it opens")), ["Vale is already watching the hatch."]);
  check("their own turn isn't when it fires", overwatchFor(g, shooterId), null);

  f.card = beast.card;
  check("out of turn it is", overwatchFor(g, shooterId), { watching: "the hatch", trigger: "when it opens" });
  check("a fist isn't what it bought", resolveAttack(g, shooterId, t.id, cleaver, { ...shot, zones: 0 }), { error: "An Overwatch buys a ranged attack, and the Cleaver isn't one." });
  check("nor is there a Fast Action to Aim with", resolveAttack(g, shooterId, t.id, rifle, { ...shot, aim: true }), { error: "Vale is shooting out of turn, with no Fast Action to Aim with." });
  const fired = rolled(resolveAttack(g, shooterId, t.id, rifle, shot));
  check("the shot interrupts what it was watching for", fired.some((l) => /watching for exactly that — when it opens — and the shot interrupts it/.test(l)), true);
  check("and it's over", me.overwatch, undefined);
  check("so a second shot out of turn is refused", resolveAttack(g, shooterId, t.id, rifle, shot), { error: `It isn't Vale's turn: card ${beast.card} is up and they hold ${me.card}.` });
  check("and the Slow Action it was declared with is still spent", me.slow, true);
}

// The other four ways it ends.
{
  const { g, shooterId } = world();
  const t = newThreat("Drone", 20, 0);
  g.threats.push(t);
  startExpedition(g, { site: "", crew: [shooterId], siteId: "tanager" });
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = f.order.find((x) => x.id === shooterId)!;
  const e = g.expedition!;
  f.card = me.card;

  declareOverwatch(g, shooterId, "the corridor", "when something comes down it");
  check("moving gives it up", said(moveTo(g, shooterId, e.zones.find((z) => z.name === "Spinal Corridor")!.id), /Overwatch ends: they moved/), true);
  check("and it's gone", me.overwatch, undefined);

  me.slow = false;
  declareOverwatch(g, shooterId, "the corridor", "when something comes down it");
  const hurt: string[] = [];
  applyDamage(g, g.characters[0], { amount: 3, useArmor: false, pierce: 0, gainPressure: false, injury: null }, hurt);
  check("being hit breaks it", hurt.some((l) => /Overwatch ends/.test(l)), true);

  me.slow = false;
  declareOverwatch(g, shooterId, "the corridor", "when something comes down it");
  check("losing sight of it ends it", clearOverwatch(g, shooterId, "they lost sight of it"), "Vale's Overwatch ends: they lost sight of it.");

  // Their own next turn is the last of the five, which is a Round away when they hold the high card.
  me.slow = false;
  me.card = 7;
  f.order.find((x) => x.id === t.id)!.card = 4;
  f.card = 7;
  declareOverwatch(g, shooterId, "the corridor", "when something comes down it");
  check("the Round turning over doesn't end it", said(nextTurn(g), /Overwatch ends/), false);
  check("so it's still theirs while the Drone acts", me.overwatch?.watching, "the corridor");
  check("and their own turn coming round is what ends it", said(nextTurn(g), /Overwatch ends: their turn has come round again/), true);
}

// What a player is sent of an Overwatch: their own, and not the GM's plans for a monster.
{
  const { g, shooterId } = world();
  const t = newThreat("Drone", 20, 0);
  g.threats.push(t);
  startFight(g, { crew: [shooterId], threats: [t.id] });
  const f = g.fight!;
  const me = f.order.find((x) => x.id === shooterId)!;
  const beast = f.order.find((x) => x.id === t.id)!;
  f.card = me.card;
  declareOverwatch(g, shooterId, "the hatch", "when it opens");
  beast.overwatch = { watching: "the crawlway", trigger: "when they turn their backs" };

  const sent = playerView(g).fight!.order;
  check("their own watch is public", sent.find((x) => x.id === shooterId)!.overwatch, { watching: "the hatch", trigger: "when it opens" });
  check("the monster's is not", sent.find((x) => x.id === t.id)!.overwatch, undefined);
  check("and the key isn't even there to notice", Object.keys(sent.find((x) => x.id === t.id)!).includes("overwatch"), false);
}

// A survivor's own damage Resistance, which the engine passed "false" for until now.
{
  /** An implant installed the way the Cybernetics tab installs one: Enhanced, undamaged, integrated. */
  const implant = (c: Character, key: string, opts: { damaged?: boolean; replacement?: boolean } = {}) =>
    void c.cybernetics!.push({ id: uid(), key, location: CYBER_BY_KEY[key].name, replacement: !!opts.replacement, damaged: !!opts.damaged, lineage: [], choice: "" });

  const hit = (set?: (c: Character) => void, weapon = "Ballistic Rifle") => {
    allSixes();
    const { g, shooterId } = world();
    const id = give(g, shooterId, weapon);
    const victim = bystander(g);
    victim.cybernetics = [];
    set?.(victim);
    const before = victim.hp;
    const lines = rolled(resolveAttack(g, shooterId, victim.id, id, shot));
    return { g, victim, lost: before - victim.hp, lines };
  };

  check("3 Ballistic into bare flesh costs 3", hit().lost, 3);
  check("Kinetic Bracing halves it", hit((c) => implant(c, "kinetic-bracing")).lost, 1);
  check("and says which implant did", hit((c) => implant(c, "kinetic-bracing")).lines.some((l) => /Kinetic Bracing gives Target Ballistic Resistance/.test(l)), true);
  check("a damaged implant protects nothing", hit((c) => implant(c, "kinetic-bracing", { damaged: true })).lost, 3);
  check("nor does a Replacement", hit((c) => implant(c, "kinetic-bracing", { replacement: true })).lost, 3);
  check("and Resistance to the wrong type is no help", hit((c) => implant(c, "toxin-processor")).lost, 3);
  check("the Chemical system halves a Chemical hit", hit((c) => implant(c, "toxin-processor"), "Chemical Injector").lost, 0);

  // Where a Xenoflora dose and a GM's ruling land, for anyone with no implant at all.
  check(
    "a Resistant: Type condition halves it too",
    hit((c) => void c.conditions.push({ id: uid(), name: "Resistant: Ballistic", duration: "Persistent", notes: "Xenoflora dose" })).lost,
    1,
  );
  check("and only its own type", hit((c) => void c.conditions.push({ id: uid(), name: "Resistant: Fire", duration: "Persistent", notes: "" })).lost, 3);

  // Resistance and Vulnerability to the same type cancel out, as they do for a threat.
  check(
    "an implant and a Vulnerable mark cancel",
    hit((c) => {
      implant(c, "kinetic-bracing");
      c.conditions.push({ id: uid(), name: "Vulnerable: Ballistic", duration: "Brief", notes: "" });
    }).lost,
    3,
  );

  // A mech suppresses the Structural and Damage systems, so the frame's numbers are the ones in play.
  {
    allSixes();
    const { g, shooterId } = world();
    const id = give(g, shooterId, "Ballistic Rifle");
    const victim = bystander(g);
    victim.cybernetics = [];
    implant(victim, "kinetic-bracing");
    const mech = newMech("Dray", "utility", 1, []);
    mech.pilotId = victim.id;
    mech.deployed = true;
    g.mechs.push(mech);
    const before = victim.hp;
    resolveAttack(g, shooterId, victim.id, id, shot);
    check("a frame suppresses the plating it replaces", before - victim.hp, 3);
  }
}

// What a Damage system does to its owner's own attacks of its type.
{
  /** `weapon` null means bare hands, which is the smallest hit in the game at 1 Physical. */
  const shoot = (keys: string[], weapon: string | null, setUp?: (t: ReturnType<typeof newThreat>) => void) => {
    allSixes();
    const { g, shooterId } = world();
    const c = g.characters[0];
    c.cybernetics = keys.map((key) => ({ id: uid(), key, location: CYBER_BY_KEY[key].name, replacement: false, damaged: false, lineage: [], choice: "" }));
    const id = weapon ? give(g, shooterId, weapon) : null;
    const t = newThreat("Drone", 20, 0);
    setUp?.(t);
    g.threats.push(t);
    const r = resolveAttack(g, shooterId, t.id, id, { ...shot, zones: 0 });
    const all = "lines" in r ? r.lines : [{ text: r.error }];
    return { t, lost: 20 - t.stats!.hp, armor: t.stats!.armor, lines: text(all.filter((l) => !l.gm)), gm: text(all.filter((l) => l.gm)) };
  };

  // 20% of a 3-damage rifle rounds up to 1, and 40% to 2.
  check("a Tier II Ballistic system adds 1 to a 3-damage rifle", shoot(["reactive-ballistic-lattice"], "Ballistic Rifle").lost, 4);
  check("and Tier III adds 2", shoot(["kinetic-rejection-array"], "Ballistic Rifle").lost, 5);
  check("a Tier III integrating its Tier II doesn't add both", shoot(["reactive-ballistic-lattice", "kinetic-rejection-array"], "Ballistic Rifle").lost, 5);
  check("and it does nothing for another type", shoot(["reactive-ballistic-lattice"], "Cleaver").lost, 3);
  check("while a Physical system pays for the cleaver", shoot(["powered-skeletal-lattice"], "Cleaver").lost, 4);

  // The share is what keeps a system worth its Load on a big weapon: a 6-damage rocket gets 2 and 3
  // where the rifle got 1 and 2, and rounding up means the smallest hit there is still gets 1.
  check("a 6-damage rocket is bare without a system", shoot([], "Rocket Launcher").lost, 6);
  check("a Tier II Fire system takes 20% of it, rounded up", shoot(["heat-exchange-network"], "Rocket Launcher").lost, 8);
  check("and Tier III takes 40%", shoot(["closed-thermal-reactor"], "Rocket Launcher").lost, 9);
  check("the log names the share it took", shoot(["closed-thermal-reactor"], "Rocket Launcher").lines.some((l) => l === "Vale's Closed Thermal Reactor: +3 Fire damage (40%)."), true);
  check("a bare fist still gets its point at Tier II", shoot(["powered-skeletal-lattice"], null).lost, 2);
  check("and rounding up can't make Tier III give more", shoot(["inertial-dominance-frame"], null).lost, 2);

  // The Ballistic signature: a step of the target's Cover, and all of it at Tier III.
  const covered = (keys: string[], cover: "partial" | "strong") => {
    allSixes();
    const { g, shooterId } = world();
    const c = g.characters[0];
    c.cybernetics = keys.map((key) => ({ id: uid(), key, location: CYBER_BY_KEY[key].name, replacement: false, damaged: false, lineage: [], choice: "" }));
    const id = give(g, shooterId, "Ballistic Rifle");
    const t = newThreat("Drone", 20, 0);
    g.threats.push(t);
    resolveAttack(g, shooterId, t.id, id, { ...shot, cover });
    return 20 - t.stats!.hp;
  };
  check("Strong Cover stops 2 of a rifle's 3", covered([], "strong"), 1);
  check("a Tier II Ballistic system looks through a point of it", covered(["reactive-ballistic-lattice"], "strong"), 3);
  check("and Tier III through all of it", covered(["kinetic-rejection-array"], "strong"), 5);
  check("with nothing left to look through, the damage still lands", covered(["kinetic-rejection-array"], "partial"), 5);

  // The Physical signature: plating stripped past the one point every hit takes.
  const plated = shoot(["powered-skeletal-lattice"], "Cleaver", (t) => void (t.stats!.armor = 4));
  check("a Tier II Physical system takes 2 points of plating", plated.armor, 2);
  check("and the usual 1 is still absorbed", plated.lost, 3);
  check("Tier III takes 3", shoot(["inertial-dominance-frame"], "Cleaver", (t) => void (t.stats!.armor = 4)).armor, 1);
  check("and never more than there is", shoot(["inertial-dominance-frame"], "Cleaver", (t) => void (t.stats!.armor = 1)).armor, 0);
  check("the log says what the system did", plated.lines.some((l) => l === "Vale's Powered Skeletal Lattice: +1 Physical damage (20%)."), true);
  check("the plating it cost is the GM's to read", plated.gm.some((l) => l === "It strips 1 more point of Drone's Armor."), true);
  check("and the crew is never told the Drone had plating", plated.lines.some((l) => /plating|armor|absorb/i.test(l)), false);
}

{
  // The Interface ladder: what a pilot's own connection lends the frame they climb into.
  const frame = (keys: string[], opts: { replacement?: boolean; damaged?: boolean } = {}) => {
    const { g } = world();
    const pilot = g.characters[0];
    pilot.cybernetics = keys.map((key) => ({ id: uid(), key, location: CYBER_BY_KEY[key].name, replacement: !!opts.replacement, damaged: !!opts.damaged, lineage: [], choice: "" }));
    const m = newMech("Dray", "utility", 1, []);
    m.pilotId = pilot.id;
    g.mechs.push(m);
    return mechStats(g, m);
  };
  const bare = frame([]).maxHp;
  check("an unaugmented pilot lends the frame nothing", frame([]).plugged, 0);
  check("a Tier I Interface system is still nothing", frame(["mech-control-interface"]).plugged, 0);
  check("Tier II lends it 2 Mech HP", frame(["neural-mech-integration"]).maxHp - bare, 2);
  check("Tier III lends it 4", frame(["total-mech-integration"]).maxHp - bare, 4);
  check("and a Tier III integrating its Tier II doesn't lend both", frame(["neural-mech-integration", "total-mech-integration"]).plugged, 4);
  check("a damaged implant lends nothing", frame(["total-mech-integration"], { damaged: true }).plugged, 0);
  check("nor does a Replacement", frame(["total-mech-integration"], { replacement: true }).plugged, 0);
  check("and another system's Tier III is no help to the frame", frame(["full-skeletal-lattice"]).plugged, 0);
}

{
  // A hazard catches whoever is still standing in it when their turn ends, which is the half that
  // costs nobody an action — including on a threat's own turn.
  const { g } = world();
  const [vale] = g.characters;
  vale.armor = 0;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const here = zoneOf(g.expedition!, vale.id)!;
  const t = newThreat("Drone", 20, 0);
  t.zone = here.id;
  g.threats.push(t);
  plantHazard(g, here.id, { ...PRESET_BY_KEY["burning-zone"], source: "Inferno Projector" });
  startFight(g, { crew: [vale.id], threats: [t.id], threatsShareCard: true });
  const before = [vale.hp, t.stats!.hp];
  const lines: (string | Line)[] = [];
  // Round the whole order, so every combatant's turn ends once.
  for (let i = 0; i < DECK_SIZE + 1 && g.fight; i++) lines.push(...nextTurn(g));
  check("the fire catches the crew when their turn ends", before[0] - vale.hp > 0, true);
  check("and the Drone on its own turn, for nothing", before[1] - t.stats!.hp > 0, true);
  check("the damage to a threat stays the GM's", text(lines.filter((l): l is Line => typeof l !== "string" && !!l.gm)).some((x) => /Drone takes \d+ Fire damage from the burning zone/.test(x)), true);
  check("but the crew is told the Drone is burning", text(lines.filter((l) => typeof l === "string" || !l.gm)).some((x) => x === "Drone is now Burning."), true);
}

{
  // The Cybernetic Integration Port: one suppressed implant keeps working inside the frame.
  const piloted = (port: { choice?: string; damaged?: boolean } | null) => {
    allSixes();
    const { g, shooterId } = world();
    const c = g.characters[0];
    c.cybernetics = [{ id: uid(), key: "closed-thermal-reactor", location: CYBER_BY_KEY["closed-thermal-reactor"].name, replacement: false, damaged: false, lineage: [], choice: "" }];
    const m = newMech("Dray", "utility", 1, []);
    m.pilotId = c.id;
    m.deployed = true;
    if (port) m.modules.push({ id: uid(), key: "cybernetic-integration-port", damaged: !!port.damaged, choice: port.choice });
    g.mechs.push(m);
    const id = give(g, shooterId, "Rocket Launcher");
    const t = newThreat("Drone", 30, 0);
    g.threats.push(t);
    resolveAttack(g, shooterId, t.id, id, { ...shot, zones: 0 });
    return { lost: 30 - t.stats!.hp, resisted: damageResistance(g, c, "Fire").length };
  };
  check("a frame suppresses a Fire system, so the rocket is bare", piloted(null).lost, 6);
  check("and the pilot loses its Resistance too", piloted(null).resisted, 0);
  check("a Port with nothing chosen connects nothing", piloted({}).lost, 6);
  check("porting the implant brings its 40% back inside the frame", piloted({ choice: "closed-thermal-reactor" }).lost, 9);
  check("and its Resistance with it", piloted({ choice: "closed-thermal-reactor" }).resisted, 1);
  check("a damaged Port connects nothing", piloted({ choice: "closed-thermal-reactor", damaged: true }).lost, 6);
  check("and a Port can't connect an implant the pilot doesn't have", piloted({ choice: "closed-circuit-nervous-system" }).lost, 6);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
