"use client";

import { Fragment, type ReactNode } from "react";
import { GLOSSARY, GLOSSARY_PATTERN, TONE_LABEL, type GlossaryEntry, type GlossaryTone } from "@/lib/glossary";
import { cn } from "@/lib/utils";
import { Tip } from "./common";

export const TONE_CLASS: Record<GlossaryTone, string> = {
  physical: "text-red-400 decoration-red-400/50",
  fire: "text-orange-400 decoration-orange-400/50",
  chemical: "text-lime-400 decoration-lime-400/50",
  electric: "text-sky-300 decoration-sky-300/50",
  medical: "text-pink-400 decoration-pink-400/50",
  combat: "text-yellow-300 decoration-yellow-300/50",
  mind: "text-violet-400 decoration-violet-400/50",
  pressure: "text-indigo-300 decoration-indigo-300/50",
  environment: "text-teal-300 decoration-teal-300/50",
  beneficial: "text-emerald-400 decoration-emerald-400/50",
};

export function GlossaryTip({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  return (
    <Tip
      content={
        <span className="grid gap-1">
          <span><span className={cn("font-semibold", entry.tone && TONE_CLASS[entry.tone])}>{entry.title}</span> <span className="opacity-70">· {entry.kind}</span></span>
          <span>{entry.text}</span>
          {entry.ends && <span className="opacity-70">Ends: {entry.ends}</span>}
        </span>
      }
    >
      <span className={cn("cursor-help underline decoration-muted-foreground/60 decoration-dotted underline-offset-2", entry.tone && TONE_CLASS[entry.tone])}>{children}</span>
    </Tip>
  );
}

export function ToneLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {(Object.keys(TONE_LABEL) as GlossaryTone[]).map((t) => <span key={t} className={TONE_CLASS[t]}>{TONE_LABEL[t]}</span>)}
    </p>
  );
}

/** Text with game terms given hover definitions. Only each term's first appearance is marked; `skip` is never. */
export function GlossaryText({ text, skip }: { text: string; skip?: string }) {
  const seen = new Set<GlossaryEntry>(skip && GLOSSARY.has(skip) ? [GLOSSARY.get(skip)!] : []);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(GLOSSARY_PATTERN)) {
    const entry = GLOSSARY.get(m[0])!;
    if (seen.has(entry)) continue;
    seen.add(entry);
    parts.push(text.slice(last, m.index), <GlossaryTip key={m.index} entry={entry}>{m[0]}</GlossaryTip>);
    last = m.index + m[0].length;
  }
  if (!parts.length) return text;
  parts.push(text.slice(last));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}
