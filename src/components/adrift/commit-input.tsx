"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Text input that only writes to game state on blur/Enter, so typing doesn't flood undo history. */
export function CommitInput({ value, onCommit, multiline, ...props }: { value: string; onCommit: (v: string) => void; multiline?: boolean } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline)
    return (
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={props.placeholder}
        className={props.className}
        aria-label={props["aria-label"]}
      />
    );
  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
