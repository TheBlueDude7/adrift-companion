import type {
  Attribute,
  ConditionDuration,
  FacilityGrade,
  ItemCategory,
  ItemTemplate,
  ItemTier,
  InjurySeverity,
  InjuryState,
  ModuleCondition,
  SkillKey,
} from "./rules";
import type { InjuryLocation } from "@/data/injuries";

/**
 * An injury from the 2d6 table has a `location`, and its `code` points into INJURY_TABLE. Injuries from the
 * old 60-entry table are `legacy`: they keep their own text and get no automatic effects until converted.
 */
export type Injury = {
  id: string;
  code: string;
  name: string;
  effect: string;
  severity: InjurySeverity;
  state: InjuryState;
  dayReceived: number;
  notes: string;
  location?: InjuryLocation;
  legacy?: boolean;
  /** Had Surgery: a Major or Deadly injury now counts as Minor. */
  operated?: boolean;
  /** A Deadly injury that needs Surgery by the end of this day and segment, or the character dies. */
  deadline?: { day: number; segment: number };
};

export type Affliction = {
  id: string;
  code: string;
  name: string;
  effect: string;
  notes: string;
};

export type ActiveCondition = {
  id: string;
  name: string;
  duration: ConditionDuration;
  notes: string;
};

export type FoodIntake = "full" | "half" | "none";

export type Survival = {
  food: FoodIntake;
  water: boolean;
  rests: number;
  foodMissStreak: number;
  waterMissStreak: number;
  sleepMissStreak: number;
  rationStreak: number;
  /** Max Energy penalty carried into today from yesterday's End of Day. */
  energyPenalty: number;
  /** Rest restores no Energy today (starvation). */
  restBlocked: boolean;
  /** Set once the first Pressure gain of the day has happened (for Strained). */
  pressureGainedToday: boolean;
};

export type Character = {
  id: string;
  name: string;
  player: string;
  background: string | null;
  specialty: string | null;
  /** Base attribute values (start at 1, plus allocated points). Background bonuses are added on top. */
  attributes: Record<Attribute, number>;
  /** Manual adjustments from injuries, cybernetics, etc. */
  attributeMods: Record<Attribute, number>;
  /** Trained skill levels, not counting background bonuses. */
  skills: Record<SkillKey, number>;
  skillXp: Record<SkillKey, number>;
  hp: number;
  energy: number;
  willpower: number;
  maxHpMod: number;
  maxEnergyMod: number;
  maxWillpowerMod: number;
  armor: number;
  pressure: number;
  stress: number;
  injuries: Injury[];
  afflictions: Affliction[];
  conditions: ActiveCondition[];
  survival: Survival;
  abilityUsed: Record<string, boolean>;
  dead: boolean;
  /** Down at 0 HP but stabilized by First Aid: no more death checks. Any healing wakes them. */
  stabilized?: boolean;
  /** Already gained Pressure from losing 2+ HP this round (cleared at End of Round and End Scene). */
  damagePressureRound?: boolean;
  /** Talked up by a Strong Reduce Pressure: +1d6 on their next roll, then it's spent. */
  encouraged?: boolean;
  notes: string;
  /** Quartermaster's Contingency Pack, while packed. */
  contingency?: Contingency;
  /** Loadmaster's shared pool: the characters on the expedition, including the Quartermaster. */
  pool?: string[];
  cybernetics?: InstalledCyber[];
};

export type InstalledCyber = {
  id: string;
  /** Key into CYBERNETICS. */
  key: string;
  /** Body location, e.g. "Left arm" or "Heart". Upgrades keep their prerequisite's location. */
  location: string;
  /** A Replacement restores normal function only: no Enhanced abilities, no Load. Tier I only. */
  replacement: boolean;
  damaged: boolean;
  /** Implants this one upgraded or integrated. They count as installed for later prerequisites. */
  lineage: string[];
  /** Choices made at installation, like Multispectrum sensor modes. */
  choice: string;
};

export type MechChassis = "utility" | "assault" | "recon";
export type MechDamageType = "Ballistic" | "Physical" | "Fire" | "Electric" | "Chemical";

export type InstalledModule = { id: string; key: string; damaged: boolean };

