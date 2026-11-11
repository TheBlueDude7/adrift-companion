import type { Attribute } from "@/lib/rules";

export type CyberSystem = "structural" | "sensory" | "internal" | "neural" | "interface" | "damage";
export type CyberTier = 1 | 2 | 3;
export type DamageType = "Ballistic" | "Physical" | "Fire" | "Electric" | "Chemical";
export const DAMAGE_TYPES: DamageType[] = ["Ballistic", "Physical", "Fire", "Electric", "Chemical"];

/** How an upgrade behaves while its owner pilots a mech. */
export type MechTag = "Frame-Compatible" | "Suppressed" | "Functions" | "GM decides";

/** One prerequisite: an installed implant (or anything upgraded from it) among `keys`, `count` times. */
export type CyberReq = { keys: string[]; label: string; limb?: "arm" | "leg"; count?: number };

export type CyberDef = {
  key: string;
  name: string;
  system: CyberSystem;
  tier: CyberTier;
  /** Tier I body location. Sided locations ask which side at installation. */
  location?: "limb" | "eye" | "ear" | "spine" | "heart" | "kidney" | "lung" | "regulator" | "neural" | "reflex" | "port" | "mech-interface";
  requires?: CyberReq[];
  /** Damage branch for damage systems. */
  damage?: DamageType;
  replacement?: string;
  effects: string[];
  /** Flat bonuses while Enhanced (not as a Replacement). */
  bonus?: { attr?: Partial<Record<Attribute, number>>; maxHp?: number; maxEnergy?: number; dampening?: number };
  /**
   * Damage types this implant halves while Enhanced and undamaged. Written here as well as in
   * `effects` so the app halves the hit rather than leaving the sentence for the GM to remember.
   */
  resist?: DamageType[];
  /**
   * What a Damage system does to its owner's own attacks of its `damage` type. `boost` is the share
   * of the hit added to it, rounded up; `cover` is how many points of the target's Cover it looks
   * through; `armor` is how many points of their worn Armor it strips beyond the usual one.
   */
  attack?: { boost: number; cover?: number; armor?: number };
  /** Set when the rulebook leaves something open. */
  note?: string;
};

export const CYBER_SYSTEMS: { key: CyberSystem; name: string; attr?: Attribute; focus: string; mech: MechTag }[] = [
  { key: "structural", name: "Structural", attr: "STR", focus: "Strength, movement, bracing, limbs, bones, and physical stability", mech: "Suppressed" },
  { key: "sensory", name: "Sensory", attr: "WIT", focus: "Vision, hearing, detection, targeting, and communication", mech: "GM decides" },
  { key: "internal", name: "Internal", attr: "CON", focus: "Organs, survival, filtration, trauma control, and bodily regulation", mech: "Functions" },
  { key: "neural", name: "Neural", attr: "INT", focus: "Pressure, Mind Breaks, memory, reflexes, and deterministic action", mech: "Functions" },
  { key: "interface", name: "Interface", focus: "Mechs, drones, machinery, remote operation, and ship integration", mech: "Frame-Compatible" },
  { key: "damage", name: "Damage", focus: "Damage bonuses, damage Resistance, condition protection, and conditional Immunity", mech: "Suppressed" },
];
export const CYBER_SYSTEM_BY_KEY = Object.fromEntries(CYBER_SYSTEMS.map((s) => [s.key, s])) as Record<CyberSystem, (typeof CYBER_SYSTEMS)[number]>;

/**
 * What a Damage system adds to its owner's own attacks of its type, as a share of the damage the hit
 * would otherwise land, rounded up. A share rather than a flat number so the system stays worth its
 * Load against a rocket as well as a pistol — and rounding up means it never does less than +1.
 */
export const DAMAGE_BOOST: Record<CyberTier, number> = { 1: 0, 2: 0.2, 3: 0.4 };

