import { attackBlocker, deathCheck, newThreat, resolveAttack, UNARMED } from "../src/lib/combat";
import { newCharacter, createInitialState, itemFromTemplate } from "../src/lib/seed";
import { DEFAULT_ITEM_TEMPLATES } from "../src/lib/rules";
import type { GameState } from "../src/lib/types";

const tpl = (name: string) => DEFAULT_ITEM_TEMPLATES.find((t) => t.name === name)!;

/** Every die a 6, so a case tests the arithmetic rather than the luck. */
const allSixes = () => void (Math.random = () => 0.9);
/** Nothing but ones. */
const allOnes = () => void (Math.random = () => 0);

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
  check("rifle on an unarmored drone", g.threats[0].hp, 7);
}

// Strong Cover is 2 points and only counts against Ballistic.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, { ...shot, cover: "strong" });
  check("rifle into Strong Cover", g.threats[0].hp, 9);
}

// Fire ignores Cover entirely.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  const t = newThreat("Drone", 10, 0);
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, { ...shot, cover: "strong" });
  check("rocket ignores Cover", g.threats[0].hp, 4);
}

// Resistance halves, rounding down.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  const t = { ...newThreat("Hardened Drone", 10, 0), resist: ["Ballistic" as const] };
  g.threats.push(t);
  resolveAttack(g, shooterId, t.id, id, shot);
  check("Resistance halves 3 to 1", g.threats[0].hp, 9);
}

// Plating is ablative: it stops 1 and loses a point.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  g.threats.push(newThreat("Plated Drone", 10, 2));
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("plating absorbs 1", [g.threats[0].hp, g.threats[0].armor], [8, 1]);
}

// "Pierces Armor" gets past the plating.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Chemical Injector");
  g.threats.push(newThreat("Plated Drone", 10, 2));
  resolveAttack(g, shooterId, g.threats[0].id, id, { ...shot, zones: 0 });
  check("injector pierces plating", [g.threats[0].hp, g.threats[0].armor], [9, 2]);
}

// Immunity is absolute.
{
  allSixes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Rocket Launcher");
  g.threats.push({ ...newThreat("Fireproof Thing", 10, 0), immune: ["Fire" as const] });
  resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("immune to Fire", g.threats[0].hp, 10);
}

// A miss changes nothing.
{
  allOnes();
  const { g, shooterId } = world();
  const id = give(g, shooterId, "Ballistic Rifle");
  g.threats.push(newThreat("Drone", 10, 0));
  const r = resolveAttack(g, shooterId, g.threats[0].id, id, shot);
  check("a miss leaves it untouched", [g.threats[0].hp, "hits" in r ? r.hits : -1], [10, 0]);
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

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
