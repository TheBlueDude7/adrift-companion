// The simulated crew's side of an expedition: what they're offered, what they're told, and how many
// tasks they may take. Run with the react-server condition, since the prompt builders are
// server-only modules:
//   npx tsx --conditions react-server scripts/check-sim.ts
import { advanceProject, extraTaskBlocker, fitOptions, newAction, openProjects, permissionReasons, projectBill, resolveAction, surgeryOn, taskTerms } from "../src/lib/actions";
import { MECH_MODULE_RECIPES } from "../src/lib/crafting";
import { MECH_MODULES } from "../src/data/mechs";
import { FACILITY_BY_NAME } from "../src/data/ship-upgrades";
import { uid } from "../src/lib/dice";
import { startExpedition, markExpeditionTurn, moveTo, revealFind, scout, siteReport } from "../src/lib/expedition";
import { FOOD_ITEMS, foodCount, hullTier, maxHp, supplyCount } from "../src/lib/derive";
import { INJURY_TABLE } from "../src/data/injuries";
import { SHIPBOARD_TASKS } from "../src/data/tasks";
import { addInjury, injuryMaxHpSources, operate, overdueInjuries, segmentsLeft } from "../src/lib/injuries";
import { normalizeGame } from "../src/lib/maps";
import { POWER_CELLS, burnDailyPower, powerDaysLeft } from "../src/lib/power";
import { PANICKED } from "../src/lib/rules";
import { createInitialState, newCharacter } from "../src/lib/seed";
import { combineCrafts, legalOptions, projectAsk } from "../src/lib/sim/options";
import { doctrine, pressing, projectAsks, site } from "../src/lib/sim/world";
import { stockItem } from "../src/lib/stock";
import { diff } from "../src/lib/sync/ops";
import { denyReason } from "../src/lib/sync/permissions";
import { playerView } from "../src/lib/sync/redact";
import type { GameState, Project, SegmentAction } from "../src/lib/types";

function world(): GameState {
  const g = createInitialState();
  for (const name of ["Vale", "Okonkwo"]) g.characters.push(newCharacter(name, null, null, "gm"));
  return g;
}

const ids = (g: GameState) => g.characters.map((c) => c.id);
const tasks = (g: GameState, i = 0) => [...new Set(legalOptions(g, g.characters[i]).options.map((o) => o.task))];
const skipped = (g: GameState, i = 0) => legalOptions(g, g.characters[i]).skipped;

/** What the server would say to a player submitting this task, which is what the sim submits through. */
function attempt(g: GameState, a: SegmentAction) {
  const after: GameState = structuredClone(g);
  after.actions.push(a);
  return denyReason(g, diff(g, after), { role: "player", characterId: a.characterId });
}

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

// Aboard, the menu is the ship's and the Expedition Tasks aren't on it.
{
  const g = world();
  const menu = tasks(g);
  check("Rest is offered aboard", menu.includes("Rest"), true);
  check("so is setting out", menu.includes("Embark Expedition"), true);
  check("but there's nothing to search", menu.includes("Search"), false);
  check("and no Expedition Task is even listed as refused", skipped(g).some((s) => s.startsWith("Scout Ahead")), false);
}

// Off the ship, that table is replaced rather than filtered down.
{
  const g = world();
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const menu = tasks(g);
  check("the Expedition Tasks are offered", ["Scout Ahead", "Search", "Analyze", "Breach", "Secure", "Field Repair", "Stand Watch", "Carry or Extract", "Catch Your Breath"].filter((t) => !menu.includes(t)), []);
  check("along with what works anywhere", ["Reduce Pressure", "Other"].filter((t) => !menu.includes(t)), []);
  check("the reactor is out of reach", menu.includes("Tune the Reactor"), false);
  check("so is a bed", menu.includes("Rest"), false);
  check("and they're already out, so there's nothing to embark on", menu.includes("Embark Expedition"), false);

  // The one who stayed behind keeps the ship's table, and can't scout a room they aren't in.
  const ferrier = newCharacter("Ferrier", null, null, "gm");
  g.characters.push(ferrier);
  check("someone aboard still has the ship's tasks", tasks(g, 2).includes("Rest"), true);
  check("and none of the site's", tasks(g, 2).includes("Search"), false);
  check(
    "which the rules say plainly",
    taskTerms(g, newAction(g, ferrier, "Search")).blocker,
    "They stayed aboard, so there's no site for them to work in",
  );
}

// Off the ship nobody is rationed: a Turn lasts as long as the GM lets it, and a crew picking
// through a derelict does several small things in each room. Aboard, it's still one task a segment.
{
  const g = world();
  const [vale] = ids(g);
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const first = newAction(g, g.characters[0], "Search");
  check("the task is stamped with the Turn", first.turn, 0);
  check("and the first one goes in", attempt(g, first), null);
  g.actions.push(first);
  const second = newAction(g, g.characters[0], "Secure");
  check("a second in the same Turn goes in too", attempt(g, second), null);
  g.actions.push(second);
  check("and a third", attempt(g, newAction(g, g.characters[0], "Stand Watch")), null);
  check("there's no extra to Push for out here", extraTaskBlocker(g, g.characters[0]), "Off the ship, tasks aren't rationed");

  markExpeditionTurn(g);
  const next = newAction(g, g.characters[0], "Field Repair");
  check("the next Turn is stamped afresh", [next.turn, attempt(g, next)], [1, null]);
  check("and the old Turn's tasks are done with", g.actions.filter((a) => a.characterId === vale && a.turn === 1).length, 0);

  const ferrier = newCharacter("Ferrier", null, null, "gm");
  g.characters.push(ferrier);
  const aboard = newAction(g, ferrier, "Rest");
  g.actions.push(aboard);
  check("but the one who stayed aboard still gets the one task", attempt(g, newAction(g, ferrier, "Purify Water")), "One task per segment. Push for an extra task (−1 Energy, +1 Pressure).");
}

