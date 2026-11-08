import { SHIPBOARD_TASKS, type TaskEffect } from "@/data/tasks";
import { actionsNow, extraTaskBlocker, newAction, permissionReasons, restPushConflict, taskAllowance, taskFor, taskTerms } from "../actions";
import { COOK_RECIPES, craftBlocker, FABRICATE_RECIPES, MEDICINE_RECIPES, SALVAGE_RECIPES } from "../crafting";
import type { Character, GameState, SegmentAction } from "../types";

/** One thing this survivor could actually do right now, already filled in enough to submit. */
export type SimOption = {
  /** What the model picks by number. */
  n: number;
  action: SegmentAction;
  task: string;
  /** Which project, recipe, or crewmate this choice means. Empty when the task takes no subject. */
  subject: string;
  /** Energy and the roll, in the words a player reads in the app. */
  terms: string;
  result: string;
  strong: string | null;
  /** Succeeds without a roll, so the sim takes the Routine step instead of rolling. */
  routine: boolean;
};

export const optionLabel = (o: SimOption) => `${o.task}${o.subject ? `: ${o.subject}` : ""} — ${o.terms}`;

export type SimMenu = {
  options: SimOption[];
  /** Tasks left off the menu, and why. Worth showing the GM: it's where the sim can't follow a real player. */
  skipped: string[];
};

/** Whether this survivor is off the ship, which changes the whole table of what they could do. */
export const away = (g: GameState, c: Character) => !!g.expedition?.crew.includes(c.id);

/** Needs a map target or a skill to train, which this prototype has no way to choose. */
const UNSUPPORTED: Partial<Record<NonNullable<TaskEffect>, string>> = {
  course: "needs a course plotted on the star chart",
  scan: "needs a tile picked on the star chart",
  train: "needs a skill chosen to practise",
};

const recipesFor = (effect: TaskEffect) =>
  effect === "craft" ? FABRICATE_RECIPES : effect === "cook" ? COOK_RECIPES : effect === "medicine" ? MEDICINE_RECIPES : effect === "salvage" ? SALVAGE_RECIPES : [];

/**
 * Every legal way to fill in one task, as separate choices. Enumerating the variants rather than
 * letting the model name a project or a recipe is what keeps it from picking something that isn't there.
 */
function variants(g: GameState, c: Character, task: string): SegmentAction[] {
  const make = (patch: Partial<SegmentAction> = {}): SegmentAction => ({ ...newAction(g, c, task), ...patch });
  switch (taskFor({ task }).effect) {
    case "project":
      return g.ship.projects.filter((p) => !p.done).map((p) => make({ projectId: p.id }));
    case "assist":
      return actionsNow(g)
        .filter((a) => a.characterId !== c.id && a.status === "planned" && taskFor(a).effect !== "assist")
        .map((a) => make({ assists: a.id }));
    case "calm":
    case "bleed":
      // Only someone they can reach: a medkit doesn't help a crewmate two zones and a hull away.
      return g.characters.filter((x) => x.id !== c.id && !x.dead && away(g, x) === away(g, c)).map((x) => make({ subjectId: x.id }));
    case "craft":
    case "cook":
    case "medicine":
    case "salvage":
      return recipesFor(taskFor({ task }).effect)
        .filter((r) => !craftBlocker(g, r))
        .map((r) => make({ crafts: [r.name] }));
    default:
      return [make()];
  }
}

/** Which project, recipe, or crewmate this choice means. */
function subject(g: GameState, a: SegmentAction): string {
  const project = a.projectId ? g.ship.projects.find((p) => p.id === a.projectId) : null;
  if (project) return `${project.name} (${project.progress}/${project.required} Progress)`;
  if (a.crafts?.length) return a.crafts.join(", ");
  const treated = a.subjectId ? g.characters.find((x) => x.id === a.subjectId)?.name : null;
  if (treated) return treated;
  const helping = a.assists ? g.actions.find((x) => x.id === a.assists) : null;
  if (helping) return `${g.characters.find((x) => x.id === helping.characterId)?.name ?? "someone"} on ${helping.task}`;
  return "";
}

/**
 * What's even on the table. Off the ship it's the Common Expedition Tasks and the handful of things
 * that work anywhere; aboard it's everything but those. Listing the rest only to refuse it would
 * bury the one report worth reading — the tasks that were nearly available.
 */
const onTheTable = (g: GameState, c: Character) =>
  away(g, c)
    ? SHIPBOARD_TASKS.filter((t) => (t.group === "Expedition" ? t.name !== "Embark Expedition" : t.anywhere))
    : SHIPBOARD_TASKS.filter((t) => t.group !== "Expedition" || t.name === "Embark Expedition");

export function legalOptions(g: GameState, c: Character): SimMenu {
  const options: SimOption[] = [];
  const skipped: string[] = [];
  for (const def of onTheTable(g, c)) {
    if (def.free) continue;
    const unsupported = def.effect ? UNSUPPORTED[def.effect] : undefined;
    if (unsupported) {
      skipped.push(`${def.name}: ${unsupported}`);
      continue;
    }
    const legal = variants(g, c, def.name);
    if (!legal.length) {
      skipped.push(`${def.name}: nothing available to pick`);
      continue;
    }
    let blocked: string | null = null;
    let offered = false;
    for (const action of legal) {
      const terms = taskTerms(g, action);
      const reasons = [
        ...(terms.blocker ? [terms.blocker] : []),
        ...permissionReasons(g, action),
        ...(restPushConflict(g, action) ? ["conflicts with another task this segment"] : []),
      ];
      if (reasons.length) {
        blocked ??= `${def.name}: ${reasons.join("; ")}`;
        continue;
      }
      offered = true;
      options.push({
        n: options.length + 1,
        action,
        task: def.name,
        subject: subject(g, action),
        terms: `${terms.energy === 0 ? "free" : `${terms.energy} Energy`}, ${terms.routine ? "Routine, so it succeeds without a roll" : `${terms.poolLabel} against threshold ${terms.threshold}, rolling ${terms.dice}d6`}`,
        result: def.result,
        strong: def.noStrong ? null : (def.strong ?? null),
        routine: terms.routine,
      });
    }
    if (blocked && !offered) skipped.push(blocked);
  }
  // Only worth saying aboard the ship, where a second task has to be Pushed for.
  const extra = taskAllowance(g, c.id) ? extraTaskBlocker(g, c) : null;
  if (extra) skipped.push(`A second task this segment: ${extra}`);
  return { options, skipped };
}

/**
 * The menu as the model reads it. Choices that differ only in their subject — a recipe, a project,
 * a patient — share one heading, so a dozen recipes don't repeat the same paragraph a dozen times.
 */
export function menuText(menu: SimMenu): string {
  const groups: { head: SimOption; picks: SimOption[] }[] = [];
  for (const o of menu.options) {
    const last = groups.at(-1);
    if (last && last.head.task === o.task && last.head.terms === o.terms) last.picks.push(o);
    else groups.push({ head: o, picks: [o] });
  }
  return groups
    .map(({ head, picks }) => {
      const title = head.subject ? `${head.task} — ${head.terms}\n   Choose: ${picks.map((p) => `${p.n}. ${p.subject}`).join(" · ")}` : `${head.n}. ${head.task} — ${head.terms}`;
      return `${title}\n   Success: ${head.result}${head.strong ? `\n   Strong Result: ${head.strong}` : ""}`;
    })
    .join("\n\n");
}
