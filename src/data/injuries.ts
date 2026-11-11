import { severityFromRoll, type Attribute, type InjurySeverity, type SkillKey } from "@/lib/rules";

export const INJURY_LOCATIONS = ["Head", "Senses", "Arms", "Legs", "Torso", "Internal"] as const;
export type InjuryLocation = (typeof INJURY_LOCATIONS)[number];

/**
 * One entry per 2d6 roll: the first die is Severity (1–3 Minor, 4–5 Major, 6 Deadly), the second is Location.
 * `skills` and `attrs` are the rolls the dice penalty applies to: −1d6 for Minor, −2d6 for Major and Deadly.
 * `conditions` last until Surgery. `bleed` is Bleeding damage per round. A `deadline` injury needs Surgery
 * within four segments — the one it happened in and the three after — or the
 * character dies. A `permanent` loss never heals naturally.
 */
export type InjuryDef = {
  code: string;
  severity: InjurySeverity;
  location: InjuryLocation;
  name: string;
  effect: string;
  skills?: SkillKey[];
  attrs?: Attribute[];
  conditions?: string[];
  bleed?: number;
  deadline?: boolean;
  permanent?: boolean;
  /** Max HP the injury costs once it's been operated on, for as long as it stays on the sheet. */
  maxHp?: number;
};

type Row = Omit<InjuryDef, "code" | "severity" | "location">;

