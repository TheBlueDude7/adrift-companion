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

export type Injury = {
  id: string;
  code: string;
  name: string;
  effect: string;
  severity: InjurySeverity;
  state: InjuryState;
  dayReceived: number;
  notes: string;
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
  /** Built-in Tier Resistance picks. Tier III may pick the same type twice for Resistance 2. */
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

export type Crop = {
  growing: boolean;
  /** Days of growth so far, out of three. */
  day: number;
  plantedDay: number;
  /** Days someone took Maintain Crops for this crop. */
  tended: number[];
  /** Raw Food waiting to be harvested. */
  ready: number;
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
  /** Stretch Rations: tonight every 3 Food Units feed 4 survivors. */
  rationsStretched?: boolean;
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
  research: Research;
  /** Tasks the crew has committed to, by day and segment. */
  actions: SegmentAction[];
};

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
  /** Recipe names to fabricate, duplicates allowed. */
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
