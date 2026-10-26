import {
  ATTRIBUTES,
  BACKGROUND_BY_KEY,
  HULL_TIERS,
  MAX_SKILL_LEVEL,
  OVERLOAD_BONUS,
  pressureTip,
  SKILLS,
  stressBand,
  type Attribute,
  type SkillKey,
} from "./rules";
import { cyberAttr, cyberMaxEnergy, cyberMaxHp } from "./cyber";
import { mechModules, mechStats, pilotedMech } from "./mechs";
import type { Character, GameState, Item, Room, Ship } from "./types";

export function skillLevel(c: Character, key: SkillKey) {
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  const bonus = bg?.skills[key] ?? 0;
  const cultivar = key === "botany" && c.specialty === "Closed-Loop Cultivation" ? 2 : 0;
  return Math.min(MAX_SKILL_LEVEL, c.skills[key] + bonus) + cultivar;
}

/** Where an attribute's bonuses come from: background, manual modifier, skills at level 10, and cybernetics. */
export function attributeBonuses(c: Character, attr: Attribute) {
  const bg = c.background ? BACKGROUND_BY_KEY[c.background] : undefined;
  const mastery = SKILLS.filter((s) => s.attr === attr && Math.min(MAX_SKILL_LEVEL, c.skills[s.key] + (bg?.skills[s.key] ?? 0)) >= MAX_SKILL_LEVEL).length;
  return { background: bg?.attributes[attr] ?? 0, mod: c.attributeMods[attr], mastery, cyber: cyberAttr(c, attr) };
}

export function attributeValue(c: Character, attr: Attribute) {
  const b = attributeBonuses(c, attr);
  return Math.max(1, c.attributes[attr] + b.background + b.mod + b.mastery + b.cyber);
}

export function allAttributes(c: Character) {
  return Object.fromEntries(ATTRIBUTES.map((a) => [a, attributeValue(c, a)])) as Record<Attribute, number>;
}

export function maxHp(c: Character) {
  const str = attributeValue(c, "STR");
  const con = attributeValue(c, "CON");
  return Math.max(0, 8 + (str - 1) + 2 * (con - 1) + c.maxHpMod + cyberMaxHp(c));
}

export function baseMaxEnergy(c: Character) {
  const con = attributeValue(c, "CON");
  return 3 + Math.floor((con - 1) / 2);
}

export function maxEnergy(c: Character) {
  return Math.max(0, baseMaxEnergy(c) + c.maxEnergyMod + cyberMaxEnergy(c) - c.survival.energyPenalty);
}

export function maxWillpower(c: Character) {
  const con = attributeValue(c, "CON");
  return Math.max(0, 1 + Math.floor((con - 1) / 3) + c.maxWillpowerMod);
}

export const HEAVY_SLOTS = 2;

/** Slots an item takes when carried. `heavyCost` is lower while a mech takes the weight. */
export function itemSlots(item: Item, heavyCost = HEAVY_SLOTS) {
  return item.qty * (item.heavy ? heavyCost : 1);
}

/** What a deployed, working mech does for its pilot's Heavy items. */
export function heavyRelief(state: GameState, characterId: string) {
  const mech = pilotedMech(state, characterId);
  const none = { heavyCost: HEAVY_SLOTS, freeHeavy: 0, noSlow: false, source: null as string | null };
  if (!mech || mechStats(state, mech).offline) return none;
  const live = new Set(mechModules(mech).filter((x) => !x.inst.damaged).map((x) => x.def.key));
  const light = mech.chassis === "utility" || live.has("reinforced-cargo-assembly");
  return {
    heavyCost: light ? 1 : HEAVY_SLOTS,
    freeHeavy: live.has("salvage-clamps") ? 1 : 0,
    noSlow: live.has("heavy-lift-actuators"),
    source: mech.name,
  };
}

/** Base carrying capacity: Strength + a third of Scavenging. */
export function inventorySlots(c: Character) {
  const brokenArm = c.injuries.some((i) => i.name === "Broken Arm" && i.state !== "Treated") ? 2 : 0;
  return Math.max(0, attributeValue(c, "STR") + Math.floor(skillLevel(c, "scavenging") / 3) - brokenArm);
}

export const CONTINGENCY_SLOTS = 2;

export const hasContingencyPack = (c: Character) => c.background === "quartermaster";
export const isLoadmaster = (c: Character) => c.background === "quartermaster" && c.specialty === "Loadmaster";

/** The Loadmaster's pool that `characterId` belongs to, if any. */
export function poolFor(state: GameState, characterId: string) {
  for (const owner of state.characters) {
    if (!owner.pool || !isLoadmaster(owner)) continue;
    const members = owner.pool.filter((id) => state.characters.some((c) => c.id === id));
    if (members.includes(characterId)) return { owner, members };
  }
  return null;
}

export function poolUsage(state: GameState, members: string[]) {
  const items = state.items.filter((i) => i.shared && members.includes(i.location));
  return { items, used: items.reduce((n, i) => n + itemSlots(i), 0), capacity: members.length };
}

export function contingencyFor(state: GameState, c: Character) {
  if (!c.contingency || !hasContingencyPack(c)) return null;
  const revealed = state.items.filter((i) => i.location === c.id && i.contingency);
  const filled = Math.min(c.contingency.slots, revealed.reduce((n, i) => n + i.qty, 0));
  return { ...c.contingency, revealed, undecided: c.contingency.slots - filled };
}

/** Personal slots after giving one to a shared pool. */
export function carrySlots(state: GameState, c: Character) {
  const mech = pilotedMech(state, c.id);
  return Math.max(0, inventorySlots(c) - (poolFor(state, c.id) ? 1 : 0) + (mech ? mechStats(state, mech).inventory : 0));
}

