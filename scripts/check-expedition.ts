import { newAction, resolveAction, taskPool, taskTerms } from "../src/lib/actions";
import { SITES, siteProblems } from "../src/data/sites";
import { TASK_BY_NAME } from "../src/data/tasks";
import { maxEnergy } from "../src/lib/derive";
import { addFind, endExpedition, findsWaiting, markExpeditionTurn, moveTo, recordSearch, revealFind, scout, setBorderState, startExpedition, TURNS_PER_SEGMENT, zoneDistance, zoneOf } from "../src/lib/expedition";
import { clearHazard, hazardsIn, hazardTollAll, plantHazard, PRESET_BY_KEY, tickHazards } from "../src/lib/hazards";
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
/** What one survivor is carrying, by name: salvage off a site goes into their own hands. */
const carried = (g: GameState, id: string) => Object.fromEntries(g.items.filter((i) => i.location === id).map((i) => [i.name, i.qty]));
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
  check("and they're told how many ways on", said(lines, /One more way on, unexplored/), true);
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

  // Breaching the command lockout is the GM opening the border. The line it writes can't name the
  // room on the far side, which the crew is still being kept from knowing about.
  const opened = setBorderState(g, zone("Spinal Corridor").id, zone("Bridge").id, "open");
  check("opening a door names only the side they know", text(opened), ["One way out of the Spinal Corridor is now open, where it was locked."]);
  check("and once both ends are known, both are named", text(setBorderState(g, zone("Docking Collar").id, zone("Spinal Corridor").id, "closed")), ["The way between the Docking Collar and the Spinal Corridor is now closed, where it was open."]);
  check("a door between two unknown rooms is the GM's business", secret(setBorderState(g, zone("Mess Deck").id, zone("Maintenance Crawl").id, "blocked")), ["A way the crew hasn't found is now blocked, where it was destroyed."]);
  setBorderState(g, zone("Docking Collar").id, zone("Spinal Corridor").id, "open");
  check("once it's breached the bridge opens up", zoneDistance(e, zone("Spinal Corridor").id, zone("Bridge").id), 1);
  check("walking in is then allowed", said(moveTo(g, vale.id, zone("Bridge").id), /moves from the Spinal Corridor to the Bridge/), true);
  check("the GM hears what's really there", secret(scout(g, zone("Cargo Hold").id)), ["Cargo Hold: Start the creature here, behind the container wall. It knows the crawlway and the crew do not."]);
  check("and scouting counts as seeing it", zone("Cargo Hold").seen, true);
  check("a survivor who stayed aboard can't be moved", said(moveTo(g, bystander(g).id, zone("Bridge").id), /isn't on this expedition/), true);

  // Two zones is as far as anyone goes in one move, and the second of them is a Sprint. With the
  // duct blocked above and the bulkhead down, nothing now joins the Bridge to the hold at all.
  check("the far end of the ship is cut off", said(moveTo(g, vale.id, zone("Cargo Hold").id), /no way from the Bridge to the Cargo Hold at all/), true);
  check("two rooms it manages at a run", said(moveTo(g, vale.id, zone("Mess Deck").id), /sprints from the Bridge through the Spinal Corridor into the Mess Deck/), true);
  check("and that's where they end up", zoneOf(e, vale.id)?.name, "Mess Deck");
}

// Clues and lore, handed over one at a time.
{
  const g = world();
  const [vale] = g.characters;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const e = g.expedition!;
  const here = zoneOf(e, vale.id)!;
  check("a room comes with things to learn", findsWaiting(here).length, 2);
  check("and the crew knows none of them yet", here.finds.filter((f) => f.found).length, 0);
  check("nor can they read one", playerView(g).expedition!.zones.find((z) => z.id === here.id)!.finds, []);

  const axe = here.finds.find((f) => f.by === "look")!;
  check("handing one over says where they are and what they found", text(revealFind(g, here.id, axe.id)), ["Docking Collar: The hatch is wedged with a fire axe, from this side. Somebody wanted it to stay open behind them."]);
  check("it's theirs now, and it's public", [axe.found, playerView(g).expedition!.zones.find((z) => z.id === here.id)!.finds.length], [true, 1]);
  check("while the one they haven't found stays out of their copy", JSON.stringify(playerView(g).expedition).includes("crew manifest"), false);
  check("handing it over twice doesn't", said(revealFind(g, here.id, axe.id), /already knows/), true);
  check("and there's one thing left in the room", findsWaiting(here).length, 1);

  // Most of what a site gives up was never written down in advance.
  const made = addFind(g, here.id, "  A handprint inside the locker door, too large to be a hand.  ", "look");
  check("the GM can write one on the spot", text(made), ["Docking Collar: A handprint inside the locker door, too large to be a hand."]);
  check("and it goes straight to the crew", playerView(g).expedition!.zones.find((z) => z.id === here.id)!.finds.length, 2);
  check("an empty one isn't a find", text(addFind(g, here.id, "   ")), ["There's nothing written to find."]);
  check("and neither is one in no room", text(addFind(g, "nowhere", "something")), ["That's no zone of this site."]);
  check("a find that isn't there can't be handed over", text(revealFind(g, here.id, "nope")), ["That's nothing this site holds."]);
}

// Searching a room.
{
  const g = world();
  const [vale] = g.characters;
  vale.skills.scavenging = 5;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const e = g.expedition!;
  const here = zoneOf(e, vale.id)!;
  const a = newAction(g, vale, "Search");
  g.actions.push(a);
  const lines = resolveAction(g, a.id, { status: "success", energy: 0, outcome: "", bundles: ["2 Scrap Metal", "1 Medical Supply"] });
  check("the room is marked searched", here.searched, true);
  check("the finder carries it out themselves", carried(g, vale.id), { "Scrap Metal": 2, "Medical Supply": 1 });
  check("and the crew hears what they got", said(lines, /Vale comes away with 2 salvage bundles: 2 Scrap Metal, 1 Medical Supply/), true);
  check("what the site has left is the GM's", secret(lines), ["The Tanager holds 2 salvage bundles now."]);

  // A clue the search turned up is told to the crew and costs the site nothing: it isn't salvage.
  const manifest = here.finds.find((f) => f.by === "search")!;
  const told = recordSearch(g, vale.id, [], [manifest.id]);
  check("a search can bring the room's own finds to light", said(told, /Docking Collar: A crew manifest/), true);
  check("which costs the site nothing", e.secrets?.capacity, 2);

  const again = newAction(g, vale, "Search");
  check("a second ordinary search of the room finds nothing", taskTerms(g, again).blocker, "The Docking Collar has been searched — only a Thorough Search finds more");
  const thorough = { ...again, thorough: true };
  check("a thorough one still would", taskTerms(g, thorough).blocker, null);
  // The dice are counted in the terms rather than among the situational modifiers, so that the pool
  // shown while planning is the pool that gets rolled.
  check("and it brings three more dice", [taskTerms(g, thorough).dice, taskPool(g, again).dice, taskPool(g, thorough).dice], [9, 6, 9]);
  check("which it says in the breakdown", taskPool(g, thorough).parts[0], "WIT 1 + Scavenging 5 + Thorough 3");
  g.actions.push(thorough);
  const loud = resolveAction(g, thorough.id, { status: "success", energy: 0, outcome: "", bundles: [] });
  check("a search that turns up something else costs the site nothing", e.secrets?.capacity, 2);
  check("and nothing new is carried out of it", carried(g, vale.id), { "Scrap Metal": 2, "Medical Supply": 1 });
  check("but a thorough search costs two Turns and always makes noise", said(loud, /takes two Expedition Turns, and it's loud either way: advance the site's Noise or Threat Clock/), true);
}
{
  const g = world();
  const [vale] = g.characters;
  startExpedition(g, { site: "The Tanager", crew: [vale.id], capacity: 1 });
  const a = newAction(g, vale, "Search");
  g.actions.push(a);
  const lines = resolveAction(g, a.id, { status: "success", energy: 0, outcome: "", bundles: ["1 Food Unit", "1 Water Unit"] });
  check("a stripped site can't give more than it has", carried(g, vale.id), { "Food Unit": 1 });
  check("and the GM alone hears that it's empty", secret(lines), ["The Tanager only had 1 bundle left, so that's all they get.", "The Tanager is stripped of ordinary useful material."]);
}
{
  const g = world();
  const [vale] = g.characters;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const here = zoneOf(g.expedition!, vale.id)!;
  const a = newAction(g, vale, "Search");
  g.actions.push(a);
  resolveAction(g, a.id, { status: "failed", energy: 0, outcome: "" });
  check("a failed search leaves the room worth searching", here.searched, false);
  check("and the site no poorer", g.expedition?.secrets?.capacity, 4);
  check("so it can be searched again", taskTerms(g, newAction(g, vale, "Search")).blocker, null);
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

// Standing hazards: the one thing in the game that hurts people without anyone spending an action.
{
  const g = world();
  const [vale] = g.characters;
  vale.armor = 0;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const e = g.expedition!;
  const next = e.zones.find((z) => z.name === "Spinal Corridor")!;
  const burning = PRESET_BY_KEY["burning-zone"];
  const planted = plantHazard(g, next.id, { ...burning, source: "Inferno Projector" });
  check("a hazard is left standing in the room", hazardsIn(next).length, 1);
  check("and the log says what it does", said(planted, /leaves burning zone in the Spinal Corridor: 2 Fire Damage, Burning and Illuminated/), true);
  check("it says it won't go out on its own", said(planted, /stands until something puts it out/), true);

  const before = vale.hp;
  const walked = moveTo(g, vale.id, next.id);
  check("walking in costs them 2", before - vale.hp, 2);
  check("and it says what caught them", said(walked, /burning zone in the Spinal Corridor catches Vale/), true);
  check("with the conditions it carries", vale.conditions.map((x) => x.name).filter((n) => n === "Burning" || n === "Illuminated").sort(), ["Burning", "Illuminated"]);
  check("a hazard with no limit doesn't burn out", text(tickHazards(g)), []);
  check("so it's still standing there", hazardsIn(next).length, 1);
  check("and the crew can see what they're standing in", playerView(g).expedition!.zones.find((z) => z.id === next.id)!.hazards?.length, 1);
  check("putting it out says so", said(clearHazard(g, next.id, hazardsIn(next)[0].id), /burning zone in the Spinal Corridor is dealt with/), true);
  check("and then it's gone", hazardsIn(next).length, 0);
  check("a hazard that isn't there can't be put out", text(clearHazard(g, next.id, "nope")), ["That hazard isn't there."]);
  check("and no zone takes one at all", text(plantHazard(g, "nowhere", { ...burning, source: "x" })), ["That zone isn't part of this site."]);
}
{
  // Resistance works on a hazard the way it works on an attack. Cover doesn't: you are standing in it.
  const g = world();
  const [vale] = g.characters;
  vale.armor = 0;
  applyCondition(g, vale, "Resistant: Fire", "Scene", []);
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const next = g.expedition!.zones.find((z) => z.name === "Spinal Corridor")!;
  plantHazard(g, next.id, { ...PRESET_BY_KEY["burning-zone"], source: "Inferno Projector" });
  const before = vale.hp;
  const walked = moveTo(g, vale.id, next.id);
  check("Resistance halves what a hazard does", before - vale.hp, 1);
  check("and the line names what gave it", said(walked, /Resistant: Fire gives Vale Fire Resistance/), true);
}
{
  // One with a limit counts its Rounds down and goes out by itself.
  const g = world();
  const [vale] = g.characters;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const here = zoneOf(g.expedition!, vale.id)!;
  plantHazard(g, here.id, { ...PRESET_BY_KEY["fire"], source: "The reactor" });
  check("it says how long it lasts", hazardsIn(here)[0].rounds, 3);
  tickHazards(g);
  tickHazards(g);
  check("two Rounds later it's nearly done", hazardsIn(here)[0].rounds, 1);
  check("and the third puts it out", text(tickHazards(g)), ["The spreading fire in the Docking Collar burns itself out."]);
  check("leaving the room clear", hazardsIn(here).length, 0);
}
{
  // A hazard planted on top of people catches them where they stand, and a Sprint pays for the room
  // it runs through as well as the one it ends in.
  const g = world();
  const [vale, okonkwo] = g.characters;
  for (const c of [vale, okonkwo]) c.armor = 0;
  startExpedition(g, { site: "", crew: [vale.id, okonkwo.id], siteId: "tanager" });
  const e = g.expedition!;
  const here = zoneOf(e, vale.id)!;
  plantHazard(g, here.id, { ...PRESET_BY_KEY["burning-zone"], source: "Inferno Projector" });
  const before = [vale.hp, okonkwo.hp];
  const caught = hazardTollAll(g, here.id);
  check("everyone already in the room pays", [before[0] - vale.hp, before[1] - okonkwo.hp], [2, 2]);
  check("and both are named", [said(caught, /catches Vale/), said(caught, /catches Okonkwo/)], [true, true]);
  // Already Burning, so the second helping of it costs the extra point that refreshing Burning costs.
  check("standing in it again costs more", (hazardTollAll(g, here.id), before[0] - vale.hp), 5);
}
{
  // A Sprint crosses two rooms, so a hazard in the one it runs through catches it on the way past.
  const g = world();
  const [vale] = g.characters;
  vale.armor = 0;
  startExpedition(g, { site: "", crew: [vale.id], siteId: "tanager" });
  const e = g.expedition!;
  const corridor = e.zones.find((z) => z.name === "Spinal Corridor")!;
  const mess = e.zones.find((z) => z.name === "Mess Deck")!;
  plantHazard(g, corridor.id, { ...PRESET_BY_KEY["burning-zone"], source: "Inferno Projector" });
  const before = vale.hp;
  const sprint = moveTo(g, vale.id, mess.id);
  check("a Sprint through a burning room is caught on the way past", before - vale.hp, 2);
  check("and it ends up where it was going", zoneOf(e, vale.id)?.name, "Mess Deck");
  check("and it says which room caught them", said(sprint, /burning zone in the Spinal Corridor catches Vale/), true);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
