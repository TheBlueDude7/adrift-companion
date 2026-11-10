// What a shared campaign actually sends down the wire, which is the one thing the other probes can't
// see: they call the rules directly, and a change that never reaches a player's screen still passes.
//   npx tsx --conditions react-server scripts/check-sync.ts
import os from "node:os";
import path from "node:path";
import { uid } from "../src/lib/dice";
import { createInitialState, newCharacter } from "../src/lib/seed";
import { diff } from "../src/lib/sync/ops";
import type { Op } from "../src/lib/sync/ops";
import type { GameState } from "../src/lib/types";

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (wanted ${JSON.stringify(want)})`}`);
}

function world(): GameState {
  const g = createInitialState();
  for (const name of ["Vale", "Okonkwo"]) g.characters.push(newCharacter(name, null, null, "gm"));
  return g;
}

// A room saves itself to disk a moment after every change, so the probe gets its own scratch
// directory. The module reads it once at load, hence the dynamic import below.
process.env.ADRIFT_DATA_DIR = path.join(os.tmpdir(), `adrift-probe-${uid()}`);

void (async () => {
  const { applyOps } = await import("../src/lib/sync/ops");
  const { applyToRoom, createRoom, join, viewFor } = await import("../src/lib/sync/rooms");

  const { room, gmKey } = await createRoom(world());
  const playerKey = `probe-player-${uid()}`;

  /** A connected client: what it was last sent, and the state it has built from that. */
  function client(key: string, name: string) {
    const seen: { version: number; ops: Op[] }[] = [];
    let game = structuredClone(viewFor(room, key));
    join(room, key, name, (event, data) => {
      if (event !== "ops") return;
      const d = data as { version: number; ops: Op[] };
      seen.push(d);
      game = applyOps(game, d.ops);
    }, () => {});
    return { seen, state: () => game };
  }

  const gm = client(gmKey, "GM");
  const player = client(playerKey, "Vale");
  const vale = room.game.characters.find((c) => c.name === "Vale")!;

  // The GM raises an attribute. Both clients have to end up holding the new number.
  const next: GameState = structuredClone(room.game);
  next.characters.find((c) => c.id === vale.id)!.attributes.STR = 7;
  applyToRoom(room, diff(room.game, next), { client: "gm-device", opId: uid() });

  check("the room takes the change", room.game.characters.find((c) => c.id === vale.id)?.attributes.STR, 7);
  check("the GM's client is sent one patch", gm.seen.length, 1);
  check("and holds the new number", gm.state().characters.find((c) => c.id === vale.id)?.attributes.STR, 7);
  check("the player's client is sent one too", player.seen.length, 1);
  check("and it isn't empty", player.seen[0].ops.length > 0, true);
  check("so the player holds the new number without reconnecting", player.state().characters.find((c) => c.id === vale.id)?.attributes.STR, 7);
  check("both patches carry the same version", [gm.seen[0].version, player.seen[0].version], [room.version, room.version]);

  // A player's own edit, which is the case that looked broken: their optimistic change is dropped the
  // moment their echo arrives, so an empty echo leaves them staring at the old number.
  const mine: GameState = structuredClone(room.game);
  mine.characters.find((c) => c.id === vale.id)!.hp = 3;
  applyToRoom(room, diff(room.game, mine), { client: "player-device", opId: uid() });
  check("a player's own edit echoes back to them", player.seen[1]?.ops.length > 0, true);
  check("with the value they just set", player.state().characters.find((c) => c.id === vale.id)?.hp, 3);

  // And the redaction still holds: what a player is sent must never name the GM's side of the table.
  const secret: GameState = structuredClone(room.game);
  secret.threats.push({
    id: uid(),
    name: "Something in the dark",
    band: "unhurt",
    conditions: [],
    known: { defenses: [], facts: [] },
    stats: { hp: 9, maxHp: 9, armor: 0, resist: [], vulnerable: [], immune: [], notes: "bleeds from the second hit" },
  });
  applyToRoom(room, diff(room.game, secret), { client: "gm-device", opId: uid() });
  check("a threat reaches the player", player.state().threats.map((t) => t.name), ["Something in the dark"]);
  check("but its HP does not", JSON.stringify(player.seen.at(-1)!.ops).includes("maxHp"), false);
  check("nor the GM's note", JSON.stringify(player.seen.at(-1)!.ops).includes("bleeds"), false);
  check("while the GM is sent all of it", gm.state().threats[0]?.stats?.maxHp, 9);

  console.log(failures ? `\n${failures} failing` : "\nall good");
  process.exit(failures ? 1 : 0);
})();