// What the site tells a survivor standing in it.
{
  const g = world();
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const [vale] = ids(g);
  const corridor = g.expedition!.zones.find((z) => z.name === "Spinal Corridor")!;
  moveTo(g, vale, corridor.id);
  const told = site(g, vale);

  check("it names the room they're in", told.includes("standing in the Spinal Corridor"), true);
  check("and the Turn they're on", told.includes("Expedition Turn 1 of 8"), true);
  check("the cover it offers", told.includes("Cover here: partial"), true);
  check("where the rest of the crew is", told.includes("Okonkwo is in the Docking Collar"), true);
  check("that they're on their own in here", told.includes("You are alone in this room"), true);
  check("and the state of every way out", ["locked", "sealed", "blocked", "closed"].filter((s) => !told.includes(s)), []);
  check("with the GM's own note on the door", told.includes("Command lockout, still powered"), true);

  // The same function over a player's copy, which is what a simulated player is actually handed.
  const theirs = site(playerView(g), vale);
  check("a player is told the same room", theirs.includes("standing in the Spinal Corridor"), true);
  check("but no room they haven't entered is named", theirs.includes("Mess Deck"), false);
  check("those are ways, not places", theirs.includes("a way you haven't been through"), true);
  check("and nothing a Search would find is in it", theirs.includes("dropped toolkit"), false);
  // The briefing is written for the survivor, so the GM's own copy withholds the same things: the
  // zone's note is the GM's prompt for playing the room, not something the crew has been told.
  check("the room's note stays out of it either way", told.includes("Noise here carries to the hold"), false);
  check("and the names of rooms they haven't entered", told.includes("Mess Deck"), false);
  scout(g, g.expedition!.zones.find((z) => z.name === "Mess Deck")!.id);
  check("scouting next door gives it a name", site(playerView(g), vale).includes("Mess Deck"), true);
  check("what the site still holds is the GM's", g.expedition!.secrets?.capacity, 4);
  check("which a player's copy has no sight of", playerView(g).expedition!.secrets, undefined);
  check("nor is Okonkwo hidden from their own crewmate", theirs.includes("Okonkwo is in the Docking Collar"), true);
}

// What the crew has been told about the site, which is how a derelict is explored: by accumulating it.
{
  const g = world();
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager" });
  const [vale] = ids(g);
  const e = g.expedition!;
  const collar = e.zones.find((z) => z.name === "Docking Collar")!;
  const corridor = e.zones.find((z) => z.name === "Spinal Corridor")!;
  const axe = collar.finds.find((f) => f.by === "look")!;

  check("an unfound clue reaches nobody, the GM included", site(g, vale).includes("wedged with a fire axe"), false);
  revealFind(g, collar.id, axe.id);
  check("one they've been handed is in front of them", site(g, vale).includes("What you've worked out about this room"), true);
  check("in the words the GM read out", site(g, vale).includes("wedged with a fire axe"), true);

  // Two rooms on, the axe matters more rather than less: it's why the hatch behind them is open.
  moveTo(g, vale, corridor.id);
  const brief = site(playerView(g), vale);
  check("and it stays with them when they move on", brief.includes("What you've learned elsewhere on this site"), true);
  check("named by the room it came from", brief.includes("in the Docking Collar: The hatch is wedged"), true);
  check("while this room has given up nothing yet", brief.includes("What you've worked out about this room"), false);

  const ceiling = corridor.finds.find((f) => f.by === "look")!;
  revealFind(g, corridor.id, ceiling.id);
  const both = site(playerView(g), vale);
  check("now it has", both.includes("pushed out from inside the ceiling void"), true);
  // This room's finds come first and unlabelled; the rooms behind them are named and come last.
  check("and the two aren't confused for each other", [both.indexOf("ceiling void") < both.indexOf("fire axe"), both.includes("- in the Spinal Corridor:")], [true, false]);
}

// The site as something outside the app reads it, which is the GM's whole view and nothing less.
{
  const g = world();
  startExpedition(g, { site: "", crew: ids(g), siteId: "tanager", capacity: 4, notes: "Wyre is in the hold." });
  const [vale] = ids(g);
  const report = siteReport(g)!;
  const medbay = report.zones.find((z) => z.name === "Medical Bay")!;

  check("it carries the site and the Turn", [report.site, report.turn, report.turnsPerSegment], ["The Tanager", 1, 8]);
  check("what the site has left, and the GM's own note", [report.capacity, report.notes], [4, "Wyre is in the hold."]);
  check("where each of the crew is standing", report.crew.find((c) => c.id === vale)?.zone, "Docking Collar");
  check("every room, entered or not", report.zones.length, 8);
  check("the GM's note on a room nobody has entered", medbay.note.startsWith("The room that explains the hold"), true);
  check("its finds, with how each would come to light", medbay.finds.map((f) => f.by), ["look", "task", "search"]);
  check("and that none of them has been handed over", medbay.finds.every((f) => !f.found), true);
  check("the ways out, by name and state", report.zones.find((z) => z.name === "Spinal Corridor")!.ways.find((w) => w.to === "Bridge")?.state, "locked");
  check("and nothing at all when nobody is off the ship", siteReport(world()), null);
}

