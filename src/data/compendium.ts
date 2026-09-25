// Generated from the Adrift rulebook compendium.
export type TableEntry = { code: string; category: number; categoryName: string; name: string; effect: string };
export type ConditionEntry = { name: string; effect: string; removal: string };

export const INJURIES: TableEntry[] = [
  {
    "code": "1-1",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Bruised Ribs",
    "effect": "Suffer −1d6 to Constitution-based rolls. The first strenuous Slow Action you perform each Scene costs +1 Energy."
  },
  {
    "code": "1-2",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Lacerations",
    "effect": "Become Bleeding. Once Bleeding is removed, reduce Maximum HP by an additional 2 until the Injury fully heals."
  },
  {
    "code": "1-3",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Burned Hands or Arms",
    "effect": "Suffer −1d6 to Tasks involving tools, weapons, or fine hand movements. Taking Fire Damage causes Staggered until the end of your next turn."
  },
  {
    "code": "1-4",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Muscle Tear",
    "effect": "Suffer -1d6 during Strength-based Tasks. Strength-based shipboard Tasks cost +1 Energy."
  },
  {
    "code": "1-5",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Minor Shock",
    "effect": "Become Staggered immediately. Your next Rest restores only half the normal Energy, rounded up, after which the Injury is healed."
  },
  {
    "code": "1-6",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Open Abrasions",
    "effect": "You lose Resistance or Immunity to Contaminated while this Injury remains. If you have no such Resistance, the first source of Contamination each expedition applies automatically without a roll. All chemical damage applied to you is doubled."
  },
  {
    "code": "1-7",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Sprained Fingers",
    "effect": "Suffer −1d6 when using two-handed weapons, firearms, Toolkits, or delicate equipment. On a failed attack using the injured hand, become Disarmed."
  },
  {
    "code": "1-8",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Shallow Puncture",
    "effect": "The first time each Expedition you Grapple, or perform a strenuous Physical Task, become Bleeding."
  },
  {
    "code": "1-9",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Flash Burn",
    "effect": "Become Blinded until the end of your next turn. Afterward, suffer −2d6 to sight-dependent Perception and ranged attacks."
  },
  {
    "code": "1-10",
    "category": 1,
    "categoryName": "Minor Surface Trauma",
    "name": "Lucky Hit",
    "effect": "The wound is painful but superficial. It has no additional mechanical effect, though it still counts as an Injury for penalties, treatment and recovery."
  },
  {
    "code": "2-1",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Sprained Joint",
    "effect": "Become Slowed and suffer −1d6 to all Acrobatics rolls. Proper bracing removes Slowed but not the Acrobatics penalty."
  },
  {
    "code": "2-2",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Mild Concussion",
    "effect": "Become Disoriented until healed. The first failed Skilled or Crisis Task each Scene also causes Staggered."
  },
  {
    "code": "2-3",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Whiplash",
    "effect": "Suffer −1d6 to Perception and Navigation. You cannot use Overwatch against a target outside the direction you were already watching."
  },
  {
    "code": "2-4",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Cracked Tooth or Jaw",
    "effect": "Suffer −2d6 to speech-dependent Tasks. Eating solid Food requires a flat Constitution roll; failure causes 1 Physical Damage. Becoming Staggered also makes you Silenced until the end of your next turn."
  },
  {
    "code": "2-5",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Shallow Shrapnel Wound",
    "effect": "Metal fragments remain lodged in the body. When you take Electric Damage, also become Conductive. Removing the fragments requires Surgery."
  },
  {
    "code": "2-6",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Nerve Shock",
    "effect": "Choose one arm or leg. The first Task using it each Scene suffers −3d6. If that Task fails, become Staggered."
  },
  {
    "code": "2-7",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Tinnitus",
    "effect": "Become Deafened until the end of the Scene. Afterward, suffer −2d6 to sound-dependent Perception until healed. Explosions cause the Deafened condition to return for the Scene."
  },
  {
    "code": "2-8",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Adrenal Dysregulation",
    "effect": "The first time you take HP Damage in each Scene, become Enraged until the end of your next turn. When Enraged ends, become Drained."
  },
  {
    "code": "2-9",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Lung Irritation",
    "effect": "You cannot safely hold your breath. While exposed to smoke, gas, vacuum, or Suffocating, you are also Weakened."
  },
  {
    "code": "2-10",
    "category": 2,
    "categoryName": "Minor Functional Trauma",
    "name": "Minor Chemical Exposure",
    "effect": "Become Contaminated until properly decontaminated. While Contaminated by this Injury, reduce Maximum Energy by 1."
  },
  {
    "code": "3-1",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Broken Leg",
    "effect": "Become Slowed and cannot Sprint. Suffer −3d6 to Acrobatics. Moving without a brace, crutch, mech, or assistance causes 1 Physical Damage once per Scene."
  },
  {
    "code": "3-2",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Broken Arm",
    "effect": "The arm cannot use weapons, Toolkits, or equipment. You cannot use two-handed weapons. Reduce expedition inventory capacity by 2 slots."
  },
  {
    "code": "3-3",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Broken Ribs",
    "effect": "Become Weakened. The first time each Scene you Sprint, make a Physical attack, or perform another strenuous Slow Action, take 1 Physical Damage."
  },
  {
    "code": "3-4",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Deep Laceration",
    "effect": "Become Bleeding and reduce Maximum HP by 2. If Bleeding is applied again before the Injury is treated, immediately take 2 Physical Damage instead of 1."
  },
  {
    "code": "3-5",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Torn Ligament",
    "effect": "Become Slowed and cannot Dodge. A brace allows Dodge at −3d6 but does not remove Slowed."
  },
  {
    "code": "3-6",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Fractured Pelvis",
    "effect": "Become Immobilized without mobility support. With a brace, stretcher, mech, or another character’s assistance, replace Immobilized with Slowed."
  },
  {
    "code": "3-7",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Crushed Hand",
    "effect": "One hand is unusable. You cannot use two-handed weapons and suffer −3d6 to Tasks requiring fine control with the remaining hand. Surgery may preserve the hand."
  },
  {
    "code": "3-8",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Dislocated Shoulder",
    "effect": "One arm is unusable until a successful First Aid Task resets it. Afterward, treat the Injury as a Broken Arm until fully healed."
  },
  {
    "code": "3-9",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Severe Concussion",
    "effect": "Become Disoriented. Begin every combat Surprised. The first time you gain Pressure in each Scene, also become Confused until the end of your next turn."
  },
  {
    "code": "3-10",
    "category": 3,
    "categoryName": "Major Skeletal Trauma",
    "name": "Penetrating Shrapnel",
    "effect": "Reduce Maximum HP by 2. Electric Damage also applies Conductive. Removing the fragments requires Surgery; failed removal causes Bleeding."
  },
  {
    "code": "4-1",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Internal Bleeding",
    "effect": "Become Bleeding at the end of every Expedition Turn and after every combat Scene. First Aid can suppress this until the end of the current segment. Surgery is required to cure it. HP recovery is halved."
  },
  {
    "code": "4-2",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Severe Burn",
    "effect": "Reduce Maximum Energy by 2. Fire Resistance is reduced by 1, to a minimum of 0. Extinguishing Burning requires a Slow Action rather than a Fast Action."
  },
  {
    "code": "4-3",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Severe Eye Injury",
    "effect": "One eye is unusable. Suffer −3d6 to ranged attacks and sight-dependent Perception. If the remaining eye is also lost or covered, become Blinded."
  },
  {
    "code": "4-4",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Ruptured Eardrum",
    "effect": "Become Deafened until treated. Suffer −2d6 to Acrobatics and balance-related Tasks. Explosions and Electric Damage also cause Staggered."
  },
  {
    "code": "4-5",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Punctured Lung",
    "effect": "After Sprinting or performing two strenuous Slow Actions in the same Scene, become Suffocating. Reduce Maximum HP by 2 during expeditions."
  },
  {
    "code": "4-6",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Chemical Burns",
    "effect": "Become Contaminated until treated. Chemical Resistance is reduced by 1. If you have Chemical Immunity, treat it as Chemical Resistance 2 instead."
  },
  {
    "code": "4-7",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Electrical Nerve Damage",
    "effect": "Whenever you take Electric Damage, also become Staggered. You lose Immunity to Staggered; if you had no Immunity, Stagger Resistance is lost instead."
  },
  {
    "code": "4-8",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Spinal Compression",
    "effect": "Become Slowed. When you fail an Acrobatics or Strength-based movement Task, become Immobilized until an adjacent character spends a Slow Action helping you."
  },
  {
    "code": "4-9",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Fractured Jaw",
    "effect": "Become Silenced. You may communicate through gestures or equipment that does not require speech. Eating solid Food costs 1 Energy and causes 1 Physical Damage."
  },
  {
    "code": "4-10",
    "category": 4,
    "categoryName": "Major Internal and Sensory Trauma",
    "name": "Traumatic Fight Response",
    "effect": "The first time you become Frightened, Surprised, or take 3 or more Damage in a Scene, become Enraged. When Enraged ends, become Confused until the end of your next turn."
  },
  {
    "code": "5-1",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Crushed Limb",
    "effect": "One limb is Crippled and permanently unusable until reconstructed or replaced. Apply the relevant effects of Broken Arm or Broken Leg."
  },
  {
    "code": "5-2",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Spinal Trauma",
    "effect": "Become Immobilized without mobility support. All Tasks cost +1 Energy. You cannot join expeditions without a wheelchair, mech, powered brace, biological adaptation, or another appropriate support system."
  },
  {
    "code": "5-3",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Organ Damage",
    "effect": "Reduce Constitution and Strength by 1 each, to a minimum of 1. After completing a strenuous Task, become Weakened until the end of the Scene."
  },
  {
    "code": "5-4",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Radiation Sickness",
    "effect": "Become Contaminated. Reduce Maximum Energy by 2 and double daily Water requirements. Radiation treatment or organ replacement is required."
  },
  {
    "code": "5-5",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Neural Trauma",
    "effect": "Reduce Intelligence and Wits by 1 each, to a minimum of 1. Become Disoriented. You lose Immunity to Confused; if you had no Immunity, lose Confused Resistance instead."
  },
  {
    "code": "5-6",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Sensory Loss",
    "effect": "Permanently lose Sight, Hearing, Smell, or Touch, determined by the Injury source or randomly. Apply Blinded or Deafened when appropriate. Lost senses require cybernetic, biological, or equivalent replacement."
  },
  {
    "code": "5-7",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Collapsed Lung",
    "effect": "The first strenuous Slow Action you perform each Scene causes Suffocating. Reduce Maximum HP by 2. A portable Oxygen supply prevents Suffocating but not the Maximum HP loss."
  },
  {
    "code": "5-8",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Kidney Damage",
    "effect": "Reduce Maximum HP and Maximum Energy by 2. Chemical Resistance is reduced by 1. Poisoned and Contaminated effects advance twice as quickly."
  },
  {
    "code": "5-9",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Systemic Infection",
    "effect": "Gain a six-box Infection Clock. Advance it at the end of each day and whenever you gain Stress. At three boxes, become Poisoned. When filled, suffer Organ Failure."
  },
  {
    "code": "5-10",
    "category": 5,
    "categoryName": "Severe Lasting Trauma",
    "name": "Traumatic Brain Injury",
    "effect": "Begin each combat Confused. The first time you become Overtaxed or Panicked in a Scene, also become Enraged or Immobilized, chosen randomly."
  },
  {
    "code": "6-1",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Massive Hemorrhage",
    "effect": "Become Bleeding, but Bleeding deals 2 Physical Damage. Every time this Bleeding deals Damage, reduce Maximum HP by the same amount. First Aid suppresses the Damage for one Expedition Turn. Surgery is required."
  },
  {
    "code": "6-2",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Organ Failure",
    "effect": "Become Poisoned and Drained. Surgery is required within one day segment or the character dies. After successful Surgery, the character must spend two segments Resting."
  },
  {
    "code": "6-3",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Bilateral Punctured Lungs",
    "effect": "Become Suffocating immediately. Without continuous Oxygen support, take 2 Physical Damage at the end of each Round. Everytime this character is hit, suffer from Suffocating until the end of the round. Surgery is required within one day segment, or the character dies."
  },
  {
    "code": "6-4",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Crushed Torso",
    "effect": "Become Immobilized, Weakened, and Bleeding. Surgery is required within one day segment or the character dies. After treatment, gain Spinal Trauma or Organ Damage."
  },
  {
    "code": "6-5",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Severed Artery",
    "effect": "Bleeding deals 3 Physical Damage instead of 1. A successful Crisis First Aid Task reduces this to normal Bleeding for one Expedition Turn. Surgery is required immediately."
  },
  {
    "code": "6-6",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Traumatic Amputation",
    "effect": "One limb is lost. Become Bleeding, with Bleeding dealing 2 Damage. Apply Crushed Limb permanently after Bleeding is stopped."
  },
  {
    "code": "6-7",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Total Spinal Severance",
    "effect": "Become permanently Immobilized below the point of Injury. You cannot perform lower-body movement and lose all expedition inventory granted by Strength until appropriate mobility support is acquired."
  },
  {
    "code": "6-8",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Full-Thickness Burns",
    "effect": "Reduce Maximum Energy by 2 and become Contaminated. You are Weakened and lose all Fire Resistance. Becoming Burning immediately deals 2 additional Fire Damage."
  },
  {
    "code": "6-9",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Brain Swelling",
    "effect": "Become Confused and Silenced. At the end of each Expedition Turn, lose 1 Maximum HP. Surgery is required before Maximum HP reaches 0."
  },
  {
    "code": "6-10",
    "category": 6,
    "categoryName": "Critical and Mortal Trauma",
    "name": "Catastrophic Trauma",
    "effect": "Surgery is required within one day segment or the character dies. Immediately roll two additional Injuries of Major or Critical severity. Reroll further results of Catastrophic Trauma."
  }
];

