import { uid } from "./dice";
import { applyCondition, applyDamage } from "./mechanics";
import { DEFAULT_CONDITION_DURATION, scaleDamage, type DamageType } from "./rules";
import { damageResistance } from "./derive";
import type { Character, GameState, Line, Threat, Zone, ZoneHazard } from "./types";

/**
 * Hazards a frame or an augmentation can leave in a zone, named as the thing that makes them. The
 * crew's own rules already describe these; this is the data behind the prose, so the app can run
 * them instead of the GM remembering to.
 */
export const HAZARD_PRESETS: { key: string; name: string; from: string; damage: number; type: DamageType; conditions: string[]; rounds?: number }[] = [
  { key: "burning-zone", name: "Burning zone", from: "Inferno Projector, Furnace Bloom", damage: 2, type: "Fire", conditions: ["Burning", "Illuminated"] },
  { key: "chemical-cloud", name: "Chemical hazard", from: "Contamination Dispersal System", damage: 2, type: "Chemical", conditions: ["Contaminated"] },
  { key: "spore-cloud", name: "Spore cloud", from: "Blackout Spore Colony", damage: 0, type: "Chemical", conditions: ["Blinded", "Silenced"] },
  { key: "mist-cloud", name: "Hallucinogenic mist", from: "Hallucinogenic Mist Colony", damage: 0, type: "Chemical", conditions: ["Blinded", "Disoriented"] },
  { key: "webbed-ground", name: "Webbed terrain", from: "Adhesive Web Organ", damage: 0, type: "Physical", conditions: ["Restrained"] },
  { key: "razorwire", name: "Razorwire", from: "Razorwire Deployer", damage: 1, type: "Physical", conditions: ["Restrained"] },
  { key: "frozen-zone", name: "Frozen zone", from: "Cryogenic Dispersal Array", damage: 2, type: "Chemical", conditions: ["Slowed"] },
  { key: "fire", name: "Spreading fire", from: "The site itself", damage: 2, type: "Fire", conditions: ["Burning"], rounds: 3 },
];

export const PRESET_BY_KEY = Object.fromEntries(HAZARD_PRESETS.map((h) => [h.key, h])) as Record<string, (typeof HAZARD_PRESETS)[number]>;

export const hazardsIn = (z: Zone | undefined) => z?.hazards ?? [];

export function plantHazard(g: GameState, zoneId: string, hazard: Omit<ZoneHazard, "id">): (string | Line)[] {
  const z = g.expedition?.zones.find((x) => x.id === zoneId);
  if (!z) return ["That zone isn't part of this site."];
  z.hazards = [...hazardsIn(z), { ...hazard, id: uid() }];
  const lasts = hazard.rounds ? ` It lasts ${hazard.rounds} Round${hazard.rounds === 1 ? "" : "s"}.` : " It stands until something puts it out.";
  return [`${hazard.source} leaves ${hazard.name.toLowerCase()} in the ${z.name}: ${hazardLine(hazard)}.${lasts}`];
}

export function clearHazard(g: GameState, zoneId: string, hazardId: string): (string | Line)[] {
  const z = g.expedition?.zones.find((x) => x.id === zoneId);
  const h = hazardsIn(z).find((x) => x.id === hazardId);
  if (!z || !h) return ["That hazard isn't there."];
  z.hazards = hazardsIn(z).filter((x) => x.id !== hazardId);
  return [`The ${h.name.toLowerCase()} in the ${z.name} is dealt with.`];
}

/** What a hazard does, for a log line or a tooltip. */
export const hazardLine = (h: Pick<ZoneHazard, "damage" | "type" | "conditions">) =>
  [h.damage > 0 ? `${h.damage} ${h.type} Damage` : null, h.conditions.length ? h.conditions.join(" and ") : null].filter(Boolean).join(", ") || "nothing on its own";

/** Where a threat is standing, which only matters once the site has zones. */
const threatsIn = (g: GameState, zoneId: string) => g.threats.filter((t) => t.zone === zoneId && (t.stats?.hp ?? 1) > 0);

