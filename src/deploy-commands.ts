import { REST, Routes } from 'discord.js';
import { env } from './config';
import { slashCommands } from './commands/slash';

async function main() {
  const rest = new REST({ version: '10' }).setToken(env.token);

  // Guild-scoped deploy needs guild IDs from the API.
  const guilds = (await rest.get(Routes.userGuilds())) as { id: string }[];
  for (const guild of guilds) {
    await rest.put(Routes.applicationGuildCommands(env.clientId, guild.id), {
      body: slashCommands,
    });
    console.log(`Deployed commands to guild ${guild.id}`);
  }
  console.log('Done.');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
