import type { RosterReport } from "./roster";
import type { SimReport } from "./table";

const tokens = (u: { input: number; cached: number; output: number }) => {
  const share = u.cached + u.input > 0 ? Math.round((u.cached / (u.cached + u.input)) * 100) : 0;
  return `-# ${u.input.toLocaleString()} fresh + ${u.cached.toLocaleString()} cached input tokens (${share}% cached), ${u.output.toLocaleString()} out.`;
};

/** The crew as it was built, in order, so the GM can read each choice against the ones before it. */
export function rosterTranscript(report: RosterReport): string {
  const parts: string[] = [];
  if (report.existing.length) parts.push(`**Already aboard:** ${report.existing.join(", ")}`);

  report.recruits.forEach((r, i) => {
    parts.push(
      [
        `**${i + 1}. ${r.character}** — ${r.player.provider}, ${r.player.style}`,
        `> ${r.pitch.replace(/\n/g, "\n> ")}`,
        `**${r.background}** · ${r.specialty} · ${r.build}`,
        `**Sheet:** ${r.sheet}`,
        `**Why:** ${r.reason}`,
        r.corrections.length ? `**Corrected:** ${r.corrections.join("; ")}` : "",
        r.unclear ? `⚠️ **Unclear to them:** ${r.unclear}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  if (report.failed.length) parts.push(`**Couldn't build:**\n${report.failed.map((x) => `- ${x}`).join("\n")}`);
  parts.push(
    [
      report.gaps.length ? `**Nobody aboard can:** ${report.gaps.join(", ")}.` : "**Every skill has someone with a level in it.**",
      tokens(report.usage),
      report.recruits.length ? "-# Run `/sim` to play a segment with them." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return parts.join("\n\n");
}

/** Plain markdown, for Discord or anywhere else a human reads the turn. */
export function transcript(report: SimReport, { committed = true }: { committed?: boolean } = {}): string {
  const parts: string[] = [];

  // The huddle stays out of the campaign log, so the transcript is the only place the GM reads it.
  for (const round of [1, 2]) {
    const said = report.briefing.filter((r) => r.round === round);
    if (!said.length) continue;
    parts.push(
      [
        round === 1 ? "**The crew talks it over**" : "**Second pass**",
        ...said.map((r) => `**${r.character}** (${r.player}): “${r.say}”\n-# Leaning: ${r.intent}`),
      ].join("\n\n"),
    );
  }

  for (const t of report.turns) {
    const lines = [
      `**${t.character}** — ${t.player.provider}, ${t.player.style}`,
      `> ${t.speech.replace(/\n/g, "\n> ")}`,
      `**Task:** ${t.task}`,
      `**Approach:** ${t.approach}`,
      // Movement is the GM's to apply, so it's called out rather than buried in the approach.
      t.move ? `**Wants to move to:** ${t.move}` : "",
      t.questions.length ? `**Asks the GM:**\n${t.questions.map((q) => `- ${q}`).join("\n")}` : "",
      t.outcome.length ? `**Result:**\n${t.outcome.map((x) => `- ${x}`).join("\n")}` : "",
      t.unclear ? `⚠️ **Unclear to them:** ${t.unclear}` : "",
    ];
    parts.push(lines.filter(Boolean).join("\n"));
  }
  if (report.failed.length) parts.push(`**Couldn't play:**\n${report.failed.map((x) => `- ${x}`).join("\n")}`);

  // Tasks the sim can't offer are the same every segment, so show them once rather than per survivor.
  const gaps = [...new Set(report.turns.flatMap((t) => t.skipped))];
  parts.push(
    [
      committed ? "" : "-# Nothing was submitted. Answer their questions and run it again with `answers:` to commit.",
      report.turns.some((t) => t.move) ? "-# Moves are yours to make on the Site tab. Nobody has been moved." : "",
      tokens(report.usage),
      gaps.length ? `-# ${gaps.length} tasks weren't offered (facilities, materials, or a map target).` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return parts.join("\n\n");
}
