import { readFile } from "node:fs/promises";
import path from "node:path";
import { allRulings } from "@/lib/discord/rulings";

const g = globalThis as unknown as { __adriftRulebook?: Promise<string> };

/** The master rulebook as markdown, plus rules updates approved through the Discord bot. */
export async function GET() {
  const read = () => readFile(path.join(process.cwd(), "content/rules/adrift-rulebook.md"), "utf8");
  const markdown = await (process.env.NODE_ENV === "production" ? (g.__adriftRulebook ??= read()) : read());
  const rulings = (await allRulings()).filter((r) => r.status === "approved").map((r) => ({ id: r.id, title: r.summary || "Rules update", text: r.text }));
  return Response.json({ markdown, rulings }, { headers: { "Cache-Control": "public, max-age=300" } });
}