// The crew's memory: lessons they signed, which is the only thing they carry that isn't state.
{
  const g = world();
  const [vale, okonkwo] = ids(g);
  const lesson = (by: string, text = "Scout the shaft before anyone goes down it.") => ({ id: uid(), text, by, from: "The Perihelion", day: 1 });
  const submit = (fn: (x: GameState) => void, who: string) => {
    const after: GameState = structuredClone(g);
    fn(after);
    return denyReason(g, diff(g, after), { role: "player", characterId: who });
  };

  check("nothing is written down to begin with", g.doctrine, undefined);
  check("a survivor signs their own lesson", submit((x) => { x.doctrine = [lesson("Vale")]; }, vale), null);
  check("but not in someone else's name", submit((x) => { x.doctrine = [lesson("Okonkwo")]; }, vale), "Sign what you learned in your own character's name.");
  check("and not an empty one", submit((x) => { x.doctrine = [lesson("Vale", "   ")]; }, vale), "A lesson with nothing in it teaches nobody.");

  g.doctrine = [lesson("Vale")];
  check("what's written stands", submit((x) => { x.doctrine = [{ ...x.doctrine![0], text: "Actually, don't bother." }]; }, vale), "What the crew learned stands as it was written.");
  check("even for the one who wrote it", submit((x) => { x.doctrine = []; }, vale), "Only the GM can strike out something the crew learned.");
  check("nor can a crewmate take it back", submit((x) => { x.doctrine = []; }, okonkwo), "Only the GM can strike out something the crew learned.");
  check("the GM can do either", denyReason(g, diff(g, { ...structuredClone(g), doctrine: [] }), { role: "gm", characterId: null }), null);
  check("adding another alongside is fine", submit((x) => { x.doctrine = [...x.doctrine!, lesson("Okonkwo", "Carry the torch, not the sled.")]; }, okonkwo), null);

  // It's the crew's own knowledge, so unlike the site's secrets it goes over whole.
  check("and a player is sent it", playerView(g).doctrine?.map((l) => l.by), ["Vale"]);

  // What a quiet segment hands them instead of a GM's description: arithmetic off their own books.
  {
    const q = world();
    // The ship is seeded in trouble — a power deficit, a holed hull, a dark Medical Bay — so a
    // segment with nothing pressing in it has to be built by putting all of that right.
    const sound = structuredClone(q);
    sound.ship.hullHp = hullTier(sound.ship).maxHp;
    for (const r of sound.ship.rooms) r.active = true;
    sound.ship.rooms[0].powerOutput += 4;
    check("a ship in good order has nothing pressing", pressing(sound).includes("Nothing is on fire"), true);

    q.items = q.items.filter((i) => i.name !== "Food Unit" && i.name !== "Water Unit");
    q.ship.hullHp = 1;
    q.characters[0].pressure = 3;
    q.characters[1].pressure = PANICKED;
    const now = pressing(q);
    check("an empty larder is counted, not described", now.includes("- Food: 0 rations for 2 of you — 0 days"), true);
    check("so is the water", now.includes("- Water: 0 units"), true);
    check("and the hull, against its own tier", now.includes(`- Hull: 1 of ${hullTier(q.ship).maxHp}`), true);
    check("Pressure short of breaking still gets said", now.includes("- Vale: Overtaxed, and it won't come down"), true);
    check("and breaking point by the name the rules give it", now.includes("- Okonkwo: Panicked."), true);
    check("nobody is told it's fine", now.includes("Nothing is on fire"), false);
    check("and none of it is the GM's side of the table", JSON.stringify(playerView(q)).includes("WHAT'S PRESSING"), false);
  }

  const brief = doctrine(g);
  check("they're told what they learned, and who said it", [brief.includes("Scout the shaft"), brief.includes("Vale, after The Perihelion")], [true, true]);
  check("and told plainly when there's nothing yet", doctrine(world()).includes("the first of it"), true);
}