export const AFFLICTIONS: TableEntry[] = [
  {
    "code": "1-1",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Fire",
    "effect": "You cannot willingly use weapons or abilities that deal Fire Damage. Unexpected flames, explosions, or a creature becoming Burning cause 1 Pressure, once per Scene. If you cannot become Frightened, gain 1 additional Pressure instead."
  },
  {
    "code": "1-2",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Claustrophobia",
    "effect": "Entering a cramped, sealed, or Restrained space causes 1 Pressure. While Grappled or Restrained in such a space, you also become Frightened. After three consecutive days without leaving the ship, gain 1 Stress."
  },
  {
    "code": "1-3",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Vacuum",
    "effect": "Entering an unpressurized environment causes 1 Pressure, once per Scene. A suit breach, decompression alarm, or failure of atmospheric protection causes Frightened. You suffer −3d6 on Tasks performed while Suffocating."
  },
  {
    "code": "1-4",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Darkness",
    "effect": "Sudden darkness causes Surprised. While in darkness, suffer −3d6 to Tasks that are not directly related to finding light or escaping. You cannot benefit from Hidden while in complete darkness."
  },
  {
    "code": "1-5",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Sound Sensitivity",
    "effect": "The first sudden loud noise each Scene causes Staggered. Explosions, unsuppressed gunfire in enclosed spaces, alarms, and sonic attacks may also cause 1 Pressure at the GM’s discretion."
  },
  {
    "code": "1-6",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Blood",
    "effect": "Seeing yourself or a nearby character become Bleeding causes 1 Pressure, once per Scene. You cannot intentionally select Bleeding as a stunt. Treating Bleeding is always a Skilled Task for you, and you suffer -2d6 to treating it."
  },
  {
    "code": "1-7",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Starvation",
    "effect": "You cannot willingly consume your final carried Food Unit or give it to another character. Beginning a day without access to Food causes 1 Stress. While carrying no Food during an expedition, you are Weakened."
  },
  {
    "code": "1-8",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Isolation",
    "effect": "While no conscious ally is in your zone or able to communicate with you, suffer −2d6 to all Tasks and cannot reduce Pressure. Becoming separated unexpectedly causes Confused until the end of your next turn."
  },
  {
    "code": "1-9",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Aversion to Silence",
    "effect": "A completely silent or very quiet zone causes 1 Pressure at the end of each Expedition Turn. You automatically fail Stealth Tasks that require remaining entirely silent unless an ally is directly communicating with you."
  },
  {
    "code": "1-10",
    "category": 1,
    "categoryName": "Phobias and Sensory Aversions",
    "name": "Fear of Medical Procedures",
    "effect": "Suffer −3d6 when performing or receiving First Aid or Surgery. Beginning Surgery causes Frightened until the procedure ends. You cannot benefit from Immunity to Frightened during a medical procedure."
  },
  {
    "code": "2-1",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Xenobiological Aversion",
    "effect": "The first biological alien encountered in a Scene causes Frightened. Suffer −3d6 on Biology Tasks involving alien organisms. Identifying an alien Resistance, Immunity, or Vulnerability requires one additional success."
  },
  {
    "code": "2-2",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Environmental Paranoia",
    "effect": "When entering a new zone, you cannot treat it as Secured until you or an ally spends an Expedition Task examining it. Acting in the zone before this occurs causes 1 Pressure and makes all Tasks there Skilled."
  },
  {
    "code": "2-3",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Mechanophobia",
    "effect": "You cannot willingly operate a mech or install a new cybernetic. Powered machinery you do not understand causes −3d6 to your first Task in its zone. If you already possess cybernetics, becoming Disrupted also causes Frightened."
  },
  {
    "code": "2-4",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Ballistic Panic",
    "effect": "The first Ballistic attack fired in each Scene causes Surprised unless you fired it. You suffer −2d6 when using Ballistic weapons and cannot use Burst Fire or Overwatch with them."
  },
  {
    "code": "2-5",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Physical Contact Aversion",
    "effect": "You cannot willingly initiate a Grapple. Entering the same zone as a hostile creature causes 1 Pressure. While Grappled, you cannot benefit from Resistance or Immunity to Frightened. All melee attacks suffer from -2d6 to hit."
  },
  {
    "code": "2-6",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Electrophobia",
    "effect": "You cannot willingly deal Electric Damage. Becoming Conductive or Disrupted also causes Frightened and increases Pressure by 2. Taking electric damage of any type automatically generates a stunt on that attack. Any Immunity you possess to those two conditions is nullified."
  },
  {
    "code": "2-7",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Chemical Dread",
    "effect": "You cannot willingly enter a Chemical hazard without sealed protection, even if you possess Chemical Resistance or Immunity. After dealing Chemical Damage, you become Compelled to decontaminate yourself before performing another non-defensive Task. After taking Chemical Damage, you become Disoriented for the next turn of combat."
  },
  {
    "code": "2-8",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Light Dependence",
    "effect": "While in darkness or heavy visual obstruction, you become Disoriented. If your light source fails unexpectedly, also gain 1 Pressure. You cannot willingly extinguish your final available light source."
  },
  {
    "code": "2-9",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Pain Anticipation",
    "effect": "When targeted by a visible damaging attack, you must Dodge or Block if able. If you choose not to or cannot, gain 1 Pressure before the attack resolves."
  },
  {
    "code": "2-10",
    "category": 2,
    "categoryName": "Threat and Damage-Type Distortions",
    "name": "Threat Misclassification",
    "effect": "When encountering an unknown creature, the GM secretly selects one damage type you irrationally believe is effective. Until the creature is successfully Analyzed, suffer −2d6 when attacking it with any other damage type. Obvious evidence may contradict the belief, but does not remove the penalty."
  },
  {
    "code": "3-1",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Obsessive Equipment Checks",
    "effect": "You must spend one Fast Action or part of an Expedition Turn checking equipment after entering a dangerous site. Until you do, you are Disoriented. If you end a day without checking your equipment, your final non-Rest Task costs +2 Energy."
  },
  {
    "code": "3-2",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Ritualized Behavior",
    "effect": "Choose one daily Task other than Rest. Missing it causes 1 Stress at End of Day. Performing the ritual under immediate danger is always Skilled."
  },
  {
    "code": "3-3",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Chemical Dependency",
    "effect": "You must consume Painkillers, Psychiatric Medication, or another chosen substance at least once every three days. Missing the dose causes 1 Stress and Drained at the beginning of each day until the dependency is satisfied."
  },
  {
    "code": "3-4",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Hoarding Compulsion",
    "effect": "You cannot voluntarily transfer your final unit of any carried supply category. If forced to abandon equipment or salvage, gain 1 Pressure per item category abandoned, to a maximum of 2 per Scene."
  },
  {
    "code": "3-5",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Traumatic Violence Aversion",
    "effect": "You cannot intentionally attack a living creature. You may Block, Dodge, restrain, flee, disable machinery, attack nonliving targets, or use non-damaging conditions. If an ally becomes Downed and you have dealt no damage during the Scene, gain 1 Pressure."
  },
  {
    "code": "3-6",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Perfection Paralysis",
    "effect": "You cannot Push rolls. When beginning a Skilled Task caused by inadequate tools, materials, or facilities, choose one: spend one additional segment preparing or suffer −3d6."
  },
  {
    "code": "3-7",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Risk Denial",
    "effect": "Reduce expedition inventory slots by 2 or by half, whichever removes more. You refuse to carry equipment you consider unnecessary, even when warned. An ally may override this through a successful Entertainer or leadership-related Task."
  },
  {
    "code": "3-8",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Comfort Dependency",
    "effect": "You cannot willingly eat raw Food or use Scrap-tier personal equipment. If forced to do so, gain 1 Pressure and become Weakened until the end of the Scene.You have extreme disdain for the mere existence of Scrap-tier equipment, used by your teammates or on the ship."
  },
  {
    "code": "3-9",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Sleep Disruption",
    "effect": "Rest restores 1 less Energy. You may benefit from only one Rest per day. If you sleep outside Crew Quarters or another secure sleeping area, begin the next day Disoriented."
  },
  {
    "code": "3-10",
    "category": 3,
    "categoryName": "Compulsions and Dependencies",
    "name": "Decontamination Ritual",
    "effect": "After direct contact with an alien organism, Chemical hazard, bodily fluid, or Contaminated object, you must decontaminate at the next safe opportunity. Until then, you cannot willingly Rest, eat, transfer items, or provide physical Assistance."
  },
  {
    "code": "4-1",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Emotional Suppression",
    "effect": "You cannot perform or benefit from ordinary Reduce Pressure Tasks. Medical Stress Recovery and effects that explicitly bypass Emotional Suppression still function."
  },
  {
    "code": "4-2",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Blame Projection",
    "effect": "After a nearby ally fails a roll, halve your next dice pool. If that roll also fails, gain 1 Pressure and the effect continues to your following roll. It ends when you next succeed a Skill Roll."
  },
  {
    "code": "4-3",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Survivor’s Guilt",
    "effect": "When a nearby ally becomes Downed, you become Compelled to reach, protect, or stabilize them. You cannot willingly retreat while they remain behind unless you spend 2 Willpower."
  },
  {
    "code": "4-4",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Identity Erosion",
    "effect": "Your Background ability is disabled. Passive Attribute and Skill benefits remain. You may still use equipment, augmentations, and abilities from other sources."
  },
  {
    "code": "4-5",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Authority Fixation",
    "effect": "At the beginning of each day, designate one conscious ally as the authority figure. Directly opposing their orders causes 1 Pressure. If they become Downed, you become Confused. If they are quiet or are not properly projecting their authority, see to it that they are convinced to give orders."
  },
  {
    "code": "4-6",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Attachment Dependency",
    "effect": "Choose one bonded crewmate. While separated from them and unable to communicate, suffer −2d6 to all rolls and cannot reduce Pressure. If you figure out they become Downed, gain 2 Pressure, and you are Compelled to reach, protect, or stabilize them."
  },
  {
    "code": "4-7",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Scapegoating",
    "effect": "After a major expedition complication, privately choose one ally to blame. You cannot Assist them and suffer −3d6 on cooperative Tasks with them. You will no longer help them if they are Downed."
  },
  {
    "code": "4-8",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Martyr Complex",
    "effect": "If an adjacent ally is Exposed, Pinned, Grappled, or Downed, you cannot willingly benefit from Cover or Armor while they remain in danger. You may spend 1 Willpower to resist for the Scene."
  },
  {
    "code": "4-9",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Emotional Contagion",
    "effect": "The first time a nearby ally gains Pressure each Scene, you also gain 1 Pressure. Immunity to Frightened does not prevent this effect."
  },
  {
    "code": "4-10",
    "category": 4,
    "categoryName": "Social and Identity Disturbances",
    "name": "Reassurance Dependence",
    "effect": "After you fail a Skilled or Crisis Task, you cannot attempt another non-defensive Task alone. An ally must Assist, communicate reassurance, or spend a Fast Action grounding you. Otherwise suffer −3d6. Suffer -1d6 to all Crisis Tasks."
  },
  {
    "code": "5-1",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Compulsive Distraction",
    "effect": "Whenever you Rest, make a flat Wits roll. On failure, the Rest satisfies sleep requirements but restores no Energy."
  },
  {
    "code": "5-2",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Time Slippage",
    "effect": "During the day, one of your Tasks randomly requires two segments instead of one. During expeditions, your first Thorough Search each day requires one additional Expedition Turn."
  },
  {
    "code": "5-3",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Depersonalization",
    "effect": "The first time you take HP Damage each Scene, reduce Pressure by 1. If you end a day without taking HP Damage or suffering a condition, gain 2 Stress."
  },
  {
    "code": "5-4",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Hallucinatory Echoes",
    "effect": "The GM may privately provide false sensory information. A successful Perception Task can distinguish one hallucination from reality. A failed attempt makes the false information feel certain for the remainder of the Scene."
  },
  {
    "code": "5-5",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Dissociative Freeze",
    "effect": "Your first failed Skilled or Crisis Task each day causes Immobilized and Silenced until the end of your next turn. An adjacent ally may spend a Fast Action to end both conditions."
  },
  {
    "code": "5-6",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Fragmented Memory",
    "effect": "You cannot Train Skills. Skills above 5 are treated as 5 until this Affliction is cured. Existing Skill Levels are not permanently lost."
  },
  {
    "code": "5-7",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Reality Doubt",
    "effect": "The first hostile creature you encounter each Scene is treated as Hidden from you until it attacks, directly interacts with you, or an ally spends a Fast Action identifying it. You cannot use Overwatch against that creature beforehand."
  },
  {
    "code": "5-8",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Sensory Inversion",
    "effect": "Once per Scene, the GM may describe one obvious damage reaction incorrectly: effective damage may appear resisted, or resisted damage may appear effective. A successful Perception or Biology Task reveals the distortion."
  },
  {
    "code": "5-9",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Tunnel Vision",
    "effect": "After you attack, Mark, or Analyze a target, all other hostile creatures are treated as Hidden from you until your target leaves the Scene, becomes Downed, or you spend a Fast Action reassessing the situation."
  },
  {
    "code": "5-10",
    "category": 5,
    "categoryName": "Dissociation and Perceptual Distortion",
    "name": "Temporal Dislocation",
    "effect": "You begin the first Round of every combat Surprised. If you would already be Surprised, you also become Confused until the end of your first turn."
  },
  {
    "code": "6-1",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Psychosomatic Pain",
    "effect": "Whenever you gain Stress, become Weakened and Slowed until you complete a full Rest. This does not count as an Injury and cannot be removed through First Aid."
  },
  {
    "code": "6-2",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Emotional Volatility",
    "effect": "When you gain Stress while near at least two allies, each nearby ally gains 1 Pressure. If you are already Panicked, they instead gain 2 Pressure."
  },
  {
    "code": "6-3",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Catastrophic Dissociation",
    "effect": "Immediately roll two additional Afflictions. They count as one Affliction for treatment, but both effects apply. Reroll further results of Catastrophic Dissociation."
  },
  {
    "code": "6-4",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Condition Fragility",
    "effect": "Choose one condition Immunity you possess. You lose that Immunity while this Affliction remains. If you possess no condition Immunity, choose one condition Resistance; it becomes Normal. If you possess neither, choose Frightened, Confused, or Staggered. You become Vulnerable to that condition, and applying it requires one fewer success, to a minimum of one."
  },
  {
    "code": "6-5",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Trauma-Linked Damage Aversion",
    "effect": "Choose two of Ballistic, Physical, Fire, Electric, or Chemical. You cannot willingly deal those damage types. The first time you suffer or witness one of those damage types each Scene, gain 1 Pressure. Any condition immunity or damage resistance associated with the 2 types is nullified."
  },
  {
    "code": "6-6",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Compulsive Exposure",
    "effect": "Choose one damage type. When a visible source of that damage appears, you become Compelled to approach, inspect, disable, or destroy it. You may spend 1 Willpower to resist for the Scene."
  },
  {
    "code": "6-7",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Dissociative Aggression",
    "effect": "When you become Panicked, also become Enraged. While Enraged this way, you are Compelled to attack the nearest perceived threat. If no threat is visible, you attack or destroy the nearest obstacle preventing escape, caring not for sound."
  },
  {
    "code": "6-8",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Panic Cascade",
    "effect": "The first time you gain any condition during a Scene, also become Confused. If the triggering condition is already Confused, become Frightened instead."
  },
  {
    "code": "6-9",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "Total Shutdown",
    "effect": "When you become Overtaxed, also become Immobilized and Silenced. These conditions remain until an adjacent ally spends a Slow Action grounding you or your Pressure falls below Overtaxed."
  },
  {
    "code": "6-10",
    "category": 6,
    "categoryName": "Severe Maladaptive States",
    "name": "No Affliction Here!",
    "effect": "Scot-free!"
  }
];

