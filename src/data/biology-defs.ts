import "server-only";

import type { BioCategory, BioDef, BioTier, BioTree } from "./biology";

/**
 * The seventy-four biological augmentations, kept on the server and nowhere else.
 *
 * This file is `server-only` on purpose. A crew knows no biology it hasn't grown, and the shape of
 * the trees is itself the spoiler — so the catalogue must not be in the browser bundle where any
 * player could read it. What reaches a client is whatever `biologyFor` decides they are entitled to:
 * everything for a GM, and only what the lab has grown for a player.
 *
 * Mechanics read augmentations through the registry in `src/lib/bio-catalogue.ts` rather than from
 * here, which is what lets the same code run on the server with all of them and in a player's
 * browser with a handful.
 */

const b = (
  tree: BioTree,
  tier: BioTier,
  name: string,
  categories: BioCategory[],
  effects: string[],
  extra: Partial<Omit<BioDef, "key" | "name" | "tree" | "tier" | "categories" | "effects">> = {},
): BioDef => ({ key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, tree, tier, categories, effects, ...extra });

export const BIO_DEFS: BioDef[] = [
  // Adaptive Tier I: common or relatively simple traits. Narrow, useful adaptations rather than
  // dramatic transformations, and every one of them Immune to some family of Minor Injury.
  b("adaptive", 1, "Redundant Tissue Mass", ["Regenerative"], ["Increase Maximum HP by 2.", "Recover 1 additional HP during a full Rest."], {
    bonus: { maxHp: 2 },
    expression: "The first time each Scene you fall below half HP, gain 2 Temporary HP.",
    backlash: "Your next Food requirement increases by 2.",
  }),
  b("adaptive", 1, "Hypercoagulation Mesh", ["Regenerative"], ["Become Immune to Minor blood-loss Injuries.", "Add Surge Dice to Constitution or First Aid attempts made to resist or remove Bleeding.", "A Biological 6 removes Bleeding."], {
    expression: "When Bleeding is prevented, become Fortified until your next turn.",
    backlash: "Become Slowed.",
  }),
  b("adaptive", 1, "Flexible Bone Matrix", ["Defensive"], ["Become Immune to Minor joint Injuries such as sprains and dislocations.", "Add Surge Dice when resisting Prone, forced movement, or crushing force."], {
    expression: "After resisting forced movement, become Fortified until your next turn.",
    backlash: "Become Brittle.",
  }),
  b("adaptive", 1, "Auxiliary Respiratory Sac", ["Environmental"], ["Become Immune to Minor Inhalation Injuries.", "Add Surge Dice against Suffocating, smoke, and airborne hazards."], {
    expression: "You may become Silenced to suppress Suffocating for the Scene.",
    backlash: "Become Drained.",
  }),
  b("adaptive", 1, "Nictitating Eye Sheath", ["Defensive", "Sensory"], ["Become Immune to Minor eye Injuries caused by dust, debris, smoke, or splashing chemicals.", "Add Surge Dice to Perception in hazardous environments."], {
    expression: "Ignore Blinded until the end of your next turn.",
    backlash: "Become Blinded afterward.",
  }),
  b("adaptive", 1, "Carrion Sensorium", ["Sensory"], ["Add Surge Dice to Perception, Biology, and tracking attempts involving living, injured, infected, or dead organisms."], {
    expression: "A Biological 6 reveals whether the target is injured, afraid, poisoned, or preparing to attack.",
    backlash: "Become Compelled to investigate the strongest biological signal nearby.",
  }),
  b("adaptive", 1, "Chromatophore Skin", ["Sensory"], ["Add Surge Dice to Stealth.", "A Biological 6 allows your coloration to match the immediate environment."], {
    expression: "Once per Scene, become Hidden after remaining still for a Fast Action.",
    backlash: "Become Illuminated as the pigments lose control.",
  }),
  b("adaptive", 1, "Anchoring Tendons", ["Physical", "Defensive"], ["Add Surge Dice to Grappling, bracing, climbing, and resisting forced movement."], {
    expression: "As a Fast Action, become Anchored and Fortified until your next turn.",
    backlash: "Become Immobilized until the end of your next turn.",
  }),
  b("adaptive", 1, "Pheromone Marker", ["Sensory", "Control"], ["Add Surge Dice when tracking or attacking a biological creature you have Marked.", "A Biological 6 applies Marked."], {
    expression: "Marked creatures cannot become Hidden from you at Close range.",
    backlash: "Become Compelled to pursue the Marked target.",
  }),
  b("adaptive", 1, "Occlusion Bladder", ["Chemical", "Control"], ["Gain a short-range Chemical spray with a base of 1 Damage.", "Add Surge Dice to its attack.", "A Biological 6 applies Blinded."], {
    attack: { damage: 1, type: "Chemical", range: "close" },
    expression: "Once per Scene, affect every creature in your zone.",
    backlash: "Become Blinded.",
  }),
  b("adaptive", 1, "Adhesive Cilia", ["Chemical", "Control"], ["Add Surge Dice to climbing, holding objects, Grappling, or applying Restrained.", "A Biological 6 applies Pinned."], {
    expression: "Become Fortified while Grappling or holding an Anchored surface.",
    backlash: "Become Restrained by your own adhesive secretions.",
  }),
  b("adaptive", 1, "Pneumatic Quill Sac", ["Ballistic"], ["Gain an integrated Ballistic attack dealing 2 base Damage.", "Add Surge Dice to its attacks.", "A Biological 6 applies Pinned or Marked."], {
    attack: { damage: 2, type: "Ballistic", range: "close" },
    expression: "Once per Scene, attack a second target in the same zone.",
    backlash: "Take 1 Physical Damage as the quills regenerate.",
  }),
  b("adaptive", 1, "Caustic Saliva", ["Chemical"], ["Gain a short-range Chemical attack dealing 2 base Damage.", "Add Surge Dice to its attacks.", "A Biological 6 applies Corroded."], {
    attack: { damage: 2, type: "Chemical", range: "close" },
    expression: "The attack ignores 1 Armor.",
    backlash: "Become Contaminated.",
  }),
  b("adaptive", 1, "Laryngeal Clamp Symbiote", ["Chemical", "Control"], ["Add Surge Dice to attacks attempting to choke, constrict, or chemically disable a target.", "A Biological 6 applies Silenced."], {
    expression: "Silenced targets also lose access to breath-based, vocal, and sonic abilities.",
    backlash: "Become Silenced.",
  }),
  b("adaptive", 1, "Biological Threat Override", ["Control"], ["Designate attacks as using this module.", "Those attacks gain triple your Surge Dice for the roll, and apply a random Minor Injury to you."], {
    expression: "At the end of each day, roll to heal Injuries twice instead of once.",
    backlash: "Gain a random Major Injury.",
    note: "Tripling the pool is the largest multiplier anywhere in the path, and it sits at Tier I: at Panicked it is +18d6, where the Tier III Siege Tendon Array grants three extra dice. Worth repricing.",
  }),

  // Adaptive Tier II: dangerous, specialized, mature or elite creatures. Strong combat identities.
  b("adaptive", 2, "Regenerative Colony", ["Regenerative"], ["Increase Maximum HP by 4.", "Once per Round while Overtaxed or Panicked, regenerate 4 HP after taking Damage.", "Cannot restore you above half HP during combat."], {
    bonus: { maxHp: 4 },
    expression: "The first regeneration each Scene also removes Bleeding or Staggered.",
    backlash: "After regenerating twice in one Scene, become Drained and Weakened.",
  }),
  b("adaptive", 2, "Redundant Organ Cluster", ["Regenerative"], ["Choose three named Injuries from the Injury table affecting the heart, lungs, kidneys, digestive system, or another internal organ. Become Immune to those Injuries.", "Add Surge Dice to Constitution rolls involving any organ system."], {
    expression: "When the Immunity prevents an Injury, gain 3 Temporary HP.",
    backlash: "Your Food requirement increases by 1 for the next two days.",
    note: "The document says to choose three Injuries and then becomes Immune to that Injury, singular. Read here as Immune to all three.",
  }),
  b("adaptive", 2, "Emergency Molt", ["Regenerative"], ["Once per expedition, spend a Slow Action to remove two of Bleeding, Burning, Contaminated, Corroded, Poisoned, or Restrained.", "Alternatively, remove one and gain 3 Temporary HP."], {
    expression: "Also restore 2 HP.",
    backlash: "Become Slowed and shed worn Armor.",
  }),
  b("adaptive", 2, "Reactive Carapace", ["Defensive"], ["Add Surge Dice to Constitution rolls against Ballistic and Physical harm.", "As a Fast Action, become Fortified until your next turn."], {
    expression: "While Fortified, also become Immune to Pinned and Prone.",
    backlash: "Become Exposed when the carapace retracts.",
  }),
  b("adaptive", 2, "Ripper Tendons", ["Physical"], ["Add Surge Dice to Physical attacks.", "A Biological 6 applies Bleeding.", "While you are Overtaxed or Panicked, Bleeding you cause deals 2 Damage instead of 1."], {
    expression: "After dealing Physical Damage, move one zone or apply Staggered.",
    backlash: "One attacking limb becomes Crippled until the end of the Scene.",
  }),
  b("adaptive", 2, "Predator-Burst Musculature", ["Physical", "Movement"], ["Add Surge Dice to Strength, Acrobatics, pursuit, jumping, and forced movement.", "Once per Scene, become Accelerated until the end of your turn."], {
    expression: "Whenever you gain Pressure, move one zone as a Reaction.",
    backlash: "Become Drained.",
  }),
  b("adaptive", 2, "Bone-Spine Launcher", ["Ballistic"], ["Gain an integrated Ballistic attack dealing 3 base Damage.", "Add Surge Dice to its attacks.", "A Biological 6 applies Pinned or Marked."], {
    attack: { damage: 3, type: "Ballistic", range: "long" },
    expression: "Attack two targets in the same zone with one roll.",
    backlash: "Take 1 Physical Damage and become Slowed.",
  }),
  b("adaptive", 2, "Shrapnel Brood", ["Ballistic"], ["Once per Scene, launch hardened biological fragments through an entire zone.", "Make one Ballistic attack against every creature there, adding Surge Dice once."], {
    expression: "A Biological 6 applies Pinned to every damaged target.",
    backlash: "Take 2 Physical Damage and become Exposed.",
  }),
  b("adaptive", 2, "Corrosive Crop", ["Chemical"], ["Gain an integrated Chemical attack dealing 3 base Damage.", "Add Surge Dice to its attacks.", "A Biological 6 applies Corroded."], {
    attack: { damage: 3, type: "Chemical", range: "close" },
    expression: "A Biological 6 also applies Poisoned.",
    backlash: "Become Contaminated.",
  }),
  b("adaptive", 2, "Hallucinogenic Mist Colony", ["Chemical", "Control"], ["Release a Chemical cloud into your zone or an adjacent zone.", "Add Surge Dice when attempting to apply Blinded or Disoriented to creatures within it."], {
    expression: "A Biological 6 may apply Confused instead.",
    backlash: "Become Disoriented.",
  }),
  b("adaptive", 2, "Adhesive Web Organ", ["Chemical", "Control"], ["Add Surge Dice to attacks that apply Pinned, Grappled, or Restrained.", "Webbed terrain becomes Difficult Terrain."], {
    expression: "Restrained targets also become Exposed.",
    backlash: "Become Immobilized until you tear free.",
  }),
  b("adaptive", 2, "Mute-Toxin Reservoir", ["Chemical", "Control"], ["Gain a close-range injection or spray.", "Add Surge Dice to the attack.", "A Biological 6 applies Silenced."], {
    expression: "A Silenced target also becomes Weakened if it relies on respiration, vocalization, or pressure regulation.",
    backlash: "Become Silenced.",
  }),
  b("adaptive", 2, "Symbiotic Condition Eater", ["Symbiotic"], ["Once per Scene, transfer Bleeding, Poisoned, Burning, or Contaminated from an adjacent ally to yourself.", "Add Surge Dice to actions performed while carrying the absorbed condition."], {
    expression: "Gain 2 Temporary HP when absorbing it.",
    backlash: "The transferred condition cannot be removed until the Scene ends.",
  }),
  b("adaptive", 2, "Nictitating Armor", ["Defensive", "Sensory"], ["Become Immune to one named eye Injury.", "Once per Scene, ignore Blinded until the end of your next turn.", "Add Surge Dice to Perception through smoke, darkness, debris, or chemicals."], {
    expression: "While ignoring Blinded, detect Hidden movement in your zone.",
    backlash: "Become Deafened as your other senses overload.",
  }),
  b("adaptive", 2, "Thermal Exchange Organ", ["Fire"], ["Add Surge Dice to Fire attacks and attempts to endure heat.", "A Biological 6 applies Burning.", "While you are Overtaxed or Panicked, Burning you cause deals 2 Fire Damage instead of 1."], {
    expression: "Become Fortified against Fire and heat while Overtaxed or Panicked.",
    backlash: "Become Overheated and Burning.",
  }),
  b("adaptive", 2, "Voltaic Nerve Web", ["Electric"], ["Add Surge Dice to Electric attacks, Initiative, and Reactions.", "A Biological 6 applies Conductive."], {
    expression: "After taking Electric Damage, become Accelerated until your next turn.",
    backlash: "Become Staggered and Disrupted.",
  }),

  // Adaptive Tier III: apex, unique, ancient or radically mutated organisms. These change how a
  // character plays, and every one of them has a Backlash that can end a Scene badly.
  b("adaptive", 3, "Distributed Vitality", ["Regenerative"], ["Increase Maximum HP by 8.", "Become Immune to conventional heart, lung, kidney, and single-organ Injuries.", "Once per Round while Overtaxed or Panicked, regenerate 2 HP, up to half Maximum HP.", "A full Rest restores all HP if your Food and Water requirements are met."], {
    bonus: { maxHp: 8 },
    expression: "Once per Scene, regeneration may function while at 0 HP.",
    backlash: "Triple your daily Food requirement; regeneration stops while hungry.",
    note: "The document lists Distributed Vitality in both the adaptive and utility Tier III tables with different effects. Merged here, carrying both.",
  }),
  b("adaptive", 3, "Perfected Molt", ["Regenerative"], ["Once per expedition, spend a secured Expedition Turn molting.", "Restore all HP, remove all removable conditions, heal one Minor Injury, and repair one biological augmentation."], {
    expression: "At five or more Stress, the molt may also remove one Major Injury and replace it with an appropriate Minor Injury.",
    backlash: "You are Immobilized, Blinded, and defenseless during the molt.",
  }),
  b("adaptive", 3, "Catastrophic Adaptation", ["Reactive"], ["Once per expedition, become Immune to one Injury as it would be inflicted.", "The body immediately develops a temporary mutation explaining how it survived."], {
    expression: "Gain 4 Temporary HP and add Surge Dice to your next Action.",
    backlash: "Gain 1 Stress and become Enraged, Confused, or Immobilized, based on the mutation.",
  }),
  b("adaptive", 3, "Apex Carapace", ["Defensive"], ["As a Fast Action, become Fortified until you voluntarily retract the carapace.", "While Fortified, become Immune to fracture, crushed-rib, and superficial Ballistic Injuries, as well as Pinned and Prone.", "Add Surge Dice to defensive Constitution rolls."], {
    expression: "Once per Round, reduce all incoming Damage by the number of Biological 6s rolled on your most recent defensive roll.",
    backlash: "Become Slowed and Exposed after retracting it.",
  }),
  b("adaptive", 3, "Siege Tendon Array", ["Physical"], ["Add Surge Dice to Physical attacks.", "Each Biological 6 may apply Staggered, Immobilized, Disarmed, or forced movement, as well as generating stunts."], {
    expression: "At four or more Stress, attacks against structures, Fortified targets, and vehicles gain three additional Surge Dice.",
    backlash: "Become Crippled in one limb and Enraged until the Scene ends.",
  }),
  b("adaptive", 3, "Living Ballista", ["Ballistic"], ["Gain a long-range integrated Ballistic attack dealing 4 base Damage.", "Add Surge Dice to its attacks.", "A Biological 6 applies Pinned or Marked."], {
    attack: { damage: 4, type: "Ballistic", range: "long" },
    expression: "Fire through every target in a straight line using one roll.",
    backlash: "Take 2 Physical Damage and become Immobilized until your next turn.",
  }),
  b("adaptive", 3, "Razorstorm Colony", ["Ballistic", "Physical"], ["Once per Scene, launch a zone-wide storm of hardened fragments.", "Add Surge Dice to attacks against every exposed creature in the chosen zone.", "Biological 6s apply Bleeding or Pinned.", "A creature already Bleeding when the storm reaches it takes +2 Damage from it."], {
    expression: "After firing, harden the remaining growths and become Fortified.",
    backlash: "Become Immobilized while the colony regrows.",
  }),
  b("adaptive", 3, "Necrotic Foundry", ["Chemical"], ["Gain an integrated Chemical attack dealing 4 base Damage.", "Before attacking, choose Corroded, Poisoned, Blinded, or Silenced.", "A Biological 6 applies the chosen condition, and two apply a second."], {
    attack: { damage: 4, type: "Chemical", range: "close" },
    expression: "At two or more Stress, the attack may fill an entire zone.",
    backlash: "Become Poisoned and Contaminated.",
  }),
  b("adaptive", 3, "Blackout Spore Colony", ["Chemical", "Control"], ["Create a persistent spore cloud in your zone or an adjacent zone.", "Creatures entering it risk becoming Blinded and Silenced.", "Add Surge Dice to both applications."], {
    expression: "You become Hidden while inside your own cloud and can perceive biological creatures within it.",
    backlash: "Become Blinded and Silenced when the cloud disperses.",
  }),
  b("adaptive", 3, "Predator Veil", ["Sensory", "Control"], ["Add Surge Dice to Stealth, pursuit, and attacks from Hidden.", "A Biological 6 applies Marked automatically, and two make the target Frightened of you."], {
    expression: "At two or more Stress, your first hostile Action from Hidden does not immediately end Hidden.",
    backlash: "Become Compelled to continue pursuing the most recently Marked creature.",
  }),
  b("adaptive", 3, "Parasitic Chorus", ["Symbiotic", "Control"], ["Connect nearby biological nervous systems.", "Add Surge Dice to attempts to transfer Frightened, Confused, Weakened, or Drained between creatures."], {
    expression: "At two or more Stress, copy Fortified, Accelerated, or Regenerating from one linked creature to another until the end of the Round.",
    backlash: "Become Confused and share one harmful condition carried by the network.",
  }),
  b("adaptive", 3, "Resurrection Seed", ["Regenerative"], ["Once per expedition, when reduced to 0 HP, form a protective cocoon.", "Become Immobilized and gain 5 Temporary HP.", "If at least 1 Temporary HP remains at the end of the Scene, return with 2 HP."], {
    expression: "Become Immune to the Injury that reduced you to 0 HP until the expedition ends.",
    backlash: "Gain 1 Stress and an obvious temporary mutation.",
  }),
  b("adaptive", 3, "Furnace Bloom", ["Fire"], ["Add Surge Dice to Fire attacks.", "A Biological 6 applies Burning.", "At Overtaxed or Panicked, the attack may create a Burning zone."], {
    expression: "At two or more Stress, become Fortified while surrounded by fire and add one additional Surge Die to Fire attacks.",
    backlash: "Become Burning and Overheated.",
  }),
  b("adaptive", 3, "Storm Reflex Cluster", ["Electric"], ["Add Surge Dice to Electric attacks, Initiative, and defensive Reactions.", "A Biological 6 applies Conductive or Staggered."], {
    expression: "At two or more Stress, Electric attacks may chain to a second nearby target.",
    backlash: "Become Overloaded, Conductive, and Disrupted.",
  }),

  // Utility Tier I: the daily economy, a little at a time.
  b("utility", 1, "Glycogen Reservoir", ["Utility"], ["Once per day, reduce the Energy cost of one Task by 1.", "Your next Food requirement increases by 1."], {
    expression: "You may use this twice per day.",
    note: "The document lists this in both Tier I tables, with the same effect. One upgrade here.",
  }),
  b("utility", 1, "Dense Caloric Tissue", ["Utility"], ["Increase Maximum Energy by 1.", "Missing or Rationing Food removes this bonus until you eat normally again."], { bonus: { maxEnergy: 1 } }),
  b("utility", 1, "Recovery Nodules", ["Regenerative"], ["When you complete a Rest, recover 3 additional HP."], { expression: "Also remove Drained after a full Rest." }),
  b("utility", 1, "Secondary Oxygen Loop", ["Environmental"], ["Add Surge Dice to Constitution Tasks involving exertion, long work, Suffocating, or exhaustion."], {
    expression: "Once per day, ignore the Energy cost of a physically demanding Task, then become Drained.",
  }),
  b("utility", 1, "Water-Retention Bladder", ["Environmental"], ["Ignore the first penalty each day caused by reduced Water."], {
    expression: "While Pressured or worse, you no longer have to drink water.",
  }),
  b("utility", 1, "Digestive Symbiote", ["Utility"], ["Gain more value from poor-quality or unusual food.", "Spoiled but non-toxic food or biological mass can be eaten safely."], {
    expression: "1 Biomass counts as 2 Food units for you.",
  }),
  b("utility", 1, "Load-Bearing Fascia", ["Physical"], ["Add Surge Dice to carrying, lifting, dragging, climbing, and similar Strength Tasks."], {
    expression: "Gain 1 extra expedition inventory slot while carrying at least 1 Stress.",
  }),
  b("utility", 1, "Micro-Rest Cortex", ["Utility"], ["When you spend a segment Resting, recover 1 additional Energy if you did not perform a Crisis Task during the previous segment."], {
    backlash: "If awakened or interrupted, become Disoriented.",
  }),
  b("utility", 1, "Pain-Filtering Tissue", ["Utility"], ["Ignore the first 1d6 penalty caused by an Injury during a noncombat Task. The Injury still exists."], {
    expression: "While carrying Stress, this applies to two Injury penalty dice instead.",
  }),
  b("utility", 1, "Thermoregulatory Mesh", ["Environmental"], ["Add Surge Dice to work performed in extreme heat or cold."], {
    expression: "Environmental discomfort cannot increase the Energy cost of Tasks by more than 1.",
  }),

  // Utility Tier II: now it starts altering the crew's daily economy rather than easing it.
  b("utility", 2, "Metabolic Overdrive Organ", ["Utility"], ["Once per day, immediately recover 2 Energy.", "At the end of the segment, become Drained."], { expression: "Recover 3 Energy instead." }),
  b("utility", 2, "Regenerative Work Tissue", ["Regenerative"], ["Increase Maximum HP by 4.", "After contributing to a Project, if you spent 2 or more Energy, recover 1 HP."], {
    bonus: { maxHp: 4 },
    expression: "The first time each day this triggers, also recover 1 Energy.",
  }),
  b("utility", 2, "Distributed Musculature", ["Physical"], ["When contributing to a physical Project, add Surge Dice to the contribution.", "A Biological 6 may add 1 extra Progress instead of another stunt."], {
    backlash: "Become Weakened after gaining extra Progress.",
  }),
  b("utility", 2, "Adaptive Circadian Gland", ["Utility"], ["Once per day, treat one Rest segment as though it were a full Rest for Energy recovery only."], {
    expression: "You may do this after a Crisis Task.",
    backlash: "You cannot benefit from this again until you complete a true full Rest.",
  }),
  b("utility", 2, "Emergency Nutrient Sac", ["Utility"], ["Store one day of Food internally. It occupies no inventory.", "When consumed, also restore 1 Energy."], {
    expression: "At two or more Stress, it restores 2 Energy instead.",
  }),
  b("utility", 2, "Hypermetabolic Hands", ["Utility"], ["Once per segment, when performing a crafting or repair Task, you may spend 1 extra Energy to treat the Task as if you had one additional Routine Mastery Benefit."], {
    backlash: "Your next Food requirement increases by 1.",
  }),
  b("utility", 2, "Waste-Reclamation Colony", ["Utility"], ["Reduce daily Food or Water consumption by one unit, chosen each day."], {
    expression: "At two or more Stress, reduce both by one.",
    backlash: "Become Poisoned if you consume contaminated supplies.",
  }),
  b("utility", 2, "Trauma-Fueled Focus", ["Utility"], ["While below half HP, add Surge Dice to noncombat Tasks."], {
    expression: "At two or more Stress, one Biological 6 can be converted into reducing an Energy cost by 1.",
  }),
  b("utility", 2, "Reserve Blood Organ", ["Regenerative"], ["Once per day, when you would become Drained from work, ignore it."], {
    expression: "Also recover 1 HP.",
    backlash: "Become Slowed until you next Rest.",
  }),
  b("utility", 2, "Mycelial Memory Lattice", ["Utility"], ["After successfully completing the same type of Task three times in a day, the fourth costs 1 less Energy."], {
    expression: "At two or more Stress, this begins after the second success instead.",
  }),

  // Utility Tier III: working at clearly inhuman levels, but never for free.
  b("utility", 3, "Perpetual Metabolism", ["Utility"], ["Increase Maximum Energy by 3.", "Once per day, when you reach 0 Energy, immediately recover 3 Energy."], {
    bonus: { maxEnergy: 3 },
    expression: "At two or more Stress, recover 4 instead.",
    backlash: "Double your Food requirement for the next day.",
  }),
  b("utility", 3, "Worker-Caste Morphology", ["Physical"], ["At the start of each day, choose one adaptation: Brawler, Lifter, or Shooter.", "For that day, relevant physical Tasks gain Surge Dice and their first Energy cost is reduced by 1."], {
    expression: "At two or more Stress, choose two adaptations.",
  }),
  b("utility", 3, "Hyperplastic Hands", ["Utility"], ["Once per Project contribution, you may gain 1 Pressure to add 1 Progress after succeeding.", "At Panicked, you may add 2 Progress instead."], {
    backlash: "Become Weakened and Drained.",
  }),
  b("utility", 3, "Emergency Organ Bloom", ["Reactive"], ["Once per expedition or workday, grow a temporary organ suited to the immediate problem: an oxygen bladder, a filtration sac, gripping pads, a thermal layer, lifting tissue.", "Gain the appropriate narrow utility benefit for the Scene or segment."], {
    backlash: "Gain 1 Pressure and become Contaminated by shed tissue afterward.",
  }),
  b("utility", 3, "Sleepless Colony", ["Utility"], ["You require ordinary sleep every other day rather than every day.", "You may remain active through one normal Rest period without Energy penalties."], {
    expression: "At two or more Stress, you may do this for two consecutive days.",
    backlash: "Afterward, gain 1 Stress unless you complete a full day of normal recovery.",
  }),
  b("utility", 3, "Catabolic Reserve", ["Utility"], ["When you lack Food, Water, or Energy, you may consume your own tissue.", "Restore 3 Energy or satisfy one day of Food or Water need, then lose 2 Maximum HP until fully nourished and rested."], {
    expression: "At three or more Stress, restore 4 Energy instead.",
  }),
  b("utility", 3, "Collective Work Symbiote", ["Symbiotic"], ["When assisting another character on a Project, your Surge Dice may be added to their contribution roll, even though normal Assistance does not combine skill levels."], {
    expression: "A Biological 6 may give the contributor 1 extra Progress.",
    backlash: "Both characters gain 1 Pressure.",
  }),
  b("utility", 3, "Adaptive Recovery Cocoon", ["Regenerative"], ["Once per day, spend one segment completely inactive.", "Restore all Energy and 4 HP, and remove Drained and Weakened.", "You are Immobilized, Blinded, and helpless during the cocoon."], {
    expression: "At two or more Stress, also suppress one Injury until the next day.",
  }),
  b("utility", 3, "Survival Metamorphosis", ["Reactive"], ["While at 0 Energy, below half HP, and carrying Stress, you may enter a survival state for one Scene.", "Ignore Energy costs, add 1 Surge Die to all applicable physical Tasks, and you cannot become Drained.", "When it ends, set Energy to 0, become Weakened, and gain 1 Stress."]),
];
