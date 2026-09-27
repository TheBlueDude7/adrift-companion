import { MATERIALS, RECIPES } from "@/data/crafting";
export const ATTRIBUTES = ["STR", "CON", "INT", "WIT"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  STR: "Strength",
  CON: "Constitution",
  INT: "Intelligence",
  WIT: "Wits",
};

export const SKILLS = [
  { key: "closeCombat", name: "Close Combat", attr: "STR" },
  { key: "lightFirearms", name: "Light Firearms", attr: "STR" },
  { key: "heavyWeaponry", name: "Heavy Weaponry", attr: "STR" },
  { key: "acrobatics", name: "Acrobatics", attr: "STR" },
  { key: "firstAid", name: "First Aid", attr: "INT" },
  { key: "surgery", name: "Surgery", attr: "INT" },
  { key: "botany", name: "Botany", attr: "INT" },
  { key: "biology", name: "Biology", attr: "INT" },
  { key: "piloting", name: "Piloting", attr: "INT" },
  { key: "navigation", name: "Navigation", attr: "INT" },
  { key: "mechTech", name: "Mechanical Technician", attr: "INT" },
  { key: "engineering", name: "Engineering", attr: "INT" },
  { key: "perception", name: "Perception", attr: "WIT" },
  { key: "stealth", name: "Stealth", attr: "WIT" },
  { key: "scavenging", name: "Scavenging", attr: "WIT" },
  { key: "cooking", name: "Cooking", attr: "WIT" },
  { key: "entertainer", name: "Entertainer", attr: "WIT" },
] as const satisfies readonly { key: string; name: string; attr: Attribute }[];

export type SkillKey = (typeof SKILLS)[number]["key"];

export const SKILL_BY_KEY = Object.fromEntries(SKILLS.map((s) => [s.key, s])) as Record<
  SkillKey,
  (typeof SKILLS)[number]
>;

export const MAX_SKILL_LEVEL = 10;
export const CREATION_ATTRIBUTE_POINTS = 6;
export const CREATION_SKILL_XP = 45;

/** XP needed to go from `level` to `level + 1`. */
export const xpForNextLevel = (level: number) => level + 1;
/** Total XP invested to reach `level` from 0. */
export const totalXpForLevel = (level: number) => (level * (level + 1)) / 2;

export type Frequency = "day" | "expedition" | "combat" | "passive";

export type BackgroundAbility = {
  name: string;
  frequency: Frequency;
  summary: string;
};

export type Background = {
  key: string;
  name: string;
  tagline: string;
  attributes: Partial<Record<Attribute, number>>;
  skills: Partial<Record<SkillKey, number>>;
  signature: BackgroundAbility;
  specialties: BackgroundAbility[];
};

