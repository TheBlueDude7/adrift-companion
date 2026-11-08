import { newAction, resolveAction, taskTerms } from "../src/lib/actions";
import { SITES, siteProblems } from "../src/data/sites";
import { TASK_BY_NAME } from "../src/data/tasks";
import { maxEnergy } from "../src/lib/derive";
import { borderBetween, endExpedition, markExpeditionTurn, moveTo, scout, startExpedition, TURNS_PER_SEGMENT, zoneDistance, zoneOf } from "../src/lib/expedition";
import { applyCondition } from "../src/lib/mechanics";
import { createInitialState, itemFromTemplate, newCharacter } from "../src/lib/seed";
import { DEFAULT_ITEM_TEMPLATES } from "../src/lib/rules";
import { playerView } from "../src/lib/sync/redact";
import type { GameState, Line } from "../src/lib/types";

/** Two survivors with no background, so nothing quietly changes a slot count behind a case. */
function world(): GameState {
  const g = createInitialState();
  for (const name of ["Vale", "Okonkwo"]) g.characters.push(newCharacter(name, null, null, "gm"));
  return g;
}

const ids = (g: GameState) => g.characters.map((c) => c.id);
/** Someone who stayed aboard. */
const bystander = (g: GameState) => {
  const c = newCharacter("Ferrier", null, null, "gm");
  g.characters.push(c);
  return c;
};
const text = (lines: (string | Line)[]) => lines.map((l) => (typeof l === "string" ? l : l.text));
const said = (lines: (string | Line)[], re: RegExp) => text(lines).some((t) => re.test(t));
const secret = (lines: (string | Line)[]) => lines.filter((l): l is Line => typeof l !== "string" && !!l.gm).map((l) => l.text);

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

// Departure.
{
  const g = world();
  const lines = startExpedition(g, { site: "The Tanager", crew: [ids(g)[0]], capacity: 4, notes: "The reactor is still hot." });
  check("the crew is away", g.expedition?.site, "The Tanager");
  check("only the one who went is recorded", g.expedition?.crew, [ids(g)[0]]);
  check("it starts on turn zero", g.expedition?.turn, 0);
  check("it remembers when they left", g.expedition?.started, { day: g.day, segment: g.segment });
  check("the one left behind is named", said(lines, /Still aboard.*Okonkwo/), true);
  check("capacity and notes are the GM's alone", secret(lines), ["The Tanager holds 4 salvage bundles.", "The Tanager: The reactor is still hot."]);
  check("a second expedition is refused", text(startExpedition(g, { site: "Elsewhere", crew: ids(g) })), ["The crew is already on an expedition to The Tanager. End that one first."]);
}
{
  const g = world();
  check("nobody going is no expedition", text(startExpedition(g, { site: "The Tanager", crew: [] })), ["Nobody is going, so there's no expedition."]);
  check("and nothing is recorded", g.expedition, undefined);
}
// A crew that leaves full has nowhere to put what it finds, which is worth saying before they go.
{
  const g = world();
  const [who] = ids(g);
  const tpl = DEFAULT_ITEM_TEMPLATES.find((t) => t.name === "Scrap Metal")!;
  g.items.push(itemFromTemplate(tpl, 40, who));
  check("an overloaded survivor is warned, not stopped", said(startExpedition(g, { site: "The Tanager", crew: [who] }), /over the inventory limit/), true);
  check("they still go", !!g.expedition, true);
}

// Expedition Turns.
{
  const g = world();
  startExpedition(g, { site: "The Tanager", crew: ids(g) });
  const segment = g.segment;
  for (let i = 1; i < TURNS_PER_SEGMENT; i++) markExpeditionTurn(g);
  check("seven turns stay inside the segment", [g.expedition?.turn, g.segment], [TURNS_PER_SEGMENT - 1, segment]);
  const eighth = markExpeditionTurn(g);
  check("the eighth consumes it", [g.expedition?.turn, g.segment], [0, segment + 1]);
  check("and says what to do about it", said(eighth, /Advance environmental and threat clocks/), true);
  check("turns need an expedition", text(markExpeditionTurn(createInitialState())), ["No expedition is under way."]);
}

