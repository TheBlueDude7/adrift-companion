import type { Attribute, SkillKey } from "@/lib/rules";

export type TaskMode = "routine" | "skilled" | "crisis";

/** How the tracker resolves the task's normal result. Everything else is narrated by the GM. */
export type TaskEffect = "rest" | "project" | "course" | "scan" | "assist" | "craft" | "cook" | "medicine" | "salvage" | "harvest" | "tend" | "convert" | "purify" | "reclaim" | "yield" | "morale" | "calm" | "bleed" | "tune" | "rations" | "train" | "patch" | null;

/** A module the task needs. Several names mean any of them will do. */
export type TaskFacility = { modules: string[]; level?: number; label: string };

export type ShipboardTask = {
  name: string;
  group: string;
  energy: number;
  /** Any of these skills can meet the threshold. */
  skills: SkillKey[];
  /** Labor: untrained physical work, where Strength stands in for the Skill Level. No skill applies. */
  labor?: boolean;
  /** Rolls this attribute instead of the skill's own. Research reads Wits rather than Intelligence. */
  attr?: Attribute;
  /** Routine Threshold, read as Strength on a Labor task. Tasks marked skilled or crisis always roll. */
  threshold: number;
  mode: TaskMode;
  result: string;
  effect: TaskEffect;
  /** Strong Result, earned on two 6s or automatically by an Expert. */
  strong?: string;
  /** Never rolled, so there's no Strong Result to offer at all. */
  noStrong?: boolean;
  facility?: TaskFacility;
  /** Levels above the threshold that earn the Strong Result without rolling. Defaults to EXPERT_MARGIN. */
  expertAt?: number;
  /** What a "yield" task stocks in ship storage. */
  yields?: { name: string; qty: number };
  /** Only the GM resolves it. Players roll and resolve every other task of their own. */
  gmResolves?: boolean;
  /** A free action taken from the character sheet whenever it's needed, not planned into a segment. */
  free?: boolean;
};

/** Mastery: levels above a Routine Threshold that cut the task's Energy by 1. */
export const PRACTICED_MARGIN = 3;
/** Mastery: levels above a Routine Threshold that earn the Strong Result without rolling. */
export const EXPERT_MARGIN = 6;
/** Mastery: levels above a Project's threshold that add 2 Progress per Routine segment. */
export const PROJECT_MARGIN = 4;
/**
 * Labor's own Routine Benefit margins. Strength spans 1–6 where a skill spans 0–10, so the
 * skill margins above would put Practiced and Expert out of reach of any realistic Strength.
 */
export const LABOR_PRACTICED_MARGIN = 1;
export const LABOR_EXPERT_MARGIN = 2;
export const LABOR_PROJECT_MARGIN = 2;
/**
 * The Strength that lets a character lend their back to a Project someone trained is already working.
 * Set above the ordinary Labor thresholds: a seat on skilled work is worth more than shifting a crate.
 */
export const LABOR_ASSIST_THRESHOLD = 3;
/** Items one Fabricate task makes, each paying the task's Energy. An Expert adds one more for free. */
export const FABRICATE_ITEMS = 2;

type Extra = Pick<ShipboardTask, "strong" | "facility" | "expertAt" | "yields" | "gmResolves" | "free" | "noStrong" | "labor" | "attr">;

/** Research reads the pattern before it reads the textbook, so it rolls Wits with the knowledge skill. */
const RESEARCH: Pick<ShipboardTask, "attr"> = { attr: "WIT" };

const t = (name: string, group: string, energy: number, skills: SkillKey[], threshold: number, result: string, mode: TaskMode = "routine", effect: TaskEffect = null, extra: Extra = {}): ShipboardTask => ({ name, group, energy, skills, threshold, mode, result, effect, ...extra });

const KITCHEN: TaskFacility = { modules: ["Kitchen"], level: 1, label: "a Kitchen" };
const HYDROPONICS: TaskFacility = { modules: ["Hydroponics"], level: 1, label: "Seeded Hydroponics" };
const NAV_SUITE: TaskFacility = { modules: ["Navigation & Sensor Suite"], level: 1, label: "a working Navigation & Sensor Suite" };

