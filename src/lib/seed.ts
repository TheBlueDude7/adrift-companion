import { ladderFor } from "@/data/ship-upgrades";
import { defaultMaps } from "./maps";
import { uid } from "./dice";
import { maxEnergy, maxHp, maxWillpower } from "./derive";
import { DEFAULT_ITEM_TEMPLATES, MODULE_PRESETS, SKILLS, type ItemTemplate, type SkillKey } from "./rules";
import type { Character, GameState, Item, Room } from "./types";

export function emptySkills(): Record<SkillKey, number> {
  return Object.fromEntries(SKILLS.map((s) => [s.key, 0])) as Record<SkillKey, number>;
}

export function newCharacter(name: string, background: string | null, specialty: string | null, player = ""): Character {
  const c: Character = {
    id: uid(),
    name,
    player,
    background,
    specialty,
    attributes: { STR: 1, CON: 1, INT: 1, WIT: 1 },
    attributeMods: { STR: 0, CON: 0, INT: 0, WIT: 0 },
    skills: emptySkills(),
    skillXp: emptySkills(),
    hp: 0,
    energy: 0,
    willpower: 0,
    maxHpMod: 0,
    maxEnergyMod: 0,
    maxWillpowerMod: 0,
    armor: 0,
    pressure: 0,
    stress: 0,
    injuries: [],
    afflictions: [],
    conditions: [],
    survival: {
      food: "none",
      water: false,
      rests: 0,
      foodMissStreak: 0,
      waterMissStreak: 0,
      sleepMissStreak: 0,
      rationStreak: 0,
      energyPenalty: 0,
      restBlocked: false,
      pressureGainedToday: false,
    },
    abilityUsed: {},
    dead: false,
    notes: "",
  };
  c.hp = maxHp(c);
  c.energy = maxEnergy(c);
  c.willpower = maxWillpower(c);
  return c;
}

export function itemFromTemplate(t: ItemTemplate, qty: number, location: string): Item {
  return {
    id: uid(),
    name: t.name,
    category: t.category,
    tier: t.tier,
    qty,
    charges: t.maxCharges,
    maxCharges: t.maxCharges,
    armor: t.armor,
    heavy: t.heavy,
    broken: false,
    notes: t.notes ?? "",
    location,
  };
}

export function roomFromPreset(moduleName: string | null, name?: string, level?: number): Room {
  const preset = MODULE_PRESETS.find((m) => m.name === moduleName);
  const ladder = ladderFor(moduleName);
  const start = ladder ? (level ?? 0) : undefined;
  return {
    id: uid(),
    name: name ?? moduleName ?? "Empty Room",
    module: moduleName,
    level: start,
    grade: (ladder && start !== undefined ? ladder.levels[start].grade : undefined) ?? "Grade I",
    powerDraw: preset?.powerDraw ?? 0,
    powerOutput: preset?.powerOutput ?? 0,
    condition: "Operational",
    active: true,
    essential: preset?.essential ?? false,
    notes: "",
  };
}

const tpl = (name: string) => DEFAULT_ITEM_TEMPLATES.find((t) => t.name === name)!;

export function createInitialState(): GameState {
  const rooms: Room[] = [
    roomFromPreset("Fusion Reactor", undefined, 1),
    roomFromPreset("Life Support", undefined, 1),
    { ...roomFromPreset("Engine Section", undefined, 1), condition: "Damaged" },
    roomFromPreset("Navigation & Sensor Suite", undefined, 1),
    roomFromPreset("Crew Quarters"),
    roomFromPreset("Workshop / Fabrication Bay", "Workshop", 1),
    { ...roomFromPreset("Medical Bay", undefined, 1), condition: "Critical", active: false },
    roomFromPreset("Storage Bay", "Cargo Hold", 0),
  ];
  const stock: [string, number][] = [
    ["Food Unit", 8],
    ["Water Unit", 10],
    ["Fuel Unit", 3],
    ["Flickering Power Cell", 2],
    ["Scrap Metal", 6],
    ["Scrap Components", 4],
    ["Basic Adhesive", 2],
    ["Medical Supply", 2],
    ["Medkit", 1],
    ["Improvised Toolkit", 1],
  ];
  return {
    version: 1,
    maps: defaultMaps(),
    campaign: "Adrift",
    day: 1,
    segment: 0,
    act: 1,
    characters: [],
    items: stock.map(([n, q]) => itemFromTemplate(tpl(n), q, "ship")),
    catalog: DEFAULT_ITEM_TEMPLATES,
    ship: {
      name: "Unnamed Derelict",
      hullTier: 1,
      hullHp: 3,
      tempHull: 0,
      catastrophicEvents: 0,
      destroyed: false,
      overloaded: false,
      location: "Debris field where the battle ended",
      rooms,
      projects: [],
    },
    mechs: [],
    research: { cybernetics: [] },
    actions: [],
    log: [
      {
        id: uid(),
        at: Date.now(),
        day: 1,
        segment: 0,
        kind: "day",
        text: "Day 1 begins. The battle is over. You are still breathing.",
      },
    ],
  };
}

export function sampleCrew(): Character[] {
  const eng = newCharacter("Ines Vatanen", "engineer", "Field Improviser");
  eng.attributes = { STR: 2, CON: 3, INT: 3, WIT: 1 };
  Object.assign(eng.skills, { engineering: 4, mechTech: 3, scavenging: 3, firstAid: 1 });
  const med = newCharacter("Dr. Osei Mbeki", "medic", "Combat Medic");
  med.attributes = { STR: 1, CON: 3, INT: 3, WIT: 2 };
  Object.assign(med.skills, { firstAid: 3, surgery: 3, biology: 2, entertainer: 1, cooking: 1 });
  const mar = newCharacter("Sgt. Rook Halloran", "marine", "Close-Quarters Doctrine");
  mar.attributes = { STR: 3, CON: 3, INT: 1, WIT: 2 };
  Object.assign(mar.skills, { closeCombat: 4, lightFirearms: 2, perception: 3, stealth: 1 });
  const qm = newCharacter("Tamsin Okafor", "quartermaster", "Loadmaster");
  qm.attributes = { STR: 3, CON: 2, INT: 2, WIT: 2 };
  Object.assign(qm.skills, { scavenging: 3, cooking: 1, perception: 2, engineering: 1 });
  for (const c of [eng, med, mar, qm]) {
    c.hp = maxHp(c);
    c.energy = maxEnergy(c);
    c.willpower = maxWillpower(c);
  }
  return [eng, med, mar, qm];
}
