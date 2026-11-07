import { after } from "next/server";
import { askRules, type Reply } from "@/lib/discord/ask";
import { env, NO_MENTIONS, postMessage, replyToInteraction, verifyDiscord } from "@/lib/discord/rest";
import { addRuling, allRulings, approvedRulings, decideRuling, type Ruling } from "@/lib/discord/rulings";
import { SEGMENTS } from "@/lib/rules";
import { selfBase } from "@/lib/sim/client";
import { runRoster, seatRecruiters } from "@/lib/sim/roster";
import { runCrew, seatCrew, simRunning } from "@/lib/sim/table";
import { rosterTranscript, transcript } from "@/lib/sim/transcript";
import { getRoom } from "@/lib/sync/rooms";

type Option = { name: string; value: string };
type Interaction = {
  type: number;
  token: string;
  channel_id?: string;
  member?: { user: { id: string } };
  user?: { id: string };
  data?: { name?: string; options?: Option[]; custom_id?: string; components?: { components: { custom_id: string; value: string }[] }[] };
  message?: { content: string };
};

/** A simulated segment is several model calls, and it runs in `after()` once the interaction is deferred. */
export const maxDuration = 300;

const EPHEMERAL = 64;
const COOLDOWN_MS = 15_000;
const lastAsked = new Map<string, number>();

const json = (body: unknown) => Response.json(body);
const message = (content: string, flags = 0) => json({ type: 4, data: { content, flags, allowed_mentions: NO_MENTIONS } });
const option = (i: Interaction, name: string) => i.data?.options?.find((o) => o.name === name)?.value?.trim() ?? "";

