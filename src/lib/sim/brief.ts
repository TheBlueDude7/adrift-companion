import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A simulated player reads the world, not the rules: the menu it chooses from already carries every
 * threshold, cost, and die. So the brief is the narrative chapters only — the setting and the
 * colonies people come from. That keeps four models' worth of prompts affordable, and it leaves out
 * the GM's chapters, so a simulated survivor can't read about what's waiting for it in the dark.
 */
const SECTIONS: { from: string; to?: string }[] = [
  { from: "## Chapter 0:", to: "## Chapter 1:" },
  { from: "## Human Space" },
];

let cached: string | null = null;

export async function playerBrief(): Promise<string> {
  if (cached) return cached;
  const text = await readFile(path.join(process.cwd(), "content", "rules", "adrift-rulebook.md"), "utf8");
  const lines = text.split("\n");
  const at = (heading: string) => lines.findIndex((l) => l.startsWith(heading));
  const parts: string[] = [];
  for (const s of SECTIONS) {
    const start = at(s.from);
    if (start < 0) continue;
    const end = s.to ? at(s.to) : lines.length;
    parts.push(lines.slice(start, end > start ? end : lines.length).join("\n").trim());
  }
  if (!parts.length) throw new Error("The rulebook has no narrative chapters to brief a player with.");
  cached = parts.join("\n\n---\n\n");
  return cached;
}
