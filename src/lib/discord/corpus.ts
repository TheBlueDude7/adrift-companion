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

/** One routable piece of the corpus. `topics` is what makes the index worth routing on. */
export type Section = { title: string; topics: string[]; text: string };

/**
 * Sent with every question regardless of what was asked. Almost no answer stands up without how a
 * roll resolves, and leaving it to the router would mean occasionally answering without it.
 */
const CORE = ["Skilled Tasks", "Strong Successes", "Chapter 2: Counting the Hours", "Skills and their attributes", "Task margins (levels above the Routine threshold)"];

/** A ceiling on an over-eager route. Generous: this is a guard rail, not the usual size. */
const BUDGET = 120_000;

const JOIN = "\n\n---\n\n";

function appData(): Record<string, unknown> {
  return {
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
}

/** Split a document at its `##` headings, keeping the `###` headings inside each as its topics. */
function split(md: string): { preamble: string; sections: Section[] } {
  const parts = md.split(/^## /m);
  const sections = parts.slice(1).map((part) => {
    const nl = part.indexOf("\n");
    const title = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = nl === -1 ? "" : part.slice(nl + 1);
    return { title, topics: [...body.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()), text: `## ${title}\n${body}`.trimEnd() };
  });
  return { preamble: parts[0].trim(), sections };
}

let built: Promise<{ preamble: string; sections: Section[] }> | null = null;

async function corpus() {
  return (built ??= (async () => {
    const dir = path.join(process.cwd(), "content", "rules");
    const [rulebook, mechs, guide] = await Promise.all(DOCS.map((f) => readFile(path.join(dir, f), "utf8")));
    const book = split(rulebook);
    const sections: Section[] = [
      ...book.sections,
      // The mechs document is flattened prose with no headings to split on, so it travels whole. Its
      // topics are written out by hand because without them the index can't route a mech question.
      { title: "Mechs", topics: ["mech storage and capacity", "chassis", "modules and loadouts", "piloting", "mech damage and repair", "fuel and power"], text: mechs },
      { title: "Using the companion app", topics: split(guide).sections.map((s) => s.title), text: guide },
      ...Object.entries(appData()).map(([title, value]) => ({ title, topics: [], text: `## ${title}\n${JSON.stringify(value)}` })),
    ];
    // Loud now rather than quietly answering without the basics if a heading is ever renamed.
    for (const t of CORE) {
      if (!sections.some((s) => s.title === t)) throw new Error(`"${t}" is in CORE but not in the corpus. Rename it in CORE or restore the heading.`);
    }
    return { preamble: book.preamble, sections };
  })());
}

/** Every source title with its topics, minus the core, which is sent whether it's asked for or not. */
export async function sectionIndex(): Promise<string> {
  const { sections } = await corpus();
  return sections
    .filter((s) => !CORE.includes(s.title))
    .map((s) => `- ${s.title}${s.topics.length ? ` — ${s.topics.join("; ")}` : ""}`)
    .join("\n");
}

/** The core plus whatever was named, in document order. Unknown titles are ignored. */
export async function selectedSources(titles: string[]): Promise<string> {
  const { preamble, sections } = await corpus();
  const want = new Set(titles.map((t) => t.trim().toLowerCase()));
  const out = [preamble];
  let used = preamble.length;
  for (const s of sections) {
    if (!CORE.includes(s.title) && !want.has(s.title.toLowerCase())) continue;
    if (used + s.text.length > BUDGET) continue;
    out.push(s.text);
    used += s.text.length;
  }
  return out.join(JOIN);
}

/** Everything, which is what a failed route falls back to. */
export async function rulesCorpus(): Promise<string> {
  const { preamble, sections } = await corpus();
  return [preamble, ...sections.map((s) => s.text)].join(JOIN);
}