export const CYBERNETICS: CyberDef[] = [
  // Structural
  {
    key: "cyber-limb", name: "Cybernetic Limb", system: "structural", tier: 1, location: "limb",
    effects: ["Injury penalties affecting that limb become mechanical damage and may be repaired rather than medically healed."],
  },
  {
    key: "spinal-brace", name: "Spinal Brace", system: "structural", tier: 1, location: "spine",
    replacement: "Allows a character with spinal or mobility Injuries to stand and move normally.",
    effects: ["+1 Maximum Energy.", "Resistance to Slowed caused by physical Injuries."],
    bonus: { maxEnergy: 1 },
  },
  {
    key: "servo-musculature", name: "Servo Musculature", system: "structural", tier: 2, requires: [{ keys: ["cyber-limb"], label: "Cybernetic Limb" }],
    effects: ["Ignore the first Weakened applied by physical exertion each Scene.", "The limb may hold or brace an object without continuous effort."],
  },
  {
    key: "kinetic-bracing", name: "Kinetic Bracing", system: "structural", tier: 2, requires: [{ keys: ["spinal-brace"], label: "Spinal Brace" }],
    effects: ["Gain Physical Resistance and Ballistic Resistance.", "Become Resistant to Prone and forced movement.", "Falling Damage is reduced by 2."],
    resist: ["Physical", "Ballistic"],
  },
  {
    key: "precision-actuators", name: "Precision Actuators", system: "structural", tier: 2, requires: [{ keys: ["cyber-limb"], limb: "arm", label: "Cybernetic Arm" }],
    effects: ["Fine manipulation using the arm gains +2d6.", "The character may perform delicate work while Staggered.", "Disarmed requires one additional success to apply to equipment held by that arm."],
  },
  {
    key: "locomotion-actuators", name: "Locomotion Actuators", system: "structural", tier: 2, requires: [{ keys: ["cyber-limb"], limb: "leg", label: "Cybernetic Leg" }],
    effects: ["Ignore ordinary Difficult Terrain.", "Standing from Prone does not require a Fast Action.", "Once per combat, cancel one zone of forced movement."],
  },
  {
    key: "full-skeletal-lattice", name: "Full Skeletal Lattice", system: "structural", tier: 3,
    requires: [
      { keys: ["kinetic-bracing"], label: "Kinetic Bracing" },
      { keys: ["servo-musculature", "precision-actuators", "locomotion-actuators"], label: "One other Structural Tier II technology" },
    ],
    effects: [
      "Strength and Constitution cannot be reduced below 3 by Injuries or conditions.",
      "Gain Immunity to Crippled, Immobilized, Prone, and Staggered.",
      "Once per Scene, ignore one physical condition immediately after it is applied.",
      "This does not prevent damage or psychological conditions.",
    ],
  },
  {
    key: "industrial-frame", name: "Industrial Frame Integration", system: "structural", tier: 3, requires: [{ keys: ["servo-musculature"], label: "Servo Musculature" }],
    effects: [
      "Treat Strength as 6 for lifting, carrying, forced movement, and breaking structures.",
      "Heavy and Bulky items occupy one fewer expedition inventory slot.",
      "Carrying a Downed character does not apply Slowed.",
      "The character counts as Mechanical for Electric and machine-targeting effects.",
    ],
  },

  // Sensory
  {
    key: "cyber-eye", name: "Cybernetic Eye", system: "sensory", tier: 1, location: "eye",
    replacement: "Restores ordinary sight.",
    effects: ["+1d6 to sight-dependent Perception.", "Resistance to Blinded caused by light, smoke, or damage to that eye.", "The ability to record visual information."],
  },
  {
    key: "auditory-implant", name: "Auditory Implant", system: "sensory", tier: 1, location: "ear",
    replacement: "Restores ordinary hearing.",
    effects: ["+1d6 to sound-dependent Perception.", "Resistance to Deafened.", "The ability to isolate or record sounds."],
  },
  {
    key: "multispectrum-vision", name: "Multispectrum Vision", system: "sensory", tier: 2, requires: [{ keys: ["cyber-eye"], label: "Cybernetic Eye" }],
    effects: [
      "Choose two sensor modes during installation: Thermal, Low-light, Ultraviolet, or Electromagnetic.",
      "Switch modes as a Fast Action.",
      "Appropriate sensor modes may detect Hidden creatures or environmental hazards that ordinary sight cannot reveal.",
    ],
  },
  {
    key: "predictive-targeting", name: "Predictive Targeting", system: "sensory", tier: 2, requires: [{ keys: ["cyber-eye"], label: "Cybernetic Eye" }],
    effects: ["The first Aim Action each Round is free.", "Marked targets cannot benefit from ordinary concealment against you.", "Gain +2d6 when attacking a target you observed during its previous turn."],
  },
  {
    key: "acoustic-mapping", name: "Acoustic Mapping", system: "sensory", tier: 2, requires: [{ keys: ["auditory-implant"], label: "Auditory Implant" }],
    effects: ["Detect the shape of nearby rooms through echoes.", "Ignore ordinary darkness when navigating.", "Hidden moving creatures must defeat your Perception even when outside direct sight."],
  },
  {
    key: "communications-suite", name: "Communications Suite", system: "sensory", tier: 2, requires: [{ keys: ["auditory-implant"], label: "Auditory Implant" }],
    effects: ["Communicate silently with linked crewmates.", "Communication does not advance Noise Clocks.", "Linked characters may share simple sensory warnings as Reactions."],
  },
  {
    key: "panoptic-sensorium", name: "Panoptic Sensorium", system: "sensory", tier: 3,
    requires: [{ keys: ["multispectrum-vision", "predictive-targeting", "acoustic-mapping", "communications-suite"], count: 2, label: "Two Sensory Tier II technologies" }],
    effects: [
      "While the sensory system is functional: you cannot be Surprised by visible, audible, thermal, or electronic threats.",
      "When a Hidden creature acts within sensor range, it immediately loses Hidden against you.",
      "Once per Round, ask the GM which visible threat is most likely to act next.",
      "Sensor-Blind, Jammed, or Disrupted disables these benefits.",
    ],
  },
  {
    key: "shared-targeting-lattice", name: "Shared Targeting Lattice", system: "sensory", tier: 3,
    requires: [{ keys: ["predictive-targeting"], label: "Predictive Targeting" }, { keys: ["communications-suite"], label: "Communications Suite" }],
    effects: [
      "When you Mark a target, every linked ally treats it as Marked.",
      "Once per Round, when a linked ally attacks the Marked target, provide one: +2d6 to hit, ignore all Armor for this attack, or prevent the target from using a Reaction.",
      "Only one character may benefit from the lattice each Round.",
    ],
  },

  // Internal
  { key: "cyber-heart", name: "Cybernetic Heart", system: "internal", tier: 1, location: "heart", replacement: "Repairs destroyed or failing cardiac function.", effects: ["+1 Constitution."], bonus: { attr: { CON: 1 } } },
  {
    key: "artificial-kidney", name: "Artificial Kidney", system: "internal", tier: 1, location: "kidney", replacement: "Restores ordinary filtration.",
    effects: ["Resistance to Poisoned and Contaminated.", "Water penalties are reduced by 1 tier for each day without water.", "Ordinary medications cannot accidentally Poison the character."],
  },
  {
    key: "artificial-lung", name: "Artificial Lung", system: "internal", tier: 1, location: "lung", replacement: "Restores ordinary breathing.",
    effects: ["+1 Constitution.", "The ability to hold breath significantly longer.", "Resistance to ordinary smoke and airborne irritants."],
    bonus: { attr: { CON: 1 } },
  },
  {
    key: "medical-regulator", name: "Medical Regulator", system: "internal", tier: 1, location: "regulator",
    effects: ["Monitors and adjusts pain, hormones, and bodily function.", "Medical characters automatically receive accurate basic vital signs.", "May alert the crew when the character becomes Poisoned or Infected."],
  },
  {
    key: "redundant-circulation", name: "Redundant Circulation", system: "internal", tier: 2, requires: [{ keys: ["cyber-heart"], label: "Cybernetic Heart" }],
    effects: ["Bleeding deals 1 less Damage, to a minimum of 0.", "Massive Hemorrhage and Severed Artery use ordinary Bleeding Damage instead of their increased values.", "May remain conscious for one Round after reaching 0 HP."],
  },
  {
    key: "toxin-processor", name: "Toxin Processor", system: "internal", tier: 2, requires: [{ keys: ["artificial-kidney"], label: "Artificial Kidney" }],
    effects: ["Gain Chemical Damage Resistance.", "Once per Scene, remove Poisoned from yourself as a Slow Action. Doing so applies Drained until the end of the Scene."],
    resist: ["Chemical"],
  },
  {
    key: "closed-cycle-respirator", name: "Closed-Cycle Respirator", system: "internal", tier: 2, requires: [{ keys: ["artificial-lung"], label: "Artificial Lung" }],
    effects: [
      "Become Immune to ordinary airborne toxins.",
      "Survive without breathable atmosphere for one Expedition Turn. The system must be recharged after use.",
      "Does not protect against vacuum pressure, extreme temperature, or direct Chemical contact.",
    ],
  },
  {
    key: "redundant-organ-network", name: "Redundant Organ Network", system: "internal", tier: 3,
    requires: [{ keys: ["redundant-circulation", "toxin-processor", "closed-cycle-respirator"], count: 2, label: "Two Internal Tier II technologies" }],
    effects: [
      "Gain +5 Maximum HP.",
      "Organ Injuries do not reduce Attributes below their pre-Injury values.",
      "Organ Failure takes twice as long to become fatal.",
      "Once per expedition, suppress one organ-related Critical Injury until returning to the ship. It returns immediately if the network becomes Disrupted.",
    ],
    bonus: { maxHp: 5 },
  },
  {
    key: "autonomous-survival-core", name: "Autonomous Survival Core", system: "internal", tier: 3,
    requires: [{ keys: ["redundant-circulation"], label: "Redundant Circulation" }, { keys: ["medical-regulator"], label: "Medical Regulator" }],
    effects: [
      "Once per expedition, when you would die or fail a final death check: remain alive at 0 HP, become Immobilized and Silenced, and suppress Bleeding and Suffocating.",
      "Remain conscious enough to communicate through cybernetics.",
      "The core keeps you alive until the end of the current Scene. You still require immediate treatment afterward.",
    ],
  },

  // Neural
  {
    key: "neural-regulator", name: "Neural Regulator", system: "neural", tier: 1, location: "neural",
    effects: ["Ignore the first time each day you become Confused or Disoriented.", "You may record and replay memories."],
  },
  {
    key: "reflex-processor", name: "Reflex Processor", system: "neural", tier: 1, location: "reflex",
    effects: ["Draw two Initiative cards and pick which one to keep.", "Once per Scene, perform a Block or Dodge as a Reaction."],
  },
  {
    key: "pressure-governor", name: "Pressure Governor", system: "neural", tier: 2, requires: [{ keys: ["neural-regulator"], label: "Neural Regulator" }],
    effects: ["Increase Dampening by 1.", "Once per Scene, when Pressure would cause a condition, delay that condition until the end of your next turn."],
    bonus: { dampening: 1 },
  },
  {
    key: "mind-break-interlock", name: "Mind-Break Interlock", system: "neural", tier: 2, requires: [{ keys: ["neural-regulator"], label: "Neural Regulator" }],
    effects: [
      "When a Mind Break would occur, choose: resolve it normally, or become Disrupted and Immobilized until the end of your next turn, then reduce Pressure to Overtaxed.",
      "Using the interlock does not prevent Stress gained from reaching Panicked.",
    ],
  },
  {
    key: "predictive-reflexes", name: "Predictive Reflexes", system: "neural", tier: 2, requires: [{ keys: ["reflex-processor"], label: "Reflex Processor" }],
    effects: ["Gain one additional Reaction each Round, only to Dodge, Block, or move away from a visible hazard.", "You cannot use both Reactions against the same trigger."],
  },
  {
    key: "memory-lattice", name: "Memory Lattice", system: "neural", tier: 2, requires: [{ keys: ["neural-regulator"], label: "Neural Regulator" }],
    effects: [
      "Once per day, record the result of one successful Intelligence- or Wits-based Task.",
      "Later that day, on a substantially similar Task, use the recorded number of successes instead of rolling. The GM decides whether Tasks are similar enough.",
    ],
  },
  {
    key: "affective-partition", name: "Affective Partition", system: "neural", tier: 3,
    requires: [{ keys: ["pressure-governor"], label: "Pressure Governor" }, { keys: ["mind-break-interlock"], label: "Mind-Break Interlock" }],
    effects: [
      "When you would become Panicked, you may partition the emotional response: set Pressure to Shaken, become Disrupted and Silenced, lose access to beneficial Pressure effects, keep deliberate control of your Actions, and regain 2 Energy.",
      "Lasts until immediate danger ends or another character safely resets the implant.",
      "Using it more than once before completing Stress Recovery causes 1 Stress.",
    ],
  },
  {
    key: "deterministic-cognition", name: "Deterministic Cognition", system: "neural", tier: 3,
    requires: [
      { keys: ["memory-lattice"], label: "Memory Lattice" },
      { keys: ["pressure-governor", "mind-break-interlock", "predictive-reflexes"], label: "One other Neural Tier II technology" },
    ],
    effects: [
      "Once per day, before rolling a Skilled or Crisis Task, declare a deterministic result. Do not roll; resolve it as the minimum successes for ordinary success.",
      "No stunts or additional benefits from this Task. Cannot resolve an impossible Task.",
    ],
  },

  // Interface
  {
    key: "data-port", name: "Data Port", system: "interface", tier: 1, location: "port",
    effects: ["Directly connect to compatible computers and machinery.", "Transfer information without ordinary external equipment.", "Gain +2d6 when diagnosing a connected electronic system."],
  },
  {
    key: "mech-control-interface", name: "Mech Control Interface", system: "interface", tier: 1, location: "mech-interface",
    effects: ["Gain +1d6 to Piloting while operating a mech.", "Remains active inside a mech."],
  },
  {
    key: "neural-mech-integration", name: "Neural Mech Integration", system: "interface", tier: 2, requires: [{ keys: ["mech-control-interface"], label: "Mech Control Interface" }],
    effects: ["Gain +2d6 to Piloting.", "The mech may use your Wits instead of its Frame Constitution when resisting Disrupted or Sensor-Blind.", "Entering or exiting the mech is a Fast Action."],
  },
  {
    key: "remote-systems-control", name: "Remote Systems Control", system: "interface", tier: 2, requires: [{ keys: ["data-port"], label: "Data Port" }],
    effects: ["Once connected to a ship network, operate one nearby door, console, sensor, or powered module as a Fast Action.", "Cannot bypass security without an appropriate Task."],
  },
  {
    key: "cybernetic-override", name: "Cybernetic Override", system: "interface", tier: 2, requires: [{ keys: ["data-port"], label: "Data Port" }],
    effects: ["When touching a Disrupted, Jammed, or Power-Starved machine, spend a Slow Action to suppress one of those conditions until the end of the Scene.", "The condition returns afterward unless properly repaired."],
  },
  {
    key: "distributed-control", name: "Distributed Control Architecture", system: "interface", tier: 3, requires: [{ keys: ["remote-systems-control"], label: "Remote Systems Control" }],
    effects: [
      "While connected to a ship, mech, or local machine network: perceive through any connected functioning sensor.",
      "Operate one connected non-weapon system each Round without spending an Action.",
      "Assist one connected ally or machine remotely.",
      "Sensor-Blind and Jammed may affect your entire network simultaneously.",
    ],
    note: "The rulebook also requires Drone Coordination, which has no entry yet.",
  },
  {
    key: "total-mech-integration", name: "Total Mech Integration", system: "interface", tier: 3, requires: [{ keys: ["neural-mech-integration"], label: "Neural Mech Integration" }],
    effects: [
      "While piloting a mech: the mech gains one additional Reaction, and you cannot be Disarmed of mech-mounted equipment.",
      "Keep operating the mech while Staggered or Immobilized.",
      "When the mech reaches 0 HP, keep it functioning until the end of your next turn.",
      "When Total Mech Integration ends unexpectedly, become Disoriented and Staggered.",
    ],
  },

  // Damage systems
  //
  // Each of the five is built the same way, so a crew can learn one and know the rest: Resistance to
  // its type, protection from the conditions that type carries, +20% Damage at Tier II and +40% at
  // Tier III on your own attacks of it, both rounded up, and that type's signature — the thing only
  // it can do.
  {
    key: "reactive-ballistic-lattice", name: "Reactive Ballistic Lattice", system: "damage", tier: 2, damage: "Ballistic",
    resist: ["Ballistic"], attack: { boost: DAMAGE_BOOST[2], cover: 1 },
    effects: [
      "Gain Ballistic Resistance.",
      "Become Immune to Pinned caused by Ballistic attacks.",
      "Your Ballistic attacks deal +20% Damage, rounded up, and treat the target's Cover as one step lower: Strong becomes Partial, Partial becomes none.",
    ],
  },
  {
    key: "kinetic-rejection-array", name: "Kinetic Rejection Array", system: "damage", tier: 3, damage: "Ballistic", requires: [{ keys: ["reactive-ballistic-lattice"], label: "Reactive Ballistic Lattice" }],
    resist: ["Ballistic"], attack: { boost: DAMAGE_BOOST[3], cover: 2 },
    effects: [
      "Retain Ballistic Resistance and Immunity to Pinned caused by Ballistic attacks.",
      "Once per Round, reduce one Ballistic attack against you to 0 Damage; the array can't negate another until the beginning of your next turn.",
      "Your Ballistic attacks deal +40% Damage, rounded up, and ignore the target's Cover entirely.",
    ],
  },
  {
    key: "powered-skeletal-lattice", name: "Powered Skeletal Lattice", system: "damage", tier: 2, damage: "Physical",
    resist: ["Physical"], attack: { boost: DAMAGE_BOOST[2], armor: 1 },
    effects: [
      "Gain Physical Resistance.",
      "Become Immune to Prone caused by ordinary impacts.",
      "Your Physical attacks deal +20% Damage, rounded up, and strip one additional point of the target's worn Armor.",
      "Once per Round, after dealing Physical Damage, apply Brittle or move the target one zone without spending an additional success. Too large or Anchored targets may resist.",
    ],
  },
  {
    key: "inertial-dominance-frame", name: "Inertial Dominance Frame", system: "damage", tier: 3, damage: "Physical", requires: [{ keys: ["powered-skeletal-lattice"], label: "Powered Skeletal Lattice" }],
    resist: ["Physical"], attack: { boost: DAMAGE_BOOST[3], armor: 2 },
    effects: [
      "Retain Physical Resistance. Become Immune to Prone and ordinary forced movement.",
      "Your Physical attacks deal +40% Damage, rounded up, and strip two additional points of the target's worn Armor.",
      "Once per combat, after dealing Physical Damage, apply Crippled, Immobilized, or Disarmed without spending an additional success.",
      "Drawback: Electric Damage automatically applies Conductive to you.",
    ],
  },
  {
    key: "heat-exchange-network", name: "Heat Exchange Network", system: "damage", tier: 2, damage: "Fire",
    resist: ["Fire"], attack: { boost: DAMAGE_BOOST[2] },
    effects: [
      "Gain Fire Resistance. Immune to Burning caused by ordinary environmental fire.",
      "Your Fire attacks deal +20% Damage, rounded up, and your Fire Damage suppresses regeneration and natural healing on the target until the end of its next turn.",
      "When your Resistance reduces Fire Damage, gain 1 Heat (store up to 2). As a Fast Action, spend all Heat as extra Fire Damage on your next successful attack.",
    ],
  },
  {
    key: "closed-thermal-reactor", name: "Closed Thermal Reactor", system: "damage", tier: 3, damage: "Fire", requires: [{ keys: ["heat-exchange-network"], label: "Heat Exchange Network" }],
    resist: ["Fire"], attack: { boost: DAMAGE_BOOST[3] },
    effects: [
      "Immune to Fire Damage while you have fewer than 3 Heat; each prevented hit gains 1 Heat. At 3 Heat, become Overheated and lose the Immunity (keep Fire Resistance).",
      "Your Fire attacks deal +40% Damage, rounded up, and your Fire Damage suppresses regeneration and natural healing on the target until the end of the Scene.",
      "Slow Action: vent all Heat and Overheated, choosing 2 Fire Damage to everyone else in your zone, an Illuminated and Burning hazard in your zone, or +3 Fire Damage on your next successful Fire attack.",
    ],
  },
  {
    key: "surge-capture-network", name: "Surge Capture Network", system: "damage", tier: 2, damage: "Electric",
    resist: ["Electric"], attack: { boost: DAMAGE_BOOST[2] },
    effects: [
      "Gain Electric Resistance. Immune to Conductive. Resistance to Disrupted.",
      "Your Electric attacks deal +20% Damage, rounded up, and may apply Disrupted or Power-Starved to a Mechanical target that would ordinarily resist them.",
      "The first time each Scene you take Electric Damage, become Charged: your next successful attack may deal +2 Electric Damage, apply Staggered, or Disrupt a Mechanical target.",
    ],
  },
  {
    key: "closed-circuit-nervous-system", name: "Closed-Circuit Nervous System", system: "damage", tier: 3, damage: "Electric", requires: [{ keys: ["surge-capture-network"], label: "Surge Capture Network" }],
    resist: ["Electric"], attack: { boost: DAMAGE_BOOST[3] },
    effects: [
      "Immune to Electric Damage while not Overloaded, and Immune to Conductive. Each prevented hit gains 1 Charge; at 3 Charges become Overloaded and lose the Immunity (keep Electric Resistance).",
      "Your Electric attacks deal +40% Damage, rounded up, and may apply Disrupted or Power-Starved to a Mechanical target that is Immune to them.",
      "Slow Action: discharge all Charges for 3 Electric Damage to everyone else in your zone, 4 Electric Damage to one target in an adjacent zone, remove Disrupted from yourself or an adjacent machine, or power one Power-Starved or Offline machine until the end of the Scene.",
    ],
  },
  {
    key: "closed-circulatory-processor", name: "Closed Circulatory Processor", system: "damage", tier: 2, damage: "Chemical",
    resist: ["Chemical"], attack: { boost: DAMAGE_BOOST[2] },
    effects: [
      "Gain Chemical Resistance. Immune to ordinary Poisoned. Resistance to Contaminated.",
      "Your Chemical attacks deal +20% Damage, rounded up, and Poisoned and Corroded you apply last one additional Round.",
      "Once per Scene, when you would become Poisoned or Contaminated, store the substance instead (one at a time).",
      "Slow Action: expel it to deal 1 Chemical Damage to a target in your zone, apply Poisoned, or apply Corroded to equipment or a Mechanical target.",
    ],
  },
  {
    key: "synthetic-metabolic-isolation", name: "Synthetic Metabolic Isolation", system: "damage", tier: 3, damage: "Chemical", requires: [{ keys: ["closed-circulatory-processor"], label: "Closed Circulatory Processor" }],
    resist: ["Chemical"], attack: { boost: DAMAGE_BOOST[3] },
    effects: [
      "Immune to Chemical Damage through breathing, skin contact, ingestion, or ordinary wounds, and to Poisoned and Contaminated. Direct injection, Surgery, or effects designed to bypass filtration ignore this.",
      "Your Chemical attacks deal +40% Damage, rounded up, and Poisoned and Corroded you apply last two additional Rounds. Once per Scene, after dealing Chemical Damage, apply both Poisoned and Corroded.",
      "Drawback: biological healing and ordinary medication restore 1 less HP or provide one fewer benefit, to a minimum of 0.",
    ],
  },
];