/** What's configured, without exposing any secret. */
export function GET() {
  const e = env();
  return json({ publicKey: !!e.publicKey, appId: !!e.appId, botToken: !!e.botToken, gm: e.gmIds.length > 0, gmChannel: !!e.gmChannel, anthropic: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscord(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp"), env().publicKey)) {
    return new Response("Bad signature", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;
  const userId = i.member?.user.id ?? i.user?.id ?? "";
  const isGM = env().gmIds.includes(userId);

  if (i.type === 1) return json({ type: 1 });

  if (i.type === 2) {
    switch (i.data?.name) {
      case "rules":
        return ask(i, userId);
      case "rulings": {
        const list = await approvedRulings();
        after(() => replyToInteraction(i.token, `**GM rulings** (these override the rulebook)\n${list.map((r, n) => `${n + 1}. ${r.text}`).join("\n\n")}`, { ephemeral: true }).catch((e) => console.error("[adrift] listing rulings failed", e)));
        return json({ type: 5, data: { flags: EPHEMERAL } });
      }
      case "ruling": {
        if (!isGM) return message("Only the GM can add rulings.", EPHEMERAL);
        const text = option(i, "text");
        await addRuling({ status: "approved", text, question: "(added by the GM)", summary: text.slice(0, 120), proposal: text, askedBy: userId, channelId: i.channel_id ?? "", decidedAt: Date.now() });
        return message(`📜 New GM ruling: ${text}`);
      }
      case "sim":
        return sim(i, isGM, new URL(request.url).origin);
      case "roster":
        return roster(i, isGM, new URL(request.url).origin);
    }
    return message("I don't know that command.", EPHEMERAL);
  }

  if (i.type === 3) {
    const [, action, id] = (i.data?.custom_id ?? "").split(":");
    if (!isGM) return message("Only the GM can rule on this.", EPHEMERAL);
    if (action === "edit") {
      const proposal = (await allRulings()).find((r) => r.id === id)?.proposal ?? "";
      return json({
        type: 9,
        data: {
          custom_id: `ruling-edit:${id}`,
          title: "Write the ruling",
          components: [{ type: 1, components: [{ type: 4, custom_id: "text", label: "Ruling", style: 2, value: proposal.slice(0, 4000), required: true, max_length: 1500 }] }],
        },
      });
    }
    const r = await decideRuling(id, action === "approve" ? "approved" : "rejected");
    if (!r) return message("That conflict has already been decided.", EPHEMERAL);
    if (r.status === "approved") after(() => announce(r));
    return decided(i, r);
  }

  if (i.type === 5) {
    if (!isGM) return message("Only the GM can rule on this.", EPHEMERAL);
    const id = (i.data?.custom_id ?? "").split(":")[1];
    const text = i.data?.components?.[0]?.components[0]?.value?.trim() ?? "";
    const r = text ? await decideRuling(id, "approved", text) : null;
    if (!r) return message("That conflict has already been decided.", EPHEMERAL);
    after(() => announce(r));
    return decided(i, r);
  }

  return new Response("Unsupported interaction", { status: 400 });
}

function ask(i: Interaction, userId: string) {
  const question = option(i, "question");
  if (!question) return message("Ask a question, for example: `/rules question: How does Armor work?`", EPHEMERAL);
  const wait = (lastAsked.get(userId) ?? 0) + COOLDOWN_MS - Date.now();
  if (wait > 0) return message(`One question at a time: try again in ${Math.ceil(wait / 1000)} seconds.`, EPHEMERAL);
  lastAsked.set(userId, Date.now());
  after(async () => {
    try {
      const reply = await askRules(question);
      const flag = reply.conflict ? await flagConflict(reply, question, userId, i.channel_id ?? "") : "";
      await replyToInteraction(i.token, `> ${question.replace(/\n/g, "\n> ")}\n\n${reply.answer}${flag}`);
    } catch (e) {
      console.error("[adrift] rules question failed", e);
      await Promise.all([
        replyToInteraction(i.token, "Sorry, I couldn't answer that right now. Try again in a moment.").catch(() => undefined),
        reportFailure(question, userId, e),
      ]);
    }
  });
  return json({ type: 5 });
}

/**
 * Run a segment for the simulated crew. The GM's Discord id is the authority here, so no campaign
 * key is needed: the survivors still act over the player endpoints, which referee them regardless.
 */
function sim(i: Interaction, isGM: boolean, origin: string) {
  if (!isGM) return message("Only the GM can run simulated survivors.", EPHEMERAL);
  const code = (option(i, "code") || process.env.ADRIFT_CAMPAIGN || "").toUpperCase();
  if (!code) return message("Which campaign? Pass `code:` or set ADRIFT_CAMPAIGN.", EPHEMERAL);
  const situation = option(i, "situation");
  if (!situation) return message("Describe the situation the crew is facing.", EPHEMERAL);
  const commit = !i.data?.options?.some((o) => o.name === "ask" && String(o.value) === "true");
  const answers = option(i, "answers");
  if (simRunning(code)) return message("A segment is already running for that campaign. Give it a moment.", EPHEMERAL);

  after(async () => {
    try {
      const room = await getRoom(code);
      if (!room) return void (await replyToInteraction(i.token, `No campaign with the code ${code}.`, { ephemeral: true }));
      const seated = seatCrew(room.game);
      if ("error" in seated) return void (await replyToInteraction(i.token, seated.error, { ephemeral: true }));
      const base = await selfBase(origin);
      const report = await runCrew(base, room.code, seated.table, situation, { answers, commit });
      await replyToInteraction(i.token, `**${SEGMENTS[room.game.segment]}, Day ${room.game.day}** — ${situation}\n\n${transcript(report, { committed: commit })}`);
    } catch (e) {
      console.error("[adrift] simulated segment failed", e);
      await replyToInteraction(i.token, `The segment failed: ${e instanceof Error ? e.message : "something went wrong"}`, { ephemeral: true }).catch(() => undefined);
    }
  });
  return json({ type: 5 });
}

/**
 * Build a crew of simulated survivors, one model each, in the order they're seated. Every survivor
 * after the first sees the sheets already made, so the crew is assembled rather than four strangers.
 */
function roster(i: Interaction, isGM: boolean, origin: string) {
  if (!isGM) return message("Only the GM can run simulated survivors.", EPHEMERAL);
  const code = (option(i, "code") || process.env.ADRIFT_CAMPAIGN || "").toUpperCase();
  if (!code) return message("Which campaign? Pass `code:` or set ADRIFT_CAMPAIGN.", EPHEMERAL);
  const directive = option(i, "brief");
  const asked = Number(i.data?.options?.find((o) => o.name === "count")?.value ?? 0);
  const count = Number.isFinite(asked) && asked > 0 ? Math.round(asked) : undefined;
  if (simRunning(code)) return message("A simulated run is already going for that campaign. Give it a moment.", EPHEMERAL);

  after(async () => {
    try {
      const room = await getRoom(code);
      if (!room) return void (await replyToInteraction(i.token, `No campaign with the code ${code}.`, { ephemeral: true }));
      const seated = seatRecruiters(undefined, count);
      if ("error" in seated) return void (await replyToInteraction(i.token, seated.error, { ephemeral: true }));
      const base = await selfBase(origin);
      const report = await runRoster(base, room.code, seated.table, directive);
      const header = `**Building a crew for ${room.game.ship.name}**${directive ? ` — ${directive}` : ""}`;
      await replyToInteraction(i.token, `${header}\n\n${rosterTranscript(report)}`);
    } catch (e) {
      console.error("[adrift] building a crew failed", e);
      await replyToInteraction(i.token, `The roster failed: ${e instanceof Error ? e.message : "something went wrong"}`, { ephemeral: true }).catch(() => undefined);
    }
  });
  return json({ type: 5 });
}

/**
 * Players get the plain apology; the GM channel gets the error itself. The usual causes are a missing
 * key, a rate limit, or an empty balance, all of which are the GM's to fix and would otherwise only
 * be visible in the host's logs.
 */
async function reportFailure(question: string, askedBy: string, e: unknown) {
  const { gmChannel } = env();
  if (!gmChannel) return;
  const detail = (e instanceof Error ? e.message : String(e)).slice(0, 1500);
  const content = `⚠️ **A rules question failed.**\n**Question** from <@${askedBy}>: ${question.slice(0, 300)}\n\`\`\`\n${detail}\n\`\`\``;
  await postMessage(gmChannel, { content, allowed_mentions: NO_MENTIONS }).catch((err) => console.error("[adrift] reporting a failed question failed", err));
}

/** Send a new conflict to the GM channel. Returns the note added to the player's answer. */
async function flagConflict(reply: Reply, question: string, askedBy: string, channelId: string): Promise<string> {
  const c = reply.conflict!;
  if (c.same_as) return "\n\n-# This is already waiting on a GM ruling.";
  const { gmIds, gmChannel } = env();
  if (!gmChannel || !gmIds.length) return "";
  const r = await addRuling({ status: "pending", text: "", question, summary: c.summary, proposal: c.proposal, askedBy, channelId });
  const content = [
    `${gmIds.map((id) => `<@${id}>`).join(" ")} **Rules conflict:** ${c.summary}`,
    `**Question** from <@${askedBy}>: ${question}`,
    `**Sources:** ${c.sources}`,
    `**Proposed ruling:** ${c.proposal}`,
  ].join("\n").slice(0, 1990);
  await postMessage(gmChannel, {
    content,
    allowed_mentions: { parse: [], users: gmIds },
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Approve", custom_id: `ruling:approve:${r.id}` },
          { type: 2, style: 1, label: "Edit and approve", custom_id: `ruling:edit:${r.id}` },
          { type: 2, style: 4, label: "Reject", custom_id: `ruling:reject:${r.id}` },
        ],
      },
    ],
  });
  return "\n\n-# I've asked the GM to make a ruling on this.";
}

function decided(i: Interaction, r: Ruling) {
  const verdict = r.status === "approved" ? `✅ **Approved:** ${r.text}` : "❌ **Rejected.**";
  return json({ type: 7, data: { content: `${i.message?.content ?? ""}\n\n${verdict}`.slice(0, 2000), components: [], allowed_mentions: NO_MENTIONS } });
}

async function announce(r: Ruling) {
  if (!r.channelId) return;
  await postMessage(r.channelId, { content: `📜 <@${r.askedBy}> The GM has ruled on your question: ${r.text}`.slice(0, 2000), allowed_mentions: { parse: [], users: [r.askedBy] } }).catch((e) =>
    console.error("[adrift] announcing a ruling failed", e),
  );
}
