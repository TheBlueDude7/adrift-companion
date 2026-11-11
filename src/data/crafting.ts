import type { ItemCategory, ItemTier, WeaponProfile } from "@/lib/rules";
import type { Recipe } from "./cybernetics";

export type Station = "workshop" | "kitchen" | "cyberlab";

export type CraftRecipe = {
  name: string;
  category: ItemCategory;
  tier?: ItemTier;
  /** Routine skill requirement, when the crafting tree lists one. */
  skill?: string;
  inputs: Recipe;
  toolkit?: number;
  /** Where it's made. Workshop recipes need a Workshop that handles their material tier. */
  station?: Station;
  /** Minimum level name at the station, when a specific upgrade is required. */
  stationLevel?: string;
  output: number;
  /** For Tasks with a different result on failure, like cooking. */
  onFailure?: { name: string; qty: number };
  charges?: number;
  armor?: number;
  /** Takes two inventory slots to carry, which is every mech module. */
  heavy?: boolean;
  /** What it does when it hits, for the weapons. Read from `notes`, which stays the prose version. */
  weapon?: WeaponProfile;
  notes: string;
};

const r = (...parts: [number, string][]): Recipe => parts.map(([qty, name]) => ({ name, qty }));

export const RECIPES: CraftRecipe[] = [
  // Power
  { name: "Flickering Power Cell", category: "Supply", tier: "Tier I", skill: "Mechanical Technician 3", inputs: r([1, "Scrap Metal"], [1, "Scrap Components"], [1, "Fuel Unit"]), station: "workshop", output: 1, notes: "Moves the ship one tile, or powers a Tier I mech. 1 use." },
  { name: "Power Cell", category: "Supply", tier: "Tier II", skill: "Mechanical Technician 6", inputs: r([1, "Reinforced Steel"], [1, "Components"], [1, "Fuel Unit"]), toolkit: 1, station: "workshop", output: 1, notes: "Moves the ship up to two tiles, or powers a mech up to Tier II. 1 use." },
  { name: "Advanced Power Cell", category: "Supply", tier: "Tier III", inputs: r([1, "Neutronium"], [1, "Components"], [1, "Fuel Unit"]), toolkit: 1, station: "workshop", output: 1, notes: "Moves the ship up to four tiles, or powers a mech up to Tier III. 1 use." },

  // Medical
  { name: "Improvised Medkit", category: "Medical", tier: "Tier I", skill: "Mechanical Technician 3 or First Aid 3", inputs: r([1, "Scrap Metal"], [2, "Basic Adhesive"]), station: "workshop", output: 1, charges: 1, notes: "Heals 1 HP. Stops Bleeding. 1 use." },
  { name: "Medkit", category: "Medical", tier: "Tier II", skill: "Mechanical Technician 5 or First Aid 6", inputs: r([1, "Reinforced Steel"], [2, "Basic Adhesive"]), toolkit: 1, station: "workshop", output: 1, charges: 1, notes: "Heals 3 HP. Stops Bleeding. +1d6 to the skill check you use it on. 1 use." },
  { name: "Glitterworld Medkit", category: "Medical", tier: "Tier III", inputs: r([1, "Neutronium"], [2, "Advanced Adhesive"]), toolkit: 1, station: "workshop", output: 1, charges: 1, notes: "Heals 5 HP. Stops Bleeding. +3d6 to the skill check you use it on. 1 use." },
  { name: "Improvised Surgical Tools", category: "Medical", tier: "Tier I", skill: "Mechanical Technician 3 or Surgery 3", inputs: r([1, "Scrap Metal"]), toolkit: 1, station: "workshop", output: 1, charges: 1, notes: "Enables basic surgery. Cannot be used to install cybernetics. 1 use." },
  { name: "Surgical Tools", category: "Medical", tier: "Tier II", skill: "Mechanical Technician 5 or Surgery 5", inputs: r([1, "Reinforced Steel"]), toolkit: 1, station: "workshop", output: 1, charges: 2, notes: "Enables surgery. Can be used to install cybernetics. 2 uses." },
  { name: "Enhanced Surgical Tools", category: "Medical", tier: "Tier III", inputs: r([1, "Neutronium"]), toolkit: 1, station: "workshop", output: 1, charges: 2, notes: "Enables surgery and installing cybernetics. +3d6 to the Surgery check. Doesn't require Energy to use. 2 uses." },
  { name: "Special Brew", category: "Medical", inputs: r([1, "Raw Food"], [1, "Water Unit"], [1, "Chemical Mixture"]), station: "kitchen", output: 1, notes: "The good stuff. Clears Afflictions and reduces Stress." },
  { name: "Psychiatric Medication", category: "Medical", skill: "First Aid 3", inputs: r([1, "Water Unit"], [2, "Chemical Mixture"]), output: 1, notes: "For those going through it. Clears Afflictions and reduces Stress." },
  { name: "Painkillers", category: "Medical", skill: "First Aid 3", inputs: r([1, "Water Unit"], [2, "Chemical Mixture"]), output: 1, notes: "Up and at 'em. Ignore the effects of a chosen Injury for the rest of the day." },

  // Tools
  { name: "Improvised Toolkit", category: "Tool", tier: "Tier I", skill: "Mechanical Technician 3", inputs: r([1, "Scrap Metal"], [1, "Scrap Components"], [1, "Basic Adhesive"]), station: "workshop", output: 1, charges: 3, notes: "Used in most repairs, crafting, and recipes: welding, cutting open materials. 3 charges." },
  { name: "Toolkit", category: "Tool", tier: "Tier II", skill: "Mechanical Technician 6", inputs: r([1, "Reinforced Steel"], [1, "Components"], [1, "Basic Adhesive"]), toolkit: 1, station: "workshop", output: 1, charges: 6, notes: "Used in most repairs, crafting, and recipes. +1d6 to the skill check you use it on. 6 charges." },
  { name: "Advanced Toolkit", category: "Tool", tier: "Tier III", inputs: r([1, "Neutronium"], [1, "Quantum Components"], [1, "Advanced Adhesive"]), toolkit: 1, station: "workshop", output: 1, charges: 9, notes: "Used in most repairs, crafting, and recipes. +3d6 to the skill check you use it on. 9 charges." },
  { name: "Crude Water Filter", category: "Supply", tier: "Tier I", skill: "Mechanical Technician 3", inputs: r([1, "Scrap Components"]), station: "workshop", output: 1, charges: 1, notes: "Consumed on a purifier for four units of water. 1 use." },
  { name: "Water Filter", category: "Supply", tier: "Tier II", inputs: r([1, "Components"]), toolkit: 1, station: "workshop", output: 1, charges: 3, notes: "Consumed on a purifier for six units of water. 3 uses." },
  { name: "Dolly", category: "Equipment", tier: "Tier I", skill: "Engineering 3", inputs: r([1, "Scrap Metal"], [1, "Scrap Components"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "+2 inventory slots when used. Halves movement speed in combat. Can't walk around with a weapon out." },
  { name: "Motion Detector", category: "Equipment", tier: "Tier I", skill: "Engineering 3", inputs: r([1, "Scrap Metal"], [1, "Scrap Components"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "Scans nearby areas for motion." },
  { name: "Scouting Car", category: "Equipment", tier: "Tier I", skill: "Engineering 3", inputs: r([4, "Scrap Components"], [1, "Scrap Metal"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "A little RC car with a black-and-white camera, used for scouting." },
  { name: "Scouting Drone", category: "Equipment", tier: "Tier II", skill: "Engineering 6", inputs: r([4, "Components"], [1, "Reinforced Steel"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "A more advanced drone with sensory modes and a full HD camera for scouting." },
  { name: "Lure", category: "Equipment", tier: "Tier I", skill: "Engineering 3", inputs: r([3, "Scrap Components"], [2, "Scrap Metal"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "Choose Heat, Noise, Smell, or Sound. Creates a sense of that type." },

  // Food
  { name: "Prepared Meal", category: "Supply", tier: "Tier I", skill: "Cooking 1", inputs: r([2, "Raw Food"], [2, "Water Unit"]), station: "kitchen", output: 4, onFailure: { name: "Prepared Meal", qty: 0 }, notes: "Eaten in place of a Food Unit: one day of food for one survivor. Two Raw Food make four meals. 4 on success, none on failure." },
  { name: "Delicious Meal", category: "Supply", skill: "Cooking 4", inputs: r([1, "Raw Food"], [1, "Water Unit"]), station: "kitchen", stationLevel: "Operational Galley", output: 2, onFailure: { name: "Prepared Meal", qty: 2 }, notes: "Consumed as one unit of food. Gain 1 XP in any skill. 2 on success, 2 Prepared Meals on failure." },
  { name: "Delectable Meal", category: "Supply", skill: "Cooking 7", inputs: r([2, "Raw Food"], [1, "Water Unit"]), station: "kitchen", stationLevel: "Nutritional Processing Suite", output: 2, onFailure: { name: "Prepared Meal", qty: 2 }, notes: "Consumed as one unit of food. Removes one level of Stress and gives 2 XP in any skill. 2 on success, 2 Prepared Meals on failure." },
  { name: "Chemical Mixture", category: "Material", tier: "Tier I", inputs: r([2, "Raw Food"]), station: "kitchen", stationLevel: "Operational Galley", output: 1, notes: "Who knows what this could make? One Raw Food per mixture with a Nutritional Processing Suite." },
  { name: "Destructive Chemical Mixture", category: "Material", tier: "Tier II", inputs: r([2, "Chemical Mixture"]), station: "kitchen", stationLevel: "Nutritional Processing Suite", output: 1, notes: "Oh, I guess I know what this could make." },

  // Armor
  { name: "Riot Shield", category: "Armor", tier: "Tier I", skill: "Mechanical Technician 3", inputs: r([3, "Scrap Metal"], [1, "Aluminum Alloy"], [1, "Basic Adhesive"]), station: "workshop", output: 1, notes: "Can tank one full hit from a damage source, depending on where it comes from." },
  { name: "Scrapwork Space Suit", category: "Armor", tier: "Tier I", inputs: r([6, "Scrap Metal"], [2, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, armor: 2, notes: "+2 Armor." },
  { name: "Durasteel Space Suit", category: "Armor", tier: "Tier II", inputs: r([6, "Reinforced Steel"], [2, "Basic Adhesive"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, armor: 4, notes: "+4 Armor." },
  { name: "Adamantite Space Suit", category: "Armor", tier: "Tier III", inputs: r([6, "Neutronium"], [2, "Advanced Adhesive"], [1, "Adamantite Alloy"]), station: "workshop", output: 1, armor: 6, notes: "+6 Armor." },

  // Weapons
  { name: "Makeshift Stun Baton", category: "Weapon", tier: "Tier I", inputs: r([2, "Scrap Metal"], [1, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 2, damageType: "Electric", range: "melee", skill: "closeCombat", nonlethal: true }, notes: "2 Damage on hit, Electric. Nonlethal. Melee." },
  { name: "Stun Baton", category: "Weapon", tier: "Tier II", inputs: r([2, "Reinforced Steel"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 4, damageType: "Electric", range: "melee", skill: "closeCombat", nonlethal: true }, notes: "4 Damage on hit, Electric. Nonlethal. Melee." },
  { name: "Makeshift Stun Gun", category: "Weapon", tier: "Tier I", inputs: r([2, "Scrap Components"], [1, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 1, damageType: "Electric", range: "short", skill: "lightFirearms", nonlethal: true }, notes: "1 Damage on hit, Electric. Nonlethal. Ranged, short." },
  { name: "Stun Gun", category: "Weapon", tier: "Tier II", inputs: r([2, "Components"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 2, damageType: "Electric", range: "short", skill: "lightFirearms", nonlethal: true }, notes: "2 Damage on hit, Electric. Nonlethal. Ranged, short." },
  { name: "Makeshift Pistol", category: "Weapon", tier: "Tier I", inputs: r([1, "Scrap Components"], [1, "Scrap Metal"], [1, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 1, damageType: "Ballistic", range: "long", skill: "lightFirearms" }, notes: "1 Damage on hit, Ballistic. Ranged, long." },
  { name: "Ballistic Rifle", category: "Weapon", tier: "Tier II", inputs: r([1, "Components"], [1, "Reinforced Steel"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 3, damageType: "Ballistic", range: "long", skill: "lightFirearms" }, notes: "3 Damage on hit, Ballistic. Ranged, long." },
  { name: "Makeshift Club", category: "Weapon", tier: "Tier I", inputs: r([3, "Scrap Metal"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 2, damageType: "Physical", range: "melee", skill: "closeCombat" }, notes: "2 Damage on hit, Physical." },
  { name: "Cleaver", category: "Weapon", tier: "Tier II", inputs: r([3, "Reinforced Steel"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 3, damageType: "Physical", range: "melee", skill: "closeCombat" }, notes: "3 Damage on hit, Physical." },
  { name: "Makeshift Chemical Injector", category: "Weapon", tier: "Tier I", inputs: r([2, "Scrap Components"], [1, "Chemical Mixture"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 1, damageType: "Chemical", range: "melee", skill: "closeCombat", ap: 3 }, notes: "1 Damage on hit, Chemical. Pierces Armor." },
  { name: "Chemical Injector", category: "Weapon", tier: "Tier II", inputs: r([2, "Components"], [1, "Destructive Chemical Mixture"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 1, damageType: "Chemical", range: "melee", skill: "closeCombat", ap: 3 }, notes: "1 Damage on hit, Chemical. Pierces Armor. Causes an additional damage type of the user's choice." },
  { name: "Flamethrower", category: "Weapon", tier: "Tier I", skill: "Mechanical Technician 3", inputs: r([2, "Scrap Components"], [1, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, weapon: { damage: 1, damageType: "Fire", range: "close", skill: "heavyWeaponry", applies: [{ name: "Burning", duration: "Ongoing" }] }, notes: "1 Damage on hit, Fire." },
  { name: "Makeshift Explosive", category: "Weapon", tier: "Tier I", skill: "Engineering 6", inputs: r([2, "Scrap Components"], [1, "Basic Adhesive"], [1, "Aluminum Alloy"]), station: "workshop", output: 1, charges: 3, weapon: { damage: 4, damageType: "Fire", range: "short", skill: "heavyWeaponry", blast: 3, thrown: true }, notes: "4 Damage on hit, Fire. Needs to be thrown. Hits additional targets in the same zone for 3 Fire damage. 3 uses." },
  { name: "Motion-Activated IED", category: "Weapon", tier: "Tier I", skill: "Engineering 5", inputs: r([1, "Motion Detector"], [1, "Makeshift Explosive"], [2, "Scrap Components"], [1, "Basic Adhesive"]), station: "workshop", output: 1, charges: 1, weapon: { damage: 4, damageType: "Fire", range: "close", skill: "heavyWeaponry", blast: 3 }, notes: "4 Damage on hit, Fire. Detonates on detecting motion in the same tile. Hits additional targets in the same zone for 3 Fire damage. Takes one Makeshift Explosive (3 charges' worth). 1 use." },
  { name: "Rocket Launcher", category: "Weapon", tier: "Tier II", inputs: r([2, "Components"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), station: "workshop", output: 1, weapon: { damage: 6, damageType: "Fire", range: "medium", skill: "heavyWeaponry", blast: 3 }, notes: "6 Damage on hit, Fire. Hits additional targets in the same zone for 3 Fire damage. Uses Makeshift Explosives as ammo." },
  { name: "Flashbang", category: "Weapon", tier: "Tier I", skill: "Engineering 3", inputs: r([1, "Scrap Components"], [2, "Scrap Metal"], [1, "Basic Adhesive"]), station: "workshop", output: 1, charges: 1, weapon: { damage: 0, damageType: "Electric", range: "short", skill: "heavyWeaponry", thrown: true, zone: true, applies: [{ name: "Blinded", duration: "Brief" }, { name: "Deafened", duration: "Brief" }] }, notes: "Applies Blinded and Deafened to all creatures in a zone for a combat round. Repeat usage has lessening effects. 1 use." },

  // Cybernetics
  { name: "Cybernetic Core", category: "Material", tier: "Tier I", inputs: r([10, "Scrap Metal"], [5, "Components"]), station: "cyberlab", output: 1, notes: "Used to craft cybernetics." },
];

/** Refining at an upgraded Workshop. Input amounts shrink as the Workshop improves. */
export const REFINING: { output: string; input: string; by: Record<string, number>; tier: ItemTier }[] = [
  { output: "Reinforced Steel", input: "Scrap Metal", by: { "Calibrated Bay": 4, "Advanced Fabricator": 3, "Jewelled Facilities": 2 }, tier: "Tier II" },
  { output: "Components", input: "Scrap Components", by: { "Calibrated Bay": 4, "Advanced Fabricator": 3, "Jewelled Facilities": 2 }, tier: "Tier II" },
  { output: "Neutronium", input: "Reinforced Steel", by: { "Jewelled Facilities": 4 }, tier: "Tier III" },
  { output: "Quantum Components", input: "Components", by: { "Jewelled Facilities": 4 }, tier: "Tier III" },
];

export const MATERIALS: { name: string; tier?: ItemTier; heavy?: boolean; notes?: string }[] = [
  { name: "Scrap Metal", tier: "Tier I" },
  { name: "Scrap Components", tier: "Tier I" },
  { name: "Basic Adhesive", tier: "Tier I" },
  { name: "Reinforced Steel", tier: "Tier II" },
  { name: "Components", tier: "Tier II" },
  { name: "Advanced Adhesive", tier: "Tier II" },
  { name: "Neutronium", tier: "Tier III" },
  { name: "Quantum Components", tier: "Tier III" },
  { name: "Aluminum Alloy", tier: "Tier I", heavy: true, notes: "Used in most military-based Tier I recipes." },
  { name: "Durasteel Alloy", tier: "Tier II", heavy: true, notes: "Used in most military-based Tier II recipes." },
  { name: "Adamantite Alloy", tier: "Tier III", heavy: true, notes: "Used in most military-based Tier III recipes." },
  { name: "Chemical Mixture", tier: "Tier I", notes: "Who knows what this could make?" },
  { name: "Destructive Chemical Mixture", tier: "Tier II" },
  { name: "Cybernetic Core", tier: "Tier I", notes: "Used to craft cybernetics." },
  { name: "Scrapped Biomass", tier: "Tier II" },
  { name: "Unknown Catalyst", tier: "Alien", notes: "?????" },
  { name: "Raw Food", tier: "Tier I", notes: "Not yummy, but beats starving." },
];

const TIER_RANK: Record<string, number> = { Scrap: 1, "Tier I": 1, "Tier II": 2, "Tier III": 3, Alien: 3 };
const MATERIAL_TIER = Object.fromEntries(MATERIALS.map((m) => [m.name, TIER_RANK[m.tier ?? "Tier I"]]));

/** Highest material tier a recipe uses: a Makeshift Bench only handles Tier I, Operational and Calibrated handle Tier II, and the Advanced Fabricator handles everything. */
export function recipeMaterialTier(inputs: Recipe) {
  return Math.max(1, ...inputs.map((i) => MATERIAL_TIER[i.name] ?? 1));
}
