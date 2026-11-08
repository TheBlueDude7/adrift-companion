# Adrift Companion

A browser companion for **Adrift**, a survival TTRPG set in 2274 after humanity loses its last stand. It handles the bookkeeping the rules ask for, so the table can focus on the story: the ship, the crew, what everyone is carrying, and what happens at the end of each day.

## What it tracks

- **Day and segment clock.** Morning, Afternoon, Evening, and Night, with a guided **End of Day** procedure. It covers Food, Water, and Sleep checks, starvation, dehydration, and sleep penalties, rationing rolls and streaks, untreated-injury HP loss, natural recovery rolls, the Pressure reset to the floor set by Stress, crop growth, solar panel Fuel, and the grid's daily Power Cell charge.
- **Survivors.** Backgrounds apply their attribute and skill bonuses automatically. Derived max HP, Energy, and Willpower follow the Constitution and Strength rules. Skills have XP tracking that levels up on its own, and the sheet shows how much of the 6 attribute points and 45 skill XP from character creation has been spent.
- **Pressure and Stress.** Pressure has five states and applies Strained double-gains, Panicked overflow into Mind Breaks, and Stress bands with their effects. Willpower can prevent Stress.
- **Dice roller.** The pool is Attribute + Skill + Pressure dice, plus modifiers and assistance. Pushing rerolls the failed dice after the Pressure gain (never at 0 Energy), and failure consequences can be applied for both the shipboard and combat Pressure tables.
- **Injuries and Afflictions.** The full compendium tables are included, with severity and treatment state (Untreated, Stabilized, or Treated). Injuries are rolled live at the table: enter the Severity d6 and Injury d10, and the app looks up the result and shows it before you apply it. Afflictions can still be rolled randomly.
- **Status tooltips.** Hover over a Pressure state, Stress band, alert, survival streak, or condition to see what it does and how it ends.
- **Conditions.** Several ways to apply them quickly:
  - The **Condition** button in the header applies one or more conditions to any number of survivors at once. Conditions are grouped (Combat, Body, Fire, Electric, and so on), searchable, and show their effect before you apply them.
  - Every crew card on the Overview has its own **+ Condition** button, and the character sheet has one-click toggles for the ten most common conditions.
  - Each condition gets a sensible default duration, which you can override. Hovering a chip shows its effect and how to remove it, and the × on the chip removes it.
  - Some effects resolve automatically: Drained costs Energy (or adds Pressure at 0 Energy), Frightened adds Pressure, and reapplying Bleeding or Burning deals damage.
  - **End round** applies Bleeding and Burning damage (heavier with a bleeding injury), adds Pressure for Suffocating, and clears Brief conditions. **End scene** clears Brief and Scene conditions and resets once-per-combat abilities.
