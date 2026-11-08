import type { SkillKey } from "@/lib/rules";

/**
 * What one Train Skill segment consumes, by the level being trained toward: 1–3, 4–7, and 8–10.
 *
 * Only raw materials and basic supplies appear here, never finished equipment. Reaching level 10
 * takes 6 units in the low band, 22 in the middle, and 27 at the top, so a crafted item in any
 * column would quietly price mastery at dozens of Medkits or Power Cells.
 */
export const TRAINING: Record<SkillKey, [low: string, medium: string, high: string]> = {
  closeCombat: ["Scrap Metal", "Reinforced Steel", "Neutronium"],
  // Practice rounds and parts, then the military alloys once the shooting gets serious.
  lightFirearms: ["Scrap Components", "Aluminum Alloy", "Durasteel Alloy"],
  heavyWeaponry: ["Chemical Mixture", "Destructive Chemical Mixture", "Adamantite Alloy"],
  // Rations to train on, then the rigging and weighted gear that a harder routine needs.
  acrobatics: ["Food Unit", "Reinforced Steel", "Neutronium"],
  firstAid: ["Medical Supply", "Chemical Mixture", "Destructive Chemical Mixture"],
  surgery: ["Medical Supply", "Reinforced Steel", "Neutronium"],
  botany: ["Water Unit", "Chemical Mixture", "Scrapped Biomass"],
  biology: ["Raw Food", "Scrapped Biomass", "Destructive Chemical Mixture"],
  // Fuel burned on practice runs rather than the Power Cells that move the ship.
  piloting: ["Fuel Unit", "Components", "Quantum Components"],
  navigation: ["Scrap Components", "Components", "Quantum Components"],
  mechTech: ["Basic Adhesive", "Advanced Adhesive", "Neutronium"],
  engineering: ["Scrap Components", "Components", "Quantum Components"],
  perception: ["Water Unit", "Food Unit", "Quantum Components"],
  stealth: ["Basic Adhesive", "Advanced Adhesive", "Quantum Components"],
  scavenging: ["Scrap Metal", "Reinforced Steel", "Neutronium"],
  cooking: ["Raw Food", "Chemical Mixture", "Destructive Chemical Mixture"],
  entertainer: ["Water Unit", "Raw Food", "Destructive Chemical Mixture"],
};

export const TRAINING_BANDS = ["Levels 1–3", "Levels 4–7", "Levels 8–10"] as const;

/** Resource band for training toward `nextLevel`. */
export const trainingBand = (nextLevel: number) => (nextLevel <= 3 ? 0 : nextLevel <= 7 ? 1 : 2);