// Crafting, which the simulated crew reported three separate complaints about.
{
  const g = world();
  const c = g.characters[0];
  const craft = (crafts: string[]) => ({ ...newAction(g, c, "Fabricate Common Item"), crafts });
  const labels = (x: GameState = g) => legalOptions(x, x.characters[0]).options.filter((o) => o.task === "Fabricate Common Item").map((o) => `${o.subject} — ${o.terms}`);

  // One task makes two items, and offering a single recipe at a time threw that allowance away.
  const batched = labels().filter((l) => l.startsWith("2× "));
  check("the batch of two is on the menu", batched.length > 0, true);
  check("and it costs the same Energy as making one", batched.every((l) => l.includes("2 Energy")), true);
  check("while nothing offers more than the allowance", labels().some((l) => l.startsWith("3× ")), false);

  // A recipe naming two trades is Routine on either, which has to be said or it reads as a bug.
  const medic = g.characters[1];
  medic.skills.firstAid = 3;
  medic.skills.mechTech = 0;
  const kit = legalOptions(g, medic).options.find((o) => o.subject === "Improvised Medkit");
  check("the medic can make a medkit on First Aid alone", !!kit, true);
  check("and is told which skill qualified, not just that it's Routine", kit?.terms.includes("your First Aid 3 meets its threshold of 3"), true);

  // A name nothing recognises used to cost nothing, roll nothing and pass as Routine.
  check("an unrecognised recipe is refused", permissionReasons(g, craft(["Improvised Medkits"])), ["No recipe called Improvised Medkits"]);
  check("and is never Routine while it's refused", taskTerms(g, craft(["Improvised Medkits"])).routine, false);
  check("the real one is fine", permissionReasons(g, craft(["Improvised Medkit"])), []);

  // You strip somebody else's hull, never the one you're standing in.
  const salvage = (x: GameState) => taskTerms(x, { ...newAction(x, x.characters[0], "Salvage Ship") }).blocker;
  check("there's nothing alongside to strip", salvage(g), "Nothing alongside but open space. Fly to a derelict first — their own ship isn't salvage");
  check("so it isn't offered at all", tasks(g).includes("Salvage Ship"), false);

  const chart = g.maps.find((m) => m.kind === "star");
  if (chart?.kind === "star" && chart.shipAt) {
    const at = chart.shipAt;
    chart.nodes.push({ id: uid(), x: at.x, y: at.y, name: "The Perihelion", type: "derelict", status: "visited", notes: "" });
    check("a derelict alongside can be stripped", salvage(g), null);
    check("and now it's on the menu", tasks(g).includes("Salvage Ship"), true);
    chart.nodes[0].status = "looted";
    check("but not twice", salvage(g), "The Perihelion has already been picked over");
    chart.nodes[0].type = "planet";
    chart.nodes[0].status = "visited";
    check("and a planet is not a hulk", salvage(g), "The Perihelion is a planet, not a hulk to strip");
  } else check("the seeded campaign has a chart with the ship on it", false, true);
}

// Two different items off the same bench, which the menu can't enumerate and so the crafter names.
const MATERIALS = ["Scrap Metal", "Scrap Components", "Basic Adhesive", "Fuel Unit"] as const;

/** A workshop with exactly this much in the hold, and a crafter who meets Tier I but is no Expert. */
function bench(components: number) {
  const g = world();
  const c = g.characters[0];
  c.skills.mechTech = 3;
  g.items = g.items.filter((i) => !MATERIALS.includes(i.name as (typeof MATERIALS)[number]));
  for (const name of MATERIALS) stockItem(g, name, name === "Scrap Components" ? components : 4, { category: "Material" });
  const menu = legalOptions(g, c);
  const pick = (subject: string) => menu.options.find((o) => o.task === "Fabricate Common Item" && o.subject === subject);
  return { g, c, menu, pick };
}

{
  const { g, c, menu, pick } = bench(4);
  const kit = pick("Improvised Toolkit")!;
  const cell = pick("Flickering Power Cell")!;
  const rest = menu.options.find((o) => o.task === "Rest")!;
  check("the bench offers a toolkit, a cell, a batch and a bed", [!!kit, !!cell, !!pick("2× Improvised Toolkit"), !!rest], [true, true, true, true]);

  const both = combineCrafts(g, c, menu, kit, [cell.n]);
  check("one task makes two different items", both.action.crafts, ["Improvised Toolkit", "Flickering Power Cell"]);
  check("and it's still the one Energy", taskTerms(g, both.action).energy, taskTerms(g, kit.action).energy);
  check("the second is named for the transcript", both.added, ["Flickering Power Cell"]);

  check("a full batch takes nothing more", combineCrafts(g, c, menu, pick("2× Improvised Toolkit")!, [cell.n]).refused, ["Flickering Power Cell is past what one task makes"]);
  check("asking it of a bed is refused in plain terms", combineCrafts(g, c, menu, rest, [cell.n]).refused, ["only a Fabricate task makes more than one thing, and they chose Rest"]);
  check("naming the same choice twice is still one of it", combineCrafts(g, c, menu, kit, [cell.n, cell.n]).action.crafts, ["Improvised Toolkit", "Flickering Power Cell"]);
  check("and naming nothing changes nothing", combineCrafts(g, c, menu, kit, []).action.crafts, ["Improvised Toolkit"]);
  check("nor does a number nobody offered", combineCrafts(g, c, menu, kit, [999]).refused, ["999 isn't another Fabricate choice"]);
}

{
  // One Scrap Components in the hold: either item alone, never both.
  const { g, c, menu, pick } = bench(1);
  const kit = pick("Improvised Toolkit")!;
  const cell = pick("Flickering Power Cell")!;
  check("each is affordable on its own", [!!kit, !!cell, !!pick("2× Improvised Toolkit")], [true, true, false]);
  const greedy = combineCrafts(g, c, menu, kit, [cell.n]);
  check("what the hold won't cover is dropped, not sent", greedy.action.crafts, ["Improvised Toolkit"]);
  check("and the reason says what was short", greedy.refused, ["Flickering Power Cell: Hold is short 1 Scrap Components"]);
}

// Rigging is wanted most where the ship isn't: a wreck's hull is weightless, airless and exposed at once.
{
  const g = world();
  startExpedition(g, { site: "The Perihelion", crew: [g.characters[0].id], siteId: "tanager" });
  check("the away team can rig a derelict", tasks(g).includes("Rig Safety Lines"), true);
  check("and the one who stayed aboard still can too", tasks(g, 1).includes("Rig Safety Lines"), true);
}

