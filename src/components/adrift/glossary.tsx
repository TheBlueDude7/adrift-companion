"use client";

import { Fragment, type ReactNode } from "react";
import { GLOSSARY, GLOSSARY_PATTERN, type GlossaryEntry } from "@/lib/glossary";
import { Tip } from "./common";

export function GlossaryTip({ entry, children }: { entry: GlossaryEntry; children: ReactNode }) {
  return (
    <Tip
      content={
        <span className="grid gap-1">
          <span><span className="font-semibold">{entry.title}</span> <span className="opacity-70">· {entry.kind}</span></span>
          <span>{entry.text}</span>
          {entry.ends && <span className="opacity-70">Ends: {entry.ends}</span>}
        </span>
      }
    >
      <span className="cursor-help underline decoration-muted-foreground/60 decoration-dotted underline-offset-2">{children}</span>
    </Tip>
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
