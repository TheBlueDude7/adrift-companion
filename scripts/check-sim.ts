// The simulated crew's side of an expedition: what they're offered, what they're told, and how many
// tasks they may take. Run with the react-server condition, since the prompt builders are
// server-only modules:
//   npx tsx --conditions react-server scripts/check-sim.ts
import { extraTaskBlocker, newAction, taskTerms } from "../src/lib/actions";
import { startExpedition, markExpeditionTurn, moveTo, scout } from "../src/lib/expedition";
import { createInitialState, newCharacter } from "../src/lib/seed";
import { legalOptions } from "../src/lib/sim/options";
import { site } from "../src/lib/sim/world";
import { diff } from "../src/lib/sync/ops";
import { denyReason } from "../src/lib/sync/permissions";
import { playerView } from "../src/lib/sync/redact";
import type { GameState, SegmentAction } from "../src/lib/types";

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
  check("along with what works anywhere", ["Stop Bleeding", "Reduce Pressure", "Other"].filter((t) => !menu.includes(t)), []);
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

console.log(failures ? `\n${failures} failing` : "\nall good");
process.exit(failures ? 1 : 0);
