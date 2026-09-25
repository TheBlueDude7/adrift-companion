import type { SkillKey } from "@/lib/rules";

/** What one Train Skill segment consumes, by the level being trained toward: 1–3, 4–7, and 8–10. */
export const TRAINING: Record<SkillKey, [low: string, medium: string, high: string]> = {
  closeCombat: ["Scrap Metal", "Reinforced Steel", "Neutronium"],
  lightFirearms: ["Aluminum Alloy", "Durasteel Alloy", "Adamantite Alloy"],
  heavyWeaponry: ["Chemical Mixture", "Destructive Chemical Mixture", "Adamantite Alloy"],
  acrobatics: ["Food Unit", "Delicious Meal", "Delectable Meal"],
  firstAid: ["Improvised Medkit", "Medkit", "Glitterworld Medkit"],
  surgery: ["Improvised Surgical Tools", "Surgical Tools", "Enhanced Surgical Tools"],
  botany: ["Water Unit", "Chemical Mixture", "Scrapped Biomass"],
  biology: ["Raw Food", "Scrapped Biomass", "Destructive Chemical Mixture"],
  piloting: ["Flickering Power Cell", "Power Cell", "Advanced Power Cell"],
  navigation: ["Scrap Components", "Components", "Quantum Components"],
  mechTech: ["Basic Adhesive", "Advanced Adhesive", "Neutronium"],
  engineering: ["Scrap Components", "Components", "Quantum Components"],
  perception: ["Water Unit", "Food Unit", "Delicious Meal"],
  stealth: ["Basic Adhesive", "Advanced Adhesive", "Quantum Components"],
  scavenging: ["Scrap Metal", "Reinforced Steel", "Neutronium"],
  cooking: ["Raw Food", "Delicious Meal", "Delectable Meal"],
  entertainer: ["Water Unit", "Delicious Meal", "Special Brew"],
};

export const TRAINING_BANDS = ["Levels 1–3", "Levels 4–7", "Levels 8–10"] as const;

/** Resource band for training toward `nextLevel`. */
export const trainingBand = (nextLevel: number) => (nextLevel <= 3 ? 0 : nextLevel <= 7 ? 1 : 2);
