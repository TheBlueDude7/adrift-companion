// Registers the bot's slash commands with Discord. Run once, and again whenever the commands change:
//   node --env-file=.env.local scripts/discord-commands.mjs
// Needs DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN. With DISCORD_GUILD_ID the commands appear in that
// server immediately; without it they're registered globally, which can take up to an hour to show.

const { DISCORD_APPLICATION_ID: appId, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guild } = process.env;
if (!appId || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN first.");
  process.exit(1);
}

const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;
// Hides a command from everyone without Administrator, so players don't see the GM's tools in the
// picker at all. It's cosmetic on its own: the route still checks DISCORD_GM_USER_ID, so another
// admin who isn't the GM is refused anyway. Grant it to specific people under
// Server Settings -> Integrations -> the bot -> Command Permissions.
const GM_ONLY = "0";
const commands = [
  {
    name: "rules",
    description: "Ask a question about Adrift's rules or the companion app",
    options: [{ type: STRING, name: "question", description: "Your question", required: true, max_length: 1000 }],
  },
  { name: "rulings", description: "List the GM's rulings" },
  {
    name: "ruling",
    description: "GM only: add a ruling that overrides the rulebook",
    default_member_permissions: GM_ONLY,
    options: [{ type: STRING, name: "text", description: "The ruling", required: true, max_length: 1500 }],
  },
  {
    name: "sim",
    description: "GM only: play a segment with the simulated crew",
    default_member_permissions: GM_ONLY,
    options: [
      { type: STRING, name: "situation", description: "What the crew is facing, if anything. Leave it out and they plan from the state", max_length: 1500 },
      { type: BOOLEAN, name: "ask", description: "Hear their plans and questions without submitting anything" },
      { type: STRING, name: "answers", description: "Your answers to the questions they asked last time", max_length: 1500 },
      { type: STRING, name: "code", description: "Campaign code, if not the one in ADRIFT_CAMPAIGN", min_length: 6, max_length: 6 },
    ],
  },
  {
    name: "expedition",
    description: "GM only: play one Expedition Turn with the away team",
    default_member_permissions: GM_ONLY,
    options: [
      { type: STRING, name: "situation", description: "What they can see from where they're standing", required: true, max_length: 1500 },
      { type: BOOLEAN, name: "ask", description: "Hear their plans and questions without submitting anything" },
      { type: STRING, name: "answers", description: "Your answers to the questions they asked last time", max_length: 1500 },
      { type: STRING, name: "code", description: "Campaign code, if not the one in ADRIFT_CAMPAIGN", min_length: 6, max_length: 6 },
    ],
  },
  {
    name: "debrief",
    description: "GM only: the crew talks over a finished job and writes down what to do differently",
    default_member_permissions: GM_ONLY,
    options: [
      { type: STRING, name: "about", description: "The job they're talking through (default: the site they just left, or the day)", max_length: 200 },
      { type: STRING, name: "who", description: "Character ids, comma separated, if not everyone who was there", max_length: 500 },
      { type: STRING, name: "code", description: "Campaign code, if not the one in ADRIFT_CAMPAIGN", min_length: 6, max_length: 6 },
    ],
  },
  {
    name: "roster",
    description: "GM only: let the simulated crew make their own characters, in order",
    default_member_permissions: GM_ONLY,
    options: [
      { type: STRING, name: "brief", description: "What this crew is for, if you want to steer them", max_length: 1500 },
      { type: INTEGER, name: "count", description: "How many survivors to make (default: one per configured model)", min_value: 1, max_value: 8 },
      { type: STRING, name: "code", description: "Campaign code, if not the one in ADRIFT_CAMPAIGN", min_length: 6, max_length: 6 },
    ],
  },
];

const url = `https://discord.com/api/v10/applications/${appId}${guild ? `/guilds/${guild}` : ""}/commands`;
const res = await fetch(url, { method: "PUT", headers: { authorization: `Bot ${token}`, "content-type": "application/json" }, body: JSON.stringify(commands) });
if (!res.ok) {
  console.error(`Discord refused the commands: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Registered ${commands.map((c) => `/${c.name}`).join(", ")} ${guild ? "in your server" : "globally"}.`);