// Asking for a project, which only the GM can open.
{
  const g = world();
  const [vale, okonkwo] = ids(g);
  const player = (id: string) => ({ role: "player" as const, characterId: id });
  const submit = (fn: (x: GameState) => void, who: string) => {
    const after: GameState = structuredClone(g);
    fn(after);
    return denyReason(g, diff(g, after), player(who));
  };
  const ask = (by: string, template = "Hull Repair") => ({ id: uid(), by, template, note: "The hull is holed." });

  // The rule itself: a project is still the GM's, and the message says what to do instead.
  check("a player can't open a project", submit((x) => { x.ship.projects.push({ ...x.ship.projects[0], id: uid() }); }, vale), "Only the GM changes projects. Add Progress with a Work on a project task instead.");

  check("but they can ask for one", submit((x) => { x.projectRequests = [ask(vale)]; }, vale), null);
  check("in their own name only", submit((x) => { x.projectRequests = [ask(okonkwo)]; }, vale), "Ask for a project as your own character.");
  check("and only for work that exists", submit((x) => { x.projectRequests = [ask(vale, "Build a Cathedral")]; }, vale), "There's no project template called Build a Cathedral.");

  g.projectRequests = [ask(vale)];
  check("an ask the GM has read doesn't change under them", submit((x) => { x.projectRequests = [{ ...x.projectRequests![0], template: "Expand Ship" }]; }, vale), "Withdraw the request and make a new one instead.");
  check("they can withdraw their own", submit((x) => { x.projectRequests = []; }, vale), null);
  check("but not somebody else's", submit((x) => { x.projectRequests = []; }, okonkwo), "Only the GM can answer someone else's project request.");
  check("the GM answers any of them", denyReason(g, diff(g, { ...structuredClone(g), projectRequests: [] }), { role: "gm", characterId: null }), null);

  // It's the crew's own ask, so a player's copy carries it.
  check("and a player is sent it", playerView(g).projectRequests?.map((r) => r.template), ["Hull Repair"]);

  // What the simulated crew may ask for, and what it may not ask twice.
  const c = g.characters[0];
  check("a template they named is turned into an ask", projectAsk(g, c, "Expand Ship", "We need the room.")?.template, "Expand Ship");
  check("spelled however they spelled it", projectAsk(g, c, "  expand ship  ", "")?.template, "Expand Ship");
  check("what's already pending is dropped", projectAsk(g, c, "Hull Repair", ""), null);
  check("so is work the app doesn't have", projectAsk(g, c, "Build a Cathedral", ""), null);
  check("and saying nothing asks nothing", projectAsk(g, c, undefined, "why"), null);

  const brief = projectAsks(g);
  check("they're told what can be asked for, by its exact name", brief.includes("- Hull Repair — Mech. Technician 3 / Engineering 4, 1 Progress"), true);
  check("and warned off asking again", brief.includes("Already asked for and waiting on the GM"), true);
}

// Solar panels and defenses: a day's work with materials, not a GM's gift.
{
  const g = world();
  const c = g.characters[0];
  c.skills.engineering = 3;
  // The seed hold already carries scrap, so empty the two the panels want and stock them by hand.
  g.items = g.items.filter((i) => i.name !== "Scrap Metal" && i.name !== "Scrap Components");
  const room = g.ship.rooms.find((r) => !r.fitting)!;
  const panels = FACILITY_BY_NAME["Makeshift Solar Panels"];
  const plan = (patch: Partial<SegmentAction> = {}) => ({ ...newAction(g, c, "Install Panels or Defenses"), ...patch });
  const fit = (name: string, roomId: string) => plan({ fit: { name, roomId } });

  check("every fitting is offered for every free slot", [...new Set(fitOptions(g).map((f) => f.name))], ["Makeshift Solar Panels", "Traps", "Defensive Gun"]);
  check("but it needs to know what and where", taskTerms(g, plan()).blocker, "Pick solar panels, traps, or a defensive gun");
  check("and a module is not a fitting", taskTerms(g, fit("Bioconverter", room.id)).blocker, "Pick solar panels, traps, or a defensive gun");

  // With nothing in the hold it's an ask, not an option: the materials are the whole of the problem.
  check("an empty hold is the only thing stopping it", permissionReasons(g, fit(panels.name, room.id)), ["Hold is short 10 Scrap Metal", "Hold is short 5 Scrap Components"]);
  check("so it's listed as needing the GM, not hidden", skipped(g).some((s) => s.startsWith("Install Panels or Defenses")), true);
  for (const [name, qty] of [["Scrap Metal", 10], ["Scrap Components", 5]] as const) stockItem(g, name, qty, { category: "Material" });
  check("stocked, it's on the menu", tasks(g).includes("Install Panels or Defenses"), true);
  check("and clear to go", permissionReasons(g, fit(panels.name, room.id)), []);
  check("Routine for a trained engineer", taskTerms(g, fit(panels.name, room.id)).routine, true);

  // The seed ship's Makeshift Bench is enough. A Workshop room with nothing in it is not.
  const bare: GameState = structuredClone(g);
  bare.ship.rooms.find((r) => r.module === "Workshop / Fabrication Bay")!.level = 0;
  check("but a bench is the least it takes", taskTerms(bare, fit(panels.name, room.id)).blocker, "Needs a working Workshop");
  check("so it isn't offered without one", tasks(bare).includes("Install Panels or Defenses"), false);

  /** Plan the task, then settle it the way the server does. */
  const run = (x: GameState, a: SegmentAction, status: "success" | "strong" | "failed") => {
    x.actions.push(a);
    return resolveAction(x, a.id, { status, energy: 0, outcome: "" });
  };

  // A success fits them and spends the hold.
  const won: GameState = structuredClone(g);
  const draw = won.ship.rooms.find((r) => r.id === room.id)!.powerDraw;
  const lines = run(won, fit(panels.name, room.id), "success");
  check("the panels go up", won.ship.rooms.find((r) => r.id === room.id)?.fitting, "Makeshift Solar Panels");
  check("the materials are spent", [supplyCount(won, "Scrap Metal"), supplyCount(won, "Scrap Components")], [0, 0]);
  check("and panels ask nothing of the grid", won.ship.rooms.find((r) => r.id === room.id)?.powerDraw, draw);
  check("the log says what it cost", lines.some((l) => typeof l === "string" && l.includes("fitted in") && l.includes("10 Scrap Metal")), true);

  // A failure costs half, rounded up, and fits nothing.
  const lost: GameState = structuredClone(g);
  run(lost, fit(panels.name, room.id), "failed");
  check("a botched job fits nothing", lost.ship.rooms.find((r) => r.id === room.id)?.fitting, undefined);
  check("and wastes half the materials, rounded up", [supplyCount(lost, "Scrap Metal"), supplyCount(lost, "Scrap Components")], [5, 2]);

  // A gun draws power of its own, unlike panels.
  const armed: GameState = structuredClone(g);
  for (const [name, qty] of [["Scrap Metal", 6], ["Aluminum Alloy", 2], ["Scrap Components", 3]] as const) stockItem(armed, name, qty, { category: "Material" });
  run(armed, { ...newAction(armed, armed.characters[0], "Install Panels or Defenses"), fit: { name: "Defensive Gun", roomId: room.id } }, "success");
  check("a gun adds its own draw to the room", armed.ship.rooms.find((r) => r.id === room.id)!.powerDraw - draw, 2);

  // One slot, one fitting: the room that already has panels is out of the running.
  check("a filled slot is off the list", fitOptions(won).some((f) => f.roomId === room.id), false);
  check("and taking it anyway is refused", taskTerms(won, fit("Traps", room.id)).blocker, `${room.name}'s spare slot already holds Makeshift Solar Panels`);
}