export const BACKGROUNDS: Background[] = [
  {
    key: "marine",
    name: "Fleet Marine",
    tagline: "Fight, bleed, and kill.",
    attributes: { STR: 1, CON: 1 },
    skills: { lightFirearms: 2, heavyWeaponry: 1, acrobatics: 1 },
    signature: {
      name: "Breach and Clear",
      frequency: "combat",
      summary:
        "When you enter a zone with a hostile (or one enters yours): Pin a visible hostile, become Fortified, or move an ally into Cover.",
    },
    specialties: [
      { name: "Suppression Doctrine", frequency: "passive", summary: "Once per Round, Ballistic Damage may apply Pinned or Marked without a success." },
      { name: "Close-Quarters Doctrine", frequency: "combat", summary: "First Physical Damage each combat in your zone also applies Staggered or Disarmed." },
      { name: "Adrenal Conditioning", frequency: "expedition", summary: "Suppress reaching 0 Energy, Drained, Weakened, or Staggered until the Scene ends." },
    ],
  },
  {
    key: "covert",
    name: "Covert Operative",
    tagline: "Ironic that your death may be unseen too.",
    attributes: { WIT: 1, STR: 1 },
    skills: { stealth: 2, lightFirearms: 1, acrobatics: 1 },
    signature: {
      name: "Ghost Protocol",
      frequency: "passive",
      summary: "Your first hostile Action while Hidden resolves before Hidden ends. Once per zone, relocate between concealed positions without a Stealth Task.",
    },
    specialties: [
      { name: "Prepared Exit", frequency: "expedition", summary: "When combat begins or retreat is declared, you and allies move one zone toward an exit as a Reaction." },
      { name: "Surgical Opening", frequency: "combat", summary: "First successful attack from Hidden: apply Silenced, Exposed, or deny Reactions." },
      { name: "No Trace", frequency: "expedition", summary: "Prevent a crew action from alerting a nearby threat, revealing the crew, or letting pursuers close in." },
    ],
  },
  {
    key: "engineer",
    name: "Ship Engineer",
    tagline: "Anything for another breath of stale, ship-generated air.",
    attributes: { INT: 2 },
    skills: { engineering: 2, mechTech: 2 },
    signature: {
      name: "Keep It Running",
      frequency: "day",
      summary: "When a reachable module or mech goes Offline or is disabled, keep one function running until the end of the segment or Scene.",
    },
    specialties: [
      { name: "Redline Familiarity", frequency: "day", summary: "Overdrive a facility (+1 Grade for a Task), produce 3 items, boost a mech, or run a Keep It Running system at full output." },
      { name: "Field Improviser", frequency: "passive", summary: "Expedition repairs ignore the −3d6 penalty for lacking a Workshop or mech berth." },
      { name: "Modular Thinking", frequency: "expedition", summary: "Temporarily repurpose one mech module as another of the same Tier or lower." },
    ],
  },
  {
    key: "medic",
    name: "Medical Officer",
    tagline: "Now, you cannot tolerate such failure.",
    attributes: { CON: 1, INT: 1 },
    skills: { firstAid: 2, surgery: 2 },
    signature: {
      name: "Triage Authority",
      frequency: "passive",
      summary: "Instantly learn the details of Injuries you see. Once per patient per expedition, suppress one condition caused by an Injury.",
    },
    specialties: [
      { name: "You're Not Dying Today", frequency: "expedition", summary: "A reachable character who would die instead stays Stabilized at 0 HP until the Scene ends." },
      { name: "Combat Medic", frequency: "combat", summary: "Fast Action First Aid with no roll or kit: remove Bleeding, Burning, Poisoned, Staggered, Suffocating, or stabilize." },
      { name: "High Surgeon", frequency: "passive", summary: "Successful Surgery on a Major/Critical Injury grants an extra benefit." },
    ],
  },
  {
    key: "pilot",
    name: "Pilot",
    tagline: "Starcharts do not mean much in a graveyard of ships.",
    attributes: { WIT: 2 },
    skills: { piloting: 2, navigation: 1, acrobatics: 1 },
    signature: {
      name: "Vector Sense",
      frequency: "day",
      summary: "While piloting, use your Reaction to cancel forced movement, prevent Prone, dodge a hazard, or resist Immobilized/Servo-Locked.",
    },
    specialties: [
      { name: "Instinctive Evasion", frequency: "day", summary: "Reduce Damage to a ship or mech you're piloting to 0." },
      { name: "Mech Expert", frequency: "passive", summary: "Mechs gain an extra Module Slot and +4 mech HP while you pilot." },
      { name: "Fly It Like You Stole It", frequency: "expedition", summary: "Overdrive a ship or mech for one Scene (ship: +3d6 Piloting, +1 zone movement)." },
    ],
  },
  {
    key: "xenobio",
    name: "Xenobiology Researcher",
    tagline: "Now it is studying you.",
    attributes: { INT: 2 },
    skills: { biology: 2, firstAid: 1, scavenging: 1 },
    signature: {
      name: "Pattern Recognition",
      frequency: "passive",
      summary: "Learn one true fact the first time an unfamiliar species uses an ability; two facts on your first successful Analyze.",
    },
    specialties: [
      { name: "Non-Human Empathy", frequency: "expedition", summary: "Produce a biological signal to make a creature withdraw, pause, or let you leave." },
      { name: "Exploit the Pattern", frequency: "combat", summary: "An Analyzed creature loses one level of defense against a condition for the Scene." },
      { name: "Specimen Over Self", frequency: "passive", summary: "First specimen from an unfamiliar organism takes no slots and reveals a property." },
    ],
  },
  {
    key: "quartermaster",
    name: "Logistics and Quartermaster",
    tagline: "Hopefully, what remains of the crew still respects the manifest.",
    attributes: { INT: 1, CON: 1 },
    skills: { scavenging: 2, cooking: 2, entertainer: 2 },
    signature: {
      name: "Contingency Pack",
      frequency: "passive",
      summary: "Two undecided Contingency Slots. Reveal any ordinary portable item that was aboard when you packed, as often as you like; a slot reopens when its item is used up or handed off.",
    },
    specialties: [
      { name: "Rally", frequency: "day", summary: "Prevent an ally's Mind Break and reduce their Pressure by 1." },
      { name: "Loadmaster", frequency: "passive", summary: "Each expedition member gives one slot to a shared pool; pool cargo passes between members in the same zone without an Action." },
      { name: "Ration Discipline", frequency: "passive", summary: "Supervised rationing causes no second-day Stress and skips the Constitution roll." },
    ],
  },
  {
    key: "terraformer",
    name: "Terraformer",
    tagline: "You have your work cut out for you.",
    attributes: { INT: 2 },
    skills: { botany: 2, biology: 1, firstAid: 1 },
    signature: {
      name: "Make It Habitable",
      frequency: "expedition",
      summary: "Spend an Expedition Turn and a common material to protect a zone from one environmental threat.",
    },
    specialties: [
      { name: "Closed-Loop Cultivation", frequency: "day", summary: "Successful Food production yields +2 Food Units (and possibly 1 Biomass). +2 Botany." },
      { name: "Adaptive Cultivar", frequency: "passive", summary: "Prepare condition-resistance doses in Hydroponics before an expedition." },
      { name: "Reclamation Ecology", frequency: "passive", summary: "Introduce a reclamation culture to a Secured zone." },
    ],
  },
];

