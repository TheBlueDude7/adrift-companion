"use client";

import { BookOpenIcon, HistoryIcon, SearchIcon } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONDITIONS } from "@/data/compendium";
import { INJURY_BY_CODE, INJURY_LOCATIONS, INJURY_TABLE } from "@/data/injuries";
import { RULE_UPDATES, type RuleUpdate } from "@/data/rule-updates";
import { EXPERT_MARGIN, PRACTICED_MARGIN, PROJECT_MARGIN } from "@/data/tasks";
import { MEDKITS } from "@/lib/actions";
import { MIND_BREAKS, PRESSURE_STATES, severityFromRoll, STRESS_BANDS } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { RuleTable } from "./common";
import { GlossaryText } from "./glossary";
import { AffectingPanel } from "./rules-affecting";
import { CyberRules, MechRules } from "./rules-paths";
import { DamageTry, InjuryTry, PoolTry } from "./rules-tryit";

const SEVERITY_FACES = [1, 2, 3, 4, 5, 6];

/** `updated` holds the ids of recent rule updates that changed this passage. */
type Block = (
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
) & { updated?: string[] };
type Section = { title: string; part: boolean; blocks: Block[]; updated?: string[] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** `<!-- updated: id, id -->` marks the next passage (or the list it continues) as changed by those updates. */
const UPDATED_MARKER = /^<!--\s*updated:\s*(.+?)\s*-->$/;

function parseRulebook(md: string): Section[] {
  const blocks: Block[] = [];
  const lines = md.split(/\r?\n/);
  let pending: string[] = [];
  const add = (b: Block) => {
    if (pending.length) b.updated = [...new Set([...(b.updated ?? []), ...pending])];
    pending = [];
    return b;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const marker = UPDATED_MARKER.exec(line.trim());
    if (marker) {
      pending.push(...marker[1].split(",").map((s) => s.trim()).filter(Boolean));
      continue;
    }
    const h = /^(#{1,6}) (.*)$/.exec(line);
    if (h) blocks.push(add({ kind: "h", level: h[1].length, text: h[2] }));
    else if (line.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") {
        last.items.push(line.slice(2));
        add(last);
      } else blocks.push(add({ kind: "ul", items: [line.slice(2)] }));
    } else if (line.startsWith("|")) {
      const head = cells(line);
      const rows: string[][] = [];
      while (lines[i + 1]?.startsWith("|")) {
        i++;
        if (!/^\|[\s|:-]+\|$/.test(lines[i].trim())) rows.push(cells(lines[i]));
      }
      blocks.push(add({ kind: "table", head, rows }));
    } else blocks.push(add({ kind: "p", text: line }));
  }

  const sections: Section[] = [{ title: "Introduction", part: true, blocks: [] }];
  for (const b of blocks) {
    if (b.kind === "h" && b.level <= 2) sections.push({ title: b.text, part: /^(Chapter \d+|Compendium|Backgrounds in Detail|Human Space)\b/.test(b.text), blocks: [], updated: b.updated });
    else sections[sections.length - 1].blocks.push(b);
  }
  return sections.filter((s) => s.blocks.length || s.part);
}

const blockText = (b: Block) => (b.kind === "ul" ? b.items.join(" ") : b.kind === "table" ? [...b.head, ...b.rows.flat()].join(" ") : b.text);

const UPDATES_BY_ID = new Map(RULE_UPDATES.map((u) => [u.id, u]));

function UpdateNote({ ids }: { ids: string[] }) {
  const updates = ids.map((id) => UPDATES_BY_ID.get(id)).filter((u) => u !== undefined);
  if (!updates.length) return null;
  return (
    <div className="grid gap-1">
      {updates.map((u) => (
        <details key={u.id} className="rounded-md border-l-2 border-l-primary bg-primary/5 px-2.5 py-1 text-xs">
          <summary className="cursor-pointer font-medium text-primary select-none">
            <HistoryIcon className="mr-1 inline size-3" />
            Updated: <span className="text-foreground">{u.title}</span>
          </summary>
          <p className="mt-1 pb-0.5 text-sm text-muted-foreground"><GlossaryText text={u.text} /></p>
        </details>
      ))}
    </div>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  if (q.length < 2) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-primary/30 text-foreground">{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

/** `rulings` are updates approved through the Discord bot that aren't written into the rulebook yet. */
type RulesData = { markdown: string; rulings: RuleUpdate[] };

export function RulesTab() {
  const [data, setData] = useState<RulesData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const updates = [...RULE_UPDATES, ...(data?.rulings ?? [])];

  return (
    <Tabs defaultValue="quick">
      <TabsList>
        <TabsTrigger value="quick" className="px-3">Quick reference</TabsTrigger>
        <TabsTrigger value="book" className="px-3">Rulebook</TabsTrigger>
        <TabsTrigger value="mechs" className="px-3">Mechs</TabsTrigger>
        <TabsTrigger value="cyber" className="px-3">Cybernetics</TabsTrigger>
        <TabsTrigger value="me" className="px-3">What&apos;s affecting me</TabsTrigger>
      </TabsList>
      <TabsContent value="quick" className="pt-3"><QuickReference updates={updates} /></TabsContent>
      <TabsContent value="book" className="pt-3">
        {data ? <Rulebook markdown={data.markdown} /> : <p className="py-8 text-center text-sm text-muted-foreground">{error ? "The rulebook couldn't be loaded." : "Loading the rulebook…"}</p>}
      </TabsContent>
      <TabsContent value="mechs" className="pt-3"><MechRules /></TabsContent>
      <TabsContent value="cyber" className="pt-3"><CyberRules /></TabsContent>
      <TabsContent value="me" className="pt-3"><AffectingPanel /></TabsContent>
    </Tabs>
  );
}

function Rulebook({ markdown }: { markdown: string }) {
  const sections = useMemo(() => parseRulebook(markdown), [markdown]);
  const [open, setOpen] = useState(1);
  const [q, setQ] = useState("");
  const query = q.trim();

  const hits = useMemo(() => {
    if (query.length < 2) return [];
    const n = query.toLowerCase();
    const out: { section: number; block: number; heading: string; text: string }[] = [];
    sections.forEach((s, si) => {
      let heading = s.title;
      if (s.title.toLowerCase().includes(n)) out.push({ section: si, block: -1, heading, text: "" });
      s.blocks.forEach((b, bi) => {
        if (b.kind === "h") heading = b.text;
        if (blockText(b).toLowerCase().includes(n)) out.push({ section: si, block: bi, heading, text: b.kind === "h" ? "" : blockText(b) });
      });
    });
    return out;
  }, [sections, query]);

  const go = (section: number, block = -1) => {
    setOpen(section);
    setQ("");
    requestAnimationFrame(() => document.getElementById(block >= 0 ? `rb-${section}-${block}` : "rb-top")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const section = sections[open];

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <Card className="h-fit lg:sticky lg:top-4">
        <CardContent className="grid gap-0.5 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {sections.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              className={cn("rounded px-2 py-1 text-left text-sm hover:bg-muted", s.part ? "mt-2 font-semibold first:mt-0" : "pl-5 text-muted-foreground", i === open && "bg-muted text-foreground")}
            >
              {s.title}
              {(s.updated || s.blocks.some((b) => b.updated)) && <HistoryIcon aria-label="Recently updated" className="ml-1.5 inline size-3 text-primary/80" />}
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4">
          <div className="relative" id="rb-top">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search the whole rulebook…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {query.length >= 2 ? (
            <div className="grid gap-1">
              <p className="text-xs text-muted-foreground">{hits.length ? `${hits.length} match${hits.length === 1 ? "" : "es"}` : "No matches."}</p>
              {hits.slice(0, 80).map((h, i) => (
                <button key={i} type="button" onClick={() => go(h.section, h.block)} className="grid gap-0.5 rounded border-l-2 border-l-primary/50 px-3 py-1.5 text-left hover:bg-muted">
                  <span className="text-xs text-muted-foreground">{sections[h.section].title}{h.heading !== sections[h.section].title && ` · ${h.heading}`}</span>
                  {h.text ? <span className="line-clamp-2 text-sm"><Mark text={h.text} q={query} /></span> : <span className="text-sm font-medium"><Mark text={h.heading} q={query} /></span>}
                </button>
              ))}
              {hits.length > 80 && <p className="text-xs text-muted-foreground">Showing the first 80. Narrow the search to see more.</p>}
            </div>
          ) : (
            <article className="grid gap-3 text-sm leading-relaxed">
              <h2 className="font-heading text-xl font-semibold">{section.title}</h2>
              {section.updated && <UpdateNote ids={section.updated} />}
              {section.blocks.map((b, i) => (
                <Fragment key={i}>
                  {b.updated && <UpdateNote ids={b.updated} />}
                  <RuleBlock id={`rb-${open}-${i}`} block={b} />
                </Fragment>
              ))}
              <div className="flex justify-between gap-2 border-t pt-3 text-sm">
                {open > 0 ? <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => go(open - 1)}>← {sections[open - 1].title}</button> : <span />}
                {open < sections.length - 1 && <button type="button" className="text-right text-muted-foreground hover:text-foreground" onClick={() => go(open + 1)}>{sections[open + 1].title} →</button>}
              </div>
            </article>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const HEADING_STYLE: Record<number, string> = { 3: "mt-3 text-base font-semibold", 4: "mt-2 font-semibold", 5: "font-medium text-muted-foreground" };

function RuleBlock({ id, block: b }: { id: string; block: Block }) {
  if (b.kind === "h") return <h3 id={id} className={cn("scroll-mt-4", HEADING_STYLE[b.level] ?? HEADING_STYLE[5])}>{b.text}</h3>;
  if (b.kind === "ul") return <ul id={id} className="grid list-disc gap-1 pl-5">{b.items.map((t, i) => <li key={i}><GlossaryText text={t} /></li>)}</ul>;
  if (b.kind === "table") return <div id={id} className="scroll-mt-4"><RuleTable head={b.head} rows={b.rows.map((r) => r.map((t, i) => <GlossaryText key={i} text={t} />))} /></div>;
  return <p id={id} className="scroll-mt-4"><GlossaryText text={b.text} /></p>;
}

type QuickCard = { title: string; find: string; body: ReactNode; wide?: boolean };

const Lines = ({ items }: { items: ReactNode[] }) => <ul className="grid list-disc gap-1 pl-5">{items.map((t, i) => <li key={i}>{typeof t === "string" ? <GlossaryText text={t} /> : t}</li>)}</ul>;

const QUICK: QuickCard[] = [
  {
    title: "Rolling dice",
    find: "roll pool attribute skill six success strong routine skilled crisis flat practiced expert project threshold",
    body: (
      <>
        <Lines items={[
          "Skill roll: Attribute + Skill + Pressure dice (d6). Each 6 is a success.",
          "Two or more 6s is a Strong Success, which only matters when the task lists a Strong Result.",
          "A flat roll is the Attribute alone, with no skill or Pressure dice.",
          "Routine: at or above the task's Routine Threshold, with the right tools and no threat, it succeeds without a roll.",
          `Practiced: ${PRACTICED_MARGIN}+ levels above the Routine Threshold costs 1 less Energy. Expert: ${EXPERT_MARGIN}+ above earns the Strong Result without rolling.`,
          `Projects: ${PROJECT_MARGIN}+ levels above the threshold adds 2 Progress per Routine segment.`,
          "Below the threshold, the task is Skilled and needs a roll. Crisis tasks always roll, even for experts.",
          "Outside combat, extra 6s don't give stunts. In combat, they buy stunts.",
          "Injuries take dice off the rolls they list (Minor −1d6, Major and Deadly −2d6).",
        ]} />
        <PoolTry />
      </>
    ),
  },
  {
    title: "Pushing",
    find: "push reroll energy pressure extra task exhausted affliction",
    body: (
      <Lines items={[
        "Costs 1 Energy and raises Pressure by 1 before the reroll.",
        "Either reroll every failed die on one roll (6s are kept) or take one extra task this segment.",
        "At 0 Energy you can still Push, but it costs an Affliction instead of the Energy. A roll can be pushed only once.",
      ]} />
    ),
  },
  {
    title: "Pressure",
    find: "pressure calm shaken pressured overtaxed panicked failure dice " + PRESSURE_STATES.map((p) => p.failure).join(" "),
    body: (
      <>
        <RuleTable head={["State", "Dice", "On a failed roll"]} rows={PRESSURE_STATES.map((p) => [p.name, p.dice ? `+${p.dice}d6` : "—", p.failure])} />
        <p className="mt-2 text-muted-foreground">Gaining Pressure while Panicked triggers a Mind Break and 1 Stress instead. Pressure drops by 1 when danger clearly ends, on each Rest, or from a Reduce Pressure task.</p>
      </>
    ),
  },
  {
    title: "Stress",
    find: "stress stable strained frayed unstable breaking collapsed floor affliction recovery " + STRESS_BANDS.map((b) => b.effect).join(" "),
    body: (
      <>
        <RuleTable head={["Stress", "Band", "Effect"]} rows={STRESS_BANDS.map((b) => [b.min === b.max ? b.min : `${b.min}–${b.max}`, b.name, b.effect])} />
        <p className="mt-2 text-muted-foreground">Bands stack. Pressure can never sit below Shaken at Stress 5+, or below Pressured at Stress 7+. Stress only comes down through a Stress Recovery project.</p>
      </>
    ),
  },
  {
    title: "Mind Breaks",
    find: "mind break d6 " + MIND_BREAKS.map((m) => `${m.name} ${m.effect}`).join(" "),
    body: (
      <>
        <RuleTable head={["d6", "Break", "Effect"]} rows={MIND_BREAKS.map((m) => [m.roll, m.name, m.effect])} />
        <p className="mt-2 text-muted-foreground">Lasts until the character falls unconscious, the danger ends, or someone stabilizes them with a Crisis First Aid or Entertainer task.</p>
      </>
    ),
  },
  {
    title: "Willpower",
    find: "willpower spend prevent stress mind break death check conscious",
    body: (
      <Lines items={[
        "Max Willpower is 1, plus 1 for every 3 Constitution above 1.",
        "Spend 1 to: prevent 1 Stress as it's gained; contest a Mind Break with a flat Constitution roll; resist a Behavioral condition; reroll a failed death check; or stay conscious until the end of the round.",
        "Willpower comes back after a Stress Recovery project or at the end of an Act.",
      ]} />
    ),
  },
  {
    title: "Damage, armor, and cover",
    find: "damage armor ablative cover partial strong full piercing injury threshold hp resistance resistant vulnerability vulnerable immunity",
    body: (
      <>
        <Lines items={[
          "Armor is ablative: each hit it protects against deals 1 less damage, and the Armor loses 1 point.",
          "Cover Armor applies first and doesn't wear down: Partial Cover 1, Strong Cover 2 (against Ballistic). Full Cover blocks targeting.",
          "Armor Piercing X ignores the first X points of Cover, then Armor.",
          "Losing 2+ HP from one source raises Pressure by 1, at most once per round. Losing 3+ HP from one hit (after Cover and Armor), or dropping to 0 HP, causes an Injury roll.",
          "Order: Vulnerability (+half), then Resistance (half), then Cover (Ballistic only), then Armor, then HP. Halves round down; Resistance and Vulnerability together cancel.",
        ]} />
        <DamageTry />
      </>
    ),
  },
  {
    title: "Injuries",
    wide: true,
    find: `injury severity location minor major deadly untreated treated surgery natural recovery bleeding cap duplicate old table convert ${INJURY_TABLE.map((e) => e.name).join(" ")}`,
    body: (
      <>
        <Lines items={[
          "Roll an Injury when one hit takes 3+ HP after Cover and Armor, or when a character drops to 0 HP.",
          "Roll 2d6. The first die is Severity (1–3 Minor, 4–5 Major, 6 Deadly); the second is Location.",
          "Minor: −1d6 to the rolls it lists. Major: −2d6, the listed condition until Surgery, and Bleeding. Deadly: Surgery within four segments or the character dies, or a permanent loss. Every Major or Deadly injury without Surgery is also Pain, −1 Maximum Energy, and a Major one left 3 days without Surgery festers into a Deadly one.",
          "Cap: 2 Minor and 1 Major at a time. Going over the cap, or rolling an injury you already have, makes it one step worse in the same location.",
          "Untreated injuries cost 1 HP each at End of Day. First Aid's first 6 makes any injury Treated, and on a Deadly injury buys one more segment. Only Surgery turns a Major or Deadly injury into a Treated Minor one: always a Crisis task, it needs Surgical Tools, and the Medical Bay sets its penalty (−3d6 without one) and how far the patient's HP drops when it begins. A failure leaves the injury as it was.",
          "Natural recovery: on every Rest, roll Constitution + days since the oldest Treated Minor injury. Any 6 heals it. Permanent losses don't heal naturally.",
          "Injuries from the old 60-entry table are marked \"old table\" and keep working as before until the GM converts them.",
        ]} />
        <RuleTable
          head={["Location", ...SEVERITY_FACES.map((f) => `${f} ${severityFromRoll(f)}`)]}
          rows={INJURY_LOCATIONS.map((loc, i) => [`${i + 1} ${loc}`, ...SEVERITY_FACES.map((f) => INJURY_BY_CODE[`${f}-${i + 1}`]?.name ?? "—")])}
        />
        <InjuryTry />
      </>
    ),
  },
  {
    title: "First Aid",
    find: "first aid medkit glitterworld improvised heal treat condition free action",
    body: (
      <>
        <Lines items={[
          "A free action, any time, with no Energy cost, but it uses up one medkit from your inventory or ship storage.",
          "Roll your First Aid pool plus the kit's dice. The kit also heals its own HP.",
          "If treating an Untreated injury (any severity), the first 6 treats it. Every other 6 heals 1 HP or clears a condition.",
          "Works without any injury, purely to heal. Healing another player's character needs their OK.",
          "In combat it's still a Slow Action.",
        ]} />
        <RuleTable head={["Kit", "Bonus dice", "Heals"]} rows={MEDKITS.map((k) => [k.name, k.dice ? `+${k.dice}d6` : "—", `${k.heal} HP`])} />
      </>
    ),
  },
  {
    title: "Death",
    find: "death dying 0 hp down constitution flat check willpower stabilize stabilized",
    body: (
      <Lines items={[
        "At 0 HP you're down, not dead. At the end of each round, make a flat Constitution roll. No 6 means death.",
        "Spend 1 Willpower to reroll a failed death check.",
        "First Aid with a 6 stabilizes them: no more death checks. Any healing wakes them; new damage ends it.",
        "While down you can't act, and further damage can kill outright.",
      ]} />
    ),
  },
  {
    title: "Rest and End of Day",
    find: "rest sleep end of day food water ration starvation dehydration energy",
    body: (
      <Lines items={[
        "Rest: +1 HP, Energy restored, Pressure −1 (not below the Stress floor), and a natural recovery roll. It needs Food and Water within the last day, or it only counts as sleep.",
        "Sleep Disruption: only one Rest a day helps, and it restores Energy to 1 below max. Compulsive Distraction: a flat Wits roll or no Energy.",
        "Expeditions: 8 Expedition Turns make one segment.",
        "Missed Food: −1 Max Energy tomorrow; from the second day, −2 and Rest restores no Energy; +1 Stress on the third day, and every third day after.",
        "Rationing (half food): a Constitution roll or −1 Max Energy, and 1 Stress every second day in a row.",
        "Missed Water: −2 Max Energy. Two days is death without immediate intervention.",
        "No sleep: −1 Max Energy, then −3, then collapse for 2 segments; +1 Stress on the third night, and every third night after.",
        "At End of Day, Pressure resets to the Stress floor.",
      ]} />
    ),
  },
  {
    title: "Combat turns",
    find: "combat turn initiative slow fast action reaction move sprint disengage engaged aim cover reload",
    body: (
      <Lines items={[
        "Initiative: everyone draws a card from 1–10. Lowest acts first. Allies may trade cards before round one.",
        "On your turn: one Slow and one Fast Action, or two Fast Actions.",
        "Slow: attack, reload, sprint 2 zones, overwatch, stop Bleeding, First Aid in combat, repair, drag a body, mark an enemy.",
        "Fast: move 1 zone, get up or drop prone, draw an item, aim, take cover, disengage, reserve a Reaction.",
        "Leaving an Engaged zone without Disengaging gives one enemy a free attack.",
        "One Reaction per round (Block, Dodge, and so on). An unused Reaction is lost at the start of your next turn.",
      ]} />
    ),
  },
  {
    title: "Range",
    find: "range close short medium long zones",
    body: (
      <>
        <RuleTable head={["Range", "Distance"]} rows={[["Close", "Same zone"], ["Short", "Adjacent zone"], ["Medium", "Up to 2 zones"], ["Long", "Up to 4 zones"]]} />
        <p className="mt-2 text-muted-foreground">You can fire one zone beyond a weapon&apos;s range at −3d6. No line of sight means no attack.</p>
      </>
    ),
  },
];

function QuickReference({ updates }: { updates: RuleUpdate[] }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const matches = (s: string) => !n || s.toLowerCase().includes(n);

  const cards = QUICK.filter((c) => matches(`${c.title} ${c.find}`));
  const shownUpdates = updates.filter((r) => matches(`update ${r.title} ${r.text}`));
  const conditions = CONDITIONS.filter((c) => matches(`condition ${c.name} ${c.effect} ${c.removal}`));

  return (
    <div className="grid gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search rules, updates, and conditions…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {shownUpdates.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HistoryIcon className="size-4" /> Recent updates</CardTitle>
            <p className="text-xs text-muted-foreground">Recent rules changes. Most are already written into the rulebook, where each changed passage is marked &quot;Updated&quot;.</p>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            {shownUpdates.map((r) => (
              <div key={r.id} className="border-l-2 border-l-primary/60 pl-3">
                <p className="font-medium">{r.title}</p>
                <p className="text-muted-foreground"><GlossaryText text={r.text} /></p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title} className={cn("min-w-0", c.wide && "md:col-span-2")}>
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpenIcon className="size-4 text-muted-foreground" /> {c.title}</CardTitle></CardHeader>
            <CardContent className="grid min-w-0 gap-2 text-sm [&>*]:min-w-0">{c.body}</CardContent>
          </Card>
        ))}
      </div>

      {conditions.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Conditions <Badge variant="secondary" className="ml-1">{conditions.length}</Badge></CardTitle></CardHeader>
          <CardContent className="grid gap-x-6 gap-y-2.5 text-sm md:grid-cols-2">
            {conditions.map((c) => (
              <div key={c.name}>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground">{c.effect}</p>
                <p className="text-xs text-muted-foreground/80">Ends: {c.removal}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {n && !cards.length && !shownUpdates.length && !conditions.length && <p className="py-6 text-center text-sm text-muted-foreground">Nothing in the quick reference matches. Try the Rulebook tab, which searches every page.</p>}
    </div>
  );
}
