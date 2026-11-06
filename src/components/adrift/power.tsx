"use client";

import { BatteryIcon, NavigationIcon } from "lucide-react";
import { cellsInHold, engineRange, nextGridCell, powerDaysLeft } from "@/lib/power";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Pill } from "./common";

/** Power Cells in the hold and how far the engines can take the ship. */
export function PowerCells({ compact }: { compact?: boolean }) {
  const game = useGame((s) => s.game);
  const cells = cellsInHold(game);
  const total = cells.reduce((s, c) => s + c.qty, 0);
  const range = engineRange(game);
  const days = powerDaysLeft(game);
  const next = nextGridCell(game);
  return (
    <div className={cn("grid gap-2 rounded-lg border p-3", total === 0 ? "border-amber-500/40 bg-amber-500/5" : "bg-background/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <BatteryIcon className={cn("size-4", total === 0 ? "text-amber-300" : "text-primary")} />
          <span className="font-medium">Power Cells</span>
          <span className="flex flex-wrap gap-1">
            {cells.map((c) => <Pill key={c.name} tone={c.qty ? "info" : "muted"}>{c.name.replace(" Power Cell", "")} ×{c.qty}</Pill>)}
            <Pill tone={days > 0 ? "good" : next ? "warn" : "danger"}>
              {days > 0 ? `Grid: ${days} day${days === 1 ? "" : "s"} of charge` : next ? `Grid: loads a ${next.name.replace(" Power Cell", "")} tonight` : "Grid: no charge, no cell"}
            </Pill>
          </span>
        </p>
        <p className={cn("flex items-center gap-1.5 text-xs", range.reason ? "text-amber-300" : "text-muted-foreground")}>
          <NavigationIcon className="size-3.5" />
          {range.reason ?? `Engines: ${range.tiles} tile${range.tiles === 1 ? "" : "s"} per segment`}
        </p>
      </div>
      {!compact && (
        <p className="text-[11px] text-muted-foreground">
          Each move burns one cell rated for the distance, and deploying a mech burns cells rated for its tier: Flickering 1 tile (Tier I mechs), Power Cell 2 tiles (Tier II), Advanced 4 tiles (Tier III). Keeping the ship running spends a day of charge every End of Day, and a cell holds as many days as it does tiles. Craft them at the Workshop from Fuel Units.
        </p>
      )}
    </div>
  );
}
