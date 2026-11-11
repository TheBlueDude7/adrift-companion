import { BIO_TIER_LABEL, type BioTier } from "@/data/biology";
import { CYBERNETICS, CYBER_BY_KEY, implantName, TIER_LABEL } from "@/data/cybernetics";
import { bioDef } from "./bio-catalogue";
import { growBlocker } from "./biology";
import { moduleLevel } from "./crafting";
import { installBlocker, planInstall } from "./cyber";
import { maxHp } from "./derive";
import { uid } from "./dice";
import { deadlineWhen, effectiveSeverity, operate } from "./injuries";
import { haveInStorage, spendUse, takeOne } from "./stock";
import type { Character, GameState, Injury, SegmentAction, SurgeryInstall } from "./types";

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
export const THEATRES = [
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
  return { ...THEATRES[level], level, cradle: cradle && bay < 1 };
}

/**
 * The hold item a Surgery consumes to install, or null when nothing is tracked.
 *
 * Cybernetics are manufactured, so one has to exist before it can go in. Biological strains are not:
 * a cultivation belongs to the whole crew once the lab has grown it, and there is nothing in the hold
 * to spend.
 */
export const installItemName = (x: SurgeryInstall) =>
  x.kind === "cyber" && CYBER_BY_KEY[x.key] ? implantName(CYBER_BY_KEY[x.key], x.replacement) : null;

/** What the surgeon is putting in, for a log line and a menu label. */
export function installLabel(x: SurgeryInstall) {
  if (x.kind === "cyber") return CYBER_BY_KEY[x.key] ? implantName(CYBER_BY_KEY[x.key], x.replacement) : x.key;
  return bioDef(x.key)?.name ?? x.key;
}

/**
 * Everything that could go into this patient right now: cybernetics sitting in the hold, and strains
 * the lab has grown. The theatre isn't consulted, because what's installable is about the patient and
 * the stock — which room it has to happen in is the surgeon's problem.
 */
export function installable(g: GameState, patient: Character): SurgeryInstall[] {
  const chrome = CYBERNETICS.flatMap((d) => (d.tier === 1 ? [false, true] : [false]).map((replacement) => ({ kind: "cyber" as const, key: d.key, replacement })))
    .filter((x) => haveInStorage(g, implantName(CYBER_BY_KEY[x.key], x.replacement)) > 0 && !installBlocker(g, patient, CYBER_BY_KEY[x.key]));
  const grown = (g.research.biology ?? [])
    .flatMap((key) => {
      const def = bioDef(key);
      return def && !growBlocker(g, patient, def) ? [{ kind: "bio" as const, key }] : [];
    });
  return [...chrome, ...grown];
}

/** The grade a theatre counts as, on the same I–III ladder the Workshop uses for materials. */
export const theatreGrade = (level: number) => (level >= 4 ? 3 : level >= 2 ? 2 : level >= 1 ? 1 : 0);

const ROMAN = ["", "I", "II", "III"] as const;
const BAY_NAME = ["", "somewhere to operate: a Medical Bay, or a Mobile Surgical Cradle", "an Operational Medical Bay", "a Medical Bay built up to Advanced Care"] as const;

/**
 * Why this Surgery can't install what it has been handed, or null.
 *
 * The implant's tier sets the theatre it needs, the way a recipe's materials set the Workshop they
 * need: a Tier III system is not something anyone fits on a folding table.
 *
 * `force` is the GM saying it happens anyway, which skips the eligibility rules but never the item:
 * a cybernetic that doesn't exist still can't be fitted. With no surgeon named there is no theatre to
 * judge, so the room goes unchecked — that path is the GM's own bookkeeping.
 */
export function surgeryInstallBlocker(g: GameState, patient: Character, x: SurgeryInstall, force = false, surgeonId?: string): string | null {
  const grade = surgeonId ? theatreGrade(theatreFor(g, surgeonId).level) : 3;
  if (x.kind === "cyber") {
    const def = CYBER_BY_KEY[x.key];
    if (!def) return x.key ? "That isn't an implant" : "Pick the implant to install";
    if (!force) {
      const why = installBlocker(g, patient, def);
      if (why) return why;
    }
    const item = implantName(def, x.replacement);
    if (!haveInStorage(g, item)) return `No ${item} in the hold — fabricate one first`;
    if (grade < def.tier) return `A Tier ${ROMAN[def.tier]} implant needs ${BAY_NAME[def.tier]}`;
    return null;
  }
  const def = bioDef(x.key);
  if (!def) return x.key ? "That isn't an augmentation" : "Pick the implant to install";
  if (!force) {
    const why = growBlocker(g, patient, def);
    if (why) return why;
  }
  if (grade < 1) return "Grafting needs a working Medical Bay";
  return null;
}

