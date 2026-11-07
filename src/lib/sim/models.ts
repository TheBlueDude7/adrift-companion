import "server-only";

import { model as anthropicModel } from "../discord/ask";

export type Provider = "anthropic" | "openai" | "xai" | "google";

type Spec = {
  /** What to call this player at the table. */
  label: string;
  keyEnv: string;
  modelEnv: string;
  /** Chat-completions base. Only Anthropic needs its own request shape. */
  base: string;
  /** Identifies this provider's conversational models in its catalogue. */
  hint: string;
  /** Last resort when the catalogue can't be read and no model is configured. */
  fallback: string;
};

/** Google and xAI both serve an OpenAI-compatible endpoint, so only Anthropic needs a second adapter. */
export const PROVIDERS: Record<Provider, Spec> = {
  anthropic: { label: "Claude", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", base: "https://api.anthropic.com/v1", hint: "sonnet", fallback: "claude-sonnet-4-5" },
  openai: { label: "ChatGPT", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", base: "https://api.openai.com/v1", hint: "gpt", fallback: "gpt-4.1" },
  xai: { label: "Grok", keyEnv: "XAI_API_KEY", modelEnv: "XAI_MODEL", base: "https://api.x.ai/v1", hint: "grok", fallback: "grok-3" },
  google: { label: "Gemini", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", base: "https://generativelanguage.googleapis.com/v1beta/openai", hint: "gemini", fallback: "gemini-3.8-flash" },
};

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as Provider[];
export const isProvider = (v: unknown): v is Provider => typeof v === "string" && v in PROVIDERS;

/** Providers with an API key set, in the order they're declared. */
export const configuredProviders = () => PROVIDER_KEYS.filter((p) => !!process.env[PROVIDERS[p].keyEnv]);

export type SystemBlock = { text: string; /** Worth caching across turns: the long, unchanging parts. */ cache?: boolean };
export type Tool = { name: string; description: string; schema: Record<string, unknown> };

/** What the call cost, so caching can be measured instead of assumed. `cached` is input served from a cache. */
export type Usage = { input: number; cached: number; output: number };

/** Node says only "fetch failed" when a connection never lands; the reason sits in the cause. */
export function reason(e: unknown): string {
  if (!(e instanceof Error)) return "something went wrong";
  const cause = e.cause;
  const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return detail && !e.message.includes(detail) ? `${e.message}: ${detail}` : e.message;
}

const ZERO: Usage = { input: 0, cached: 0, output: 0 };
export const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output });

/** The version number in a model id, so `gemini-3.8-flash` outranks `gemini-2.5-flash`. */
function version(id: string): number {
  const m = id.match(/(\d+)(?:\.(\d+))?/);
  return m ? Number(m[1]) + (m[2] ? Number(`0.${m[2]}`) : 0) : 0;
}

/** Models that can't hold a conversation, whatever their name suggests. */
const NOT_CHAT = ["audio", "realtime", "image", "tts", "whisper", "embedding", "transcribe", "moderation", "instruct", "search", "dall-e", "sora", "codex", "veo", "imagen", "embed"];

const g = globalThis as unknown as { __adriftSimModels?: Map<Provider, Promise<string>>; __adriftSimNoForcedTool?: boolean };
const chosen = (g.__adriftSimModels ??= new Map());

/**
 * The newest conversational model the key can reach, so a provider shipping a better one is picked
 * up without a code change. Set the provider's model env var to pin one instead.
 */
function discover(spec: Spec, key: string): Promise<string> {
  return fetch(`${spec.base}/models`, { headers: { Authorization: `Bearer ${key}` } })
    .then((r) => (r.ok ? (r.json() as Promise<{ data?: { id: string; created?: number }[] }>) : Promise.reject(new Error(`${r.status}`))))
    .then((body) => {
      const usable = (body.data ?? []).filter((m) => m.id.includes(spec.hint) && !NOT_CHAT.some((bad) => m.id.includes(bad)));
      if (!usable.length) return spec.fallback;
      // Catalogues are not reliably ordered, so prefer the newest by creation date, and where a
      // catalogue omits dates entirely — Google's does — fall back to the version in the name.
      return usable.reduce((best, m) => {
        const byDate = (m.created ?? 0) - (best.created ?? 0);
        if (byDate !== 0) return byDate > 0 ? m : best;
        return version(m.id) > version(best.id) ? m : best;
      }).id;
    });
}

export function pickModel(provider: Provider): Promise<string> {
  const spec = PROVIDERS[provider];
  const pinned = process.env[spec.modelEnv];
  if (pinned) return Promise.resolve(pinned);
  const key = process.env[spec.keyEnv];
  if (!key) return Promise.reject(new Error(`${spec.keyEnv} is not set.`));
  if (provider === "anthropic") return anthropicModel(key);
  const existing = chosen.get(provider);
  if (existing) return existing;
  const task = discover(spec, key).catch(() => {
    chosen.delete(provider);
    return spec.fallback;
  });
  chosen.set(provider, task);
  return task;
}

/** Anthropic caches only what you mark, so `cache` on a block is what earns the discount. */
async function anthropic<T>(key: string, model: string, system: SystemBlock[], tool: Tool, prompt: string): Promise<{ value: T; usage: Usage }> {
  const send = (force: boolean) =>
    fetch(`${PROVIDERS.anthropic.base}/messages`, {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: system.map((s) => ({ type: "text", text: s.text, ...(s.cache ? { cache_control: { type: "ephemeral" } } : {}) })),
        tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
        ...(force ? { tool_choice: { type: "tool", name: tool.name } } : {}),
        messages: [{ role: "user", content: prompt }],
      }),
    });

  // Some models reject a forced tool choice. The tool is the only one offered and the prompt asks for
  // it, so letting the model choose still gets a call; remember the refusal rather than pay for it twice.
  let res = await send(!g.__adriftSimNoForcedTool);
  if (res.status === 400 && !g.__adriftSimNoForcedTool) {
    const refusal = await res.text();
    if (!refusal.includes("tool_choice")) throw new Error(`400 ${refusal}`);
    g.__adriftSimNoForcedTool = true;
    res = await send(false);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    content: { type: string; name?: string; input?: T }[];
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  const value = body.content.find((x) => x.type === "tool_use" && x.name === tool.name)?.input;
  if (!value) throw new Error("no tool call in the reply");
  const u = body.usage ?? {};
  return {
    value,
    usage: { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), cached: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
  };
}

