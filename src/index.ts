import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { env } from "./config";
import { connectDatabase, disconnectDatabase } from "./database/client";
import { slashCommands } from "./commands/slash";
import { handleInteraction } from "./events/interactions";
import { handleMessageCreate } from "./events/messages";
import { closeOpenTicketsForUser } from "./services/tickets";
import { startInactivityScheduler } from "./services/inactivity";
import { startPanelScheduler } from "./services/panelSchedule";
import { getAutoReplyText } from "./components/builders";
import { Jishaku } from "djsko";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// djsko treats an empty owner list as "fall back to the application owner",
// so a missing env var would silently widen access. A placeholder ID that
// matches no real user keeps the console closed instead.
const NO_OWNERS = ["0"];
if (!env.jskOwners.length || !env.jskShellOwners.length) {
  console.warn(
    "JSK_OWNERS / JSK_SHELL_OWNERS not set -- the jsk console is disabled for anyone not listed.",
  );
}

const jsk = new Jishaku(client, {
  prefix: ".", // Root command becomes `.jsk`. Default: '.'
  owners: env.jskOwners.length ? env.jskOwners : NO_OWNERS,
  shellOwners: env.jskShellOwners.length ? env.jskShellOwners : NO_OWNERS,
  encoding: "UTF-8", // Use 'Shift_JIS' for Japanese Windows shell output.
  // Redacts env secrets from everything jsk sends -- including `.jsk update`'s
  // deploy output, which echoes docker/npm logs into the channel.
  security: true,
  updateCommand: "/opt/sarp-project/sarp-tickets/deploy-sarp-tickets.sh",
  restartCommand: "systemctl --user restart sarp-tickets.service",
  promoteCommand: "/opt/sarp-project/sarp-tickets/promote-sarp-tickets.sh",
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(env.token);
    for (const guild of c.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(env.clientId, guild.id), {
        body: slashCommands,
      });
    }
    console.log("Slash commands deployed.");
  } catch (err) {
    console.error("Failed to deploy slash commands:", err);
  }
  startInactivityScheduler(c);
  startPanelScheduler(c);
});

// Joining a new server: register commands there immediately.
client.on(Events.GuildCreate, (guild) => {
  void guild.commands
    .set(slashCommands)
    .catch((err) => console.error(`Failed to deploy slash commands to ${guild.id}:`, err));
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch((err) => {
    console.error("Interaction error:", err);
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      void interaction
        .reply({ content: "Something went wrong.", ephemeral: true })
        .catch(() => null);
    }
  });
});

client.on(Events.MessageCreate, (message) => {
  void handleMessageCreate(message).catch((err) =>
    console.error("Message error:", err),
  );
});

client.on(Events.MessageCreate, (message) => jsk.onMessageCreated(message));

client.on(Events.GuildMemberRemove, (member) => {
  void closeOpenTicketsForUser(
    client,
    member.id,
    getAutoReplyText("leave_close_reason"),
  ).catch((err) => console.error("Leave-close error:", err));
});

async function shutdown() {
  console.log("Shutting down bot...");
  const forceExit = setTimeout(() => process.exit(1), 3000);
  forceExit.unref();
  try {
    await disconnectDatabase();
    client.destroy();
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

connectDatabase()
  .then(() => client.login(env.token))
  .catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });
