"use client";

import { EyeOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SEGMENTS } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";

const KIND_STYLE = {
  info: "border-l-border",
  roll: "border-l-sky-400/60",
  danger: "border-l-rose-400/70",
  day: "border-l-primary",
};

export function LogTab() {
  const log = useGame((s) => s.game.log);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? log.filter((l) => l.text.toLowerCase().includes(n)) : log;
  }, [log, q]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; entries: typeof filtered }[] = [];
    for (const e of filtered) {
      const key = `${e.day}-${e.segment}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.entries.push(e);
      else out.push({ key, label: `Day ${e.day} · ${SEGMENTS[e.segment]}`, entries: [e] });
    }
    return out;
  }, [filtered]);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <Input placeholder="Search the session log…" value={q} onChange={(e) => setQ(e.target.value)} />
        {groups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{q ? "No log entries match." : "Nothing has happened yet."}</p>}
        {groups.map((g) => (
          <div key={g.key}>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
            <ul className="grid gap-1">
              {g.entries.map((e) => (
                <li key={e.id} className={cn("flex gap-3 border-l-2 py-1 pl-3 text-sm", KIND_STYLE[e.kind], e.gm && "bg-amber-400/5")}>
                  <span className="tabular shrink-0 font-mono text-[11px] text-muted-foreground">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className={cn("flex-1", e.kind === "danger" && "text-rose-100", e.kind === "day" && "font-medium")}>
                    {/* Nobody but the GM was ever sent this line, and the GM shouldn't read it out. */}
                    {e.gm && <EyeOffIcon className="mr-1.5 mb-0.5 inline size-3 text-amber-300/80" aria-label="GM only" />}
                    {e.text}
                  </span>
                  {e.by && <span className="shrink-0 text-[11px] text-muted-foreground">{e.by}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
