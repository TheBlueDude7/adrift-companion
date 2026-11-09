import "server-only";

import { uid } from "../dice";
import { pushLog } from "../log";
import { createSimClient } from "./client";
import { addUsage, PROVIDERS, reason, type Usage } from "./models";
import { decideDebrief } from "./player";
import type { Player } from "./table";
import { withCampaignLock } from "./table";

export type DebriefRemark = {
  character: string;
  player: { provider: string; model: string; style: string };
  usage: Usage;
  /** What they say at the debrief. */
  said: string;
  /** The standing order they added, or null when they had nothing to add. */
  lesson: string | null;
  unclear?: string;
};

export type DebriefReport = { from: string; remarks: DebriefRemark[]; failed: string[]; usage: Usage };

/**
 * The crew talks over a job that's finished, and writes down what they'd do differently.
 *
 * This is the one pass that leaves the crew changed rather than the campaign: a lesson goes on the
 * state and is read by every survivor from then on, so a doctrine with a hole in it can be mended.
 * It runs in order, and each survivor reads the lessons already written — including the ones added
 * a moment ago by the person before them — which is what keeps four models from writing the same
 * sentence four times.
 *
 * Lessons go in over the ordinary player endpoints like everything else: the server only accepts
 * one signed in the speaker's own name, and nobody can revise what another survivor wrote.
 */
export async function runDebrief(base: string, code: string, table: Player[], from: string): Promise<DebriefReport> {
  return withCampaignLock(code, async () => {
    const report: DebriefReport = { from, remarks: [], failed: [], usage: { input: 0, cached: 0, output: 0 } };

    for (const seat of table) {
      const label = PROVIDERS[seat.provider].label;
      const client = createSimClient(base, code, seat.characterId, `${label} · ${seat.name}`);
      try {
        const game = await client.snapshot();
        await client.claim(seat.characterId);
        const c = game.characters.find((x) => x.id === seat.characterId);
        if (!c) throw new Error("That character is no longer in the campaign.");

        const said = await decideDebrief(game, c, { provider: seat.provider, style: seat.style }, from);
        const keep = said.keep && !!said.lesson.trim();
        if (keep) {
          await client.change((g) => {
            g.doctrine = [...(g.doctrine ?? []), { id: uid(), text: said.lesson.trim().slice(0, 300), by: c.name, from, day: g.day }];
            pushLog(g, `${c.name}, on ${from}: ${said.lesson.trim()}`, "day", label);
          });
        }
        report.remarks.push({
          character: c.name,
          player: { provider: label, model: said.model, style: seat.style },
          usage: said.usage,
          said: said.said,
          lesson: keep ? said.lesson.trim() : null,
          unclear: said.unclear,
        });
        report.usage = addUsage(report.usage, said.usage);
      } catch (e) {
        console.error("[adrift] a survivor couldn't be debriefed", seat.name, e);
        report.failed.push(`${seat.name} (${label}): ${reason(e)}`);
      }
    }
    return report;
  });
}
