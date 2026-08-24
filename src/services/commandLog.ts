import type { ChatInputCommandInteraction, Client, Message } from 'discord.js';
import { getConfig } from '../config';
import { buildNamedContainer } from '../components/containerStore';
import { V2_FLAGS } from '../components/builders';

function formatSlashCommand(interaction: ChatInputCommandInteraction): string {
  const parts = [`/${interaction.commandName}`];
  for (const opt of interaction.options.data) {
    if (opt.options?.length) {
      parts.push(opt.name);
      for (const sub of opt.options) {
        parts.push(`${sub.name}:${stringifyOption(sub.value)}`);
      }
    } else {
      parts.push(`${opt.name}:${stringifyOption(opt.value)}`);
    }
  }
  return parts.join(' ');
}

function stringifyOption(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'id' in value) {
    return String((value as { id: string }).id);
  }
  return String(value);
}

export async function logCommandExecuted(
  client: Client,
  opts: {
    command: string;
    userId: string;
    userTag?: string;
    channelId: string | null;
  },
): Promise<void> {
  const channelId = getConfig().Command_Log_Channel;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !('send' in channel)) return;

  const container = buildNamedContainer('command_log', {
    command: opts.command.replace(/`/g, "'"),
    userMention: `<@${opts.userId}>`,
    userId: opts.userId,
    channelMention: opts.channelId ? `<#${opts.channelId}>` : 'Unknown',
  });

  // Blue accent to match the reference layout (no emoji).
  if (typeof container.setAccentColor === 'function') {
    container.setAccentColor(0x5865f2);
  }

  await channel
    .send({
      components: [container],
      flags: V2_FLAGS,
      allowedMentions: { parse: [] },
    })
    .catch((err) => console.error('Command log failed:', err));
}

export async function logSlashCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await logCommandExecuted(interaction.client, {
    command: formatSlashCommand(interaction),
    userId: interaction.user.id,
    channelId: interaction.channelId,
  });
}

export async function logPrefixCommand(message: Message, command: string): Promise<void> {
  await logCommandExecuted(message.client, {
    command,
    userId: message.author.id,
    channelId: message.channel.id,
  });
}
