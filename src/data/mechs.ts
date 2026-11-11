import type { MechChassis, MechDamageType } from "@/lib/types";
import type { Recipe } from "./cybernetics";

export const MECH_DAMAGE_TYPES: MechDamageType[] = ["Ballistic", "Physical", "Fire", "Electric", "Chemical"];

export const CHASSIS: Record<MechChassis, { name: string; hp: number; inventory: number; hardpoints: number; noise: string; ability: string; abilityText: string[] }> = {
  utility: {
    name: "Utility Frame", hp: 7, inventory: 6, hardpoints: 1, noise: "Moderate", ability: "Heavy Lift Assembly",
    abilityText: ["Heavy items the pilot carries occupy one slot instead of two.", "The pilot may carry a Downed character without becoming Slowed.", "+2d6 to lifting, dragging, and forcing structures."],
  },
  assault: {
    name: "Assault Frame", hp: 10, inventory: 2, hardpoints: 2, noise: "Loud", ability: "Braced Frame",
    abilityText: ["Become Anchored or stop being Anchored as a Fast Action."],
  },
  recon: {
    name: "Recon Frame", hp: 6, inventory: 3, hardpoints: 1, noise: "Low", ability: "Rapid Movement",
    abilityText: ["Sprint moves up to three zones instead of two.", "+2d6 to Perception Tasks involving hazards, movement, and hidden routes.", "The first Difficult Terrain Task each Scene is Routine when no immediate threat is present."],
  },
};

/** `armor` is the frame's own plating, before any Defensive module adds to it. */
export const MECH_TIERS: Record<1 | 2 | 3, { slots: number; frame: number; hpBonus: number; armor: number; resistPicks: number; cells: number }> = {
  1: { slots: 4, frame: 4, hpBonus: 0, armor: 4, resistPicks: 0, cells: 1 },
  2: { slots: 5, frame: 5, hpBonus: 2, armor: 6, resistPicks: 1, cells: 1 },
  3: { slots: 6, frame: 6, hpBonus: 4, armor: 8, resistPicks: 2, cells: 2 },
};

export const MECH_CONDITIONS = ["Breached", "Conductive", "Corroded", "Disrupted", "Immobilized", "Jammed", "Overheated", "Power-Starved", "Sensor-Blind", "Servo-Locked", "Anchored"];

export const MECH_COMPLICATIONS = ["The mech becomes Breached.", "The pilot becomes Staggered.", "The pilot is Restrained inside the damaged frame.", "The mech falls Prone.", "A mounted system catches fire.", "The cockpit fills with smoke.", "The frame becomes Servo-Locked."];

export type ModuleCategory = "Cargo & Salvage" | "Defensive" | "Environmental" | "Mobility" | "Sensors" | "Engineering" | "Medical" | "Weapon" | "Control";

export type MechModule = {
  key: string;
  name: string;
  category: ModuleCategory;
  slots: number;
  tier: 1 | 2 | 3;
  effect: string;
  weapon?: MechDamageType;
  hp?: number;
  armor?: number;
  inventory?: number;
  resist?: MechDamageType;
  /** Keeps one of the pilot's otherwise suppressed implants connected, named on the installed module. */
  port?: true;
};

const m = (category: ModuleCategory, name: string, slots: number, tier: 1 | 2 | 3, effect: string, extra: Partial<MechModule> = {}): MechModule => ({
  key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  name,
  category,
  slots,
  tier,
  effect,
  ...extra,
});

