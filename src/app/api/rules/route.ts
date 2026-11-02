import { readFile } from "node:fs/promises";
import path from "node:path";
import { allRulings } from "@/lib/discord/rulings";

const g = globalThis as unknown as { __adriftRulebook?: Promise<string> };

/** The master rulebook as markdown, plus GM rulings approved through the Discord bot. */
export async function GET() {
  const markdown = await (g.__adriftRulebook ??= readFile(path.join(process.cwd(), "content/rules/adrift-rulebook.md"), "utf8"));
  const rulings = (await allRulings()).filter((r) => r.status === "approved").map((r) => ({ id: r.id, title: r.summary || "GM ruling", text: r.text }));
  return Response.json({ markdown, rulings }, { headers: { "Cache-Control": "public, max-age=300" } });
}
