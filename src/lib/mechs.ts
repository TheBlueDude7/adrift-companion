import { CHASSIS, MECH_DAMAGE_TYPES, MECH_TIERS, MODULE_BY_KEY, type MechModule } from "@/data/mechs";
import { UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { uid } from "./dice";
import type { Character, GameState, Mech, MechChassis, MechDamageType } from "./types";

export const isMechExpert = (c: Character | undefined) => c?.specialty === "Mech Expert";

export function mechModules(m: Mech) {
  return m.modules.flatMap((x) => (MODULE_BY_KEY[x.key] ? [{ inst: x, def: MODULE_BY_KEY[x.key] }] : []));
}

export function mechStats(g: GameState, m: Mech) {
  const chassis = CHASSIS[m.chassis];
  const tier = MECH_TIERS[m.tier];
  const pilot = g.characters.find((c) => c.id === m.pilotId);
  const expert = isMechExpert(pilot);
  const mods = mechModules(m);
  const live = mods.filter((x) => !x.inst.damaged);
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
    armor: live.reduce((s, x) => s + (x.def.armor ?? 0), 0),
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
 * Resolve an attack against a mech: Resistance, then Cover, then Mech HP.
 * What's left after the mech hits 0 passes to the pilot. An Offline mech protects no one.
 */
export function resolveMechDamage(g: GameState, m: Mech, amount: number, type: MechDamageType | "Other", cover: number) {
  const s = mechStats(g, m);
  if (m.hp <= 0) return { resisted: 0, toMech: 0, excess: Math.max(0, amount - cover) };
  const resisted = type === "Other" ? 0 : Math.min(amount, s.resist[type]);
  const after = Math.max(0, amount - resisted - cover);
  const toMech = Math.min(m.hp, after);
  return { resisted, toMech, excess: after - toMech };
}

export function newMech(name: string, chassis: MechChassis, tier: 1 | 2 | 3, tierResist: MechDamageType[]): Mech {
  const hp = CHASSIS[chassis].hp + MECH_TIERS[tier].hpBonus;
  return { id: uid(), name, chassis, tier, hp, tierResist, modules: [], pilotId: null, deployed: false, external: false, upgrading: false, conditions: [], notes: "" };
}