export type Mech = {
  id: string;
  name: string;
  chassis: MechChassis;
  tier: 1 | 2 | 3;
  hp: number;
  /** Armor Points left on the plating. Ablative: every hit it absorbs costs a point, like a survivor's Armor. */
  armor: number;
  /** Built-in Tier Resistance picks, one damage type each. Older saves may repeat a type; it counts once. */
  tierResist: MechDamageType[];
  modules: InstalledModule[];
  pilotId: string | null;
  deployed: boolean;
  /** Secured outside the hull instead of in a berth. Doesn't count against Mech Capacity. */
  external: boolean;
  /** Offline while a tier-upgrade Project is underway. */
  upgrading: boolean;
  conditions: string[];
  notes: string;
};

export type Research = {
  /** Tier II and III cybernetics the crew has unlocked. Tier I is always available. */
  cybernetics: string[];
  /** The GM has put a viable alien specimen in the crew's hands, so they may attempt the project. */
  xenofloraAllowed?: boolean;
  /** The Xenoflora Cultivation project is finished, so the beds will take an alien strain. */
  xenoflora?: boolean;
};

export type Contingency = {
  slots: number;
  /** Names of items that were in ship storage when the pack was made. Only these can be revealed. */
  manifest: string[];
};

export type Item = {
  id: string;
  name: string;
  category: ItemCategory;
  tier?: ItemTier;
  qty: number;
  charges?: number;
  maxCharges?: number;
  armor?: number;
  /** Takes two inventory slots and slows whoever carries it. */
  heavy?: boolean;
  broken: boolean;
  notes: string;
  /** "ship" or a character id */
  location: string;
  /** In the Loadmaster's shared pool, carried by the character at `location`. */
  shared?: boolean;
  /** Revealed from the carrier's Contingency Pack; fills one Contingency Slot. */
  contingency?: boolean;
};

/** What the beds are planted with. Every kind grows alike and harvests something different. */
export type CropKind = "food" | "chemical" | "fiber" | "xeno";

export type Crop = {
  growing: boolean;
  /** Days of growth so far, out of three. */
  day: number;
  plantedDay: number;
  /** Days someone took Maintain Crops for this crop. */
  tended: number[];
  /** What's planted right now. */
  kind: CropKind;
  /** What the beds are sown with next, when the crew wants to switch. Self-sustaining beds never
   * stand empty, so the choice has to be made while something is still growing. */
  next?: CropKind;
  /** The condition a Xenoflora strain is tuned against, fixed when it goes into the beds. */
  strain?: string;
  /** The strain the next Xenoflora sowing will be tuned against. */
  nextStrain?: string;
  /** Produce waiting to be harvested, kept apart by kind so a changed planting can't mix the pile. */
  ready: Partial<Record<CropKind, number>>;
};

export type Room = {
  id: string;
  name: string;
  module: string | null;
  grade: FacilityGrade;
  powerDraw: number;
  powerOutput: number;
  condition: ModuleCondition;
  active: boolean;
  essential: boolean;
  notes: string;
  /** Index into the module's upgrade ladder, for modules that have one. */
  level?: number;
  /** Solar panels or defenses in the room's spare slot, which the module slot doesn't use. */
  fitting?: string;
};

export type Project = {
  id: string;
  name: string;
  skill: string;
  threshold: number;
  progress: number;
  required: number;
  contributorLimit: number;
  energy: number;
  facility: string;
  materials: string;
  roomId: string | null;
  /** The survivor a Stress Recovery project treats; relief lands only on completion. */
  patientId?: string | null;
  /** Install or Upgrade Module: on completion, the project's room houses this module at this ladder level. */
  module?: { name: string; level?: number } | null;
  notes: string;
  done: boolean;
};

export type Ship = {
  name: string;
  hullTier: number;
  hullHp: number;
  tempHull: number;
  catastrophicEvents: number;
  destroyed: boolean;
  overloaded: boolean;
  /** Tune the Reactor: +1 Power Unit until the end of the day. */
  tuned?: boolean;
  /** Days of charge left in the Power Cell running the grid. End of Day burns one. */
  powerDays?: number;
  /** The kind of Power Cell the crew wants the grid to load. Unset means the weakest in the hold. */
  gridCell?: string;
  /** Stretch Rations: tonight every 3 Food Units feed 4 survivors. */
  rationsStretched?: boolean;
  /** Life Support's reclaimed water has already been drawn today. */
  reclaimed?: boolean;
  /** The crop growing in Hydroponics. */
  crop?: Crop;
  location: string;
  rooms: Room[];
  projects: Project[];
};

export type LogEntry = {
  id: string;
  at: number;
  day: number;
  segment: number;
  text: string;
  kind: "info" | "roll" | "danger" | "day";
  /** Player who made the change, in shared campaigns. */
  by?: string;
};

export type Terrain = "floor" | "wall" | "door" | "airlock" | "cover" | "debris" | "hazard" | "objective";