// Projects used to be free: the materials were prose on the sheet and nothing came out of the hold.
{
  const g = world();
  const c = g.characters[0];
  c.skills.mechTech = 6;
  c.skills.engineering = 6;
  // The seed hold carries scrap and a toolkit, so it's emptied and restocked by hand.
  g.items = g.items.filter((i) => !["Scrap Metal", "Scrap Components", "Basic Adhesive"].includes(i.name) && !/toolkit/i.test(i.name));
  const frame: Project = {
    id: "frame",
    name: "Mech Frame (Tier I)",
    skill: "Mechanical Technician or Engineering",
    threshold: 4,
    progress: 0,
    required: 6,
    contributorLimit: 2,
    energy: 2,
    facility: "",
    materials: "",
    roomId: null,
    notes: "",
    done: false,
  };
  g.ship.projects.push(frame);
  const work = () => ({ ...newAction(g, c, "Work on a project"), projectId: frame.id });

  check("a frame costs scrap for every point of Progress", projectBill(g, frame).text, "2 Scrap Metal, 1 Scrap Components, 1 toolkit charge per Progress, 2 Basic Adhesive to finish");
  check("and an empty hold stops it", permissionReasons(g, work()), ["Hold is short 2 Scrap Metal", "Hold is short 1 Scrap Components", "Hold is short 1 Toolkit charges"]);
  check("so it's an ask, not an option", skipped(g).some((s) => s.startsWith("Work on a project")), true);

  // Stocked for one point only, the first contribution empties the hold and the second is refused.
  stockItem(g, "Scrap Metal", 2, { category: "Material" });
  stockItem(g, "Scrap Components", 1, { category: "Material" });
  stockItem(g, "Improvised Toolkit", 1, { category: "Equipment", maxCharges: 1 });
  check("stocked for one point, it's clear", permissionReasons(g, work()), []);
  const lines = resolveAction(g, (g.actions.push(work()), g.actions.at(-1)!.id), { status: "success", energy: 0, outcome: "" });
  check("the Progress lands", g.ship.projects[0].progress, 1);
  check("and the hold pays for it", [supplyCount(g, "Scrap Metal"), supplyCount(g, "Scrap Components")], [0, 0]);
  check("the log says what it took", lines.some((l) => typeof l === "string" && l.includes("takes 2 Scrap Metal, 1 Scrap Components, 1 toolkit charge out of the hold")), true);
  // The toolkit the probe stocked came out of the catalog with its full load of charges, so it has
  // some left; the materials are what ran out, and they're what stops the next segment's work.
  check("and the next point is unaffordable", permissionReasons(g, work()), ["Hold is short 2 Scrap Metal", "Hold is short 1 Scrap Components"]);

  // The last point of Progress pays the completion cost on top of its own.
  const last: GameState = structuredClone(g);
  last.ship.projects[0].progress = 5;
  for (const [name, qty] of [["Scrap Metal", 2], ["Scrap Components", 1], ["Basic Adhesive", 2]] as const) stockItem(last, name, qty, { category: "Material" });
  advanceProject(last, "frame", 1);
  check("finishing it costs the adhesive too", [last.ship.projects[0].done, supplyCount(last, "Basic Adhesive")], [true, 0]);

  // Hull Repair is priced by what the hull is made of, so a better ship costs rarer stock.
  const hull: Project = { ...frame, id: "hull", name: "Hull Repair", required: 2, progress: 0 };
  const plated: GameState = structuredClone(g);
  plated.ship.hullTier = 3;
  check("a patched hull is mended with scrap", projectBill(g, hull).text, "3 Scrap Metal, 1 Basic Adhesive, 1 toolkit charge per Progress");
  check("a plated one needs Neutronium", projectBill(plated, hull).text, "1 Neutronium, 1 Advanced Adhesive, 1 toolkit charge per Progress");

  // Labour-only projects stay free, and nothing is charged for Progress that didn't land.
  check("treating someone's Stress costs the hold nothing", projectBill(g, { name: "Stress Recovery" }).text, "");
  const nothing: GameState = structuredClone(g);
  for (const [name, qty] of [["Scrap Metal", 2], ["Scrap Components", 1]] as const) stockItem(nothing, name, qty, { category: "Material" });
  advanceProject(nothing, "frame", 0);
  check("and no Progress takes no materials", supplyCount(nothing, "Scrap Metal"), 2);

  // A filed project keeps its record but stops asking for segments.
  const filed: GameState = structuredClone(nothing);
  check("an underway project is on the menu", openProjects(filed).map((p) => p.name), ["Mech Frame (Tier I)"]);
  filed.ship.projects[0].archived = true;
  check("archiving takes it off the menu", openProjects(filed), []);
  check("without throwing the record away", filed.ship.projects.length, 1);
  check("and nobody can work on it", taskTerms(filed, { ...newAction(filed, filed.characters[0], "Work on a project"), projectId: "frame" }).blocker, "Mech Frame (Tier I) has been filed away in the archive");
}

