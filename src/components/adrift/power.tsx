"use client";

import { BatteryIcon, NavigationIcon } from "lucide-react";
import { POWER_CELLS, cellsInHold, engineRange, gridCellMissing, nextGridCell, powerDaysLeft } from "@/lib/power";
import { useGame } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "./common";

const shortName = (name: string) => name.replace(" Power Cell", "");

/** Power Cells in the hold and how far the engines can take the ship. */
export function PowerCells({ compact }: { compact?: boolean }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const cells = cellsInHold(game);
  const total = cells.reduce((s, c) => s + c.qty, 0);
  const range = engineRange(game);
  const days = powerDaysLeft(game);
  const next = nextGridCell(game);
  const want = game.ship.gridCell;
  const missing = gridCellMissing(game);

  const choose = (name?: string) =>
    act("Grid cell", (g) => {
      g.ship.gridCell = name;
      return name
        ? `The grid is set to run the ship on ${shortName(name)} cells.`
        : "The grid goes back to loading the weakest cell in the hold.";
    });
  return (
    <div className={cn("grid gap-2 rounded-lg border p-3", total === 0 ? "border-amber-500/40 bg-amber-500/5" : "bg-background/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm">
          <BatteryIcon className={cn("size-4", total === 0 ? "text-amber-300" : "text-primary")} />
          <span className="font-medium">Power Cells</span>
          <span className="flex flex-wrap gap-1">
            {cells.map((c) => <Pill key={c.name} tone={c.qty ? "info" : "muted"}>{shortName(c.name)} ×{c.qty}</Pill>)}
            <Pill tone={days > 0 ? "good" : next ? "warn" : "danger"}>
              {days > 0 ? `Grid: ${days} day${days === 1 ? "" : "s"} of charge` : next ? `Grid: loads a ${shortName(next.name)} tonight` : "Grid: no charge, no cell"}
            </Pill>
          </span>
        </p>
        <p className={cn("flex items-center gap-1.5 text-xs", range.reason ? "text-amber-300" : "text-muted-foreground")}>
          <NavigationIcon className="size-3.5" />
          {range.reason ?? `Engines: ${range.tiles} tile${range.tiles === 1 ? "" : "s"} per segment`}
        </p>
      </div>
      {/* Which cell keeps the lights on is the crew's call: burn the cheap ones, or spend a good one
          to stop feeding the grid every night and keep the hold tidy for travel. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Run the grid on:</span>
        <Button size="xs" variant={want ? "outline" : "default"} onClick={() => choose(undefined)}>Weakest first</Button>
        {POWER_CELLS.map((c) => (
          <Button key={c.name} size="xs" variant={want === c.name ? "default" : "outline"} onClick={() => choose(c.name)}>
            {shortName(c.name)} · {c.days}d
          </Button>
        ))}
      </div>
      {missing && <p className="text-[11px] text-amber-300">No {shortName(want!)} cells in the hold, so the grid falls back to the weakest it has.</p>}
      {!compact && (
        <p className="text-[11px] text-muted-foreground">
          Each move burns one cell rated for the distance, and deploying a mech burns cells rated for its tier: Flickering 1 tile (Tier I mechs), Power Cell 2 tiles (Tier II), Advanced 4 tiles (Tier III). Keeping the ship running spends a day of charge every End of Day, and a cell holds as many days as it does tiles. The crew chooses which kind the grid loads; left alone it takes the weakest, saving the strong ones for travel. Craft them at the Workshop from Fuel Units.
        </p>
      )}
    </div>
  );
}