// The return procedure.
{
  const g = world();
  const [vale, okonkwo] = g.characters;
  vale.pressure = 2;
  okonkwo.pressure = 2;
  vale.abilityUsed["expedition:Field Triage"] = true;
  vale.abilityUsed["day:Second Wind"] = true;
  applyCondition(g, vale, "Bleeding", "Ongoing", []);
  startExpedition(g, { site: "The Tanager", crew: [vale.id], capacity: 4 });
  markExpeditionTurn(g);
  markExpeditionTurn(g);
  const lines = endExpedition(g, { panicked: [vale.id], outcome: "secured" });
  check("it reports how long they were gone", said(lines, /Away for 2 Expedition Turns/), true);
  check("bleeding doesn't quietly come aboard", said(lines, /Vale is still Bleeding/), true);
  check("the one who went eases 1 Pressure", vale.pressure, 1);
  check("the one who stayed aboard doesn't", okonkwo.pressure, 2);
  check("Panicked costs 1 Stress", vale.stress, 1);
  check("once-per-expedition abilities reset", Object.keys(vale.abilityUsed), ["day:Second Wind"]);
  check("what's left stays the GM's", secret(lines), ["The Tanager still holds 4 salvage bundles."]);
  check("and the site's standing is recorded", said(lines, /Secured/), true);
  check("the crew is home", g.expedition, undefined);
}
{
  const g = world();
  const [vale] = g.characters;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  check("a Calm survivor is left alone about it", said(endExpedition(g), /Pressure/), false);
}
{
  const g = world();
  const [vale] = g.characters;
  vale.pressure = 3;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  const lines = endExpedition(g, { safe: false });
  check("Pressure holds while the danger does", vale.pressure, 3);
  check("and says so", said(lines, /danger hasn't passed/), true);
}
{
  const g = world();
  g.characters[0].abilityUsed["expedition:Field Triage"] = true;
  check("ending with no expedition recorded still resets abilities", said(endExpedition(g), /ready again/), true);
  check("and leaves nothing behind", g.characters[0].abilityUsed, {});
}

// What a player receives.
{
  const g = world();
  startExpedition(g, { site: "The Tanager", crew: ids(g), capacity: 4, notes: "The reactor is still hot." });
  const seen = playerView(g).expedition!;
  check("players see where they are and what time it is", Object.keys(seen).sort(), ["at", "borders", "crew", "site", "started", "turn", "zones"]);
  check("and not what's left to find", seen.secrets, undefined);
  check("no expedition stays no key", "expedition" in playerView(createInitialState()), false);
}

// The Common Expedition Tasks.
{
  const g = world();
  const [vale] = g.characters;
  vale.skills.scavenging = 5;
  const search = newAction(g, vale, "Search");
  g.actions.push(search);
  check("searching the ship's corridors is refused", taskTerms(g, search).blocker, "The crew isn't on an expedition");
  check("but embarking never is", taskTerms(g, newAction(g, vale, "Embark Expedition")).blocker, null);
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  const terms = taskTerms(g, search);
  check("out there it rolls Scavenging", [terms.blocker, terms.skill, terms.dice], [null, "scavenging", 6]);
  check("and never goes Routine, whatever the level", terms.routine, false);
  check("the GM resolves what's found", TASK_BY_NAME["Search"].gmResolves, true);
}
{
  const g = world();
  const [vale] = g.characters;
  // Perception 2 catches an obvious threat without a roll; anything subtler is the GM's call.
  vale.skills.perception = 2;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  check("Stand Watch is Routine at Perception 2", taskTerms(g, newAction(g, vale, "Stand Watch")).routine, true);
  g.characters[1].skills.perception = 1;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  check("and a roll below it", taskTerms(g, newAction(g, g.characters[1], "Stand Watch")).routine, false);
}
{
  const g = world();
  const [vale] = g.characters;
  vale.attributes.STR = 3;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  const terms = taskTerms(g, newAction(g, vale, "Carry or Extract"));
  check("carrying someone out is Labor", [terms.labor, terms.skill, terms.attr, terms.threshold], [true, null, "STR", 2]);
  check("and Strength 3 manages an awkward load", terms.routine, true);
}
{
  const g = world();
  const [vale] = g.characters;
  vale.pressure = 2;
  startExpedition(g, { site: "The Tanager", crew: [vale.id] });
  const a = newAction(g, vale, "Catch Your Breath");
  g.actions.push(a);
  const terms = taskTerms(g, a);
  check("catching your breath is free and automatic", [terms.energy, terms.routine], [0, true]);
  resolveAction(g, a.id, { status: "success", energy: terms.energy, outcome: "" });
  check("and buys one Pressure level", vale.pressure, 1);
  check("but no Energy, unlike Rest", vale.energy, maxEnergy(vale));
}

// Every authored site, before anyone sits down to play it.
for (const def of SITES) check(`${def.name} is authored correctly`, siteProblems(def), []);
check("a border to nowhere is caught", siteProblems({ id: "x", name: "X", capacity: 1, zones: [{ id: "a", name: "A" }], borders: [{ from: "a", to: "b" }] }), ['A border names "b", which is no zone of this site.']);
check("and so is a room nothing leads to", siteProblems({ id: "x", name: "X", capacity: 1, zones: [{ id: "a", name: "A" }, { id: "b", name: "B" }], borders: [] }), ['Zone "b" can\'t be reached from the entrance.']);

// Walking a site.
{
  const g = world();
  const [vale, okonkwo] = g.characters;
  const lines = startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const e = g.expedition!;
  const zone = (name: string) => e.zones.find((z) => z.name === name)!;
  check("the site's name carries over", e.site, "The Tanager");
  check("so does its Salvage Capacity", e.secrets?.capacity, 4);
  check("the crew starts at the docking collar", [zoneOf(e, vale.id)?.name, zoneOf(e, okonkwo.id)?.name], ["Docking Collar", "Docking Collar"]);
  check("which is the only zone they've seen", e.zones.filter((z) => z.seen).map((z) => z.name), ["Docking Collar"]);
  check("and they're told how many ways on", said(lines, /One way on from here/), true);
  check("the authored slugs are gone", e.zones.every((z) => z.id.length > 20), true);

  check("the mess is two zones off", zoneDistance(e, zone("Docking Collar").id, zone("Mess Deck").id), 2);
  check("the hold is only reachable the hard way", zoneDistance(e, zone("Docking Collar").id, zone("Cargo Hold").id), 4);
  check("and the bridge not at all while it's locked", zoneDistance(e, zone("Spinal Corridor").id, zone("Bridge").id), null);

  check("walking into the next room works", said(moveTo(g, vale.id, zone("Spinal Corridor").id), /moves from the Docking Collar to the Spinal Corridor/), true);
  check("and reveals it", zone("Spinal Corridor").seen, true);
  check("but not what's past it", zone("Mess Deck").seen, false);
  check("a locked door refuses", said(moveTo(g, vale.id, zone("Bridge").id), /locked.*Command lockout/), true);
  check("a buckled bulkhead refuses", said(moveTo(g, vale.id, zone("Cargo Hold").id), /blocked/), true);
  check("so the survivor stays put", zoneOf(e, vale.id)?.name, "Spinal Corridor");
  check("and you can't step across the ship", said(moveTo(g, vale.id, zone("Maintenance Crawl").id), /no way from the Spinal Corridor/), true);

  // Breaching the command lockout is the GM opening the border.
  borderBetween(e, zone("Spinal Corridor").id, zone("Bridge").id)!.state = "open";
  check("once it's breached the bridge opens up", zoneDistance(e, zone("Spinal Corridor").id, zone("Bridge").id), 1);
  check("walking in is then allowed", said(moveTo(g, vale.id, zone("Bridge").id), /moves from the Spinal Corridor to the Bridge/), true);
  check("the GM hears what's really there", secret(scout(g, zone("Cargo Hold").id)), ["Cargo Hold: Start the creature here, behind the container wall. It knows the crawlway and the crew do not."]);
  check("and scouting counts as seeing it", zone("Cargo Hold").seen, true);
  check("a survivor who stayed aboard can't be moved", said(moveTo(g, bystander(g).id, zone("Bridge").id), /isn't on this expedition/), true);
}

// What a player receives of a site.
{
  const g = world();
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const e = g.expedition!;
  const corridor = e.zones.find((z) => z.name === "Spinal Corridor")!;
  moveTo(g, g.characters[0].id, corridor.id);
  const seen = playerView(g).expedition!;
  const named = seen.zones.filter((z) => z.seen).map((z) => z.name).sort();
  check("players see the zones the crew has been in", named, ["Docking Collar", "Spinal Corridor"]);
  check("and that there are five more ways on", seen.zones.filter((z) => !z.seen).length, 5);
  check("but not a thing about them", [...new Set(seen.zones.filter((z) => !z.seen).map((z) => z.name))], ["Somewhere else"]);
  check("no zone carries its secrets", seen.zones.every((z) => !("secrets" in z)), true);
  // The hold does reach them, as a blocked bulkhead off the corridor. The crawlway behind the mess
  // touches nothing they've seen, so they have no reason to think it exists.
  check("but a room two doors away isn't mentioned at all", seen.zones.some((z) => z.id === e.zones.find((x) => x.name === "Maintenance Crawl")!.id), false);
  check("doors the crew can see are described", seen.borders.length, e.borders.filter((b) => [b.a, b.b].some((id) => e.zones.find((z) => z.id === id)?.seen)).length);
  check("and the crew's own positions are no secret", Object.keys(seen.at).length, 2);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