export const CYBER_BY_KEY = Object.fromEntries(CYBERNETICS.map((c) => [c.key, c])) as Record<string, CyberDef>;

export const CYBER_LOCATIONS: Record<NonNullable<CyberDef["location"]>, { name: string; sides?: string[] }> = {
  limb: { name: "Limb", sides: ["Left arm", "Right arm", "Left leg", "Right leg"] },
  eye: { name: "Eye", sides: ["Left eye", "Right eye"] },
  ear: { name: "Ear", sides: ["Left ear", "Right ear"] },
  spine: { name: "Spine" },
  heart: { name: "Heart" },
  kidney: { name: "Kidney" },
  lung: { name: "Lungs" },
  regulator: { name: "Medical regulation" },
  neural: { name: "Neural regulation" },
  reflex: { name: "Reflex processor" },
  port: { name: "Data port" },
  "mech-interface": { name: "Mech interface" },
};

export const CYBER_LOAD: Record<CyberTier, number> = { 1: 1, 2: 2, 3: 3 };

/** What the best implant in a system adds to the Attribute that system is built around. */
export const SYSTEM_ATTR_BONUS: Record<CyberTier, number> = { 1: 0, 2: 1, 3: 2 };

/**
 * What an Interface system adds to the Maximum HP of a mech its owner is piloting. Interface is the
 * one branch built around no Attribute, because the thing it improves isn't the body: a deeper
 * connection means the frame takes punishment that would have stopped a bolted-on pilot. So it has
 * the same ladder as the others, paid out in the frame.
 */
