"use client";

import { CheckIcon, CopyIcon, CrownIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, RadioIcon, UsersIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useGame } from "@/lib/store";
import { usePerms } from "@/lib/use-perms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BACKUP_KEY, claimCharacter, connect, hostCampaign, joinCampaign, leaveCampaign, lookupCampaign, reannounce, restoreBackup } from "@/lib/sync/client";
import { cn } from "@/lib/utils";
import { CommitInput } from "./commit-input";
import { Pill } from "./common";

const shareLink = (code: string, gmKey?: string) => `${window.location.origin}/?join=${code}${gmKey ? `&gm=${gmKey}` : ""}`;

function initialJoinCode() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("join")?.toUpperCase() ?? "";
}

function initialGmKey() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("gm") ?? "";
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        variant="outline"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}

function SessionPanel({ code, gmKey, onRename }: { code: string; gmKey?: string; onRename: (v: string) => void }) {
  const { people, playerName, status, game, me } = useGame();
  const perms = usePerms();
  const [showGm, setShowGm] = useState(false);
  const characters = game.characters.filter((c) => !c.dead);
  const takenBy = (id: string) => people.find((p) => p.characterId === id);
  const assign = (characterId: string | null, memberId?: string) => claimCharacter(characterId, memberId).catch((e: Error) => toast.error(e.message));
  const players = people.filter((p) => p.role === "player");
  const online = people.filter((p) => p.online);

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-center">
        <p className="text-xs text-muted-foreground">Join code</p>
        <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-primary">{code}</p>
        <div className="mt-3"><CopyField value={shareLink(code)} label="Invite link" /></div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {perms.isGM ? <Pill tone="warn"><CrownIcon className="size-3" /> Game master</Pill> : <Pill tone="info">Player</Pill>}
        <span className="text-xs text-muted-foreground">
          {perms.isGM ? "You can change everything." : "You can edit your character, the ship's storage, and rooms and projects aboard the ship."}
        </span>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="mp-name-online">Your name</Label>
        <CommitInput id="mp-name-online" value={playerName} placeholder="e.g. Roger (GM)" onCommit={onRename} />
      </div>

      {!perms.isGM && (
        <div className="grid gap-1.5">
          <Label>Your character</Label>
          <Select value={perms.myCharacterId ?? "none"} onValueChange={(v) => assign(v === "none" ? null : (v as string))}>
            <SelectTrigger className="w-full"><SelectValue>{characters.find((c) => c.id === perms.myCharacterId)?.name ?? "Not chosen yet"}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not chosen yet</SelectItem>
              {characters.map((c) => {
                const holder = takenBy(c.id);
                const mine = c.id === perms.myCharacterId;
                return <SelectItem key={c.id} value={c.id} disabled={!!holder && !mine}>{c.name}{holder && !mine ? ` (${holder.name})` : ""}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {perms.myCharacterId === null && <p className="text-xs text-muted-foreground">Pick a survivor, or create a new one on the Crew tab. It becomes yours automatically.</p>}
        </div>
      )}

      <div className="grid gap-1.5">
        <p className="text-sm font-medium">People · {online.length} online</p>
        <ul className="grid gap-1.5 text-sm">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", p.online ? "bg-emerald-400" : "bg-muted-foreground/40")} />
              <span className={cn("min-w-0 flex-1 truncate", !p.online && "text-muted-foreground")}>
                {p.name}
                {p.id === me?.id && <span className="text-muted-foreground"> (you)</span>}
              </span>
              {p.role === "gm" ? (
                <Pill tone="warn">GM</Pill>
              ) : perms.isGM ? (
                <Select value={p.characterId ?? "none"} onValueChange={(v) => assign(v === "none" ? null : (v as string), p.id)}>
                  <SelectTrigger size="sm" className="w-40" aria-label={`Character for ${p.name}`}><SelectValue>{characters.find((c) => c.id === p.characterId)?.name ?? "No character"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No character</SelectItem>
                    {characters.map((c) => {
                      const holder = takenBy(c.id);
                      return <SelectItem key={c.id} value={c.id} disabled={!!holder && holder.id !== p.id}>{c.name}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <span className="truncate text-xs text-muted-foreground">{characters.find((c) => c.id === p.characterId)?.name ?? "No character yet"}</span>
              )}
            </li>
          ))}
        </ul>
        {players.length === 0 && status === "online" && perms.isGM && <p className="text-xs text-muted-foreground">Send the invite link to your players. They open it, enter a name, and pick their character.</p>}
      </div>

      {gmKey && (
        <div className="grid gap-2">
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => setShowGm((v) => !v)}>
            <KeyRoundIcon /> {showGm ? "Hide" : "Show"} GM link for your other devices
          </Button>
          {showGm && (
            <>
              <CopyField value={shareLink(code, gmKey)} label="GM link" />
              <p className="text-xs text-amber-200">Anyone with this link gets full GM control. Don&apos;t send it to players.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PlayTogether() {
  const { session, status, people, playerName } = useGame();
  const [open, setOpen] = useState(() => !!initialJoinCode());
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [gmKey] = useState(initialGmKey);
  const [linkCode] = useState(initialJoinCode);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof lookupCampaign>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasBackup, setHasBackup] = useState(false);

  useEffect(() => {
    if (session) connect(session.code);
    if (initialJoinCode()) window.history.replaceState(null, "", window.location.pathname);
    // Only on first mount: resume the saved session and consume the invite link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onOpenChange(o: boolean) {
    setOpen(o);
    setError("");
    if (o) setHasBackup(!!localStorage.getItem(BACKUP_KEY));
    else setPreview(null);
  }

  const setName = (name: string) => useGame.setState({ playerName: name.trim().slice(0, 40) });
  const named = playerName.trim().length > 0;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const dot = status === "online" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400 animate-pulse" : "bg-rose-400";

  return (
    <>
      {session ? (
        <Button size="sm" variant="outline" onClick={() => onOpenChange(true)} title={status === "online" ? "Shared campaign: everyone's edits sync live" : "Reconnecting to the shared campaign"}>
          <span className={cn("size-2 rounded-full", dot)} />
          <span className="font-mono">{session.code}</span>
          <span className="hidden text-muted-foreground sm:inline">· {people.filter((p) => p.online).length || 1}</span>
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => onOpenChange(true)}>
          <UsersIcon /> <span className="hidden lg:inline">Play together</span>
        </Button>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          {session ? (
            <>
              <DialogHeader>
                <DialogTitle>Shared campaign</DialogTitle>
                <DialogDescription>
                  {status === "online" && "Everyone with the code edits the same campaign. Changes appear for all players within a moment."}
                  {status === "connecting" && "Connecting to the server… Your changes are kept and sent as soon as the connection is back."}
                  {status === "lost" && "This campaign is no longer on the server. Leave to keep playing with the copy on this device."}
                </DialogDescription>
              </DialogHeader>
              <SessionPanel code={session.code} gmKey={session.gmKey} onRename={(v) => { setName(v); reannounce(); }} />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    leaveCampaign();
                    onOpenChange(false);
                    toast("Left the shared campaign. The latest version is kept on this device.");
                  }}
                >
                  <LogOutIcon /> Leave
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Play together</DialogTitle>
                <DialogDescription>Host this campaign on the server so every player can edit it at once from their own device, or join someone else&apos;s.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="mp-name">Your name</Label>
                  <Input id="mp-name" value={playerName} placeholder="Shown to other players and in the log" onChange={(e) => useGame.setState({ playerName: e.target.value.slice(0, 40) })} />
                </div>

                <div className="grid gap-2 rounded-xl border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium"><RadioIcon className="size-4 text-primary" /> Host this campaign</p>
                  <p className="text-xs text-muted-foreground">Uploads the campaign you have open now and gives you a code to share.</p>
                  <Button disabled={!named || busy} onClick={() => run(async () => { const c = await hostCampaign(); toast.success(`Hosting as ${c}. Share the invite link with your players.`); })}>
                    {busy && !preview ? <Loader2Icon className="animate-spin" /> : <RadioIcon />} Host campaign
                  </Button>
                </div>

                <div className="grid gap-2 rounded-xl border p-3">
                  <p className="flex items-center gap-2 text-sm font-medium"><UsersIcon className="size-4 text-primary" /> Join a campaign</p>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Join code"
                      placeholder="6-letter code"
                      value={joinCode}
                      maxLength={6}
                      className="font-mono tracking-widest uppercase"
                      onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setPreview(null); }}
                    />
                    <Button variant="outline" disabled={joinCode.trim().length !== 6 || busy} onClick={() => run(async () => setPreview(await lookupCampaign(joinCode)))}>Find</Button>
                  </div>
                  {preview && (
                    <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                      <p>
                        <span className="font-medium">{preview.ship}</span> · {preview.crew} survivor{preview.crew === 1 ? "" : "s"} · {preview.people.length} online
                      </p>
                      <p className="text-xs text-muted-foreground">Your current campaign is saved on this device and can be restored after you leave.</p>
                      <Button disabled={!named} onClick={() => { joinCampaign(preview.code, gmKey && preview.code === linkCode ? gmKey : undefined); onOpenChange(false); toast.success(`Joined ${preview.ship}`); }}>
                        Join as {named ? playerName : "…"}{gmKey && preview.code === linkCode ? " (GM)" : ""}
                      </Button>
                    </div>
                  )}
                </div>

                {!named && <p className="text-xs text-amber-200">Enter your name first.</p>}
                {error && <p className="flex items-center gap-2 text-sm text-rose-300"><WifiOffIcon className="size-4" /> {error}</p>}

                {hasBackup && (
                  <>
                    <Separator />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (restoreBackup()) toast.success("Restored the campaign you had before joining");
                        setHasBackup(false);
                      }}
                    >
                      Restore the campaign I had before joining
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