// Mech modules cost a segment at the bench, not a line on the Mechs tab.
{
  const g = world();
  const c = g.characters[0];
  c.skills.mechTech = 3;
  const rack = MECH_MODULE_RECIPES.find((r) => r.name.startsWith("External Cargo Rack"))!;
  const build = (name = rack.name) => ({ ...newAction(g, c, "Fabricate Mech Module"), crafts: [name] });
  // The seed hold carries scrap and a toolkit, so the ask is cleared out to be set by hand.
  g.items = g.items.filter((i) => !["Scrap Metal", "Scrap Components", "Basic Adhesive"].includes(i.name) && !/toolkit/i.test(i.name));
  stockItem(g, "Scrap Metal", 4, { category: "Material" });
  stockItem(g, "Scrap Components", 2, { category: "Material" });

  check("every module is on the bench menu", MECH_MODULE_RECIPES.length, MECH_MODULES.length);
  check("a Tier I module is Routine at Mechanical Technician 3", taskTerms(g, build()).routine, true);
  check("and costs the sheet's 2 Energy", taskTerms(g, build()).energy, 2);
  check("the hold is what's short", permissionReasons(g, build()), ["Hold is short 1 Basic Adhesive", "Hold is short 1 Toolkit charges"]);
  check("so it's an ask, not an option", skipped(g).some((s) => s.startsWith("Fabricate Mech Module")), true);

  stockItem(g, "Basic Adhesive", 1, { category: "Material" });
  stockItem(g, "Improvised Toolkit", 1, { category: "Equipment", maxCharges: 1 });
  check("stocked, the task is offered", tasks(g).includes("Fabricate Mech Module"), true);
  check("and clear to build", permissionReasons(g, build()), []);
  resolveAction(g, (g.actions.push(build()), g.actions.at(-1)!.id), { status: "success", energy: 0, outcome: "" });
  check("the module lands in the hold", supplyCount(g, rack.name), 1);
  check("and the materials are gone", [supplyCount(g, "Scrap Metal"), supplyCount(g, "Basic Adhesive")], [2, 0]);

  // A Tier III module needs the better bench and the better crafter, and costs an Energy more.
  const vault = MECH_MODULE_RECIPES.find((r) => r.tier === "Tier III")!;
  check("a Tier III module isn't Routine for a Tier I hand", taskTerms(g, build(vault.name)).routine, false);
  check("and asks the extra Energy", taskTerms(g, build(vault.name)).energy, 3);
  check("while a Makeshift Bench can't take its materials", taskTerms(g, build(vault.name)).blocker, "Tier III materials need an Advanced Fabricator");
}

// Surgery spends the patient's segment as well as the surgeon's.
{
  const g = world();
  const [medic, patient] = g.characters;
  medic.skills.surgery = 5;
  const cut = () => ({ ...newAction(g, medic, "Surgery"), subjectId: patient.id });

  check("it needs to know who's on the table", taskTerms(g, { ...newAction(g, medic, "Surgery") }).blocker, "Pick who's on the table");
  check("and nobody operates on themselves", taskTerms(g, { ...newAction(g, medic, "Surgery"), subjectId: medic.id }).blocker, "Nobody operates on themselves");
  check("with a patient named, it stands", taskTerms(g, cut()).blocker, null);

  // Once the surgery is planned, the patient's own segment is gone.
  g.actions.push(cut());
  check("the patient is on the table", surgeryOn(g, patient.id)?.characterId, medic.id);
  check("so their tasks are refused by name", taskTerms(g, newAction(g, patient, "Rest")).blocker, `${medic.name} has them on the table, so the segment isn't theirs`);
  check("nothing is left on their menu", tasks(g, 1), []);
  check("while the surgeon's own segment is their own", taskTerms(g, cut()).blocker, null);
  // The bench used to ignore every situational blocker, so Fabricate stayed on a patient's menu —
  // and on the menu of a survivor two decks into a derelict.
  check("not even the workbench", taskTerms(g, { ...newAction(g, patient, "Fabricate Common Item"), crafts: ["Improvised Medkit"] }).routine, false);

  // The other way about: a patient who already committed keeps the segment until it's withdrawn.
  const busy = world();
  busy.characters[0].skills.surgery = 5;
  busy.actions.push(newAction(busy, busy.characters[1], "Rest"));
  check("a committed survivor can't be cut into", taskTerms(busy, { ...newAction(busy, busy.characters[0], "Surgery"), subjectId: busy.characters[1].id }).blocker, `${busy.characters[1].name} is already committed to Rest — withdraw it first`);
}

