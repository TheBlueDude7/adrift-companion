import "server-only";

import { skillLevel } from "../derive";
import { pushLog } from "../log";
import { SKILLS } from "../rules";
import type { Character } from "../types";
import { createSimClient } from "./client";
import { buildCharacter, buildLine, resolveBuild } from "./create";
import { addUsage, configuredProviders, isProvider, PROVIDERS, PROVIDER_KEYS, type Provider, type Usage } from "./models";
import { decideCreate } from "./player";
import { type Style } from "./styles";
import { noProvidersMessage, withCampaignLock } from "./table";

/** A roster seat as a caller describes it: who builds, and how they lean. There's no character yet. */
export type RosterSeat = { provider?: unknown; style?: unknown };
export type Recruiter = { provider: Provider; style: string };

export type SimRecruit = {
  character: string;
  player: { provider: string; model: string; style: string };
  usage: Usage;
  background: string;
  specialty: string;
  /** The named spread and shape they took. */
  build: string;
  /** What the finished sheet reads, at the levels the app will show. */
  sheet: string;
  pitch: string;
  reason: string;
  /** Where the reply had to be corrected to stay legal: a misread background, a repeated skill. */
  corrections: string[];
  unclear?: string;
};

export type RosterReport = {
  /** Survivors already aboard when the roster started, so the GM sees what was built around. */
  existing: string[];
  recruits: SimRecruit[];
  failed: string[];
  /** Skills nobody aboard has any level in once the roster is done: the crew's blind spots. */
  gaps: string[];
  usage: Usage;
};

/** A ceiling on the crew, so a stray command can't fill the ship. */
const MAX_CREW = 8;

const DEFAULT_STYLES: Style[] = ["cautious", "bold", "specialist", "caretaker"];

/**
 * Who builds, and in what order. Unseated slots take the configured providers in turn, so four keys
 * make four survivors by four models without the caller naming anything. The order is the point:
 * the first seat chooses freely and every seat after it is answering what already exists.
 */
export function seatRecruiters(seats?: RosterSeat[], count?: number): { table: Recruiter[] } | { error: string; status: number } {
  const ready = configuredProviders();
  if (!ready.length) return { error: noProvidersMessage(), status: 409 };
  const wanted: RosterSeat[] = seats ?? Array.from({ length: count ?? ready.length }, () => ({}));
  if (!wanted.length) return { error: "No survivors to make.", status: 400 };
  if (wanted.length > MAX_CREW) return { error: `That's more than a crew: ${MAX_CREW} survivors is the limit.`, status: 400 };
  const table: Recruiter[] = [];
  for (const [i, seat] of wanted.entries()) {
    if (seat.provider !== undefined && !isProvider(seat.provider)) return { error: `Unknown model '${String(seat.provider)}'. Pick one of: ${PROVIDER_KEYS.join(", ")}.`, status: 400 };
    if (seat.style !== undefined && (typeof seat.style !== "string" || seat.style.length > 1000)) return { error: "A playstyle is a name from the list or a short description.", status: 400 };
    const provider = (seat.provider as Provider | undefined) ?? ready[i % ready.length];
    if (!ready.includes(provider)) return { error: `${PROVIDERS[provider].label} has no API key: set ${PROVIDERS[provider].keyEnv}.`, status: 409 };
    table.push({ provider, style: (seat.style as string | undefined) ?? DEFAULT_STYLES[i % DEFAULT_STYLES.length] });
  }
  return { table };
}

/** Skills nobody aboard has any level in, counting what backgrounds grant. */
const blindSpots = (crew: Character[]) => SKILLS.filter((s) => !crew.some((c) => skillLevel(c, s.key) > 0)).map((s) => s.name);

/**
 * Build a crew one survivor at a time. Each recruiter reads the campaign fresh, so it sees the
 * finished sheets of everyone made before it and nothing of whoever comes after — which is what
 * lets a later model cover a job the earlier ones left open.
 *
 * The survivor goes in over the ordinary player endpoints: the server lets a player holding no
 * character create exactly one and hands it straight to them. The seat then lets go of it, so it
 * sits like any GM-made survivor and `/sim` can claim it under its own name later.
 */
export async function runRoster(base: string, code: string, table: Recruiter[], directive: string): Promise<RosterReport> {
  return withCampaignLock(code, async () => {
    const report: RosterReport = { existing: [], recruits: [], failed: [], gaps: [], usage: { input: 0, cached: 0, output: 0 } };
    let crew: Character[] = [];
    let read = false;

    for (const [i, seat] of table.entries()) {
      const label = PROVIDERS[seat.provider].label;
      // Each recruiter needs a slot of its own: `join` hands a returning player their old one by name.
      const client = createSimClient(base, code, `recruit:${i}`, `${label} · recruit ${i + 1}`);
      try {
        const game = await client.snapshot();
        crew = game.characters;
        if (!read) {
          report.existing = crew.map((c) => `${c.name}${c.background ? ` (${c.background})` : ""}`);
          read = true;
        }
        if (crew.length >= MAX_CREW) {
          report.failed.push(`${label}: there are already ${crew.length} survivors aboard, which is the limit.`);
          continue;
        }

        const pick = await decideCreate({ provider: seat.provider, style: seat.style }, crew, directive);
        const build = resolveBuild(pick);
        const character = buildCharacter(build, label);

        await client.change((g) => {
          g.characters.push(character);
          pushLog(g, `${character.name} joins the crew: ${build.background.name}, ${build.specialty}.`, "info", label);
        });
        await client.claim(null);
        crew = [...crew, character];

        report.recruits.push({
          character: character.name,
          player: { provider: label, model: pick.model, style: seat.style },
          usage: pick.usage,
          background: build.background.name,
          specialty: build.specialty,
          build: `${build.spread.label} · ${build.shape.label}`,
          sheet: buildLine(character),
          pitch: pick.pitch,
          reason: pick.reason,
          corrections: build.corrections,
          unclear: pick.unclear,
        });
        report.usage = addUsage(report.usage, pick.usage);
      } catch (e) {
        console.error("[adrift] making a survivor failed", label, e);
        report.failed.push(`${label}: ${e instanceof Error ? e.message : "something went wrong"}`);
      }
    }

    report.gaps = blindSpots(crew);
    return report;
  });
}
