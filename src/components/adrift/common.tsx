"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function StarshipIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 9h8l7 3-7 3H6z" />
      <path d="m9 9-2-5h3l4 5" />
      <path d="m9 15-2 5h3l4-5" />
      <path d="M2 11h2" />
      <path d="M2 13h2" />
    </svg>
  );
}

export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  label,
  className,
  size = "sm",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  size?: "sm" | "xs";
}) {
  const btn = size === "sm" ? "icon-sm" : "icon-xs";
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Button
        variant="outline"
        size={btn}
        aria-label={label ? `Decrease ${label}` : "Decrease"}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <MinusIcon />
      </Button>
      <span className={cn("tabular min-w-7 text-center font-mono font-medium", size === "xs" && "min-w-5 text-xs")}>{value}</span>
      <Button
        variant="outline"
        size={btn}
        aria-label={label ? `Increase ${label}` : "Increase"}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

const TONES = {
  hp: "bg-rose-400",
  energy: "bg-amber-300",
  willpower: "bg-violet-400",
  hull: "bg-sky-400",
  good: "bg-emerald-400",
  stress: "bg-orange-400",
  progress: "bg-teal-300",
} as const;

export function Meter({
  value,
  max,
  tone,
  segmented = false,
  className,
}: {
  value: number;
  max: number;
  tone: keyof typeof TONES;
  segmented?: boolean;
  className?: string;
}) {
  if (segmented && max <= 16) {
    return (
      <div className={cn("flex gap-0.5", className)} role="meter" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
        {Array.from({ length: Math.max(max, 1) }, (_, i) => (
          <div key={i} className={cn("h-2 flex-1 rounded-[2px]", i < value ? TONES[tone] : "bg-muted")} />
        ))}
      </div>
    );
  }
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="meter" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
      <div className={cn("h-full rounded-full transition-all", TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatBlock({
  label,
  value,
  max,
  tone,
  onChange,
  extra,
}: {
  label: string;
  value: number;
  max: number;
  tone: keyof typeof TONES;
  onChange: (v: number) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <span className="tabular font-mono text-sm">
          {value}
          <span className="text-muted-foreground">/{max}</span>
        </span>
      </div>
      <Meter value={value} max={max} tone={tone} segmented />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Stepper value={value} onChange={onChange} min={0} max={max} label={label} size="xs" />
        {extra}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Hover (or keyboard-focus) explanation. `children` must be a single DOM element; it becomes the trigger. */
export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return children;
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} className="block max-w-72 text-left leading-snug">{content}</TooltipContent>
    </Tooltip>
  );
}

export function Pill({ children, tone = "muted", className, tip }: { children: ReactNode; tone?: "muted" | "warn" | "danger" | "good" | "info"; className?: string; tip?: ReactNode }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    warn: "bg-amber-400/15 text-amber-300",
    danger: "bg-rose-500/15 text-rose-300",
    good: "bg-emerald-500/15 text-emerald-300",
    info: "bg-sky-500/15 text-sky-300",
  };
  const pill = <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], tip && "cursor-help", className)}>{children}</span>;
  return <Tip content={tip}>{pill}</Tip>;
}

export function Dice({ dice, highlight = 6 }: { dice: number[]; highlight?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {dice.map((v, i) => (
        <span
          key={i}
          className={cn(
            "tabular flex size-8 items-center justify-center rounded-md border font-mono text-sm font-semibold",
            v >= highlight ? "border-primary bg-primary/20 text-primary" : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {v}
        </span>
      ))}
    </div>
  );
}