/** The Standard Shipboard Tasks table, plus project work, assisting, and free-form tasks. */
export const SHIPBOARD_TASKS: ShipboardTask[] = [
  t("Rest", "Recovery", 0, [], 0, "Qualify for Energy recovery and reduce Pressure by 1, never below the Stress floor.", "routine", "rest", { noStrong: true }),
  t("Work on a project", "Ship", 0, [], 0, "Add Progress to a Project. Uses the Project's skill, threshold, and Energy. 4 levels above its threshold adds 2 Progress.", "routine", "project"),
  t("Upgrade Module", "Ship", 2, ["engineering"], 4, "Advance an eligible module upgrade Project. Engineering 4 up to the third level, then 6, 8, and 10.", "routine", "project", { strong: "Recover 20% of the materials, rounded down." }),
  t("Repair Ordinary Ship Damage", "Ship", 2, ["mechTech"], 5, "Repair a stable module (Mechanical Technician 5). Restoring Hull HP is the Hull Repair project instead: Mechanical Technician 3 or Engineering 4.", "routine", "project", { strong: "Regain the Energy spent." }),
  t("Fabricate Common Item", "Ship", 2, ["mechTech"], 3, "Create two items from known recipes for the one Energy cost, using their skill: Mechanical Technician 3 for Tier I, 6 for Tier II, 9 for Tier III. 6 levels above every threshold makes a third item in the same segment, also covered.", "routine", "craft"),
  t("Deconstruct Common Item", "Ship", 1, ["scavenging"], 2, "Take an item in the hold apart for half the materials it was made from, rounded down, off the bulkiest inputs first. Scavenging 2 for Tier I, 4 for Tier II, 6 for Tier III, 7+ for alien equipment.", "routine", "salvage", { strong: "Recover three quarters of the materials instead of half." }),
  t("Salvage Ship", "Ship", 2, ["scavenging"], 4, "Scavenge a ship using the scavenge rules.", "routine", null, { strong: "Find additional or higher-quality materials.", gmResolves: true }),
  t("Tune the Reactor", "Ship", 1, ["engineering"], 6, "+1 Power Unit until the end of the day. Needs a Large reactor (Engineering 6), or Voltaic and up (Engineering 8).", "routine", "tune", { facility: { modules: ["Fusion Reactor"], level: 3, label: "a Large reactor or better" } }),
  t("Brace the Hull", "Ship", 2, [], 0, "Shore up a breach with your shoulder and whatever will wedge: 1 temporary Hull HP, which the next Hit gives way to. It can't raise the ship above 1 Hull HP, so it only buys time at a holed hull.", "skilled", "patch", { labor: true, noStrong: true }),
  t("Rig Safety Lines", "Ship", 1, ["acrobatics"], 2, "String lines, tethers, and handholds through a Weightless, unpressurized, or Exposed Construction space. Work there stops counting as Crisis for the rest of the day.", "routine", null, { strong: "The rigging reaches one adjoining space too." }),
  t("Plot Safe Course", "Navigation", 1, ["piloting"], 4, "Move through scanned, stable space. Piloting 4 for 1 tile, 6 for 2, 8 for 3–4. Burns one Power Cell; Piloting 8 skips the cell once per day.", "routine", "course", { strong: "No Power Cell consumed." }),
  t("Plot Unsafe Course", "Navigation", 1, ["piloting"], 0, "Move through unknown space. Into an unscanned tile it's a Crisis task at −3d6. Burns one Power Cell.", "skilled", "course", { strong: "Avoid the hazard, collision, or ambush." }),
  t("Scan Nearby Tile", "Navigation", 1, ["navigation"], 4, "Reveal basic information about a tile. Navigation 4 for adjacent tiles, 6 for 2 tiles away (Enhanced suite), 8 for 3 tiles (Biometric).", "routine", "scan", { strong: "Also reveal a concealed signal, hazard, or secondary point of interest.", facility: NAV_SUITE }),
  t("Deep Scan", "Navigation", 2, ["navigation"], 7, "Sweep a tile for concealed signals, hidden ships, and anomalies. Alien anomalies need an Enigmatic suite and Navigation 9.", "routine", "scan", { strong: "Also identify the signal's source and whether it's hostile.", facility: { modules: ["Navigation & Sensor Suite"], level: 2, label: "an Operational Navigation & Sensor Suite" } }),
  t("Prepare Food", "Food & water", 1, ["cooking"], 1, "Cook one galley recipe: meals, Special Brews, or Chemical Mixtures. Uses Cooking at the recipe's threshold, and a rough galley costs dice. A botched check still makes whatever the recipe lists.", "routine", "cook", { strong: "Make one extra meal.", facility: KITCHEN }),
  t("Stretch Rations", "Food & water", 1, ["cooking"], 5, "Tonight, every 3 Food Units feed 4 survivors.", "routine", "rations", { facility: KITCHEN }),
  t("Harvest Hydroponics", "Food & water", 1, ["botany"], 0, "Collect whatever the beds have ready, whichever crop it was. +1 of it for every 3 Botany levels.", "routine", "harvest", { strong: "+1 more.", facility: HYDROPONICS }),
  t("Maintain Crops", "Food & water", 2, ["botany"], 2, "Prevent ordinary crop loss and advance cultivation. Empty beds are sown with the crop the crew has chosen. A Xenoflora strain needs this every day at any level or it slips containment. Botany 5 at Expanded Hydroponics, 7 at Self-Sustaining.", "routine", "tend", { facility: HYDROPONICS }),
  t("Cultivate Specimen", "Food & water", 2, ["botany"], 6, "Grow an alien plant sample into 1 Chemical Mixture.", "routine", "yield", { strong: "+1 Chemical Mixture.", facility: HYDROPONICS, yields: { name: "Chemical Mixture", qty: 1 } }),
  t("Purify Water", "Food & water", 1, ["cooking"], 2, "Use up one charge of a water filter from the hold: 4 Water Units from a Crude Water Filter, 6 from a Water Filter.", "routine", "purify"),
  t("Filter Reclaimed Water", "Food & water", 1, ["cooking"], 1, "Draw the day's reclaimed water out of Life Support: 2 Water Units, once a day.", "routine", "reclaim", { strong: "+1 Water Unit.", facility: { modules: ["Life Support"], level: 1, label: "working Life Support" } }),
  t("Turn Food into Fuel", "Food & water", 1, ["botany"], 4, "Convert 2 Food Units into 1 Fuel Unit using a Bioconverter. Botany 7 converts 3 into 2.", "routine", "convert", { facility: { modules: ["Bioconverter"], label: "a Bioconverter" } }),
  t("First Aid: Minor Injury", "Medical", 0, ["firstAid"], 3, "Use up a medkit to treat a Minor injury or just heal. A free action from the character sheet, any time.", "skilled", null, { strong: "Each 6 not spent treating heals 1 HP or clears a condition.", free: true }),
  t("Stop Bleeding", "Medical", 1, ["firstAid"], 0, "Use up a medkit to end one survivor's Bleeding.", "crisis", "bleed"),
  t("Surgery", "Medical", 3, ["surgery"], 0, "Treat a Major or Deadly injury. The patient drops to half their Max HP (if above it) when Surgery begins.", "crisis", null, { strong: "Reduce long-term penalties, or the patient regains 1 HP." }),
  t("Prep for Surgery", "Medical", 1, ["firstAid"], 7, "Ready the patient and the theatre: the next Surgery on them this day gets +2d6.", "routine", null, { facility: { modules: ["Medical Bay"], level: 3, label: "a Sterile Suite Medical Bay" } }),
  t("Craft Medicine", "Medical", 1, ["firstAid", "surgery"], 3, "Produce one medicine from a known recipe, drawing the materials from the hold. First Aid 3 or Surgery 5.", "routine", "medicine"),
  t("Decontaminate", "Medical", 1, ["firstAid", "biology"], 5, "Remove contamination from a person, item, or room."),
  t("Analyze Known Biomass", "Science", 1, ["biology"], 5, "Extract known data from a studied specimen.", "routine", null, { ...RESEARCH, strong: "Learn two facts instead of one.", expertAt: 3 }),
  t("Analyze Unknown Biomass", "Science", 1, ["biology", "botany"], 0, "Discover properties of an unfamiliar specimen.", "skilled", null, { ...RESEARCH, strong: "Also identify a viable Research Trait or important biological weakness." }),
  t("Extract Research Trait", "Science", 2, ["biology"], 7, "Isolate a studied organism's Research Trait for crafting or augmentation.", "routine", null, { ...RESEARCH, facility: { modules: ["Biological Lab"], label: "a Biological Lab" } }),
  t("Scrap Biomass", "Science", 2, ["biology"], 3, "Recover biological crafting materials."),
  t("Analyze Technical Data", "Science", 1, ["engineering", "biology"], 3, "Interpret known human data or studied alien data.", "routine", null, RESEARCH),
  t("Train Skill", "Crew", 2, [], 0, "Spend 1 training resource from the hold and gain 1 XP in the skill. Levels 1–3 use a common resource, 4–7 a refined one, and 8–10 a rare one.", "routine", "train"),
  t("Reduce Pressure", "Crew", 1, ["entertainer"], 1, "Reduce another character's Pressure by 1 in safety, never below their Stress floor.", "routine", "calm", { strong: "The target also gets +1d6 on their next skill roll." }),
  t("Morale Night", "Crew", 2, ["entertainer"], 6, "Music, stories, a stolen bottle: every other survivor aboard reduces Pressure by 1.", "routine", "morale", { facility: { modules: ["Crew Quarters", "Crewmate Quarters", "Crewmate Quarters Expanded"], label: "Crew Quarters" } }),
  t("Treat Long-Term Stress", "Crew", 2, ["entertainer"], 3, "Advance a Stress Recovery Project.", "routine", "project"),
  t("Assist", "Crew", 1, [], 0, "Help another character with a task you have a level in. Roll against their task's skill; on a success only one assistant's dice count, the best Skill Level among them, up to +4d6. On a Project, you add 1 Progress if you meet its threshold and take one of its contributor slots.", "routine", "assist"),
  t("Embark Expedition", "Expedition", 0, [], 0, "Away from the ship on an expedition for this segment. The GM starts it from the campaign menu, which tracks the site and its Expedition Turns; the rest plays out at the table.", "routine", null, { noStrong: true }),
  t("Other", "Other", 1, [], 0, "Anything else. Describe it and the GM sets the terms.", "skilled", null, { gmResolves: true }),
];

export const TASK_BY_NAME = Object.fromEntries(SHIPBOARD_TASKS.map((x) => [x.name, x])) as Record<string, ShipboardTask>;
export const TASK_GROUPS = Array.from(new Set(SHIPBOARD_TASKS.map((x) => x.group)));

/** Engineering needed to upgrade a module to the level at `index` on its ladder. */
export const upgradeThreshold = (index: number) => (index <= 2 ? 4 : index === 3 ? 6 : index === 4 ? 8 : 10);
