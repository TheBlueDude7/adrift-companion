import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { IMPLANT_RECIPES, CYBERNETICS } from "@/data/cybernetics";
import { MATERIALS, RECIPES, REFINING } from "@/data/crafting";
import { CHASSIS, MECH_MODULES, MECH_TIERS, MODULE_RECIPES } from "@/data/mechs";
import { FACILITIES, UPGRADE_LADDERS } from "@/data/ship-upgrades";
import { EXPERT_MARGIN, PRACTICED_MARGIN, PROJECT_MARGIN, SHIPBOARD_TASKS } from "@/data/tasks";
import { TRAINING } from "@/data/training";
import { BACKGROUNDS, PRESSURE_STATES, PROJECT_TEMPLATES, SKILLS, STRESS_BANDS } from "@/lib/rules";

/** Player-safe sources only. Nothing here may describe specific enemies, encounters, or plot. */
const DOCS = ["adrift-rulebook.md", "adrift-mechs.md", "app-guide.md"];

let cached: string | null = null;

export async function rulesCorpus(): Promise<string> {
  if (cached) return cached;
  const dir = path.join(process.cwd(), "content", "rules");
  const docs = await Promise.all(DOCS.map((f) => readFile(path.join(dir, f), "utf8")));
  const data: Record<string, unknown> = {
    "Skills and their attributes": SKILLS,
    "Task margins (levels above the Routine threshold)": { practiced: PRACTICED_MARGIN, expert: EXPERT_MARGIN, projectEfficiency: PROJECT_MARGIN },
    "Shipboard tasks": SHIPBOARD_TASKS,
    "Project templates": PROJECT_TEMPLATES,
    Backgrounds: BACKGROUNDS,
    "Pressure states": PRESSURE_STATES,
    "Stress bands": STRESS_BANDS,
    "Skill training materials (levels 1–3, 4–7, 8–10)": TRAINING,
    "Crafting recipes": RECIPES,
    Refining: REFINING,
    Materials: MATERIALS,
    Cybernetics: CYBERNETICS,
    "Implant recipes": IMPLANT_RECIPES,
    "Mech chassis": CHASSIS,
    "Mech tiers": MECH_TIERS,
    "Mech modules": MECH_MODULES,
    "Mech module recipes": MODULE_RECIPES,
    "Ship upgrade ladders": UPGRADE_LADDERS,
    Facilities: FACILITIES,
  };
  const appData = Object.entries(data).map(([title, value]) => `## ${title}\n${JSON.stringify(value)}`).join("\n\n");
  cached = [...docs, `# Companion app data\nHow the companion app implements the rules, as JSON.\n\n${appData}`].join("\n\n---\n\n");
  return cached;
}
