import type { CraftRecipe } from "@/data/crafting";
import { SHIPBOARD_TASKS, type TaskEffect } from "@/data/tasks";
import { actionsNow, extraTaskBlocker, fitOptions, newAction, openProjects, normalFabricateLimit, permissionReasons, restPushConflict, taskAllowance, taskFor, taskTerms, type TaskTerms } from "../actions";
import { COOK_RECIPES, craftBlocker, FABRICATE_RECIPES, MECH_MODULE_RECIPES, MEDICINE_RECIPES, SALVAGE_RECIPES } from "../crafting";
import { uid } from "../dice";
import { ATTRIBUTE_NAMES, PROJECT_TEMPLATES, SKILL_BY_KEY } from "../rules";
import { operable } from "../surgery";
import type { Character, GameState, ProjectRequest, SegmentAction } from "../types";

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
  effect === "craft" ? FABRICATE_RECIPES
  : effect === "cook" ? COOK_RECIPES
  : effect === "medicine" ? MEDICINE_RECIPES
  : effect === "salvage" ? SALVAGE_RECIPES
  : effect === "mechmod" ? MECH_MODULE_RECIPES
  : [];

/**
 * Which skill makes a task Routine, and at what threshold.
 *
 * Saying only "Routine" reads as a contradiction whenever the task's own description names a
 * different skill: a recipe that takes Mechanical Technician 3 *or* First Aid 3 is Routine for a
 * medic with no mechanical training at all, and without this that looks like a bug worth reporting.
 * Several tasks let the best of two trades stand in, so the one that actually qualified is the
 * thing worth printing.
 */
function qualifies(terms: TaskTerms): string {
  const name = terms.skill ? SKILL_BY_KEY[terms.skill].name : terms.attr ? ATTRIBUTE_NAMES[terms.attr] : null;
  if (!name) return "nothing to roll";
  const level = terms.margin === null ? null : terms.threshold + terms.margin;
  return `your ${name}${level === null ? "" : ` ${level}`} meets its threshold of ${terms.threshold}`;
}

/**
 * Every legal way to fill in one task, as separate choices. Enumerating the variants rather than
 * letting the model name a project or a recipe is what keeps it from picking something that isn't there.
 */
