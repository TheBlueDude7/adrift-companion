import type { SimReport } from "./table";

/** Plain markdown, for Discord or anywhere else a human reads the turn. */
export function transcript(report: SimReport, { committed = true }: { committed?: boolean } = {}): string {
  const parts: string[] = [];
  for (const t of report.turns) {
    const lines = [
      `**${t.character}** — ${t.player.provider}, ${t.player.style}`,
      `> ${t.speech.replace(/\n/g, "\n> ")}`,
      `**Task:** ${t.task}`,
      `**Approach:** ${t.approach}`,
      t.questions.length ? `**Asks the GM:**\n${t.questions.map((q) => `- ${q}`).join("\n")}` : "",
      t.outcome.length ? `**Result:**\n${t.outcome.map((x) => `- ${x}`).join("\n")}` : "",
      t.unclear ? `⚠️ **Unclear to them:** ${t.unclear}` : "",
    ];
    parts.push(lines.filter(Boolean).join("\n"));
  }
  if (report.failed.length) parts.push(`**Couldn't play:**\n${report.failed.map((x) => `- ${x}`).join("\n")}`);

  // Tasks the sim can't offer are the same every segment, so show them once rather than per survivor.
  const gaps = [...new Set(report.turns.flatMap((t) => t.skipped))];
  const u = report.usage;
  const cachedShare = u.cached + u.input > 0 ? Math.round((u.cached / (u.cached + u.input)) * 100) : 0;
  parts.push(
    [
      committed ? "" : "-# Nothing was submitted. Answer their questions and run it again with `answers:` to commit.",
      `-# ${u.input.toLocaleString()} fresh + ${u.cached.toLocaleString()} cached input tokens (${cachedShare}% cached), ${u.output.toLocaleString()} out.`,
      gaps.length ? `-# ${gaps.length} tasks weren't offered this segment (facilities, materials, or a map target).` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return parts.join("\n\n");
}