export const BACKGROUND_BY_KEY = Object.fromEntries(BACKGROUNDS.map((b) => [b.key, b])) as Record<
  string,
  Background
>;

export const SEGMENTS = ["Morning", "Afternoon", "Evening", "Night"] as const;

export const PRESSURE_STATES = [
  { name: "Calm", dice: 0, failure: "No additional consequence." },
  { name: "Shaken", dice: 1, failure: "Become Pressured." },
  { name: "Pressured", dice: 2, failure: "Lose 1 current Energy and gain 1 Stress." },
  { name: "Overtaxed", dice: 3, failure: "Lose all current Energy, gain 1 Pressure and 1 Stress." },
  { name: "Panicked", dice: 4, failure: "Lose all current Energy, take 2 HP damage, gain 1 Stress, and trigger a Mind Break." },
] as const;

export const PANICKED = 4;

export const pressureTip = (level: number) => {
  const p = PRESSURE_STATES[level];
  return `${p.name}: ${p.dice ? `+${p.dice}d6 Pressure dice on rolls` : "no Pressure dice on rolls"}. On a failed roll: ${p.failure}`;
};

export const STRESS_BANDS = [
  { min: 0, max: 2, name: "Stable", effect: "No additional effect." },
  { min: 3, max: 4, name: "Strained", effect: "The first time you gain Pressure each day, gain one additional level." },
  { min: 5, max: 6, name: "Frayed", effect: "Begin each expedition Shaken. After sleep, Pressure cannot recover below Shaken." },
  { min: 7, max: 8, name: "Unstable", effect: "Begin each expedition Pressured. The first Mind Break each expedition also causes an Affliction." },
  { min: 9, max: 9, name: "Breaking", effect: "Begin every day Pressured. Every Mind Break causes an Affliction." },
  { min: 10, max: 10, name: "Collapsed", effect: "Immediately gain an Affliction. Further Stress gains cause a Mind Break instead." },
] as const;

