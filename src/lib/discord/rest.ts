import "server-only";

import { createPublicKey, verify } from "node:crypto";

const API = "https://discord.com/api/v10";
// DER header that turns a raw 32-byte Ed25519 key into an SPKI public key.
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

export const env = () => ({
  publicKey: process.env.DISCORD_PUBLIC_KEY ?? "",
  appId: process.env.DISCORD_APPLICATION_ID ?? "",
  botToken: process.env.DISCORD_BOT_TOKEN ?? "",
  gmIds: (process.env.DISCORD_GM_USER_ID ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  gmChannel: process.env.DISCORD_GM_CHANNEL_ID ?? "",
});

/** Discord signs every interaction; anything that fails this check must get a 401. */
export function verifyDiscord(body: string, signature: string | null, timestamp: string | null, publicKeyHex: string): boolean {
  if (!signature || !timestamp || !publicKeyHex) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** Split text into Discord-sized messages, breaking on paragraph or line boundaries. */
export function chunks(text: string, size = 1900): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const cut = Math.max(rest.lastIndexOf("\n\n", size), rest.lastIndexOf("\n", size), rest.lastIndexOf(" ", size));
    const at = cut > size / 2 ? cut : size;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out.length ? out : ["…"];
}

export type Mentions = { parse: string[]; users?: string[] };
export const NO_MENTIONS: Mentions = { parse: [] };

async function call(method: string, url: string, body: unknown, bot = false) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bot) headers.authorization = `Bot ${env().botToken}`;
  const res = await fetch(`${API}${url}`, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Discord ${method} ${url.split("/").slice(0, 3).join("/")} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : ((await res.json()) as { id: string });
}

/** Replace a deferred interaction's "thinking…" message, adding follow-ups when the answer is long. */
export async function replyToInteraction(token: string, text: string, opts: { mentions?: Mentions; ephemeral?: boolean } = {}) {
  const [first, ...more] = chunks(text);
  const allowed_mentions = opts.mentions ?? NO_MENTIONS;
  await call("PATCH", `/webhooks/${env().appId}/${token}/messages/@original`, { content: first, allowed_mentions });
  for (const part of more) await call("POST", `/webhooks/${env().appId}/${token}`, { content: part, allowed_mentions, flags: opts.ephemeral ? 64 : 0 });
}

export async function postMessage(channelId: string, body: { content: string; components?: unknown[]; allowed_mentions?: Mentions }) {
  return call("POST", `/channels/${channelId}/messages`, { allowed_mentions: NO_MENTIONS, ...body }, true);
}