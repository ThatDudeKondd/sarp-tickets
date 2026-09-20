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

const jsk = new Jishaku(client, {
  prefix: ".", // Root command becomes `.jsk`. Default: '.'
  owners: ["726507399640252416", "1383717448804470817", "1092489655888379915"], // Optional; defaults to the application owner/team.
  shellOwners: ["726507399640252416"],
  encoding: "UTF-8", // Use 'Shift_JIS' for Japanese Windows shell output.
  updateCommand: "/opt/sarp-project/sarp-tickets/deploy-sarp-tickets.sh",
  restartCommand: "systemctl --user restart sarp-tickets.service",
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