export const stressBand = (stress: number) =>
  STRESS_BANDS.find((b) => stress >= b.min && stress <= b.max) ?? STRESS_BANDS[0];

/** Minimum Pressure a character starts the day at, based on Stress. */
export const dailyPressureFloor = (stress: number) => (stress >= 9 ? 2 : stress >= 5 ? 1 : 0);

export const MIND_BREAKS = [
  { roll: 1, name: "Freeze Response", effect: "Cannot move, speak, or take actions and is helpless." },
  { roll: 2, name: "Total Shutdown", effect: "Collapses unconscious until the immediate danger ends or medical intervention succeeds." },
  { roll: 3, name: "Flight Instinct", effect: "Must flee by the safest apparent route, abandoning plans and equipment if necessary." },
  { roll: 4, name: "Dissociation", effect: "All actions suffer −6d6. May not recognize allies, threats, or surroundings correctly." },
  { roll: 5, name: "Compulsive Shedding", effect: "Attempts to remove worn equipment, armor, clothing, or implants that feel foreign." },
  { roll: 6, name: "Violent Outburst", effect: "Attacks the nearest perceived threat recklessly, then all rolls suffer −6d6 until the break ends." },
] as const;
export const MIND_BREAK_BY_NAME: Record<string, (typeof MIND_BREAKS)[number]> = Object.fromEntries(MIND_BREAKS.map((m) => [m.name, m]));

export const INJURY_SEVERITIES = ["Minor", "Major", "Deadly"] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];
export const severityFromRoll = (d6: number): InjurySeverity => (d6 <= 3 ? "Minor" : d6 <= 5 ? "Major" : "Deadly");

export const INJURY_STATES = ["Untreated", "Stabilized", "Treated"] as const;
export type InjuryState = (typeof INJURY_STATES)[number];

export const CONDITION_DURATIONS = ["Brief", "Ongoing", "Scene", "Persistent"] as const;
export type ConditionDuration = (typeof CONDITION_DURATIONS)[number];

export const HULL_TIERS = [
  { name: "Barely Standing", maxHp: 4, armorDice: 0 },
  { name: "Patched", maxHp: 6, armorDice: 1 },
  { name: "Reinforced", maxHp: 8, armorDice: 3 },
  { name: "Plated", maxHp: 10, armorDice: 5 },
] as const;

export const MODULE_CONDITIONS = ["Operational", "Damaged", "Critical", "Offline", "Destroyed"] as const;
export type ModuleCondition = (typeof MODULE_CONDITIONS)[number];

export const MODULE_CONDITION_EFFECTS: Record<ModuleCondition, string> = {
  Operational: "Functions normally and supports Routine work.",
  Damaged: "Tasks suffer −2d6; Routine work becomes Skilled; output may be reduced.",
  Critical: "No Routine work; Tasks are Skilled or Crisis at −3d6; failure may worsen it to Offline.",
  Offline: "Cannot function or support Tasks. Requires repair.",
  Destroyed: "Must be rebuilt using its Construction Project.",
};

/** Progress needed to restore one condition step, keyed by the current condition. */
export const REPAIR_PROGRESS: Partial<Record<ModuleCondition, number>> = {
  Damaged: 1,
  Critical: 2,
  Offline: 3,
};

export const FACILITY_GRADES = ["Makeshift", "Grade I", "Grade II", "Grade III", "Experimental"] as const;
export type FacilityGrade = (typeof FACILITY_GRADES)[number];