export type MapLabel = { id: string; x: number; y: number; text: string };

export type TokenKind = "crew" | "enemy" | "neutral";
export type MapToken = { id: string; x: number; y: number; kind: TokenKind; characterId?: string; label: string };

export type GridMap = {
  id: string;
  kind: "grid";
  name: string;
  width: number;
  height: number;
  /** Sparse terrain keyed by "x,y". Unpainted cells are empty space. */
  cells: Record<string, Terrain>;
  labels: MapLabel[];
  tokens: MapToken[];
  notes: string;
};

export type StarNodeType = "derelict" | "station" | "planet" | "anomaly" | "hazard" | "beacon" | "unknown";
export type StarNodeStatus = "unexplored" | "visited" | "looted" | "dangerous";

export type SpaceTile = "clear" | "debris" | "radiation" | "gravity" | "interference" | "hazard";

export type TilePos = { x: number; y: number };

export type StarNode = {
  id: string;
  /** Tile column and row. */
  x: number;
  y: number;
  name: string;
  type: StarNodeType;
  status: StarNodeStatus;
  notes: string;
  /** Grid map charting this location, if any. */
  mapId?: string;
};

export type StarMap = {
  id: string;
  kind: "star";
  name: string;
  /** Always odd, so the grid has a middle tile. */
  size: number;
  /** The neutron star: the system's only light. */
  star: TilePos;
  /** Scan results keyed by "x,y". Tiles that are missing haven't been scanned. */
  tiles: Record<string, SpaceTile>;
  nodes: StarNode[];
  shipAt: TilePos | null;
  notes: string;
};

/** `createdBy` is the character who made the map; players may delete only their own. */
export type GameMap = (GridMap | StarMap) & { createdBy?: string };

export type GameState = {
  version: 1;
  maps: GameMap[];
  campaign: string;
  day: number;
  segment: number;
  act: number;
  characters: Character[];
  items: Item[];
  catalog: ItemTemplate[];
  ship: Ship;
  log: LogEntry[];
  mechs: Mech[];
  /** Mechs players have asked the GM to add. They don't exist until the GM allows them. */
  mechRequests?: { id: string; by: string; mech: Mech }[];
  /** First Aid a player has offered another survivor. It's rolled when the patient's player (or the GM) accepts. */
  firstAidOffers?: FirstAidOffer[];
  research: Research;
  /**
   * Ration Discipline covers one stretch of rationing. `covered` is true while that stretch lasts;
   * `cooldown` counts the ration-free days still needed (of 3 in a row) before it covers another.
   */
  rationDiscipline?: { covered: boolean; cooldown: number };
  /** Tasks the crew has committed to, by day and segment. */
  actions: SegmentAction[];
};

/**
 * `injuryId` is the Untreated Minor injury to treat, or null to just heal. `kit` is the medkit it spends,
 * from the healer's inventory or "ship" storage. `clear` lists condition ids that 6s clear first, in order.
 */
export type FirstAidOffer = { id: string; healerId: string; patientId: string; injuryId: string | null; kit?: { name: string; location: string }; clear?: string[] };

export type ActionStatus = "planned" | "success" | "strong" | "failed" | "cancelled";

export type SegmentAction = {
  id: string;
  characterId: string;
  day: number;
  segment: number;
  /** Name from SHIPBOARD_TASKS, or "Other". */
  task: string;
  /** What the character is doing, in the player's words. */
  detail: string;
  projectId?: string | null;
  /** Star map tile, for courses and scans. */
  target?: { mapId: string; x: number; y: number } | null;
  /** Another action this one assists. */
  assists?: string | null;
  /** The crewmate a task is performed on: Reduce Pressure, Stop Bleeding. */
  subjectId?: string | null;
  /** Recipe names to fabricate, duplicates allowed. Cooking, medicine, and salvage use the first. */
  crafts?: string[];
  /** Skill a Train Skill task practices. */
  trainSkill?: SkillKey;
  /** A Master Pilot's once-a-day move that burned no Power Cell. */
  freeCell?: boolean;
  /** A player's roll for this task, made by the server. Once rolled, the dice decide the result. */
  roll?: { dice: number[]; pushed: boolean };
  /** The one extra task a survivor Pushed for this segment (paid 1 Energy and 1 Pressure). */
  extra?: boolean;
  /** A player asked the GM to allow a task they lack the Energy for, and whether the GM has. */
  approval?: "pending" | "granted";
  status: ActionStatus;
  /** The GM's note on how it went. */
  outcome?: string;
};
