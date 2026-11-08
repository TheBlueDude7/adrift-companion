"use client";

import { useState } from "react";
import { CrosshairIcon, EyeIcon, HeartPulseIcon, PlusIcon, SkullIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { armed, attackBlocker, attackPool, COVER_POINTS, deathCheck, defenseOf, newThreat, resolveAttack, type AttackShot, type Cover } from "@/lib/combat";
import { maxHp } from "@/lib/derive";
import { DAMAGE_TYPES, SKILL_BY_KEY, WEAPON_RANGES, threatBand, type DamageType } from "@/lib/rules";
import { useGame } from "@/lib/store";
import { attackOwnTarget } from "@/lib/sync/client";
import type { Character, GameState, Line, Threat } from "@/lib/types";
import { usePerms } from "@/lib/use-perms";
import { cn } from "@/lib/utils";
import { EmptyState, Meter, Pill, SectionTitle, Stepper } from "./common";

const COVER_LABEL: Record<Cover, string> = {
  none: "No cover",
  partial: "Partial Cover (1)",
  strong: "Strong Cover (2)",
};

const RANGE_LABEL: Record<keyof typeof WEAPON_RANGES, string> = {
  melee: "melee",
  close: "close",
  short: "short, 1 zone",
  medium: "medium, 2 zones",
  long: "long, 4 zones",
};

const BAND_TONE = { unhurt: "muted", hurt: "warn", "badly hurt": "danger", down: "muted" } as const;

/** Everything a shot could be aimed at: the GM's threats first, then survivors still standing. */
function targets(g: GameState) {
  return [
    ...g.threats.filter((t) => t.band !== "down").map((t) => ({ id: t.id, label: `${t.name} — ${t.stats ? `${t.stats.hp}/${t.stats.maxHp} HP` : t.band}`, threat: true })),
    ...g.characters.filter((c) => !c.dead).map((c) => ({ id: c.id, label: `${c.name} — ${c.hp}/${maxHp(c)} HP`, threat: false })),
  ];
}

/**
 * What a threat shrugs off. The GM sees its real defenses; a player sees only the ones the crew
 * earned by Analyze, which is why the two lists are built from different places.
 */
function TypePills({ t, gm }: { t: Threat; gm: boolean }) {
  if (!gm || !t.stats) {
    return (
      <>
        {t.known.defenses.map((k) => (
          <Pill key={k.type} tone={k.effect === "vulnerable" ? "danger" : k.effect === "normal" ? "muted" : "good"} tip="Worked out by the crew.">
            {k.effect === "normal" ? `${k.type}: ordinary` : `${k.effect === "resists" ? "Resists" : k.effect === "immune" ? "Immune" : "Vulnerable"}: ${k.type}`}
          </Pill>
        ))}
      </>
    );
  }
  const known = new Set(t.known.defenses.map((k) => k.type));
  const mark = (x: DamageType) => (known.has(x) ? "" : " ·");
  return (
    <>
      {t.stats.immune.map((x) => <Pill key={`i${x}`} tone="info" tip={known.has(x) ? "Takes no damage of this type. The crew knows." : "Takes no damage of this type. The crew doesn't know yet."}>Immune: {x}{mark(x)}</Pill>)}
      {t.stats.resist.map((x) => <Pill key={`r${x}`} tone="good" tip={known.has(x) ? "Halved, rounding down. The crew knows." : "Halved, rounding down. The crew doesn't know yet."}>Resists: {x}{mark(x)}</Pill>)}
      {t.stats.vulnerable.map((x) => <Pill key={`v${x}`} tone="danger" tip={known.has(x) ? "Raised by half, rounding down. The crew knows." : "Raised by half, rounding down. The crew doesn't know yet."}>Vulnerable: {x}{mark(x)}</Pill>)}
    </>
  );
}

/** The GM's picker for what a threat shrugs off. A type can only sit in one of the three lists. */
function TypeRow({ label, chosen, others, onChange }: { label: string; chosen: DamageType[]; others: DamageType[]; onChange: (v: DamageType[]) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {DAMAGE_TYPES.map((t) => {
          const taken = others.includes(t);
          return (
            <label key={t} className={cn("flex items-center gap-1.5 text-sm", taken && "opacity-40")}>
              <Checkbox
                checked={chosen.includes(t)}
                disabled={taken}
                aria-label={`${label}: ${t}`}
                onCheckedChange={(v) => onChange(v ? [...chosen, t] : chosen.filter((x) => x !== t))}
              />
              {t}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ThreatDialog({ existing }: { existing?: Threat }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const s = existing?.stats;
  const [name, setName] = useState(existing?.name ?? "");
  const [hp, setHp] = useState(s?.maxHp ?? 8);
  const [armor, setArmor] = useState(s?.armor ?? 0);
  const [resist, setResist] = useState<DamageType[]>(s?.resist ?? []);
  const [vulnerable, setVulnerable] = useState<DamageType[]>(s?.vulnerable ?? []);
  const [immune, setImmune] = useState<DamageType[]>(s?.immune ?? []);
  const [notes, setNotes] = useState(s?.notes ?? "");

  function reset() {
    setName(existing?.name ?? "");
    setHp(s?.maxHp ?? 8);
    setArmor(s?.armor ?? 0);
    setResist(s?.resist ?? []);
    setVulnerable(s?.vulnerable ?? []);
    setImmune(s?.immune ?? []);
    setNotes(s?.notes ?? "");
  }

  function save() {
    const shown = name.trim() || "Something";
    if (existing) {
      act("Edit a threat", (g) => {
        const t = g.threats.find((x) => x.id === existing.id);
        if (!t?.stats) return "";
        const grew = Math.max(0, hp - t.stats.maxHp);
        t.name = shown;
        t.stats = { hp: Math.max(0, Math.min(hp, t.stats.hp + grew)), maxHp: hp, armor, resist, vulnerable, immune, notes };
        t.band = threatBand(t.stats.hp, t.stats.maxHp);
        // A defense the crew had worked out may no longer be true, so re-read what they know.
        t.known.defenses = t.known.defenses.map((k) => ({ type: k.type, effect: defenseOf(t.stats!, k.type) }));
        return [{ text: `${shown} looks ${t.band}.` }, { text: `${shown}: ${t.stats.hp}/${hp} HP, ${armor} plating.`, gm: true }];
      });
    } else {
      act("Add a threat", (g) => {
        const t = newThreat(shown, hp, armor);
        t.stats = { ...t.stats!, resist, vulnerable, immune, notes };
        g.threats.push(t);
        return [{ text: `⚔ ${shown} enters the fight.` }, { text: `${shown}: ${hp} HP${armor ? `, ${armor} plating` : ""}.`, gm: true }];
      });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger
        render={existing
          ? <Button size="xs" variant="outline">Edit</Button>
          : <Button size="sm" variant="outline"><PlusIcon /> Add a threat</Button>}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? existing.name : "New threat"}</DialogTitle>
          <DialogDescription>
            None of this reaches the players. They see the name, how hurt it looks, and whatever they work out by Analyze — the server strips the rest before it leaves.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="threat-name">Name</Label>
            <Input id="threat-name" placeholder="Hull-breach scavenger" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Label>HP</Label>
              <Stepper value={hp} onChange={setHp} min={1} max={200} label="HP" />
            </div>
            <div className="flex items-center gap-2">
              <Label>Plating</Label>
              <Stepper value={armor} onChange={setArmor} min={0} max={10} label="plating" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Plating is ablative, like a survivor&apos;s Armor: it absorbs 1 from a hit and loses a point.</p>
          <TypeRow label="Immune to" chosen={immune} others={[...resist, ...vulnerable]} onChange={setImmune} />
          <TypeRow label="Resists" chosen={resist} others={[...immune, ...vulnerable]} onChange={setResist} />
          <TypeRow label="Vulnerable to" chosen={vulnerable} others={[...immune, ...resist]} onChange={setVulnerable} />
          <div className="grid gap-1.5">
            <Label htmlFor="threat-notes">Notes</Label>
            <Input id="threat-notes" placeholder="Optional: how it fights, what it wants" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>{existing ? "Save" : "Add it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The GM hands over one fact at a time, which is how a successful Analyze pays off. */
function RevealDialog({ t }: { t: Threat }) {
  const act = useGame((s) => s.act);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DamageType | "none">("none");
  const [fact, setFact] = useState("");
  const known = new Set(t.known.defenses.map((k) => k.type));
  const left = DAMAGE_TYPES.filter((x) => !known.has(x));

  function give() {
    act("Reveal what the crew learned", (g) => {
      const x = g.threats.find((y) => y.id === t.id);
      if (!x?.stats) return "";
      const out: Line[] = [];
      if (type !== "none") {
        const effect = defenseOf(x.stats, type);
        x.known.defenses.push({ type, effect });
        out.push({ text: `The crew works out how ${x.name} answers ${type} damage: ${effect === "normal" ? "ordinarily" : effect}.` });
      }
      if (fact.trim()) {
        x.known.facts.push(fact.trim());
        out.push({ text: `They learn something about ${x.name}: ${fact.trim()}` });
      }
      return out;
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setType("none"); setFact(""); } }}>
      <DialogTrigger render={<Button size="xs" variant="outline"><EyeIcon /> Reveal</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What {t.name} gives up</DialogTitle>
          <DialogDescription>
            After a successful Analyze. Pick a damage type and the app tells them the truth about it — resisted, vulnerable, immune, or ordinary. Facts you write are passed on as written.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>A damage type they pin down</Label>
            <Select value={type} onValueChange={(v) => setType((v as DamageType | null) ?? "none")}>
              <SelectTrigger className="w-full"><SelectValue>{type === "none" ? "Nothing this time" : type}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nothing this time</SelectItem>
                {left.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
            {left.length === 0 && <p className="text-[11px] text-muted-foreground">They&apos;ve worked out all five already.</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reveal-fact">Or a fact, in your words</Label>
            <Input id="reveal-fact" placeholder="It won't cross the coolant spill" value={fact} onChange={(e) => setFact(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={type === "none" && !fact.trim()} onClick={give}>Tell them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreatCard({ t }: { t: Threat }) {
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const s = t.stats;
  const down = t.band === "down";

  const setHp = (next: number) =>
    act("Threat HP", (g) => {
      const x = g.threats.find((y) => y.id === t.id);
      if (!x?.stats) return "";
      x.stats.hp = next;
      const was = x.band;
      x.band = threatBand(next, x.stats.maxHp);
      return [
        ...(x.band === was ? [] : [{ text: `${x.name} looks ${x.band}.` }]),
        { text: `${x.name}: ${next}/${x.stats.maxHp} HP.`, gm: true },
      ];
    });

  return (
    <div className={cn("grid gap-2 rounded-lg border p-2.5", down ? "bg-muted/20 opacity-70" : "bg-background/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t.name}</span>
        <Pill tone={BAND_TONE[t.band]}>{down ? "Down" : t.band}</Pill>
        {s && s.armor > 0 && <Pill tip="Ablative: it absorbs 1 from a hit, then loses a point. The crew is never told.">{s.armor} plating</Pill>}
        <TypePills t={t} gm={isGM} />
        {t.conditions.map((c) => <Pill key={c.name} tone="warn">{c.name}</Pill>)}
        {s && <span className="tabular ml-auto font-mono text-sm">{s.hp}<span className="text-muted-foreground">/{s.maxHp}</span></span>}
      </div>
      {s && <Meter value={s.hp} max={s.maxHp} tone="hp" segmented={s.maxHp <= 16} />}
      {t.known.facts.map((f, i) => <p key={i} className="text-xs text-muted-foreground">Known: {f}</p>)}
      {s?.notes && <p className="text-xs text-amber-200/70">Yours: {s.notes}</p>}
      {isGM && s && (
        <div className="flex items-center gap-2">
          <Stepper value={s.hp} onChange={setHp} min={0} max={s.maxHp} label={`${t.name} HP`} size="xs" />
          <div className="ml-auto flex gap-1">
            <RevealDialog t={t} />
            <ThreatDialog existing={t} />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${t.name}`}
              title="Remove from the fight"
              onClick={() => act("Remove a threat", (g) => { g.threats = g.threats.filter((x) => x.id !== t.id); return `${t.name} is no longer in the fight.`; })}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AttackDialog({ attacker }: { attacker: Character }) {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const { isGM } = usePerms();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("unarmed");
  const [targetId, setTargetId] = useState("");
  const [zones, setZones] = useState(0);
  const [cover, setCover] = useState<Cover>("none");
  const [aim, setAim] = useState(false);
  const [burst, setBurst] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const options = armed(game, attacker.id);
  const choice = options.find((o) => (o.item?.id ?? "unarmed") === itemId) ?? options[0];
  const list = targets(game).filter((t) => t.id !== attacker.id);
  const target = list.find((t) => t.id === targetId);
  const shot: AttackShot = { zones, cover, aim, burst, answers };
  const blocked = attackBlocker(choice.weapon, shot, attacker);
  const pool = attackPool(attacker, choice.weapon, shot);
  const w = choice.weapon;

  function send() {
    if (!target) return;
    if (isGM) {
      act(`${attacker.name} attacks`, (g) => {
        const r = resolveAttack(g, attacker.id, target.id, choice.item?.id ?? null, shot);
        return "error" in r ? r.error : r.lines;
      }, "roll");
    } else void attackOwnTarget({ attackerId: attacker.id, targetId: target.id, itemId: choice.item?.id ?? null, zones, cover, aim, burst, answers });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setItemId(options[options.length - 1]?.item?.id ?? "unarmed"); setTargetId(list[0]?.id ?? ""); setZones(0); setCover("none"); setAim(false); setBurst(false); setAnswers({}); } }}>
      <DialogTrigger render={<Button size="xs" variant="outline"><CrosshairIcon /> Attack</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{attacker.name} attacks</DialogTitle>
          <DialogDescription>The app rolls this and applies the damage, so pick only the weapon, the target, and the shot.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Weapon</Label>
            <Select value={itemId} onValueChange={(v) => setItemId(v ?? "unarmed")}>
              <SelectTrigger className="w-full"><SelectValue>{choice.item?.name ?? "Unarmed"}</SelectValue></SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.item?.id ?? "unarmed"} value={o.item?.id ?? "unarmed"}>
                    {o.item?.name ?? "Unarmed"}{o.item?.charges !== undefined ? ` (${o.item.charges} left)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {w.damage} {w.damageType}{w.damage === 0 ? " damage" : ""} · {RANGE_LABEL[w.range]} · {SKILL_BY_KEY[w.skill].name}
              {w.ap ? ` · pierces ${w.ap} Armor` : ""}
              {w.blast ? ` · ${w.blast} to everything else in the zone` : ""}
              {w.nonlethal ? " · nonlethal" : ""}
              {w.thrown ? " · thrown" : ""}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Target</Label>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to shoot at. The GM adds threats above.</p>
            ) : (
              <Select value={targetId} onValueChange={(v) => setTargetId(v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue>{target?.label ?? "Pick a target"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {list.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label>Zones away</Label>
            <Stepper value={zones} onChange={setZones} min={0} max={10} label="zones" />
          </div>
          <div className="grid gap-1.5">
            <Label>Their cover</Label>
            <Select value={cover} onValueChange={(v) => setCover(v as Cover)}>
              <SelectTrigger className="w-full"><SelectValue>{COVER_LABEL[cover]}</SelectValue></SelectTrigger>
              <SelectContent>
                {(Object.keys(COVER_POINTS) as Cover[]).map((k) => <SelectItem key={k} value={k}>{COVER_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Cover Armor only absorbs Ballistic damage, and never wears down.</p>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={aim} onCheckedChange={(v) => setAim(!!v)} aria-label="Aim" /> Aimed first (+1d6)
            </label>
            <label className={cn("flex items-center gap-2 text-sm", !w.auto && "opacity-40")}>
              <Checkbox checked={burst} disabled={!w.auto} onCheckedChange={(v) => setBurst(!!v)} aria-label="Burst Fire" /> Burst Fire (+2d6)
            </label>
          </div>
          {!w.auto && <p className="text-[11px] text-muted-foreground">Burst Fire needs an automatic weapon, and nothing craftable is one — it will come from salvage.</p>}
          {pool.asks.length > 0 && (
            <div className="grid gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
              <Label>Conditions the rules leave to a ruling</Label>
              {pool.asks.map((a) => (
                <label key={a.key} className="flex items-start gap-2 text-sm">
                  <Checkbox checked={answers[a.key] === true} aria-label={`${a.condition}: ${a.question}`} onCheckedChange={(v) => setAnswers((x) => ({ ...x, [a.key]: !!v }))} />
                  <span className="grid">
                    <span>{a.question}</span>
                    <span className="text-[11px] text-muted-foreground">{a.condition} {a.dice < 0 ? `−${-a.dice}d6` : `+${a.dice}d6`} if so{a.once ? ", and then it's spent" : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="grid gap-1 rounded-md bg-muted/40 p-2 text-sm">
            {blocked ? <span className="text-amber-300">{blocked}</span> : <span><span className="font-mono">{pool.dice}d6</span> <span className="text-xs text-muted-foreground">— {pool.parts.join(", ")}</span></span>}
            {!blocked && pool.dice === 0 && <span className="text-xs text-amber-300">No dice left, so this can only miss — and it still spends the ammunition.</span>}
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!target || !!blocked} onClick={send}><CrosshairIcon /> Roll the attack</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeathCheckRow({ c }: { c: Character }) {
  const act = useGame((s) => s.act);
  const { isGM, canEditCharacter } = usePerms();
  const [willpower, setWillpower] = useState(false);
  const mine = canEditCharacter(c.id);

  function roll() {
    if (isGM) act(`${c.name}'s death check`, (g) => deathCheck(g.characters.find((x) => x.id === c.id)!, willpower), "roll");
    else void attackOwnTarget({ step: "death-check", attackerId: c.id, willpower });
  }

  return (
    <div className="grid gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SkullIcon className="size-4 text-rose-300" />
        <span className="font-medium">{c.name}</span>
        <Pill tone="danger">Down at 0 HP</Pill>
        {c.willpower > 0 && <Pill tone="info">{c.willpower} Willpower</Pill>}
      </div>
      <p className="text-xs text-muted-foreground">A flat Constitution roll at the end of each round. Any 6 and they hold on.</p>
      {mine ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className={cn("flex items-center gap-2 text-sm", c.willpower === 0 && "opacity-40")}>
            <Checkbox checked={willpower} disabled={c.willpower === 0} onCheckedChange={(v) => setWillpower(!!v)} aria-label="Spend Willpower on a reroll" />
            Spend 1 Willpower to reroll a failure
          </label>
          <Button size="xs" variant="outline" className="ml-auto" onClick={roll}>Roll the death check</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Theirs to roll.</p>
      )}
    </div>
  );
}

export function CombatTab() {
  const game = useGame((s) => s.game);
  const { isGM, myCharacterId } = usePerms();
  const fighters = game.characters.filter((c) => !c.dead && c.hp > 0 && (isGM || c.id === myCharacterId));
  const dying = game.characters.filter((c) => !c.dead && c.hp === 0 && !c.stabilized);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SkullIcon className="size-4 text-primary" /> Threats</CardTitle>
          <CardDescription>
            {isGM
              ? "Yours to add, edit and play. The players are sent the name, how hurt it looks, and anything they've worked out by Analyze — the numbers never leave the server, so what you keep back stays back."
              : "What you're fighting. How hurt it looks is all you get; the rest you work out by Analyze, or by watching what your shots do."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5">
          {game.threats.length === 0 ? (
            <EmptyState
              title="Nothing hostile"
              body={isGM ? "Add a threat when a fight starts, so attacks against it are rolled and applied like any other." : "Nothing the crew can see."}
              action={isGM ? <ThreatDialog /> : undefined}
            />
          ) : (
            <>
              {game.threats.map((t) => <ThreatCard key={t.id} t={t} />)}
              {isGM && <div className="justify-self-start pt-1"><ThreatDialog /></div>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CrosshairIcon className="size-4 text-primary" /> Attacks</CardTitle>
          <CardDescription>
            One attack at a time. The app builds the pool from the weapon&apos;s skill, the attacker&apos;s state and the shot, rolls it, and applies the damage in the rulebook&apos;s order.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5">
          {fighters.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody here can act.</p>
          ) : (
            fighters.map((c) => {
              const carried = armed(game, c.id).filter((o) => o.item);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/40 p-2.5">
                  <span className="font-medium">{c.name}</span>
                  {carried.length === 0 ? <Pill tone="warn">Unarmed</Pill> : carried.map((o) => <Pill key={o.item!.id}>{o.item!.name}</Pill>)}
                  <div className="ml-auto"><AttackDialog attacker={c} /></div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {dying.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HeartPulseIcon className="size-4 text-rose-300" /> Death checks</CardTitle>
            <CardDescription>Owed at the end of every round until First Aid stabilizes them or healing brings them above 0 HP.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            <SectionTitle>Still down</SectionTitle>
            {dying.map((c) => <DeathCheckRow key={c.id} c={c} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