export type ModulePreset = { name: string; powerDraw: number; powerOutput?: number; essential?: boolean };

export const MODULE_PRESETS: ModulePreset[] = [
  { name: "Fusion Reactor", powerDraw: 0, powerOutput: 6, essential: true },
  { name: "Life Support", powerDraw: 1, essential: true },
  { name: "Engine Section", powerDraw: 3 },
  { name: "Navigation & Sensor Suite", powerDraw: 1 },
  { name: "Crew Quarters", powerDraw: 1 },
  { name: "Kitchen", powerDraw: 1 },
  { name: "Workshop / Fabrication Bay", powerDraw: 1 },
  { name: "Medical Bay", powerDraw: 2 },
  { name: "Hydroponics", powerDraw: 2 },
  { name: "Storage Bay", powerDraw: 0 },
  { name: "Cybernetics Lab", powerDraw: 2 },
  { name: "Biological Lab", powerDraw: 3 },
  { name: "Armory", powerDraw: 0 },
  { name: "Defensive System", powerDraw: 2 },
  { name: "Ship Weapon", powerDraw: 3 },
];

export const OVERLOAD_BONUS = 2;

export const ITEM_CATEGORIES = [
  "Material",
  "Supply",
  "Medical",
  "Tool",
  "Weapon",
  "Armor",
  "Equipment",
  "Specimen",
  "Other",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_TIERS = ["Scrap", "Tier I", "Tier II", "Tier III", "Alien"] as const;
export type ItemTier = (typeof ITEM_TIERS)[number];

export type ItemTemplate = {
  name: string;
  category: ItemCategory;
  tier?: ItemTier;
  maxCharges?: number;
  armor?: number;
  heavy?: boolean;
  notes?: string;
};

const BASE_ITEM_TEMPLATES: ItemTemplate[] = [
  { name: "Food Unit", category: "Supply", notes: "One day of food for one survivor." },
  { name: "Water Unit", category: "Supply", notes: "One day of water for one survivor." },
  { name: "Fuel Unit", category: "Supply", notes: "Usually Tritium and Deuterium. Refined into Power Cells at the Workshop, which move the ship and run mechs." },
  { name: "Medical Supply", category: "Medical" },
  { name: "Brace", category: "Medical", notes: "Mobility support for leg, pelvis, and ligament Injuries." },
  { name: "Portable Oxygen Supply", category: "Equipment", maxCharges: 3 },
  { name: "Large Salvage", category: "Material", heavy: true, notes: "Machinery, plating, or a sealed crate worth hauling back. Break it down aboard the ship." },
];

export const DEFAULT_ITEM_TEMPLATES: ItemTemplate[] = [
  ...MATERIALS.map((m): ItemTemplate => ({ name: m.name, category: "Material", tier: m.tier, heavy: m.heavy, notes: m.notes })),
  ...BASE_ITEM_TEMPLATES,
  ...RECIPES.filter((r) => !MATERIALS.some((m) => m.name === r.name) && !BASE_ITEM_TEMPLATES.some((b) => b.name === r.name)).map(
    (r): ItemTemplate => ({ name: r.name, category: r.category, tier: r.tier, maxCharges: r.charges && r.charges > 1 ? r.charges : undefined, armor: r.armor, notes: r.notes }),
  ),
];

export const PROJECT_TEMPLATES = [
  { name: "Expand Ship", skill: "Engineering", threshold: 4, required: 8, contributorLimit: 3, energy: 3, facility: "Operational Workshop", materials: "Per Progress by hull tier: 3 Scrap Metal (Barely Standing/Patched), 2 Reinforced Steel (Reinforced), 1 Neutronium (Plated); plus 1 Toolkit charge." },
  { name: "Hull Repair", skill: "Mech. Technician 3 / Engineering 4", threshold: 3, required: 1, contributorLimit: 2, energy: 2, facility: "Operational Workshop", materials: "Per Hull HP: 3 Scrap Metal + 1 Basic Adhesive (Patched), 2 Reinforced Steel + 1 Basic Adhesive (Reinforced), 1 Neutronium + 1 Advanced Adhesive (Plated); plus 1 Toolkit charge." },
  { name: "Install Workshop (Grade I)", skill: "Engineering", threshold: 3, required: 4, contributorLimit: 2, energy: 2, facility: "Improvised Toolkit or better", materials: "Upfront: 1 Basic Adhesive. Per Progress: 2 Scrap Metal + 1 Scrap Component." },
  { name: "Install Module", skill: "Engineering", threshold: 3, required: 4, contributorLimit: 2, energy: 2, facility: "An empty room", materials: "The module's first upgrade level, spent when the project starts. The module is installed when it's complete." },
  { name: "Upgrade Module", skill: "Engineering", threshold: 4, required: 4, contributorLimit: 2, energy: 2, facility: "The module's room", materials: "The next level's upgrade cost, spent when the project starts. Engineering 4 up to the third level, then 6, 8, and 10. The upgrade applies when it's complete." },
  { name: "Module Repair", skill: "Mechanical Technician", threshold: 5, required: 1, contributorLimit: 2, energy: 2, facility: "Workshop", materials: "Damaged→Operational 1, Critical→Damaged 2, Offline→Critical 3 Progress." },
  { name: "Stress Recovery", skill: "Entertainer", threshold: 3, required: 3, contributorLimit: 1, energy: 2, facility: "Crew Quarters or Medical Bay", materials: "Choose the patient when starting. Completion: the patient’s Stress drops by 1d4 + 2. Lost if the patient gains Stress first." },
  { name: "Affliction Treatment", skill: "Surgery 4 / Entertainer 4 (always Skilled)", threshold: 4, required: 5, contributorLimit: 1, energy: 0, facility: "Medical Bay", materials: "Psychiatric Medication or Special Brew each day. Missing a day resets Progress." },
  { name: "Mech Frame (Tier I)", skill: "Mechanical Technician or Engineering", threshold: 4, required: 6, contributorLimit: 2, energy: 2, facility: "Grade I Workshop and an available mech berth", materials: "Per Progress: 2 Scrap Metal + 1 Scrap Component, and 1 Toolkit charge per contribution (Improvised or better). Completion: 2 Basic Adhesive. Record the finished frame on the Mechs tab." },
  { name: "Mech Frame (Tier II)", skill: "Mechanical Technician or Engineering", threshold: 6, required: 8, contributorLimit: 2, energy: 3, facility: "Grade II Workshop and an available mech berth", materials: "Per Progress: 1 Reinforced Steel + 1 Component, and 1 Toolkit charge per contribution (Standard or better). Completion: 2 Advanced Adhesive." },
  { name: "Mech Frame (Tier III)", skill: "Engineering", threshold: 8, required: 10, contributorLimit: 2, energy: 3, facility: "Grade III Workshop and an available mech berth", materials: "Per Progress: 1 Neutronium + 1 Quantum Component, and 1 Toolkit charge per contribution (Advanced). Completion: 3 Advanced Adhesive." },
  { name: "Mech Upgrade (Tier I → II)", skill: "Mechanical Technician or Engineering", threshold: 6, required: 5, contributorLimit: 2, energy: 3, facility: "Grade II Workshop and a mech berth", materials: "Per Progress: 1 Reinforced Steel + 1 Component, and 1 Toolkit charge per contribution. Completion: 2 Advanced Adhesive. The mech is Offline until done." },
  { name: "Mech Upgrade (Tier II → III)", skill: "Engineering", threshold: 8, required: 7, contributorLimit: 2, energy: 3, facility: "Grade III Workshop and a mech berth", materials: "Per Progress: 1 Neutronium + 1 Quantum Component, and 1 Toolkit charge per contribution. Completion: 3 Advanced Adhesive. The mech is Offline until done." },
  { name: "Cybernetic Research (Tier II)", skill: "Engineering", threshold: 6, required: 5, contributorLimit: 2, energy: 2, facility: "Cybernetics Lab, Grade II Workshop and Grade II Medical Bay, Standard Toolkit or better", materials: "Committed at the start: 1 Cybernetic Core, 2 Reinforced Steel, 3 Components, 1 Advanced Adhesive. Choose a category; on completion, roll for the technology and record it under Cybernetic research." },
  { name: "Cybernetic Research (Tier III)", skill: "Engineering", threshold: 8, required: 8, contributorLimit: 2, energy: 3, facility: "Cybernetics Lab, Grade III Workshop and Grade III Medical Bay, Advanced Toolkit", materials: "Committed at the start: 2 Cybernetic Cores, 2 Neutronium, 3 Quantum Components, 2 Advanced Adhesive. Needs two Tier II technologies unlocked in the category (Damage: the matching Tier II system)." },
  { name: "Custom Project", skill: "", threshold: 0, required: 4, contributorLimit: 2, energy: 2, facility: "", materials: "" },
] as const;

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  day: "Once per day",
  expedition: "Once per expedition (resets at End of Day)",
  combat: "Once per combat",
  passive: "Passive",
};