function variants(g: GameState, c: Character, task: string): SegmentAction[] {
  const make = (patch: Partial<SegmentAction> = {}): SegmentAction => ({ ...newAction(g, c, task), ...patch });
  switch (taskFor({ task }).effect) {
    case "project":
      return openProjects(g).map((p) => make({ projectId: p.id }));
    case "assist":
      return actionsNow(g)
        .filter((a) => a.characterId !== c.id && a.status === "planned" && taskFor(a).effect !== "assist")
        .map((a) => make({ assists: a.id }));
    case "calm":
    case "prep":
      // Only someone they can reach: a medkit doesn't help a crewmate two zones and a hull away.
      return g.characters.filter((x) => x.id !== c.id && !x.dead && away(g, x) === away(g, c)).map((x) => make({ subjectId: x.id }));
    case "surgery":
      return g.characters
        .filter((x) => x.id !== c.id && !x.dead && away(g, x) === away(g, c))
        .flatMap((x) => operable(x).map((i) => make({ subjectId: x.id, injuryId: i.id })));
    case "craft": {
      // One Fabricate task makes two items for the one Energy — three for an Expert — and offering
      // only a single recipe at a time quietly threw that away, so a crew that needed two power
      // cells spent two segments on them. Each recipe is offered singly and by the batch; the hold
      // decides which of those survive, since an unaffordable batch is blocked like anything else.
      const batches = (r: CraftRecipe) => Array.from({ length: normalFabricateLimit(c, [r.name]) }, (_, i) => make({ crafts: Array(i + 1).fill(r.name) }));
      return recipesFor("craft")
        .filter((r) => !craftBlocker(g, r))
        .flatMap(batches);
    }
    case "fit":
      return fitOptions(g).map((f) => make({ fit: { name: f.name, roomId: f.roomId } }));
    case "cook":
    case "medicine":
    case "salvage":
    case "mechmod":
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
  if (a.crafts?.length) {
    const counts = new Map<string, number>();
    for (const n of a.crafts) counts.set(n, (counts.get(n) ?? 0) + 1);
    return [...counts].map(([n, qty]) => (qty > 1 ? `${qty}× ${n}` : n)).join(", ");
  }
  if (a.fit) return `${a.fit.name} in ${g.ship.rooms.find((r) => r.id === a.fit!.roomId)?.name ?? "a room"}`;
  const treated = a.subjectId ? g.characters.find((x) => x.id === a.subjectId) : null;
  const injury = a.injuryId ? treated?.injuries.find((i) => i.id === a.injuryId) : null;
  if (treated) return injury ? `${treated.name}'s ${injury.name}` : treated.name;
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
        terms: `${terms.energy === 0 ? "free" : `${terms.energy} Energy`}, ${terms.routine ? `Routine (${qualifies(terms)}), so it succeeds without a roll` : `${terms.poolLabel} against threshold ${terms.threshold}, rolling ${terms.dice}d6`}`,
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

/** Whether this choice is a trip to the workbench, which is the one task that makes more than one thing. */
const isCraft = (o: SimOption) => taskFor(o.action).effect === "craft";

/**
 * One Fabricate task, with the other items the crafter wants off the same bench.
 *
 * The allowance is two items for the one Energy, or three for an Expert, and they needn't be the
 * same thing. Enumerating every pair would mean hundreds of menu lines, so the menu lists each
 * recipe once (and by the batch) and a crafter who wants a medkit *and* a toolkit names the second
 * choice here instead. Each addition is checked the way a submitted task would be — the hold has to
 * cover both, and the allowance has to stretch — so anything that wouldn't be accepted is dropped
 * with a reason rather than sent and refused.
 */
export function combineCrafts(g: GameState, c: Character, menu: SimMenu, chosen: SimOption, extras: number[]): { action: SegmentAction; added: string[]; refused: string[] } {
  const wanted = [...new Set(extras)].filter((n) => n !== chosen.n);
  if (!wanted.length) return { action: chosen.action, added: [], refused: [] };
  if (!isCraft(chosen)) return { action: chosen.action, added: [], refused: [`only a Fabricate task makes more than one thing, and they chose ${chosen.task}`] };

  let action = chosen.action;
  const added: string[] = [];
  const refused: string[] = [];
  for (const n of wanted) {
    const extra = menu.options.find((o) => o.n === n);
    if (!extra || !isCraft(extra)) {
      refused.push(`${n} isn't another Fabricate choice`);
      continue;
    }
    const crafts = [...(action.crafts ?? []), ...(extra.action.crafts ?? [])];
    if (crafts.length > normalFabricateLimit(c, crafts)) {
      refused.push(`${extra.subject} is past what one task makes`);
      continue;
    }
    const merged = { ...action, crafts };
    const problems = permissionReasons(g, merged);
    if (problems.length) {
      refused.push(`${extra.subject}: ${problems.join("; ")}`);
      continue;
    }
    action = merged;
    added.push(extra.subject);
  }
  return { action, added, refused };
}

/**
 * A survivor's ask for a project, if they named one the app recognises.
 *
 * The template name is matched rather than trusted, because the server checks the same thing and a
 * request it would refuse should never be sent. Asking twice for what's already pending is dropped
 * too: the point of an ask is to tell the GM something they don't know.
 */
export function projectAsk(g: GameState, c: Character, propose: string | undefined, why: string | undefined): ProjectRequest | null {
  const wanted = propose?.trim();
  if (!wanted) return null;
  const template = PROJECT_TEMPLATES.find((t) => t.name.toLowerCase() === wanted.toLowerCase());
  if (!template) return null;
  if ((g.projectRequests ?? []).some((r) => r.template === template.name)) return null;
  return { id: uid(), by: c.id, template: template.name, note: (why ?? "").trim().slice(0, 300) };
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