export const INTERFACE_MECH_HP: Record<CyberTier, number> = { 1: 0, 2: 2, 3: 4 };

export function dampeningForLoad(load: number) {
  return load >= 9 ? 3 : load >= 6 ? 2 : load >= 3 ? 1 : 0;
}

export const TIER_LABEL: Record<CyberTier, string> = { 1: "Tier I", 2: "Tier II", 3: "Tier III" };

export type Recipe = { name: string; qty: number }[];

export const IMPLANT_RECIPES: Record<CyberTier | "replacement", Recipe> = {
  1: [{ name: "Cybernetic Core", qty: 1 }, { name: "Scrap Metal", qty: 2 }, { name: "Scrap Components", qty: 3 }, { name: "Basic Adhesive", qty: 1 }],
  2: [{ name: "Cybernetic Core", qty: 1 }, { name: "Reinforced Steel", qty: 2 }, { name: "Components", qty: 3 }, { name: "Advanced Adhesive", qty: 1 }],
  3: [{ name: "Cybernetic Core", qty: 2 }, { name: "Neutronium", qty: 2 }, { name: "Quantum Components", qty: 3 }, { name: "Advanced Adhesive", qty: 2 }],
  replacement: [{ name: "Cybernetic Core", qty: 1 }, { name: "Scrap Metal", qty: 1 }, { name: "Scrap Components", qty: 2 }, { name: "Basic Adhesive", qty: 1 }],
};

export const FABRICATE_TASK: Record<CyberTier, string> = {
  1: "Engineering or Mechanical Technician, Routine Threshold 4, 2 Energy, 1 segment, Grade I Workshop, Standard Toolkit",
  2: "Engineering or Mechanical Technician, Routine Threshold 6, 2 Energy, 1 segment, Grade II Workshop, Standard Toolkit",
  3: "Engineering, Routine Threshold 8, 3 Energy, 1 segment, Grade III Workshop, Advanced Toolkit",
};

export const SURGERY_TASK: Record<CyberTier, string> = {
  1: "Surgery (always Crisis), 2 Energy, 1 segment, Grade I Medical Bay, Surgical Toolkit",
  2: "Surgery (always Crisis), 3 Energy, 1 segment, Grade II Medical Bay, Surgical Toolkit",
  3: "Surgery (always Crisis), 3 Energy, 2 segments, Grade III Medical Bay, Advanced Surgical Toolkit",
};

export const implantName = (def: Pick<CyberDef, "name">, replacement = false) => `${def.name} implant${replacement ? " (Replacement)" : ""}`;