export const CONDITION_GROUPS: { name: string; conditions: string[] }[] = [
  { name: "Combat", conditions: ["Surprised", "Prone", "Pinned", "Grappled", "Restrained", "Immobilized", "Staggered", "Slowed", "Exposed", "Marked"] },
  { name: "Senses & mind", conditions: ["Blinded", "Deafened", "Disoriented", "Frightened", "Confused", "Enraged", "Compelled", "Silenced"] },
  { name: "Body", conditions: ["Weakened", "Drained", "Bleeding", "Brittle", "Crippled", "Disarmed"] },
  { name: "Fire", conditions: ["Burning", "Smoldering", "Illuminated", "Overheated"] },
  { name: "Electric", conditions: ["Conductive", "Disrupted", "Jammed"] },
  { name: "Chemical", conditions: ["Corroded", "Poisoned", "Contaminated"] },
  { name: "Environment", conditions: ["Suffocating", "Freezing", "Anchored", "Weightless"] },
  { name: "Beneficial", conditions: ["Regenerating", "Hidden", "Fortified", "Accelerated"] },
];

export const COMMON_CONDITIONS = ["Bleeding", "Staggered", "Prone", "Frightened", "Burning", "Poisoned", "Contaminated", "Weakened", "Slowed", "Confused"];

