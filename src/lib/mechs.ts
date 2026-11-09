import { CHASSIS, MECH_DAMAGE_TYPES, MECH_TIERS, MODULE_BY_KEY, type MechModule } from "@/data/mechs";
import { UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { uid } from "./dice";
import { scaleDamage } from "./rules";
import type { Character, GameState, Mech, MechChassis, MechDamageType } from "./types";

export const isMechExpert = (c: Character | undefined) => c?.specialty === "Mech Expert";

export function mechModules(m: Mech) {
  return m.modules.flatMap((x) => (MODULE_BY_KEY[x.key] ? [{ inst: x, def: MODULE_BY_KEY[x.key] }] : []));
}

/**
 * Armor Points the mech's plating provides when it's intact: the frame's own, which no damage can take
 * away for good, plus every working Defensive module. Damaged modules protect nothing.
 */
export const maxMechArmor = (m: Mech) =>
  MECH_TIERS[m.tier].armor + mechModules(m).reduce((s, x) => s + (x.inst.damaged ? 0 : x.def.armor ?? 0), 0);

export function mechStats(g: GameState, m: Mech) {
  const chassis = CHASSIS[m.chassis];
  const tier = MECH_TIERS[m.tier];
  const pilot = g.characters.find((c) => c.id === m.pilotId);
  const expert = isMechExpert(pilot);
  const mods = mechModules(m);
  const live = mods.filter((x) => !x.inst.damaged);
  const maxArmor = maxMechArmor(m);
  const resist = Object.fromEntries(MECH_DAMAGE_TYPES.map((t) => [t, 0])) as Record<MechDamageType, number>;
  for (const t of m.tierResist) resist[t] += 1;
  for (const x of live) if (x.def.resist) resist[x.def.resist] += 1;
  return {
    chassis,
    maxHp: chassis.hp + tier.hpBonus + live.reduce((s, x) => s + (x.def.hp ?? 0), 0) + (expert ? 4 : 0),
    slots: tier.slots + (expert ? 1 : 0),
    usedSlots: mods.reduce((s, x) => s + x.def.slots, 0),
    hardpoints: chassis.hardpoints,
    usedHardpoints: mods.filter((x) => x.def.weapon).length,
    maxArmor,
    // Clamped on the way out, so losing or damaging a plating module can't leave stale points behind.
    armor: Math.min(m.armor, maxArmor),
    inventory: chassis.inventory + live.reduce((s, x) => s + (x.def.inventory ?? 0), 0),
    frame: tier.frame,
    cells: tier.cells,
    resist,
    expert,
    offline: m.hp <= 0 || m.upgrading,
  };
}

/** Why a module can't go into this mech, or null. */
export function moduleBlocker(g: GameState, m: Mech, def: MechModule) {
  const s = mechStats(g, m);
  if (def.tier > m.tier) return `Needs a Tier ${"I".repeat(def.tier)} frame`;
  if (s.usedSlots + def.slots > s.slots) return "Not enough Module Slots";
  if (def.weapon && s.usedHardpoints >= s.hardpoints) return "No free Hardpoint";
  return null;
}

/** Berths aboard: the best working Storage Bay, or the one berth every ship has. */
export function mechCapacity(g: GameState) {
  const ladder = UPGRADE_LADDERS["Storage Bay"].levels;
  const bays = g.ship.rooms.filter((r) => r.module === "Storage Bay" && r.condition !== "Destroyed" && r.level !== undefined);
  const best = Math.max(1, ...bays.map((r) => ladder[r.level!]?.mechs ?? 1));
  return { capacity: best, used: g.mechs.filter((m) => !m.external).length };
}

export const pilotedMech = (g: GameState, characterId: string) => g.mechs.find((m) => m.pilotId === characterId && m.deployed && m.hp > 0 && !m.upgrading);

/**
 * Resolve an attack against a mech: Vulnerability, Resistance, Cover (Ballistic only), Armor, then Mech HP.
 * Any Resistance to the type counts once; extra sources don't stack.
 * Mech Armor is ablative like a survivor's: it absorbs 1 and the plating loses a point, so the caller
 * spends `armored` out of `m.armor`. What's left after the mech hits 0 passes to the pilot. An Offline
 * mech protects no one.
 */
export function resolveMechDamage(g: GameState, m: Mech, amount: number, type: MechDamageType | "Other", cover: number, vulnerable = false) {
  const s = mechStats(g, m);
  const coverPoints = type === "Ballistic" ? cover : 0;
  if (m.hp <= 0) return { vulnerable: 0, resisted: 0, covered: 0, armored: 0, toMech: 0, excess: Math.max(0, amount - coverPoints) };
  const resistant = type !== "Other" && s.resist[type] > 0;
  const scaled = scaleDamage(amount, resistant, vulnerable);
  const covered = Math.min(scaled, coverPoints);
  const armored = s.armor > 0 && scaled - covered > 0 ? 1 : 0;
  const after = scaled - covered - armored;
  const toMech = Math.min(m.hp, after);
  return { vulnerable: Math.max(0, scaled - amount), resisted: Math.max(0, amount - scaled), covered, armored, toMech, excess: after - toMech };
}

export function newMech(name: string, chassis: MechChassis, tier: 1 | 2 | 3, tierResist: MechDamageType[]): Mech {
  const hp = CHASSIS[chassis].hp + MECH_TIERS[tier].hpBonus;
  // A frame rolls out of the bay fully plated.
  const armor = MECH_TIERS[tier].armor;
  return { id: uid(), name, chassis, tier, hp, armor, plated: true, tierResist, modules: [], pilotId: null, deployed: false, external: false, upgrading: false, conditions: [], notes: "" };
}