// Raw Food is food: the crew eats the greenhouse, but only once the galley is bare.
{
  const g = world();
  g.items = g.items.filter((i) => !FOOD_ITEMS.includes(i.name as (typeof FOOD_ITEMS)[number]));
  check("an empty hold feeds nobody", foodCount(g), 0);
  stockItem(g, "Raw Food", 5, { category: "Supply", tier: "Tier I" });
  check("but produce counts", foodCount(g), 5);
  check("and nobody is told they're starving beside it", pressing(g).includes("Food: 5 rations"), true);
  check("it's eaten last of all, after the cooked meals", FOOD_ITEMS.at(-1), "Raw Food");
}

// Organ Failure is the one injury that costs Max HP, and only once the Surgery is behind them.
{
  const g = world();
  const c = g.characters[0];
  const before = maxHp(c);
  const organ = INJURY_TABLE.find((e) => e.name === "Organ Failure")!;
  check("it's the only injury that names a Max HP loss", INJURY_TABLE.filter((e) => e.maxHp).map((e) => e.name), ["Organ Failure"]);

  addInjury(g, c, organ, []);
  check("carrying it costs nothing yet", maxHp(c), before);

  c.hp = before;
  const out: string[] = [];
  operate(c, c.injuries[0].id, out);
  check("surviving it costs 2 Max HP", maxHp(c), before - 2);
  check("and the HP above the new cap is gone", c.hp, before - 2);
  check("the log says so", out.some((l) => l.includes(`Organ Failure leaves ${c.name} -2 Max HP`)), true);
  check("and the sheet can show where it went", injuryMaxHpSources(c), ["Organ Failure -2"]);

  c.injuries = [];
  check("healing it gives the 2 back", maxHp(c), before);
}

// A Deadly injury allows four segments wherever in the day it lands, rolling into the next day.
{
  const g = world();
  const c = g.characters[0];
  g.day = 3;
  g.segment = 2; // Evening
  addInjury(g, c, INJURY_TABLE.find((e) => e.name === "Crushed Torso")!, []);
  const due = c.injuries[0].deadline!;
  check("the deadline rolls into tomorrow", due, { day: 4, segment: 1 });
  check("and that is four segments of grace", segmentsLeft(g, due), 4);
  check("nobody is overdue yet", overdueInjuries(g, c), []);

  g.segment = 3; // Night of the same day
  check("three left the next segment", segmentsLeft(g, due), 3);
  g.day = 4;
  g.segment = 1; // the deadline segment itself
  check("the deadline segment is still a chance", [segmentsLeft(g, due), overdueInjuries(g, c).length], [1, 0]);
  g.segment = 2;
  check("past it, they are out of time", [segmentsLeft(g, due), overdueInjuries(g, c).length], [0, 1]);

  // The window was clamped to the end of the day, so a wound at Night left almost no time at all.
  const night = world();
  night.segment = 3;
  addInjury(night, night.characters[0], INJURY_TABLE.find((e) => e.name === "Brain Swelling")!, []);
  check("a wound at Night gets the same four", segmentsLeft(night, night.characters[0].injuries[0].deadline!), 4);
}

// Stop Bleeding is gone: First Aid clears Bleeding with its spare sixes.
{
  const g = world();
  check("the task is off the board", SHIPBOARD_TASKS.some((t) => t.name === "Stop Bleeding"), false);
  check("and off every menu", tasks(g).includes("Stop Bleeding"), false);
  check("First Aid says it clears conditions", SHIPBOARD_TASKS.find((t) => t.name === "First Aid: Minor Injury")!.result.includes("Bleeding included"), true);
}
// A cell holds as many days as it says it does. `normalizeGame` used to delete the grid's remaining
// charge, and it runs on every load and every sync, so every cell burned out after a single night.
{
  const g = world();
  g.items = g.items.filter((i) => !POWER_CELLS.some((c) => c.name === i.name));
  stockItem(g, "Power Cell", 2, { category: "Equipment" });
  g.ship.gridCell = "Power Cell";

  const night = () => { const out: string[] = []; burnDailyPower(g, out); return out.join(" "); };
  check("the first night loads a cell", night(), "🔌 A Power Cell is loaded into the grid (2 days of power). The grid has 1 day of charge left.");
  check("and takes one cell out of the hold", supplyCount(g, "Power Cell"), 1);
  check("the charge survives a reload", powerDaysLeft(normalizeGame(structuredClone(g))), 1);
  check("the second night runs on the same cell", night(), "🔌 That charge is spent: tomorrow needs another Power Cell.");
  check("so the hold still has the spare", supplyCount(g, "Power Cell"), 1);
  check("the third night loads it", night().startsWith("🔌 A Power Cell is loaded"), true);
  check("and that's the hold empty", supplyCount(g, "Power Cell"), 0);
}

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