/**
 * Put it in. Called on a successful Surgery, and by the GM override on the crew sheet.
 *
 * The implant item is spent here rather than when the Surgery is planned, so a Surgery that fails
 * leaves it in the hold: the segment and the patient's HP are the price of a bad operation, and the
 * hardware survives to be tried again.
 */
export function installBySurgery(g: GameState, patient: Character, x: SurgeryInstall, out: string[], opts: { forcedBy?: string; untracked?: boolean } = {}) {
  const { forcedBy, untracked } = opts;
  if (x.kind === "bio") {
    const def = bioDef(x.key);
    if (!def) return void out.push("⚠ That isn't an augmentation.");
    patient.biology = [...(patient.biology ?? []), { id: uid(), key: def.key, choice: x.choice?.trim() ?? "" }];
    out.push(`${patient.name} is grafted with a ${def.name} (${BIO_TIER_LABEL[def.tier as BioTier]} ${def.tree === "adaptive" ? "Adaptive" : "Utility"}). It takes hold over a full Rest.`);
    if (forcedBy) out.push(`The GM forced the graft (${forcedBy}).`);
    return;
  }
  const def = CYBER_BY_KEY[x.key];
  if (!def) return void out.push("⚠ That isn't an implant.");
  const item = implantName(def, x.replacement);
  if (!untracked && takeOne(g, item)) out.push(`The ${item} comes out of the hold.`);
  const plan = planInstall(patient, def, { location: x.location, replaceId: x.replaceId });
  const absorbed = (patient.cybernetics ?? []).filter((i) => plan.removes.includes(i.id));
  patient.cybernetics = [
    ...(patient.cybernetics ?? []).filter((i) => !plan.removes.includes(i.id)),
    { id: uid(), key: def.key, location: plan.location, replacement: !!x.replacement, damaged: false, lineage: plan.lineage, choice: x.choice?.trim() ?? "" },
  ];
  out.push(`${patient.name} receives a ${x.replacement ? "Replacement " : ""}${def.name} (${TIER_LABEL[def.tier]}, ${plan.location}).`);
  if (forcedBy) out.push(`The GM forced the install (${forcedBy}).`);
  if (absorbed.length) out.push(`It ${def.tier === 3 ? "integrates" : "replaces"} ${absorbed.map((i) => CYBER_BY_KEY[i.key]?.name ?? i.key).join(", ")}.`);
}

/**
 * Why this injury can't go under the knife, or null.
 *
 * An operation doesn't have to be about an injury: a Surgery that's installing something has its own
 * subject, and asking it to name a wound as well would be asking for one that isn't there.
 */
export function surgeryInjuryBlocker(patient: Character, injury: Injury | undefined, installing = false) {
  if (!injury) return installing ? null : "Pick the injury to operate on, or the implant to install";
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
  const install = a.install ?? null;
  if (!patient || patient.dead || (!injury && !install)) return void out.push("⚠ Nobody was on the table.");
  const tools = surgicalToolsFor(g, a.characterId);
  if (tools && spendUse(g, tools.name, tools.location)) out.push(`One use of ${tools.location === "ship" ? "the ship's" : "their"} ${tools.name} is spent.`);
  const theatre = theatreFor(g, a.characterId);
  const keep = theatre.keep ? theatre.keep[ok ? "success" : "failure"] : null;
  const floor = keep === null ? patient.hp : Math.max(1, Math.floor(maxHp(patient) * keep));
  if (patient.hp > floor) {
    out.push(`${patient.name} goes under: HP drops to ${floor} (${keep === 1 / 2 ? "half" : "three-quarters of"} their Max HP, ${theatre.label}).`);
    patient.hp = floor;
  }
  if (install) {
    const what = installLabel(install);
    // Nothing is consumed until the implant actually goes in, so a failed operation costs the segment
    // and the patient's HP and leaves the hardware on the tray.
    if (!ok) {
      const kept = installItemName(install);
      out.push(`The Surgery fails: the ${what} doesn't go in.${kept ? ` The ${kept} is undamaged and still in the hold.` : ""}`);
      return;
    }
    installBySurgery(g, patient, install, out);
    if (strong && patient.hp < maxHp(patient)) {
      patient.hp += 1;
      out.push(`A clean procedure: ${patient.name} regains 1 HP (${patient.hp}/${maxHp(patient)}).`);
    }
    return;
  }
  if (!injury) return;
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