export const MECH_MODULES: MechModule[] = [
  m("Cargo & Salvage", "External Cargo Rack", 1, 1, "Adds +4 inventory slots. Cargo stored here is exposed if the mech becomes Breached.", { inventory: 4 }),
  m("Cargo & Salvage", "Reinforced Cargo Assembly", 2, 2, "Adds +7 inventory slots. Heavy items the pilot carries occupy one slot instead of two.", { inventory: 7 }),
  m("Cargo & Salvage", "Heavy Lift Actuators", 1, 1, "Carry Heavy objects and Downed characters without becoming Slowed. +2d6 when lifting, dragging, or forcing structures."),
  m("Cargo & Salvage", "Retrieval Winch", 1, 1, "As a Slow Action, pull an ally, object, or restrained target from an adjacent zone into your zone."),
  m("Cargo & Salvage", "Specimen Containment Pod", 1, 1, "Holds one biological, Chemical, radioactive, or Contaminated specimen without exposing the pilot or crew."),
  m("Cargo & Salvage", "Expanded Containment Vault", 2, 2, "Holds up to three hazardous specimens or one living creature of roughly human size."),
  m("Cargo & Salvage", "Medical Evacuation Cradle", 1, 1, "Carries one Downed or Immobilized character without using normal inventory slots. The passenger is protected by the mech's environmental seal."),
  m("Cargo & Salvage", "Salvage Clamps", 1, 1, "Secure large machinery or structural pieces. One Heavy item the pilot carries occupies no slots."),

  m("Defensive", "Ballistic Plating", 1, 1, "Grants Ballistic Resistance.", { resist: "Ballistic" }),
  m("Defensive", "Impact Bracing", 1, 1, "Grants Physical Resistance and Resistance to Prone and forced movement.", { resist: "Physical" }),
  m("Defensive", "Thermal Shielding", 1, 1, "Grants Fire Resistance and Resistance to Burning and Overheated.", { resist: "Fire" }),
  m("Defensive", "Arc Grounding", 1, 1, "Grants Electric Resistance and Resistance to Conductive and Disrupted.", { resist: "Electric" }),
  m("Defensive", "Chemical Seal", 1, 1, "Grants Chemical Resistance. Ordinary inhaled toxins can't reach the pilot while the mech is not Breached.", { resist: "Chemical" }),
  m("Defensive", "Reinforced Chassis", 1, 1, "+3 Maximum Mech HP and +1 Armor, but −2d6 to Stealth and Acrobatics.", { hp: 3, armor: 1 }),
  m("Defensive", "Heavy Reinforced Chassis", 2, 2, "+6 Maximum Mech HP and +3 Armor, but −4d6 to Stealth and Acrobatics.", { hp: 6, armor: 3 }),
  m("Defensive", "Emergency Sealant System", 1, 1, "Once per expedition, prevent Breached when it would be applied."),
  m("Defensive", "Reactive Stabilizers", 1, 2, "Resistant to Staggered, Immobilized, Servo-Locked, and forced movement."),
  m("Defensive", "Redundant Control System", 1, 2, "The first time each expedition the mech would become Disrupted, Jammed, or Sensor-Blind, ignore it."),
  m("Defensive", "Adaptive Plating", 2, 3, "After suffering a damage type, gain Resistance to that type until another damage type damages the mech."),
  m("Defensive", "Emergency Barrier", 2, 3, "Once per combat, reduce one incoming attack's Damage to 0. The mech then becomes Power-Starved until the end of its next turn."),

  m("Environmental", "Independent Life Support", 1, 1, "Protects the pilot from vacuum and Suffocating while the mech is powered and not Breached."),
  m("Environmental", "Extended Life Support", 1, 2, "Independent atmosphere for the pilot and one passenger for an entire expedition."),
  m("Environmental", "Radiation Shielding", 1, 2, "Resistance to radiation-related Contamination; ordinary radiation exposure doesn't reach the pilot."),
  m("Environmental", "Thermal Regulation Suite", 1, 1, "Prevents ordinary Freezing and environmental Overheated conditions."),
  m("Environmental", "Pressure Adaptation System", 1, 2, "Safe operation underwater, in high-pressure atmospheres, and during extreme decompression."),
  m("Environmental", "Decontamination Shell", 1, 2, "Once per Scene, spend a Slow Action to remove Contaminated from the mech or its pilot."),
  m("Environmental", "Sealed Medical Environment", 2, 2, "First Aid and stabilization inside hazardous atmospheres without exposing the patient."),
  m("Environmental", "Alien Environment Emulator", 2, 3, "At deployment, select one unusual atmospheric or environmental condition. The frame reproduces or resists it for the expedition."),

  m("Mobility", "Magnetic Anchors", 1, 1, "Become Anchored or stop being Anchored as a Fast Action."),
  m("Mobility", "Zero-G Maneuver Pack", 1, 1, "Controlled movement in Weightless environments without routine Acrobatics rolls."),
  m("Mobility", "Servo Boosters", 1, 2, "Move one additional zone when using Sprint. Once per combat, gain Accelerated."),
  m("Mobility", "Jump Thrusters", 1, 2, "As a Slow Action, move up to two zones ignoring ground hazards and blocked low obstacles. The landing is loud."),
  m("Mobility", "Climbing Assembly", 1, 1, "Move across walls, ceilings, wreck exteriors, and steep surfaces without ordinary penalties."),
  m("Mobility", "Grapnel Launcher", 1, 1, "Anchor to a visible surface or pull the mech toward an adjacent or nearby zone. May retrieve unsecured objects."),
  m("Mobility", "Aquatic Propulsion", 1, 1, "Normal movement underwater or through dense fluid environments."),
  m("Mobility", "Emergency Ejection System", 1, 2, "At 0 HP the pilot may immediately exit into an adjacent zone, Prone but not Restrained inside the frame."),
  m("Mobility", "Phase-Step Actuator", 2, 3, "Once per combat, move through one blocked border or occupied zone. The mech becomes Disrupted afterward."),

  m("Sensors", "Floodlight Array", 1, 1, "Illuminates the current zone and adjacent zones. May trigger light-based enemy weaknesses."),
  m("Sensors", "Survey Suite", 1, 1, "+2d6 to Perception and Scavenging Tasks involving terrain, salvage, hazards, or structural routes."),
  m("Sensors", "Biological Scanner", 1, 1, "+2d6 to Biology Tasks to observe organisms. After seeing a creature use an ability, identify one visible biological Tell."),
  m("Sensors", "Advanced Xenobiology Suite", 2, 2, "Once per creature type per expedition, reveal one Resistance, Vulnerability, condition defense, or biological rule after observing it for one Round."),
  m("Sensors", "Atmospheric Analyzer", 1, 1, "Automatically identifies atmospheric composition, toxins, oxygen levels, and pressure hazards."),
  m("Sensors", "Targeting Suite", 1, 1, "The first Aim action each Round is free. This does not grant an additional Action."),
  m("Sensors", "Threat Marking System", 1, 2, "Once per Round after successfully analyzing or attacking a target, apply Marked to it."),
  m("Sensors", "Motion Prediction Array", 1, 2, "+2d6 to Dodge and Overwatch attacks against targets the mech has already observed moving."),
  m("Sensors", "Signal Interceptor", 1, 2, "Detects nearby electronic communication, remote controls, hidden machines, and Jammed zones."),
  m("Sensors", "Recon Drone Bay", 2, 2, "Deploy a small drone to Scout an adjacent zone without exposing the mech. The drone may be destroyed independently."),
  m("Sensors", "Low-Signature Shroud", 2, 3, "Removes the mech's Stealth penalty while moving slowly. Attacking, Sprinting, or Heavy equipment disables it for the Scene."),

  m("Engineering", "Integrated Toolkit", 1, 1, "Counts as an Improvised Toolkit for repairs, breaching, and mechanical Tasks."),
  m("Engineering", "Fabrication Arm", 1, 2, "Counts as a Standard Toolkit and allows field crafting that would normally require a Makeshift facility."),
  m("Engineering", "Field Repair System", 1, 1, "Once per expedition, restore 2 Mech HP without spending an Expedition Turn."),
  m("Engineering", "Automated Repair Swarm", 2, 3, "At the end of a Scene, restore 1 Mech HP if powered. Can't raise the mech above half Maximum HP during an expedition."),
  m("Engineering", "Portable Power Coupling", 1, 1, "Power an Offline console, door, tool, or small machine while the mech remains connected."),
  m("Engineering", "Emergency Power Reserve", 1, 2, "Once per expedition, immediately remove Power-Starved or Disrupted."),
  m("Engineering", "Structural Support Rig", 1, 1, "Hold open a door, brace a collapsing structure, stabilize a wreck, or support a damaged ceiling without continuous effort."),
  m("Engineering", "Portable Workshop Rig", 2, 3, "Functions as a Grade I Workshop for portable equipment and mech repairs. Can't construct rooms or full ship modules."),
  m("Engineering", "Barricade Extruder", 1, 2, "As a Slow Action, raise the Cover in the mech's zone by one step, to Partial and then to Strong. It stands for the rest of the expedition unless something tears it down."),
  m("Engineering", "Blast Shutter Deployer", 1, 2, "As a Fast Action, set one border of the mech's zone to sealed, or open a border the mech itself sealed. A sealed border needs a Breach to cross and stops line of sight."),
  m("Engineering", "Demolition Charge Rack", 2, 3, "As a Slow Action, bring down one border of the mech's zone: it becomes blocked, and nothing crosses it without clearing the rubble. The collapse is Loud and strips the Cover from both rooms it touches."),
  m("Engineering", "Siege Breaching Assembly", 2, 3, "As a Slow Action, reduce any closed, locked, or sealed border the mech can reach to destroyed, with no Task and no roll. Against a blocked border it takes two turns. Loud."),
  m("Engineering", "Load-Bearing Gantry", 1, 2, "While the mech is Anchored, every crew member in its zone ignores Heavy for carrying and loading, and the mech can hold a structure, door, or ceiling open for all of them at once without spending Actions."),
  m("Engineering", "Field Shelter Deployment", 2, 2, "As a Slow Action, deploy a sealed shelter in the mech's zone. Up to four crew may Rest inside it as though aboard the ship, and the zone counts as Secured against ordinary weather, atmosphere, and ambient hazards while it stands."),

  m("Medical", "Integrated Medkit", 1, 1, "Counts as a Medkit and allows First Aid without drawing separate equipment."),
  m("Medical", "Stabilization Harness", 1, 1, "A passenger carried by the mech can't suffer additional Bleeding damage while the harness is active."),
  m("Medical", "Trauma Monitoring System", 1, 1, "Automatically identifies the severity of visible Injuries and whether Surgery is urgently required."),
  m("Medical", "Auto-Injector Array", 1, 2, "Once per Scene, remove Weakened, Confused, or Staggered from the pilot. The pilot becomes Drained afterward."),
  m("Medical", "Mobile Surgical Cradle", 2, 3, "Counts as a Field Setup Medical Bay wherever the mech is: Surgery gets −2d6 instead of −3d6 out in a derelict, or aboard a ship with no working Medical Bay. Surgery is still a Crisis task."),
  m("Medical", "Life-Support Bypass", 1, 2, "Compensates for Punctured Lungs, Collapsed Lung, Organ Failure, or similar Injuries while inside the mech. Doesn't heal them."),
  m("Medical", "Neural Grounding System", 1, 2, "Ignore the first Pressure gained from an environmental hazard each expedition. Affliction triggers still apply."),
  m("Medical", "Casualty Recovery Frame", 2, 2, "Carry up to two Downed or Immobilized characters without using inventory slots, and pull one in from an adjacent zone as a Fast Action. Neither of them can suffer further Bleeding damage while aboard."),
  m("Medical", "Crew Boarding Rail", 1, 1, "Two crew may ride the frame. They move with it, including through its Sprint, and they count as behind the mech's Cover while aboard."),
  m("Medical", "Triage Broadcast Array", 2, 3, "As a Slow Action, stabilize every Bleeding or Downed crew member in the mech's zone at once. Stabilizing is not treatment; their injuries are still untreated."),

  m("Weapon", "Ballistic Autocannon", 1, 1, "3 Ballistic Damage at Medium range. Additional successes may apply Pinned or destroy Cover.", { weapon: "Ballistic" }),
  m("Weapon", "Precision Rail Driver", 2, 2, "4 Ballistic Damage at Long range, ignores 1 Armor. Requires a Slow Action to Aim before each attack.", { weapon: "Ballistic" }),
  m("Weapon", "Suppression Array", 1, 2, "2 Ballistic Damage. On a hit, every other exposed enemy in the target zone becomes Pinned.", { weapon: "Ballistic" }),
  m("Weapon", "Breaching Arm", 1, 1, "3 Physical Damage. +3d6 against doors, Cover, Armor, and structures. Applies Brittle on hit.", { weapon: "Physical" }),
  m("Weapon", "Hydraulic Crusher", 2, 2, "5 Physical Damage against a Grappled target, 3 otherwise. May apply Crippled or destroy Armor through stunts.", { weapon: "Physical" }),
  m("Weapon", "Vibroblade Assembly", 1, 2, "3 Physical Damage; may apply Bleeding without an additional success when exploiting Physical Vulnerability.", { weapon: "Physical" }),
  m("Weapon", "Incinerator", 1, 1, "2 Fire Damage in the same or an adjacent zone. May apply Burning or Illuminated.", { weapon: "Fire" }),
  m("Weapon", "Thermal Lance", 1, 2, "3 Fire Damage to one target, ignores 1 Armor. Effective against structures and regeneration.", { weapon: "Fire" }),
  m("Weapon", "Inferno Projector", 2, 3, "Creates a Burning zone: 2 Fire Damage to creatures entering or ending their turn there. The area stays Illuminated.", { weapon: "Fire" }),
  m("Weapon", "Arc Projector", 1, 1, "2 Electric Damage; may apply Conductive or Staggered.", { weapon: "Electric" }),
  m("Weapon", "Disruption Pulse", 1, 2, "1 Electric Damage to every machine or cybernetic target in the zone; may apply Disrupted.", { weapon: "Electric" }),
  m("Weapon", "Chain Arc Array", 2, 3, "3 Electric Damage to one target, then 1 to up to two other Conductive targets in nearby zones.", { weapon: "Electric" }),
  m("Weapon", "Chemical Projector", 1, 1, "2 Chemical Damage; may apply Corroded or Poisoned.", { weapon: "Chemical" }),
  m("Weapon", "Corrosive Jet", 1, 2, "3 Chemical Damage to one target and automatically applies Corroded on a hit.", { weapon: "Chemical" }),
  m("Weapon", "Contamination Dispersal System", 2, 3, "Creates a persistent Chemical hazard in one zone. Targets entering it risk becoming Contaminated.", { weapon: "Chemical" }),
  m("Weapon", "Razorwire Deployer", 1, 2, "Fills the mech's zone or an adjacent one with wire: 1 Physical Damage and Restrained to anything entering it or ending its turn there. The crew know where it is and can pick their way through.", { weapon: "Physical" }),
  m("Weapon", "Cryogenic Dispersal Array", 2, 3, "Freezes a whole zone: 2 Chemical Damage and Slowed to anything entering it or ending its turn there, until the room thaws.", { weapon: "Chemical" }),
  m("Weapon", "Siege Mortar", 2, 3, "4 Ballistic Damage to every exposed target in one zone the mech can see, at any range. Destroys that zone's Cover outright. Extremely loud.", { weapon: "Ballistic" }),

  m("Control", "Manual Control Rig", 0, 1, "Standard mech controls. No additional benefit."),
  m("Control", "Neural Interface", 1, 2, "Interface and Frame-Compatible. +2d6 to Piloting and removes the penalty for operating a Damaged mech."),
  m("Control", "Predictive Combat Interface", 1, 3, "Once per Round, reserve a Reaction without spending a Fast Action."),
  m("Control", "Cybernetic Integration Port", 1, 2, "Choose one normally suppressed cybernetic. It becomes Frame-Compatible while connected to this mech.", { port: true }),
  m("Control", "Biological Accommodation Chamber", 2, 2, "Choose one passive biological upgrade. It stays functional inside the mech. Active attacks and extra Actions stay suppressed."),
  m("Control", "Alien Symbiosis Core", 2, 3, "One biological upgrade functions normally inside the mech, but gaining Pressure may also apply Overloaded, Enraged, or another listed side effect."),
  m("Control", "Command Beacon", 1, 2, "While the beacon is live, every crew member in the mech's zone reduces Pressure gained by 1, to a minimum of 0."),
  m("Control", "Fire Coordination Mast", 1, 3, "As a Fast Action, name one target the mech can see. Until the end of the Round every ally attacking that target rolls +2d6, and the first ally to hit it may apply Marked without spending a success."),
];

