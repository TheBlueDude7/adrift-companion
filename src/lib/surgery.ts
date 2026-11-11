import { moduleLevel } from "./crafting";
import { maxHp } from "./derive";
import { deadlineWhen, effectiveSeverity, operate } from "./injuries";
import { spendUse } from "./stock";
import type { Character, GameState, Injury, SegmentAction } from "./types";

/** Surgery needs one of these, best first. Using it spends a charge. */
export const SURGICAL_TOOLS = [
  { name: "Enhanced Surgical Tools", dice: 3, free: true },
  { name: "Surgical Tools", dice: 0, free: false },
  { name: "Improvised Surgical Tools", dice: 0, free: false },
] as const;

export type ToolSource = (typeof SURGICAL_TOOLS)[number] & { location: string };

/** The best Surgical Tools the surgeon can reach: their own pack, then ship storage. */
export function surgicalToolsFor(g: GameState, surgeonId: string): ToolSource | null {
  const aboard = !g.expedition?.crew.includes(surgeonId);
  for (const tool of SURGICAL_TOOLS) {
    for (const location of aboard ? [surgeonId, "ship"] : [surgeonId]) {
      if (g.items.some((i) => i.location === location && i.name === tool.name && i.qty > 0 && !i.broken)) return { ...tool, location };
    }
  }
  return null;
}

/**
 * Where the operation happens, by Medical Bay level. `keep` is the share of Max HP the patient drops to
 * when Surgery begins, on success and on failure; null means no drop at all.
 */
const THEATRES = [
  { label: "No Medical Bay", dice: -3, keep: { success: 1 / 2, failure: 1 / 2 } },
  { label: "Field Setup", dice: -2, keep: { success: 1 / 2, failure: 1 / 2 } },
  { label: "Operational Medical Bay", dice: -1, keep: { success: 3 / 4, failure: 1 / 2 } },
  { label: "Sterile Suite", dice: 0, keep: { success: 3 / 4, failure: 3 / 4 } },
  { label: "Advanced Care", dice: 0, keep: null },
] as const;

const CRADLE = "mobile-surgical-cradle";

/**
 * The Medical Bay only counts aboard. A working Mobile Surgical Cradle counts as a Field Setup wherever
 * its mech is: deployed with the expedition, or berthed on the ship.
 */
export function theatreFor(g: GameState, surgeonId: string) {
  const away = !!g.expedition?.crew.includes(surgeonId);
  const bay = away ? -1 : moduleLevel(g, "Medical Bay");
  const cradle = (g.mechs ?? []).some((m) => !m.upgrading && m.deployed === away && m.modules.some((x) => x.key === CRADLE && !x.damaged));
  const level = Math.max(bay, cradle ? 1 : 0, 0);
  return { ...THEATRES[level], cradle: cradle && bay < 1 };
}

/** Why this injury can't go under the knife, or null. */
export function surgeryInjuryBlocker(patient: Character, injury: Injury | undefined) {
  if (!injury) return "Pick the injury to operate on";
  if (injury.legacy) return `${injury.name} is from the old table: convert it on the crew sheet first`;
  if (effectiveSeverity(injury) === "Minor") return `${injury.name} is Minor: First Aid and Rest handle it, not Surgery`;
  return null;
}

/** Injuries a surgeon could operate on. */
export const operable = (patient: Character) => patient.injuries.filter((i) => !surgeryInjuryBlocker(patient, i));

/** A successful Prep for Surgery on this patient today adds +2d6 to their Surgery. */
export const PREP_DICE = 2;
export const prepped = (g: GameState, a: SegmentAction) =>
  g.actions.some((x) => x.task === "Prep for Surgery" && x.subjectId === a.subjectId && x.day === a.day && (x.status === "success" || x.status === "strong"));

/**
 * The operation itself, success or failure: spend a charge of the tools, drop the patient's HP as the
 * theatre allows, and on success turn the injury into a Treated Minor one. A failure leaves the injury
 * as it was; the costs are paid either way.
 */
export function performSurgery(g: GameState, a: SegmentAction, ok: boolean, strong: boolean, out: string[]) {
  const patient = g.characters.find((x) => x.id === a.subjectId);
  const injury = patient?.injuries.find((i) => i.id === a.injuryId);
  if (!patient || patient.dead || !injury) return void out.push("⚠ Nobody was on the table.");
  const tools = surgicalToolsFor(g, a.characterId);
  if (tools && spendUse(g, tools.name, tools.location)) out.push(`One use of ${tools.location === "ship" ? "the ship's" : "their"} ${tools.name} is spent.`);
  const theatre = theatreFor(g, a.characterId);
  const keep = theatre.keep ? theatre.keep[ok ? "success" : "failure"] : null;
  const floor = keep === null ? patient.hp : Math.max(1, Math.floor(maxHp(patient) * keep));
  if (patient.hp > floor) {
    out.push(`${patient.name} goes under: HP drops to ${floor} (${keep === 1 / 2 ? "half" : "three-quarters of"} their Max HP, ${theatre.label}).`);
    patient.hp = floor;
  }
  if (!ok) {
    out.push(`The Surgery fails: ${injury.name} is unchanged.${injury.deadline ? ` ${patient.name} still needs Surgery by the end of ${deadlineWhen(g.day, injury.deadline)}.` : ""}`);
    return;
  }
  operate(patient, injury.id, out);
  if (strong && patient.hp < maxHp(patient)) {
    patient.hp += 1;
    out.push(`A clean procedure: ${patient.name} regains 1 HP (${patient.hp}/${maxHp(patient)}).`);
  }
}
