import type { FacilityGrade } from "@/lib/rules";
import type { Recipe } from "./cybernetics";

export type UpgradeLevel = {
  name: string;
  /** Materials to reach this level. Empty for the starting level. */
  cost: Recipe;
  /** Charges of any tier of toolkit. */
  toolkit: number;
  effect: string;
  /** Facility grade this level provides, for rules that ask for "a Grade II Workshop" and so on. */
  grade?: FacilityGrade;
  powerOutput?: number;
  tiles?: number;
  mechs?: number;
};

const r = (...parts: [number, string][]): Recipe => parts.map(([qty, name]) => ({ name, qty }));

/** Keyed by module name, matching MODULE_PRESETS. */
export const UPGRADE_LADDERS: Record<string, { blurb: string; levels: UpgradeLevel[] }> = {
  "Fusion Reactor": {
    blurb: "Powers the ship. Without it, none of the other modules work properly. Broken: adding fuel rods is hazardous; whoever does it gains radiation poisoning and loses 1 HP.",
    levels: [
      { name: "Broken", cost: r([5, "Scrap Metal"], [3, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, powerOutput: 3, effect: "Produces 3 Power. Each working room draws its Power Draw (the Reactor draws none). Refuelling is hazardous: radiation poisoning and −1 HP." },
      { name: "Repaired", cost: r([8, "Scrap Metal"], [4, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, powerOutput: 5, effect: "Produces 5 Power. Each working room draws its Power Draw (the Reactor draws none)." },
      { name: "Operational", cost: r([6, "Reinforced Steel"], [6, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, powerOutput: 7, effect: "Produces 7 Power. Each working room draws its Power Draw (the Reactor draws none)." },
      { name: "Large", cost: r([8, "Reinforced Steel"], [4, "Components"], [1, "Basic Adhesive"]), toolkit: 3, powerOutput: 9, effect: "Produces 9 Power. Each working room draws its Power Draw (the Reactor draws none)." },
      { name: "Voltaic", cost: r([6, "Neutronium"], [8, "Components"], [1, "Advanced Adhesive"]), toolkit: 3, powerOutput: 11, effect: "Produces 11 Power. Each working room draws its Power Draw (the Reactor draws none)." },
      { name: "Unlimited", cost: r([8, "Neutronium"], [8, "Quantum Components"], [1, "Advanced Adhesive"]), toolkit: 3, powerOutput: 13, effect: "Produces 13 Power. Each working room draws its Power Draw (the Reactor draws none)." },
    ],
  },
  "Navigation & Sensor Suite": {
    blurb: "Scans for biological readings in the area. Know thy enemy.",
    levels: [
      { name: "Offline", cost: r([2, "Scrap Metal"], [5, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 2, effect: "No meaningful sensor data. Can't scan unknown locations: you're going in blind." },
      { name: "Fragmentary", cost: r([3, "Scrap Metal"], [6, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, effect: "Sensors flicker. Scans may return false positives or negatives for biological creatures." },
      { name: "Operational", cost: r([2, "Reinforced Steel"], [8, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, effect: "Scans accurately return the count of biological creatures." },
      { name: "Enhanced", cost: r([4, "Reinforced Steel"], [8, "Scrap Components"], [2, "Advanced Adhesive"]), toolkit: 4, effect: "Scans accurately return the count of biological creatures and their type." },
      { name: "Biometric", cost: r([3, "Neutronium"], [6, "Quantum Components"]), toolkit: 0, effect: "Scanning happens automatically four times a day; no one needs to man it." },
      { name: "Enigmatic", cost: r([1, "Unknown Catalyst"]), toolkit: 0, effect: "???" },
    ],
  },
  "Engine Section": {
    blurb: "Without it, the ship can't move.",
    levels: [
      { name: "Broken", cost: r([4, "Scrap Metal"], [2, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 2, tiles: 0, effect: "The ship can't move." },
      { name: "Repaired", cost: r([8, "Scrap Metal"], [4, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 2, tiles: 1, effect: "Move 1 tile per segment piloted." },
      { name: "Thrust-Capable", cost: r([6, "Reinforced Steel"], [6, "Components"], [1, "Basic Adhesive"]), toolkit: 2, tiles: 2, effect: "Move 2 tiles per segment piloted." },
      { name: "Vector-Optimized", cost: r([6, "Neutronium"], [8, "Quantum Components"], [1, "Advanced Adhesive"]), toolkit: 2, tiles: 4, effect: "Move 4 tiles per segment piloted." },
    ],
  },
  "Life Support": {
    blurb: "Maintains breathable atmosphere, pressure, temperature, and basic water reclamation. Without it, survival is measured in minutes.",
    levels: [
      { name: "Broken", cost: r([2, "Scrap Metal"], [5, "Scrap Components"], [2, "Basic Adhesive"]), toolkit: 2, effect: "All characters lose 1 HP at the end of every rest. Generating water is not possible." },
      { name: "Jury-Rigged", cost: r([3, "Scrap Metal"], [6, "Scrap Components"], [2, "Basic Adhesive"]), toolkit: 2, effect: "No bonuses or penalties." },
      { name: "Operational", cost: r([4, "Scrap Metal"], [6, "Components"], [1, "Basic Adhesive"]), toolkit: 3, effect: "All characters gain 3 extra HP every rest." },
      { name: "Stabilized", cost: r([4, "Reinforced Steel"], [8, "Components"], [2, "Basic Adhesive"]), toolkit: 3, effect: "All characters gain 6 extra HP every rest." },
      { name: "Closed-Loop", cost: r([4, "Reinforced Steel"], [4, "Quantum Components"], [2, "Advanced Adhesive"]), toolkit: 3, effect: "All characters gain 14 extra HP every rest and cure a random minor Injury." },
      { name: "Regenerating", cost: r([8, "Neutronium"], [8, "Quantum Components"], [2, "Advanced Adhesive"]), toolkit: 3, effect: "All characters fully heal every rest and cure all Minor Injuries." },
    ],
  },
  "Medical Bay": {
    blurb: "Surgery or bust, that's what I always say.",
    levels: [
      { name: "Base Setup", cost: r([2, "Scrap Metal"], [4, "Scrap Components"], [3, "Basic Adhesive"]), toolkit: 2, effect: "No surgery can happen here." },
      { name: "Field Setup", cost: r([3, "Scrap Metal"], [6, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, grade: "Grade I", effect: "Surgery is enabled. All surgery rolls get −2d6." },
      { name: "Operational", cost: r([2, "Reinforced Steel"], [6, "Scrap Components"], [2, "Basic Adhesive"]), toolkit: 3, grade: "Grade II", effect: "Surgery rolls get −1d6. Successful surgeries only drop the patient to three-quarters of their Max HP, not half." },
      { name: "Sterile Suite", cost: r([4, "Reinforced Steel"], [6, "Scrap Components"], [2, "Advanced Adhesive"]), toolkit: 4, grade: "Grade III", effect: "All surgeries only drop the patient to three-quarters of their Max HP, not half." },
      { name: "Advanced Care", cost: r([3, "Neutronium"], [6, "Quantum Components"], [4, "Advanced Adhesive"]), toolkit: 0, grade: "Experimental", effect: "Surgery no longer lowers the patient's HP, success or fail." },
    ],
  },
  "Workshop / Fabrication Bay": {
    blurb: "The air smells of hot metal and burned adhesive. This is where scrap becomes solutions, and mistakes become permanent.",
    levels: [
      { name: "None", cost: [], toolkit: 0, effect: "No production is possible here." },
      { name: "Makeshift Bench", cost: r([2, "Scrap Metal"], [3, "Scrap Components"], [2, "Basic Adhesive"]), toolkit: 2, grade: "Makeshift", effect: "Make items and upgrade the ship using Tier I materials only." },
      { name: "Operational Workshop", cost: r([3, "Scrap Metal"], [6, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 3, grade: "Grade I", effect: "Make items and upgrade the ship using Tier I and II materials." },
      { name: "Calibrated Bay", cost: r([2, "Reinforced Steel"], [6, "Components"], [2, "Basic Adhesive"]), toolkit: 3, grade: "Grade II", effect: "Tier I and II materials. Make Reinforced Steel from 4 Scrap Metal, and Components from 4 Scrap Components." },
      { name: "Advanced Fabricator", cost: r([4, "Reinforced Steel"], [6, "Components"], [2, "Basic Adhesive"]), toolkit: 3, grade: "Grade III", effect: "Craft all recipes. Reinforced Steel from 3 Scrap Metal, Components from 3 Scrap Components." },
      { name: "Jewelled Facilities", cost: r([4, "Neutronium"], [6, "Quantum Components"], [2, "Advanced Adhesive"]), toolkit: 3, grade: "Experimental", effect: "Craft all recipes. Reinforced Steel from 2 Scrap Metal, Components from 2 Scrap Components. Neutronium from 4 Reinforced Steel, Quantum Components from 4 Components." },
    ],
  },
  "Storage Bay": {
    blurb: "Mech storage: berths for the frames that represent hope and utility in a place determined to crush survival.",
    levels: [
      { name: "Base Cargo Storage", cost: [], toolkit: 0, mechs: 1, effect: "Can hold 1 mech." },
      { name: "Large Storage", cost: r([10, "Scrap Metal"], [4, "Scrap Components"], [6, "Basic Adhesive"]), toolkit: 2, mechs: 2, effect: "Can hold 2 mechs." },
      { name: "Enormous Storage", cost: r([10, "Reinforced Steel"], [4, "Components"], [6, "Basic Adhesive"]), toolkit: 2, mechs: 3, effect: "Can hold 3 mechs." },
    ],
  },
  Kitchen: {
    blurb: "Steam, grease, and recycled water cling to every surface. Meals are prepared here, not to be enjoyed, but to keep you moving.",
    levels: [
      { name: "Absent", cost: [], toolkit: 0, effect: "Nonexistent." },
      { name: "Improvised Galley", cost: r([4, "Scrap Metal"], [2, "Scrap Components"], [1, "Aluminum Alloy"]), toolkit: 0, effect: "Cook food and Special Brews. −4d6 to all rolls using this station." },
      { name: "Operational Galley", cost: r([4, "Reinforced Steel"], [4, "Components"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), toolkit: 3, effect: "Cook food and Special Brews at −2d6. Synthesize Chemical Mixtures from two Raw Food. Can make Delicious Meals." },
      { name: "Nutritional Processing Suite", cost: r([8, "Reinforced Steel"], [4, "Components"], [1, "Basic Adhesive"], [1, "Durasteel Alloy"]), toolkit: 3, effect: "Cook food and Special Brews. Chemical Mixture from one Raw Food; Destructive Chemical Mixture from two Chemical Mixtures. Can make Delectable Meals." },
    ],
  },
  Hydroponics: {
    blurb: "Dim grow lights hum over rows of stubborn, engineered life. The ship grows food here, or it starves.",
    levels: [
      { name: "Dead", cost: r([2, "Scrap Metal"], [5, "Scrap Components"], [1, "Basic Adhesive"]), toolkit: 2, effect: "No food production is possible." },
      { name: "Seeded", cost: r([3, "Scrap Metal"], [3, "Scrap Components"], [2, "Basic Adhesive"]), toolkit: 2, effect: "After a Maintain Crops action, 4 Raw Food after 3 days. Maintain Crops must be taken every day or the crops don't grow." },
      { name: "Operational", cost: r([4, "Scrap Metal"], [5, "Components"], [1, "Basic Adhesive"]), toolkit: 3, effect: "After a grow action, 6 Raw Food after 3 days. Maintain Crops only needs to be taken on the second or third day." },
      { name: "Expanded", cost: r([3, "Reinforced Steel"], [6, "Components"], [2, "Basic Adhesive"]), toolkit: 3, effect: "After a grow action, 8 Raw Food after 3 days. Maintain Crops only needs to be taken on initial seeding." },
      { name: "Self-Sustaining", cost: r([3, "Neutronium"], [6, "Quantum Components"]), toolkit: 0, effect: "10 Raw Food every 3 days." },
    ],
  },
};

export type Facility = {
  name: string;
  cost: Recipe;
  toolkit: number;
  effect: string;
  powerDraw: number;
  /** Takes a room's spare slot rather than its module slot. One per room: solar panels or defenses, never both. */
  fitting?: boolean;
};

/** One-off facilities. Building one adds a room housing it, unless it fits a room's spare slot. */
export const FACILITIES: Facility[] = [
  { name: "Cybernetics Lab", cost: r([10, "Reinforced Steel"], [1, "Aluminum Alloy"], [1, "Durasteel Alloy"], [3, "Components"]), toolkit: 0, powerDraw: 2, effect: "Allows crafting Cybernetic Cores (10 Scrap Metal + 5 Components) and Cybernetic Research." },
  { name: "Biological Lab", cost: r([7, "Reinforced Steel"], [1, "Aluminum Alloy"], [1, "Durasteel Alloy"], [6, "Components"]), toolkit: 0, powerDraw: 3, effect: "Allows biological research and crafting DNA-altering substances." },
  { name: "Bioconverter", cost: r([10, "Scrap Metal"], [2, "Basic Adhesive"], [5, "Components"]), toolkit: 0, powerDraw: 1, effect: "Unlocks the “Turn food to fuel” action." },
  { name: "Makeshift Solar Panels", cost: r([10, "Scrap Metal"], [5, "Scrap Components"]), toolkit: 0, powerDraw: 0, fitting: true, effect: "Take up no space and need no power: one set per room, in the room's spare slot rather than its module slot. A room fitted with panels can't also hold defenses. Collect 1 Fuel Unit a day unless the room is Offline or Destroyed." },
  { name: "Crewmate Quarters", cost: r([20, "Scrap Metal"], [10, "Scrap Components"]), toolkit: 0, powerDraw: 1, effect: "Characters heal +4 HP on rest." },
  { name: "Crewmate Quarters Expanded", cost: r([5, "Durasteel Alloy"], [5, "Components"]), toolkit: 0, powerDraw: 1, effect: "Requires Crewmate Quarters. Characters heal +5 HP on rest and reduce Pressure by an additional 1 on rest." },
  { name: "Traps", cost: r([6, "Scrap Metal"], [2, "Aluminum Alloy"], [3, "Scrap Components"]), toolkit: 0, powerDraw: 0, fitting: true, effect: "Provide defenses in that room during combat. Take the room's spare slot, so the room can't also carry solar panels." },
  { name: "Defensive Gun", cost: r([6, "Scrap Metal"], [2, "Aluminum Alloy"], [3, "Scrap Components"]), toolkit: 0, powerDraw: 2, fitting: true, effect: "Defends the room against threats larger than you. Base 4 damage of a type chosen when built. Higher-grade materials add +2 damage per upgrade. Takes the room's spare slot, so the room can't also carry solar panels." },
];

export const FACILITY_BY_NAME = Object.fromEntries(FACILITIES.map((f) => [f.name, f])) as Record<string, Facility>;

/** What can fill a room's spare slot: one set of solar panels, or defenses. */
export const ROOM_FITTINGS = FACILITIES.filter((f) => f.fitting);

export const SOLAR_PANELS = "Makeshift Solar Panels";

/** Fuel Units one set of solar panels collects each day. */
export const SOLAR_FUEL_PER_DAY = 1;

export const ladderFor = (module: string | null) => (module ? UPGRADE_LADDERS[module] : undefined);
