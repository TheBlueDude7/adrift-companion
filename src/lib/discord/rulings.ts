import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { RULE_UPDATES } from "@/data/rule-updates";

export type Ruling = {
  id: string;
  status: "pending" | "approved" | "rejected";
  /** The final ruling, once approved. */
  text: string;
  question: string;
  summary: string;
  proposal: string;
  askedBy: string;
  channelId: string;
  createdAt: number;
  decidedAt?: number;
};

/** The recent rules updates. Most are already in the rulebook text; a few have no passage there. */
export const SEED_RULINGS: Pick<Ruling, "id" | "text">[] = RULE_UPDATES;

const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const FILE = path.join(process.env.ADRIFT_DATA_DIR ?? (volume ? volume : path.join(process.cwd(), "data")), "rulings.json");

const g = globalThis as unknown as { __adriftRulings?: Promise<Ruling[]>; __adriftRulingsWrite?: Promise<void> };

function load(): Promise<Ruling[]> {
  return (g.__adriftRulings ??= readFile(FILE, "utf8").then((t) => JSON.parse(t) as Ruling[]).catch(() => []));
}

async function save(list: Ruling[]) {
  const write = (g.__adriftRulingsWrite ?? Promise.resolve()).then(async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(`${FILE}.tmp`, JSON.stringify(list, null, 2));
    await rename(`${FILE}.tmp`, FILE);
  });
  g.__adriftRulingsWrite = write.catch((e) => console.error("[adrift] saving rulings failed", e));
  await write;
}

export async function allRulings() {
  return load();
}

/** Approved rulings, seeds first, as the bot and `/rulings` show them. */
export async function approvedRulings(): Promise<Pick<Ruling, "id" | "text">[]> {
  return [...SEED_RULINGS, ...(await load()).filter((r) => r.status === "approved")];
}

export async function pendingRulings() {
  return (await load()).filter((r) => r.status === "pending");
}

export async function addRuling(r: Omit<Ruling, "id" | "createdAt">): Promise<Ruling> {
  const list = await load();
  const ruling: Ruling = { ...r, id: randomBytes(4).toString("hex"), createdAt: Date.now() };
  list.push(ruling);
  await save(list);
  return ruling;
}

export async function decideRuling(id: string, status: "approved" | "rejected", text?: string): Promise<Ruling | null> {
  const list = await load();
  const r = list.find((x) => x.id === id);
  if (!r || r.status !== "pending") return null;
  r.status = status;
  r.text = status === "approved" ? (text ?? r.proposal) : "";
  r.decidedAt = Date.now();
  await save(list);
  return r;
}
