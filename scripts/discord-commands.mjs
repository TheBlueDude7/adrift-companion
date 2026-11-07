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
const BOOLEAN = 5;
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
    options: [{ type: STRING, name: "text", description: "The ruling", required: true, max_length: 1500 }],
  },
  {
    name: "sim",
    description: "GM only: play a segment with the simulated crew",
    options: [
      { type: STRING, name: "situation", description: "What the crew is facing right now", required: true, max_length: 1500 },
      { type: BOOLEAN, name: "ask", description: "Hear their plans and questions without submitting anything" },
      { type: STRING, name: "answers", description: "Your answers to the questions they asked last time", max_length: 1500 },
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