export const CONDITIONS: ConditionEntry[] = [
  {
    "name": "Surprised",
    "effect": "The target cannot take a Reaction or Fast Action until the end of its relevant turn.",
    "removal": "Ends after the target’s first turn."
  },
  {
    "name": "Prone",
    "effect": "Standing requires a Fast Action. Close Combat attacks made while Prone suffer −2d6. When appropriate, the target gains Partial Cover against non-adjacent Ballistic attacks.",
    "removal": "Stand using a Fast Action."
  },
  {
    "name": "Pinned",
    "effect": "The target cannot Sprint or willingly move into a more exposed position. It may Crawl or move toward nearby Cover.",
    "removal": "Break line of sight, reach Full Cover, or spend a Slow Action regaining control."
  },
  {
    "name": "Grappled",
    "effect": "The target cannot leave its current zone and cannot use equipment requiring unrestricted movement.",
    "removal": "Win a Skilled Strength, Close Combat, or Acrobatics Task against the grappler."
  },
  {
    "name": "Restrained",
    "effect": "The target cannot move or use Reactions and suffers −2d6 to attacks and movement-related Tasks.",
    "removal": "Escape using the method specified by the source."
  },
  {
    "name": "Immobilized",
    "effect": "The target cannot change zones but may otherwise act normally.",
    "removal": "Remove or escape the source."
  },
  {
    "name": "Staggered",
    "effect": "The target loses one Fast Action during its next turn.",
    "removal": "Ends after the target’s next turn."
  },
  {
    "name": "Slowed",
    "effect": "Moving one zone requires a Slow Action. The target cannot Sprint.",
    "removal": "Ends as specified by the source."
  },
  {
    "name": "Exposed",
    "effect": "The target gains no benefit from Cover.",
    "removal": "Move to new Cover or use the Take Cover action."
  },
  {
    "name": "Marked",
    "effect": "The next attack against the target gains +2d4 if Ballistic or Physical. 1d4 otherwise.",
    "removal": "Ends after the attack is resolved or at the end of the Scene."
  },
  {
    "name": "Blinded",
    "effect": "The target cannot establish normal line of sight and suffers −5d6 to sight-dependent Tasks.",
    "removal": "Remove the source or restore vision."
  },
  {
    "name": "Deafened",
    "effect": "The target cannot hear speech, alarms, or sound-based warnings and suffers −3d6 to sound-dependent Perception Tasks.",
    "removal": "Remove the source or restore hearing."
  },
  {
    "name": "Disoriented",
    "effect": "The target cannot Aim or use Overwatch and suffers −4d6 to Perception and Navigation Tasks. The target also suffers from -1d6 to all non-constitution based rolls.",
    "removal": "Ends as specified by the source."
  },
  {
    "name": "Frightened",
    "effect": "The target cannot willingly move closer to the source and gains 1 Pressure when the condition is first applied.-2d6 to all skill rolls from the source of the fear, and -1d6 to all attack rolls from the source of the fear.",
    "removal": "The source leaves, is defeated, or the target succeeds on an appropriate Willpower effect."
  },
  {
    "name": "Weakened",
    "effect": "The target deals −1 Damage and suffers −2d6 on Tasks involving physical force.",
    "removal": "Ends as specified by the source."
  },
  {
    "name": "Drained",
    "effect": "The target immediately loses 1 current Energy. If already at 0 Energy, it gains 1 Pressure instead.",
    "removal": "Drained is resolved immediately rather than remaining active."
  },
  {
    "name": "Bleeding",
    "effect": "The target takes 1 unblockable Physical Damage each turn. Bleeding can trigger only once per Round, and Bleeding is persistent until treated. A Bleeding target that remains still and performs no Slow Actions does not take this damage. Bleeding is removed by: A successful First Aid Task. Spending an appropriate Medkit use.",
    "removal": ""
  },
  {
    "name": "Brittle",
    "effect": "The target’s structure, shell, armor, or bones have been weakened. The next Physical or Ballistic hit against the target: Deals +1 Damage. Damages one additional point of Armor if the attack already damages Armor. Brittle ends after triggering or at the end of the Scene.",
    "removal": ""
  },
  {
    "name": "Crippled",
    "effect": "One limb or major movement structure has been seriously damaged. When Crippled is applied, the source states what was affected. Examples include: Arm: −3d6 to Tasks requiring that arm. Leg: The target becomes Slowed and cannot Sprint. Wing: The target cannot fly normally.",
    "removal": ""
  },
  {
    "name": "Disarmed",
    "effect": "The target drops one held item chosen by the effect’s source. The item lands within the target’s zone. Recovering it normally requires a Fast Action. Disarmed is resolved immediately rather than remaining active.",
    "removal": ""
  },
  {
    "name": "Burning",
    "effect": "The target takes 1 Fire Damage at the start of each turn. Burning is Ongoing. It may be removed by: Spending a Fast Action to extinguish the flames. An adjacent character spending a Fast Action to help. Entering water, vacuum, fire-suppression foam, or another environment that smothers the flames. Using appropriate equipment.",
    "removal": ""
  },
  {
    "name": "Smoldering",
    "effect": "The target emits visible smoke, heat, sparks, or embers. While : The target cannot Hide. Heat-sensitive creatures and sensors automatically detect its general location. The next source of Fire Damage also applies Burning. Smoldering normally lasts until the end of the Scene or until the target spends a Fast Action cooling or cleaning itself.",
    "removal": ""
  },
  {
    "name": "Illuminated",
    "effect": "The target or zone produces enough light to be clearly visible. An Illuminated target: Cannot benefit from darkness. Cannot Hide using visual concealment alone. May trigger special weaknesses in light-sensitive creatures. Illuminated normally lasts until the light source is removed or the Scene ends.",
    "removal": ""
  },
  {
    "name": "Overheated",
    "effect": "The target’s body, armor, cybernetics, or machinery has exceeded safe temperatures. While Overheated: The target suffers −2d6 to strenuous physical Tasks. It cannot safely use abilities that would produce additional heat. Machines and mechs may suffer random additional penalties when acting. Overheated ends after the target spends a Slow Action cooling itself in an appropriate environment.",
    "removal": ""
  },
  {
    "name": "Conductive",
    "effect": "The target has become unusually vulnerable to electrical transfer. The next Electric hit against it: Deals +1 Damage. Applies Staggered without requiring a stunt. Conductive ends after triggering or at the end of the Scene. A target may become Conductive through:",
    "removal": ""
  },
  {
    "name": "Disrupted",
    "effect": "Electronic systems and powered equipment temporarily stop functioning. While Disrupted: Activated cybernetic abilities cannot be used. Equipment-based Reactions cannot be used. Targeting systems, powered tools, and electronic weapons may become unavailable. Machines may lose one Fast Action or equivalent function.",
    "removal": ""
  },
  {
    "name": "Jammed",
    "effect": "The target cannot use remote communication, wireless systems, targeting links, or electronic coordination. Jammed may affect: Radios. Drones. Remote weapons. Sensor feeds.",
    "removal": ""
  },
  {
    "name": "Corroded",
    "effect": "The target’s armor or protective surface has been chemically weakened. The next time Armor would reduce damage: That Armor provides no damage reduction. The Armor loses 1 additional point. Corroded then ends. Corroded may also affect:",
    "removal": ""
  },
  {
    "name": "Poisoned",
    "effect": "The target suffers: −2d6 to Strength-based Tasks. −2d6 to Constitution-based Tasks. During combat, the source may instead cause damage after a listed number of Rounds. Poisoned is Persistent until removed through: An antidote.",
    "removal": ""
  },
  {
    "name": "Contaminated",
    "effect": "Contamination may spread through: Physical contact. Shared atmosphere. Bodily fluids. Damaged suits. Improper storage.",
    "removal": ""
  },
  {
    "name": "Suffocating",
    "effect": "The target cannot breathe properly. At the end of each Round, the target gains 1 Pressure. After a number of Rounds determined by the environment, the target also begins taking Physical Damage. Suffocating ends when breathable air is restored.",
    "removal": ""
  },
  {
    "name": "Freezing",
    "effect": "The target suffers: −2d6 to Acrobatics and fine-motor Tasks. Slowed. Inability to recover from certain injuries or conditions. Prolonged exposure may cause Physical Damage or an Injury. Freezing ends after sufficient warmth is restored.",
    "removal": ""
  },
  {
    "name": "Anchored",
    "effect": "The target cannot be forcibly moved, knocked Prone, pulled, or displaced against its will. Exceptions apply if environmental or other conditions are overwhelming(for example, if a whole is blown into the ship where the anchored individual is attached, they won’t be able to anchor themselves in the middle of space). Anchored does not prevent voluntary movement unless the source states otherwise.",
    "removal": ""
  },
  {
    "name": "Weightless",
    "effect": "The target is in zero gravity or otherwise lacks stable footing. While Weightless: Ordinary movement may require Acrobatics or a handhold. Forced movement continues until something stops it. Prone normally has no effect. Recoil and impacts may move the target.",
    "removal": ""
  },
  {
    "name": "Enraged",
    "effect": "The target gains +2d6 to Physical attacks. While Enraged, it: Cannot use defensive Reactions. Cannot willingly retreat. Must move toward or attack an obvious threat when able. Enraged normally lasts until the end of the Scene or until the source is removed.",
    "removal": ""
  },
  {
    "name": "Compelled",
    "effect": "The target is driven toward a specific action stated by the source. They will prioritize over anything else, including their own safety. Examples include: Protect a creature. Approach a sound. Attack the nearest target. Flee from light.",
    "removal": ""
  },
  {
    "name": "Silenced",
    "effect": "The target cannot speak, shout, or use voice-activated equipment. While Silenced, the target cannot: Provide verbal Assistance. Issue spoken commands. Warn distant allies through speech. Use abilities requiring a voice.",
    "removal": ""
  },
  {
    "name": "Confused",
    "effect": "At the beginning of the target’s turn, it must choose one: Lose one Fast Action while regaining focus. Suffer −3d6 to all Tasks during the turn. Confused normally lasts until the end of the target’s next turn.",
    "removal": ""
  },
  {
    "name": "Regenerating",
    "effect": "The target recovers a set amount of HP at the end of each turn. The source states what suppresses regeneration. Common suppressors include: Fire Damage. Chemical Damage. A specific atmosphere.",
    "removal": ""
  },
  {
    "name": "Hidden",
    "effect": "The target cannot be directly targeted by creatures that have not detected it. Hidden ends when the target: Makes an obvious attack. Enters clear sight. Produces detectable noise. Is revealed by Perception or equipment.",
    "removal": ""
  },
  {
    "name": "Fortified",
    "effect": "The target gains 1 temporary Armor against the next damaging hit. This Armor: Is lost after reducing damage once. Does not require repair. Does not stack with itself unless stated otherwise.",
    "removal": ""
  },
  {
    "name": "Accelerated",
    "effect": "The target gains one additional Fast Action during its next turn. A target cannot normally benefit from Accelerated more than once per Round.",
    "removal": ""
  }
];