function hurt(g: GameState, h: ZoneHazard, c: Character, out: (string | Line)[]) {
  const said: string[] = [];
  if (h.damage > 0) {
    const resists = damageResistance(g, c, h.type);
    if (resists.length) said.push(`${resists[0]} gives ${c.name} ${h.type} Resistance.`);
    applyDamage(
      g,
      c,
      {
        amount: h.damage,
        useArmor: true,
        pierce: 0,
        // No Cover: it is no help against something you are standing in.
        resistant: resists.length > 0,
        vulnerable: c.conditions.some((x) => x.name === `Vulnerable: ${h.type}`),
        gainPressure: true,
        injury: null,
      },
      said,
    );
  }
  for (const name of h.conditions) applyCondition(g, c, name, DEFAULT_CONDITION_DURATION[name] ?? "Ongoing", said);
  for (const text of said) out.push({ text });
}

function hurtThreat(h: ZoneHazard, t: Threat, out: (string | Line)[]) {
  const s = t.stats;
  // A threat's conditions are public — the crew can see it reel — but its numbers are not.
  for (const name of h.conditions) {
    t.conditions.push({ id: uid(), name, duration: DEFAULT_CONDITION_DURATION[name] ?? "Ongoing", notes: h.name });
    out.push({ text: `${t.name} is now ${name}.` });
  }
  if (!s || h.damage <= 0) return;
  if (s.immune.includes(h.type)) {
    out.push({ text: `${t.name} is immune to ${h.type} damage.`, gm: true });
    return;
  }
  const scaled = scaleDamage(h.damage, s.resist.includes(h.type), s.vulnerable.includes(h.type));
  const lost = Math.min(s.hp, scaled);
  s.hp -= lost;
  out.push({ text: `${t.name} takes ${lost} ${h.type} damage from the ${h.name.toLowerCase()} (HP ${s.hp}/${s.maxHp}).`, gm: true });
}

/**
 * Everything standing in a zone pays its hazards. Called when a creature walks in and again when
 * their turn ends there, which is what "entering or ending their turn" comes to.
 */
export function hazardToll(g: GameState, zoneId: string, who: { characterId?: string; threatId?: string }): (string | Line)[] {
  const z = g.expedition?.zones.find((x) => x.id === zoneId);
  const list = hazardsIn(z);
  if (!z || !list.length) return [];
  const out: (string | Line)[] = [];
  for (const h of list) {
    const c = who.characterId ? g.characters.find((x) => x.id === who.characterId && !x.dead) : undefined;
    const t = who.threatId ? g.threats.find((x) => x.id === who.threatId) : undefined;
    if (!c && !t) continue;
    out.push(`The ${h.name.toLowerCase()} in the ${z.name} catches ${c?.name ?? t!.name}: ${hazardLine(h)}.`);
    if (c) hurt(g, h, c, out);
    if (t) hurtThreat(h, t, out);
  }
  return out;
}

/** Everyone in the zone at once, for a hazard planted on top of them. */
export function hazardTollAll(g: GameState, zoneId: string): (string | Line)[] {
  const e = g.expedition;
  if (!e) return [];
  const crew = e.crew.filter((id) => e.at[id] === zoneId);
  return [
    ...crew.flatMap((id) => hazardToll(g, zoneId, { characterId: id })),
    ...threatsIn(g, zoneId).flatMap((t) => hazardToll(g, zoneId, { threatId: t.id })),
  ];
}

/**
 * Count a Round off every hazard that has one, and clear the ones that have burned out. Hazards with
 * no `rounds` stand until a crew does something about them.
 */
export function tickHazards(g: GameState): (string | Line)[] {
  const out: (string | Line)[] = [];
  for (const z of g.expedition?.zones ?? []) {
    for (const h of hazardsIn(z)) if (h.rounds !== undefined) h.rounds -= 1;
    const gone = hazardsIn(z).filter((h) => h.rounds !== undefined && h.rounds <= 0);
    if (gone.length) z.hazards = hazardsIn(z).filter((h) => !gone.includes(h));
    for (const h of gone) out.push(`The ${h.name.toLowerCase()} in the ${z.name} burns itself out.`);
  }
  return out;
}