- **Background abilities.** Once-per-day and once-per-expedition uses reset at End of Day, and once-per-combat uses reset at the end of a scene.
- **Ship.** Hull tier with Hull HP and Armor Dice. Resolving a Hit covers armor rolls, temporary patches, Critical Integrity, Catastrophic Events, and destruction.
- **Segment tasks.** An Actions tab where every survivor commits to a task for the current segment, picked from the rulebook's Standard Shipboard Tasks (plus project work, assisting, and free-form tasks). Players submit and edit their own; everyone sees each task's Energy, whether the survivor meets the Routine Threshold, and the dice pool otherwise. Routine tasks resolve in one click. Players roll the rest from the task itself, and the dice decide the result as they land: the server rolls the pool, and the task resolves at once unless a Push is still possible, in which case the player Pushes (once, never while exhausted) or keeps the result. A rolled task can't be edited or withdrawn. A player can't submit a task they lack the Energy for (counting what their earlier planned tasks will cost); instead they ask the GM for permission, and the task waits until the GM allows or refuses it. Players can spend their own Energy but only the GM restores it (Rest tasks still do). The GM resolves Salvage Ship and Other tasks, and can resolve anyone's task with Success, Strong, or Failed. Resolving pays Energy and applies the normal result: Rest, Project Progress (including an assistant's), moving the ship for a course, recording a scan on the star map, and fabricating items. Tasks left unresolved stay listed until the GM deals with them.
- **Power grid and Power Cells.** Generation against draw, overloading the grid, and one-click shedding of non-essential modules. The reactor's output decides how many modules stay active; it never runs out. Power Cells are the consumable: a move burns one cell rated for the distance (1, 2, or 4 tiles), deploying a mech burns cells rated for its tier, and simply keeping the ship running spends a day of a cell's charge at every End of Day (Flickering 1 day, Power Cell 2, Advanced 4). The grid loads the weakest cell in the hold first, so stronger ones stay available for travel; the Power Cells panel and the End of Day screen both show the charge left and what loads next.
- **Hydroponics.** The Ship tab tracks the crop: Maintain Crops seeds and tends it, End of Day grows it by the module's rules (Seeded needs tending daily, Operational on the second or third day, Expanded and Self-Sustaining grow on their own), and Harvest Hydroponics moves the ready Raw Food into the hold.
- **Moving the ship.** A survivor plans Plot Safe Course or Plot Unsafe Course on the Actions tab (or with **Plan a course here** on the star map), and the ship moves when the task resolves. The Engine Section's level caps the tiles per move (Repaired 1, Thrust-Capable 2, Vector-Optimized 4), and a failed course leaves the ship where it is. The GM can also move the ship directly from the star map.
- **Rooms and modules.** Facility grade, condition (Operational, Damaged, Critical, Offline, or Destroyed), whether the module is powered, and whether it is essential.
- **Projects.** Templates for Expand Ship, Hull Repair, Workshop installs, Module Repair, Stress Recovery, and Affliction Treatment, Mech Frame construction and upgrades, and Cybernetic Research. A Stress Recovery project names its patient when it starts, and it lowers only that survivor's Stress (1d4 + 2) when it completes.
- **Ship upgrades and facilities.** Reactor, Navigation & Sensor Suite, Engine, Life Support, Medical Bay, Workshop, Storage Bay, Kitchen, and Hydroponics each have their upgrade ladder. A room shows its current level and what it does, and upgrading either spends the listed materials and toolkit charges from the hold or just sets the level. Medical Bay and Workshop levels set the room's facility grade. One-off facilities (Cybernetics Lab, Biological Lab, Bioconverter, Crewmate Quarters) can be built as a new room or added to an existing one. Makeshift Solar Panels, Traps, and a Defensive Gun instead fill a room's spare slot, which its module doesn't use: one of them per room, so panels and defenses can't share a room. Each set of panels collects 1 Fuel Unit into the hold at End of Day unless its room is Offline or Destroyed, and a fitted Defensive Gun adds its 2 Power to the room's draw.
- **Crafting.** A Craft dialog in ship storage covers every recipe from the crafting tree: power cells, medkits, surgical tools, toolkits, filters, gadgets, armor, weapons, meals, chemicals, and Cybernetic Cores. It checks the station each recipe needs. The Workshop's level caps the material tier (Makeshift Bench Tier I, Operational and Calibrated Tier II, Advanced Fabricator and up Tier III), and meals and chemicals need the right Kitchen level. Cooking has separate success and failure buttons. The Refining tab converts scrap into higher-tier materials at the Workshop's current ratio. The GM can allow a recipe anyway.
- **Skill mastery.** Being 3 levels above a task's threshold cuts its Energy by 1, being 6 above earns its Strong Result without a roll (the GM's button reads "Expert"), and being 4 above a Project's threshold adds 2 Progress. Thresholds rise with the job:
  - Safe courses need Piloting 4, 6, or 8 by distance.
  - Scans need Navigation 4, 6, or 8 by distance, and the sensor suite's level sets how far they reach.
  - Maintain Crops needs more Botany as Hydroponics improves.
  - Meals need Cooking 1, 4, or 7.
  - Module upgrades show the Engineering they need.

  New tasks give the flat skills something to do at high levels: Stretch Rations, Cultivate Specimen, Deep Scan, Tune the Reactor (+1 Power Unit for the day), Morale Night (everyone's Pressure −1), Extract Research Trait, and Prep for Surgery. Each task that needs a module or facility is flagged when the ship lacks it. Harvesting adds Raw Food for high Botany, Botany 7 improves Food into Fuel, and a Master Pilot (Piloting 8) makes one move a day without a Power Cell.
- **Skill training.** Train Skill spends 1 resource from the hold for 1 XP. The resource depends on the skill and the level being trained toward: a common material for levels 1–3, a refined one for 4–7, and a rare one for 8–10. For example, Entertainer starts on Water Units and Engineering on Scrap Components. Only raw materials and basic supplies appear in the table, never finished equipment, since the XP ladder compounds to 6 / 22 / 27 units per band. A resource that carries charges gives up one charge rather than the whole unit, and the resource is used even if the session fails. The full table is in `src/data/training.ts`.
- **Fabricate Common Item.** Planning this task means picking up to two items from the crafting tree, three when the crafter clears every recipe's threshold by 6, and one more with Redline Familiarity's once-a-day overdrive. They can be any mix, including two of the same item, and kitchen recipes are left to Prepare Food. The plan shows the combined materials against the hold, plus any station blockers. The hardest item sets the terms: the task is Routine only when the crafter meets every recipe's threshold, costs 1 less Energy when they clear every threshold by 3, and otherwise rolls at −1d6 for each level below. The task's Energy is paid once and covers every item the crafter is allowed, including the third one an Expert earns and the one more Redline's overdrive adds. Resolving it makes the items in ship storage. On a success the GM can still mark single items as failed. A failed item still uses its toolkit charges and loses half its materials (rounded up); the rest go back to the hold. An item isn't made if the hold is short or the station is missing.
- **Cybernetics.** Every survivor sheet has a Cybernetics card. Install Structural, Sensory, Internal, Neural, Interface, and Damage implants by location, as Enhanced or Standard Replacement. The app tracks Cybernetic Load and Dampening per body system, applies attribute, HP, and Energy bonuses, and handles Tier II upgrades replacing their Tier I and Tier III implants integrating their prerequisites. Implants can come from the hold, be fabricated from materials, or be installed without tracking materials. Research is crew-wide: Tier I is known from the start, and Tier II and III discoveries are recorded on the Ship tab from a numbered list you roll against.
- **Mechs.** A Mechs tab for Utility, Assault, and Recon frames at Tiers I–III. It covers HP, slots, hardpoints, Frame STR and CON, Resistances, chassis abilities, modules (crafted, taken from the hold, or untracked), mech conditions, and the pilot. Damage goes through Resistance and Cover, then Mech HP, and any excess reaches the deployed pilot (with injury dice if needed). Deploying burns Power Cells (Tier II mechs need a Power Cell or better, Tier III an Advanced one), a piloted mech adds its inventory bonus to the pilot, and the Storage Bay level sets how many mechs fit aboard.
- **Inventory.** Ship storage and personal inventories, with slot limits of Strength + ⅓ Scavenging, charges, and broken items. Most items take one slot each (a quantity of 3 takes 3 slots). Heavy items (alloys, Large Salvage, mech modules, or anything you mark Heavy) take 2 slots and flag the carrier as Slowed. A deployed Utility Frame or Reinforced Cargo Assembly drops them to 1 slot, Salvage Clamps carry one for free, and Heavy Lift Actuators remove the Slowed. Items can be transferred between the hold and any survivor, and the catalog can be extended with your own items.
- **Quartermaster.** A Logistics and Quartermaster survivor gets two inventory tools on their sheet, and their player can run both without the GM:
  - **Contingency Pack.** Pack two undecided slots before heading out. Reveal what's in them whenever you like: pick any item that was in ship storage when you packed, and one unit moves from storage into your pack. There's no limit on reveals. A slot becomes undecided again once its item is used up, discarded, or handed to someone else.
  - **Shared pool** (Loadmaster). Pick who's on the expedition. Each member gives up one personal slot, and the pool holds one slot per member. Put items in the pool from their transfer menu. Pool cargo still belongs to whoever carries it, but any member can pass it to another member, and every member's sheet shows what's in the pool and who has it. Ending the pool gives everyone their slot back, and they keep what they're carrying.
- **Maps.** A Map tab with two kinds of map:
  - **System chart.** The system as a square grid of tiles (101 × 101 by default; 51, 151, or 201 across). There are no stars in the background: the only light is the neutron star, which starts on the middle tile and can be moved to any tile. Coordinates are counted from the star. Every tile starts unscanned; paint scan results onto tiles (clear, debris field, radiation, gravity well, interference, or another hazard), and chart contacts (derelicts, stations, planets, anomalies, hazards, beacons, unknown signals) marked unexplored, visited, picked clean, or dangerous. The dashed box around the ship shows the tiles one move away. The GM moves the ship, which spends 1 Fuel Unit from ship storage per tile (or none, for a free move) and updates the ship's location. The panel warns when the destination is unscanned (Crisis work at −3d6) or hazardous.
  - **Deck maps.** A large grid (60 × 40 by default, resizable up to 200 × 200) for mapping derelicts. Drag out rooms (floor inside, walls around the edge), paint floor, walls, doors, airlocks, cover, debris, hazards, and salvage, and drop text labels. Crew, enemy, and other tokens can be dragged around so everyone can see where they are.
  - Any contact on the system chart can start its own deck map, and a deck map can jump back to the chart. Scroll (or Ctrl + scroll on a grid) zooms, and dragging empty space pans.
- **Play together.** One person hosts the campaign on the server and shares a 6-letter code or invite link. Everyone who joins edits the same campaign live from their own device. See [Playing together](#playing-together).
- **Session log and undo.** Every change is logged by day and segment (and by player, in shared campaigns). The last 40 actions can be undone; in a shared campaign, Undo only reverts your own changes.

All data is saved in your browser's local storage. Use the menu in the top right to **export** a campaign to a JSON file or **import** one, for example to move between devices or keep backups.

## Running locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:4317>.

For a production build:

```bash
npm run build
npm start
```

## Playing together

The app includes a small sync server, so no extra services are needed.

1. On the machine that will act as the server, run:

   ```bash
   npm install
   npm run host
   ```

   This builds the app and serves it on port 4317 on every network interface.
2. Open the app, click **Play together** in the header, enter your name, and choose **Host campaign**. The campaign you have open is uploaded and you get a join code and invite link.
3. Players open the invite link (or open the app and enter the code), type their name, and join. The header shows the code, a green dot while connected, and how many people are online.

How players reach the server:

- **Same network:** use the host machine's local IP, for example `http://192.168.1.20:4317`. On Windows, allow Node.js through the firewall when prompted.
- **Running inside WSL:** other devices can't reach WSL directly by default. Either turn on mirrored networking (`networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`, then run `wsl --shutdown`), or use the tunnel below.
- **Over the internet:** forward port 4317 on your router, or run a tunnel such as `npx cloudflared tunnel --url http://localhost:4317` and share the address it prints. You can also deploy to any host that runs a persistent Node.js server with a disk (Render, Railway, Fly.io, or a VPS). Serverless platforms such as Vercel won't work, because the server keeps live connections and saves campaigns to disk.

### Roles

Whoever hosts is the **game master**. Everyone who joins with the code is a **player**.

- **Players** pick their character, either with **Play as** on the character's sheet in the Crew tab or from the Play together dialog. Each character can have only one player. A player who hasn't picked a character yet can create a new one, and it becomes theirs.
- Players can edit their own sheet, conditions, and carried items, plus shared-pool cargo carried by anyone in their Loadmaster pool. They can also take, stow, use, and craft with items in ship storage, power rooms on and off, draw on the maps, and write in the log. Other characters' sheets are read-only for them.
- Only the GM can change the day and time, run End of Day, change hull and power, start a project or change its Progress (players add Progress by resolving a Work on a project task), edit characters nobody plays, run rounds and scenes, add items to ship storage out of nowhere, move the ship, place the neutron star, or resize the system chart (players move the ship by planning a course), import a campaign, or complete an act. The GM can also assign a character to any player from the People list. The GM renames the ship from the campaign menu or by editing its name on the Ship tab.

The server checks every change against these rules, so a player can't get around them by editing the page. Undo only reverts your own changes.

The GM's access is tied to a secret key stored in their browser. To run the game from another device, open **GM link** in the Play together dialog and open that link on the other device. Don't share it with players, because anyone who opens it becomes a GM. Campaigns hosted before roles existed have no GM key, so everyone in them can edit everything.

One server can run any number of campaigns at once. Each hosted campaign gets its own code, GM, players, and save file. Run a single server process (not several behind a load balancer), because live campaigns are held in that process's memory. When hosting publicly, serve it over HTTPS, which most hosts and tunnels do for you.

Shared campaigns are saved as JSON in `data/campaigns/` (set `ADRIFT_DATA_DIR` to change this), so they survive restarts. Anyone with the code can join as a player, so share it only with your table. Leaving a campaign keeps its latest state on your device as a local copy, and the campaign you had before joining can be restored from the same dialog.

For playing together, use `npm run host` rather than `npm run dev`. The dev server blocks pages opened from any address other than `localhost`.

## Project layout

- `docs/Adrift.docx`: the current rulebook, with one-slot items plus Heavy items, Power Cells for movement, and no Expedition Clocks. `docs/Adrift-tracked-changes.docx` is the same revision with every edit shown as a tracked change.

- `src/lib/rules.ts`: rule constants (skills, backgrounds, hull tiers, Pressure and Stress tables, module presets, item templates, and project templates).
- `src/lib/mechanics.ts`: rule procedures (Pressure and Stress changes, damage, rests, conditions, rounds and scenes, and End of Day).
- `src/data/tasks.ts` and `src/lib/actions.ts`: the shipboard task table and how planned tasks resolve. `src/lib/power.ts` handles Power Cells, engine range, and ship movement.
- `src/lib/derive.ts`: derived stats (max HP, Energy, and Willpower, inventory slots, and the power budget).
- `src/data/compendium.ts`: Injury, Affliction, and Condition tables taken from the rulebook.
- `src/data/cybernetics.ts`, `mechs.ts`, `ship-upgrades.ts`, `crafting.ts`: implant, mech, upgrade ladder, facility, and recipe tables from the supplements. The matching rules live in `src/lib/cyber.ts`, `src/lib/mechs.ts`, and `src/lib/crafting.ts`, and `src/lib/stock.ts` spends and adds materials in the hold.
- `src/lib/store.ts`: Zustand store with persistence, undo history, and the log.
- `src/lib/sync/`: multiplayer sync. `ops.ts` diffs and merges game state by item id, `rooms.ts` holds shared campaigns on the server, and `client.ts` keeps each browser in step over Server-Sent Events.
- `src/app/api/campaigns/`: the sync server's HTTP routes (create, look up, send changes, and the live event stream).
- `src/components/adrift/*`: the UI, one file per tab.

## Rule assumptions

These places in the rulebook were ambiguous. The tracker's defaults are listed here and are easy to change:

- Reactor output defaults to 6 Power Units, and module power draws follow the rulebook's general power scale. Both can be edited per room.
- Charges follow the crafting tree: Medkits have 1 use, and toolkits have 3, 6, or 9 charges by tier. Toolkit charges for recipes and upgrades come from any toolkit in the hold, cheapest first.
- Reflex Processor and Neural Regulator use the Cybernetics Template wording where it differs from the Cybernetics document.
- Mech capacity follows the Ship Upgrades sheet (Storage Bay levels hold 1, 2, or 3 mechs) rather than the Mechs document's Cargo Bay +1/+2/+3.
- Reactor upgrade levels show how many rooms they power as text. The power grid still uses Power Units.
- Power Cells replace Fuel for movement and mechs. Fuel Units are now only a crafting input for cells. The Mechs document still says Fuel.
- The Mechs document's separate Bulky and Heavy sizes are merged into the single Heavy tag.
- A mech deployment burns as many cells as the Mechs document's Fuel cost (1, 1, 2 by tier).
- Expeditions are not tracked; run them at the table. Because of that, once-per-expedition abilities reset at End of Day.
- The damage dialog suggests gaining Pressure at 2+ HP lost and an Injury at 3+ HP lost. You can toggle both before applying. With an Injury checked, the dialog waits for the dice you rolled.