const LOCATION_ROWS: Record<InjuryLocation, [Row, Row, Row, Row, Row, Row]> = {
  Head: [
    { name: "Mild Concussion", effect: "−1d6 to Intelligence rolls.", attrs: ["INT"] },
    { name: "Scalp Wound", effect: "−1d6 to Wits rolls.", attrs: ["WIT"] },
    { name: "Whiplash", effect: "−1d6 to Piloting.", skills: ["piloting"] },
    { name: "Severe Concussion", effect: "−2d6 to Intelligence and Wits rolls. Disoriented until Surgery.", attrs: ["INT", "WIT"], conditions: ["Disoriented"] },
    { name: "Fractured Jaw", effect: "−2d6 to Entertainer. Silenced until Surgery.", skills: ["entertainer"], conditions: ["Silenced"] },
    { name: "Brain Swelling", effect: "−2d6 to Intelligence and Wits rolls. Confused and Silenced. Surgery within four segments or die.", attrs: ["INT", "WIT"], conditions: ["Confused", "Silenced"], deadline: true },
  ],
  Senses: [
    { name: "Ringing Ears", effect: "−1d6 to Perception.", skills: ["perception"] },
    { name: "Scratched Eye", effect: "−1d6 to Light Firearms and Heavy Weaponry.", skills: ["lightFirearms", "heavyWeaponry"] },
    { name: "Broken Nose", effect: "−1d6 to Scavenging and Biology.", skills: ["scavenging", "biology"] },
    { name: "Severe Eye Injury", effect: "−2d6 to Perception, Light Firearms and Heavy Weaponry. One eye is unusable; if the other is covered, you're Blinded.", skills: ["perception", "lightFirearms", "heavyWeaponry"] },
    { name: "Ruptured Eardrum", effect: "−2d6 to Perception and Acrobatics. Deafened until Surgery.", skills: ["perception", "acrobatics"], conditions: ["Deafened"] },
    { name: "Sensory Loss", effect: "−2d6 to Perception. Sight or hearing is lost (from the source, or the GM's choice): Blinded or Deafened permanently, until replaced by a cybernetic or graft.", skills: ["perception"], permanent: true },
  ],
  Arms: [
    { name: "Sprained Fingers", effect: "−1d6 to Mechanical Technician, Engineering and Surgery.", skills: ["mechTech", "engineering", "surgery"] },
    { name: "Bruised Shoulder", effect: "−1d6 to Close Combat and Scavenging.", skills: ["closeCombat", "scavenging"] },
    { name: "Burned Hands", effect: "−1d6 to First Aid and Cooking.", skills: ["firstAid", "cooking"] },
    { name: "Broken Arm", effect: "−2d6 to Strength rolls. That arm is unusable: no two-handed weapons or tools.", attrs: ["STR"] },
    { name: "Dislocated Shoulder", effect: "−2d6 to Strength rolls. The arm is unusable until a First Aid task resets it.", attrs: ["STR"] },
    { name: "Traumatic Amputation", effect: "−2d6 to Strength rolls. The arm is lost, and Bleeding deals 2. Permanent until replaced by a cybernetic or graft.", attrs: ["STR"], bleed: 2, permanent: true },
  ],
  Legs: [
    { name: "Sprained Ankle", effect: "−1d6 to Acrobatics.", skills: ["acrobatics"] },
    { name: "Pulled Hamstring", effect: "−1d6 to Close Combat.", skills: ["closeCombat"] },
    { name: "Gashed Calf", effect: "−1d6 to Stealth.", skills: ["stealth"] },
    { name: "Broken Leg", effect: "−2d6 to Acrobatics, Close Combat and Stealth. Slowed until Surgery.", skills: ["acrobatics", "closeCombat", "stealth"], conditions: ["Slowed"] },
    { name: "Fractured Pelvis", effect: "−2d6 to Acrobatics, Close Combat and Stealth. Immobilized without a brace or someone's help; Slowed with it.", skills: ["acrobatics", "closeCombat", "stealth"] },
    { name: "Crushed Leg", effect: "−2d6 to Acrobatics, Close Combat and Stealth. The leg is lost: Immobilized without support, and Bleeding deals 2. Permanent until replaced by a cybernetic or graft.", skills: ["acrobatics", "closeCombat", "stealth"], bleed: 2, permanent: true },
  ],
  Torso: [
    { name: "Bruised Ribs", effect: "−1d6 to Light Firearms and Heavy Weaponry.", skills: ["lightFirearms", "heavyWeaponry"] },
    { name: "Muscle Tear", effect: "−1d6 to Strength rolls.", attrs: ["STR"] },
    { name: "Back Spasm", effect: "−1d6 to Engineering and Botany.", skills: ["engineering", "botany"] },
    { name: "Broken Ribs", effect: "−2d6 to Strength and Constitution rolls. Weakened until Surgery.", attrs: ["STR", "CON"], conditions: ["Weakened"] },
    { name: "Punctured Lung", effect: "−2d6 to Constitution rolls. Suffocating after Sprinting or a second strenuous Slow Action in a Scene.", attrs: ["CON"] },
    { name: "Crushed Torso", effect: "−2d6 to Strength and Constitution rolls. Immobilized and Weakened. Surgery within four segments or die.", attrs: ["STR", "CON"], conditions: ["Immobilized", "Weakened"], deadline: true },
  ],
  Internal: [
    { name: "Minor Shock", effect: "−1d6 to Navigation and Entertainer.", skills: ["navigation", "entertainer"] },
    { name: "Bruised Organs", effect: "−1d6 to Constitution rolls.", attrs: ["CON"] },
    { name: "Mild Infection", effect: "−1d6 to Constitution rolls made to resist Poisoned or Contaminated." },
    { name: "Internal Bleeding", effect: "−2d6 to Constitution rolls. Bleeding again after every combat Scene until Surgery.", attrs: ["CON"] },
    { name: "Systemic Infection", effect: "−2d6 to Constitution rolls. Poisoned until Surgery.", attrs: ["CON"], conditions: ["Poisoned"] },
    { name: "Organ Failure", effect: "−2d6 to Constitution rolls. Poisoned and Drained. Surgery within four segments or die, and −2 Max HP afterward.", attrs: ["CON"], conditions: ["Poisoned", "Drained"], deadline: true, maxHp: -2 },
  ],
};

export const INJURY_TABLE: InjuryDef[] = INJURY_LOCATIONS.flatMap((location, li) =>
  LOCATION_ROWS[location].map((row, si) => ({ ...row, code: `${si + 1}-${li + 1}`, severity: severityFromRoll(si + 1), location })),
);

export const INJURY_BY_CODE = Object.fromEntries(INJURY_TABLE.map((e) => [e.code, e])) as Record<string, InjuryDef>;

/** Dice the injury takes off the rolls it affects. A Major or Deadly injury that's had Surgery counts as Minor. */
export const INJURY_PENALTY: Record<InjurySeverity, number> = { Minor: 1, Major: 2, Deadly: 2 };