export const BENEFICIAL_CONDITIONS = new Set(["Regenerating", "Hidden", "Fortified", "Accelerated", "Anchored"]);

/** Resolved immediately rather than remaining on the character. */
export const INSTANT_CONDITIONS = new Set(["Drained", "Disarmed"]);

export const DEFAULT_CONDITION_DURATION: Record<string, ConditionDuration> = {
  Surprised: "Brief",
  Staggered: "Brief",
  Confused: "Brief",
  Accelerated: "Brief",
  Fortified: "Brief",
  Prone: "Ongoing",
  Pinned: "Ongoing",
  Grappled: "Ongoing",
  Restrained: "Ongoing",
  Immobilized: "Ongoing",
  Exposed: "Ongoing",
  Burning: "Ongoing",
  Overheated: "Ongoing",
  Suffocating: "Ongoing",
  Freezing: "Ongoing",
  Weightless: "Ongoing",
  Anchored: "Ongoing",
  Compelled: "Ongoing",
  Silenced: "Ongoing",
  Illuminated: "Ongoing",
  Jammed: "Ongoing",
  Bleeding: "Persistent",
  Crippled: "Persistent",
  Poisoned: "Persistent",
  Contaminated: "Persistent",
};

export const defaultDuration = (name: string): ConditionDuration => DEFAULT_CONDITION_DURATION[name] ?? "Scene";
