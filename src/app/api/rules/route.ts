import { readFile } from "node:fs/promises";
import path from "node:path";
import { GM_RULE_UPDATES } from "@/data/rule-updates-gm";
import { allRulings } from "@/lib/discord/rulings";
import { CODE_RE, getRoom, isGm } from "@/lib/sync/rooms";

const g = globalThis as unknown as { __adriftRulebook?: Promise<string> };

/**
 * Whether whoever is asking may read the GM's rule updates.
 *
 * The same rule `/api/biology` uses for the catalogue those updates describe: in a shared campaign,
 * only the holder of the GM key; on a device playing alone, whoever is sitting at it, unless the
 * deployment sets ADRIFT_STRICT_BIOLOGY and keeps the GM's material to hosted campaigns.
 */
async function asksAsGm(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return !process.env.ADRIFT_STRICT_BIOLOGY;
  if (!CODE_RE.test(code)) return false;
  const room = await getRoom(code);
  const key = request.headers.get("x-adrift-key");
  return !!room && !!key && key.length <= 200 && isGm(room, key);
}

/** The master rulebook as markdown, rules updates approved through the Discord bot, and the GM's own updates for the GM. */
export async function GET(request: Request) {
  const read = () => readFile(path.join(process.cwd(), "content/rules/adrift-rulebook.md"), "utf8");
  const markdown = await (process.env.NODE_ENV === "production" ? (g.__adriftRulebook ??= read()) : read());
  const rulings = (await allRulings()).filter((r) => r.status === "approved").map((r) => ({ id: r.id, title: r.summary || "Rules update", text: r.text }));
  const gmUpdates = (await asksAsGm(request)) ? GM_RULE_UPDATES : [];
  // The answer now depends on who asked, so no shared cache may keep one person's copy for another.
  return Response.json({ markdown, rulings, gmUpdates }, { headers: { "Cache-Control": "private, max-age=300", Vary: "x-adrift-key" } });
}