export function inventoryFor(state: GameState, location: string) {
  return state.items.filter((i) => i.location === location);
}

/** The armor a survivor wears in their Armor Slot: their best carried piece. It takes no inventory slot. */
export function wornArmor(state: GameState, characterId: string): Item | null {
  const pieces = inventoryFor(state, characterId).filter((i) => i.category === "Armor" && !i.shared && i.qty > 0);
  return pieces.sort((a, b) => Number(a.broken) - Number(b.broken) || (b.armor ?? 0) - (a.armor ?? 0))[0] ?? null;
}

/** Personal slots in use: carried items outside the shared pool and the Armor Slot, plus undecided Contingency Slots. */
export function usedSlots(state: GameState, characterId: string) {
  const pooled = !!poolFor(state, characterId);
  const relief = heavyRelief(state, characterId);
  const carried = inventoryFor(state, characterId).filter((i) => !(pooled && i.shared));
  const heavyCount = carried.filter((i) => i.heavy).reduce((n, i) => n + i.qty, 0);
  const worn = wornArmor(state, characterId);
  const items =
    carried.reduce((sum, i) => sum + itemSlots(i, relief.heavyCost), 0) -
    Math.min(relief.freeHeavy, heavyCount) * relief.heavyCost -
    (worn ? itemSlots({ ...worn, qty: 1 }, relief.heavyCost) : 0);
  const c = state.characters.find((x) => x.id === characterId);
  return items + (c ? (contingencyFor(state, c)?.undecided ?? 0) : 0);
}

/** Carrying a Heavy item slows a character unless their mech's actuators take the load. */
export function slowedByHeavy(state: GameState, characterId: string) {
  return state.items.some((i) => i.location === characterId && i.heavy && i.qty > 0) && !heavyRelief(state, characterId).noSlow;
}

export function creationSpend(c: Character) {
  const attrPoints = ATTRIBUTES.reduce((s, a) => s + (c.attributes[a] - 1), 0);
  const skillXp = SKILLS.reduce((s, sk) => s + (c.skills[sk.key] * (c.skills[sk.key] + 1)) / 2, 0);
  return { attrPoints, skillXp };
}

export function hullTier(ship: Ship) {
  return HULL_TIERS[ship.hullTier] ?? HULL_TIERS[0];
}

export function roomWorks(r: Room) {
  return r.active && r.condition !== "Offline" && r.condition !== "Destroyed";
}

export function power(ship: Ship) {
  const generated = ship.rooms.filter(roomWorks).reduce((s, r) => s + r.powerOutput, 0) + (ship.overloaded ? OVERLOAD_BONUS : 0) + (ship.tuned ? 1 : 0);
  const draw = ship.rooms.filter(roomWorks).reduce((s, r) => s + r.powerDraw, 0);
  return { generated, draw, surplus: generated - draw };
}

export function hasWorkingModule(ship: Ship, moduleName: string) {
  return ship.rooms.some((r) => r.module === moduleName && roomWorks(r));
}

export function supplyCount(state: GameState, name: string, location = "ship") {
  return state.items.filter((i) => i.name === name && (location === "*" || i.location === location)).reduce((s, i) => s + i.qty, 0);
}

/** Items that feed a survivor for a day. */
const FOOD_ITEMS = ["Prepared Meal", "Food Unit"] as const;

export const foodCount = (state: GameState, location = "ship") => FOOD_ITEMS.reduce((s, n) => s + supplyCount(state, n, location), 0);

export function characterAlerts(state: GameState, c: Character) {
  const alerts: { text: string; tone: "danger" | "warn"; tip: string }[] = [];
  if (c.dead) return [{ text: "Dead", tone: "danger" as const, tip: "This survivor has died. They take no tasks and are skipped at End of Day." }];
  if (c.hp <= 0) alerts.push({ text: "Down — death checks", tone: "danger", tip: "At 0 HP. Make a flat Constitution death check each round until someone stabilizes or heals them." });
  const untreated = c.injuries.filter((i) => i.state === "Untreated").length;
  if (untreated) alerts.push({ text: `${untreated} untreated injur${untreated > 1 ? "ies" : "y"}`, tone: "warn", tip: `Each untreated injury costs 1 HP at End of Day (−${untreated} tonight). Treat it with First Aid or Surgery to stop the loss.` });
  if (c.energy <= 0) alerts.push({ text: "Exhausted", tone: "warn", tip: "No Energy left. They can't take tasks that cost Energy until they Rest or sleep." });
  if (c.pressure >= 4) alerts.push({ text: "Panicked", tone: "danger", tip: pressureTip(c.pressure) });
  if (c.stress >= 9) alerts.push({ text: `Stress ${c.stress}`, tone: "danger", tip: `${stressBand(c.stress).name}: ${stressBand(c.stress).effect}` });
  const used = usedSlots(state, c.id);
  const slots = carrySlots(state, c);
  if (used > slots) alerts.push({ text: "Over-encumbered", tone: "warn", tip: `Carrying ${used} slots of ${slots}. Drop or stow items in the hold to get back under capacity.` });
  if (slowedByHeavy(state, c.id)) alerts.push({ text: "Slowed: Heavy load", tone: "warn", tip: "Carrying a Heavy item slows them unless a piloted mech's actuators take the load." });
  if (c.survival.waterMissStreak >= 1) alerts.push({ text: "Dehydrated", tone: "danger", tip: `${c.survival.waterMissStreak} day${c.survival.waterMissStreak > 1 ? "s" : ""} without Water. One day costs 2 Max Energy; two days means death without immediate intervention.` });
  return alerts;
}