/**
 * One request shape for ChatGPT, Grok, and Gemini. These providers cache automatically rather than
 * on request, so the saving comes from keeping the prompt's opening identical between turns.
 */
async function openAiCompatible<T>(provider: Provider, spec: Spec, key: string, model: string, system: SystemBlock[], tool: Tool, prompt: string): Promise<{ value: T; usage: Usage }> {
  const res = await fetch(`${spec.base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system.map((s) => s.text).join("\n\n") },
        { role: "user", content: prompt },
      ],
      tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.schema } }],
      tool_choice: { type: "function", function: { name: tool.name } },
      // Only OpenAI documents this, and the compatibility layers reject parameters they don't know.
      ...(provider === "openai" ? { prompt_cache_key: "adrift-sim" } : {}),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const args = body.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("no tool call in the reply");
  const u = body.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return { value: JSON.parse(args) as T, usage: { input: Math.max(0, (u.prompt_tokens ?? 0) - cached), cached, output: u.completion_tokens ?? 0 } };
}

/**
 * One forced tool call, whichever provider is playing. Returns the model that answered so a
 * transcript can say who made the choice.
 */
export async function structured<T>(provider: Provider, system: SystemBlock[], tool: Tool, prompt: string): Promise<{ value: T; model: string; usage: Usage }> {
  const spec = PROVIDERS[provider];
  const key = process.env[spec.keyEnv];
  if (!key) throw new Error(`${spec.keyEnv} is not set, so ${spec.label} can't play.`);
  const model = await pickModel(provider);
  try {
    const { value, usage } = provider === "anthropic" ? await anthropic<T>(key, model, system, tool, prompt) : await openAiCompatible<T>(provider, spec, key, model, system, tool, prompt);
    return { value, model, usage: usage.input || usage.output ? usage : ZERO };
  } catch (e) {
    throw new Error(`${spec.label} (${model}) failed: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}
