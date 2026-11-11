"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";

const viewAs = (characterId: string | null) => useGame.setState({ viewAs: { characterId } });
const stop = () => useGame.setState({ viewAs: null });

/** The GM's way to check what a player can see and do, by becoming one until they stop. */
export function ViewAsMenu() {
  const { realGM, viewAs: current, playerOf } = usePerms();
  const characters = useGame((s) => s.game.characters);
  if (!realGM) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant={current ? "secondary" : "ghost"} title="See the campaign as a player sees it"><EyeIcon /> <span className="hidden sm:inline">View as</span></Button>} />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>See it as a player would</DropdownMenuLabel>
          {characters.filter((c) => !c.dead).map((c) => {
            const player = playerOf(c.id);
            return (
              <DropdownMenuItem key={c.id} onClick={() => viewAs(c.id)}>
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{player ? player.name : "no player"}</span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuItem onClick={() => viewAs(null)}>A player who hasn&apos;t picked a character</DropdownMenuItem>
        </DropdownMenuGroup>
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={stop}><EyeOffIcon /> Back to the GM&apos;s view</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Says plainly, on every tab, that this isn't the GM's view and how to get it back. */
export function ViewAsBanner() {
  const { realGM, viewAs: current, playerOf } = usePerms();
  const characters = useGame((s) => s.game.characters);
  if (!realGM || !current) return null;
  const character = characters.find((c) => c.id === current.characterId);
  const player = current.characterId ? playerOf(current.characterId) : undefined;
  const who = character ? `${player ? `${player.name}, playing ` : "the player of "}${character.name}` : "a player who hasn't picked a character";

  return (
    <div className="border-b border-sky-500/30 bg-sky-500/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs sm:px-6">
        <EyeIcon className="size-3.5 text-sky-400" />
        <span>
          Viewing as <span className="font-medium">{who}</span>. You see what the server would send them, and anything they couldn&apos;t do is refused. What they can do still happens for real.
        </span>
        <Button size="xs" variant="outline" className="ml-auto" onClick={stop}><EyeOffIcon /> Back to the GM&apos;s view</Button>
      </div>
    </div>
  );
}