export const MODULE_BY_KEY = Object.fromEntries(MECH_MODULES.map((x) => [x.key, x])) as Record<string, MechModule>;

/**
 * The modules that edit the site rather than the frame: borders, Cover, and standing hazards.
 *
 * This is the mech path's claim on the game. Surgery changes the person and a graft changes the body;
 * only a frame changes the room, and a room is shared, so it is also the only path whose purchases
 * help the crew member who walks in next turn.
 */
export const MECH_ROOM_MODULES = [
  "barricade-extruder",
  "blast-shutter-deployer",
  "demolition-charge-rack",
  "siege-breaching-assembly",
  "razorwire-deployer",
  "cryogenic-dispersal-array",
  "siege-mortar",
  "inferno-projector",
  "contamination-dispersal-system",
  "structural-support-rig",
  "phase-step-actuator",
];

/** The modules that spend the frame's size on somebody other than the pilot. */
export const MECH_SUPPORT_MODULES = [
  "command-beacon",
  "fire-coordination-mast",
  "casualty-recovery-frame",
  "crew-boarding-rail",
  "triage-broadcast-array",
  "load-bearing-gantry",
  "field-shelter-deployment",
  "medical-evacuation-cradle",
  "retrieval-winch",
  "heavy-lift-actuators",
  "extended-life-support",
];
export const MODULE_CATEGORIES: ModuleCategory[] = ["Weapon", "Defensive", "Cargo & Salvage", "Environmental", "Mobility", "Sensors", "Engineering", "Medical", "Control"];

export const MODULE_RECIPES: Record<1 | 2 | 3, Recipe> = {
  1: [{ name: "Scrap Metal", qty: 2 }, { name: "Scrap Components", qty: 2 }, { name: "Basic Adhesive", qty: 1 }],
  2: [{ name: "Reinforced Steel", qty: 1 }, { name: "Components", qty: 2 }, { name: "Advanced Adhesive", qty: 1 }],
  3: [{ name: "Neutronium", qty: 2 }, { name: "Quantum Components", qty: 2 }, { name: "Advanced Adhesive", qty: 2 }],
};

export const MODULE_CRAFT_TASK: Record<1 | 2 | 3, string> = {
  1: "Mechanical Technician or Engineering, Routine 3, 2 Energy, 1 segment, Grade I Workshop, Improvised Toolkit or better",
  2: "Mechanical Technician or Engineering, Routine 5, 2 Energy, 1 segment, Grade II Workshop, Standard Toolkit or better",
  3: "Mechanical Technician or Engineering, Routine 7, 3 Energy, 1 segment, Grade III Workshop, Advanced Toolkit",
};

/** Materials per 2 HP restored by a Repair Mech Task. */
export const MECH_REPAIR_RECIPES: Record<1 | 2 | 3, Recipe> = {
  1: [{ name: "Scrap Metal", qty: 2 }, { name: "Scrap Components", qty: 1 }],
  2: [{ name: "Reinforced Steel", qty: 1 }, { name: "Components", qty: 1 }],
  3: [{ name: "Neutronium", qty: 1 }, { name: "Quantum Components", qty: 1 }],
};

export const moduleItemName = (mod: Pick<MechModule, "name">) => `${mod.name} (mech module)`;
