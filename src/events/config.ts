import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChannelSelectMenuInteraction,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import {
  getConfig,
  updateConfig,
  type AutoReplyKey,
  type ChannelSettingKey,
  type PermissionSettingKey,
  type RoleSettingKey,
} from '../config';
import {
  buildConfigAutoRepliesPicker,
  buildConfigChannelSelect,
  buildConfigChannelsPicker,
  buildConfigPermissionsPicker,
  buildConfigRoleSelect,
  buildConfigRolesPicker,
  buildConfigRoot,
  PERM_LABELS,
  REPLY_LABELS,
  V2_FLAGS,
} from '../components/configPanel';
import { getContainerText, setContainerText } from '../components/containerStore';
import { canUseTicketConfig } from '../utils/permissions';
import { logPrefixCommand } from '../services/commandLog';

const CONFIG_TIMEOUT_MS = 5 * 60 * 1000;

interface ConfigSession {
  invokerId: string;
  panelMessage: Message;
  invokingMessage: Message;
  timer: ReturnType<typeof setTimeout>;
}

/** Keyed by panel message ID — the panel is always edited in place, so the key never changes. */
const sessions = new Map<string, ConfigSession>();

function scheduleTimeout(panelMessageId: string): ReturnType<typeof setTimeout> {
  return setTimeout(() => void endSession(panelMessageId), CONFIG_TIMEOUT_MS);
}

async function endSession(panelMessageId: string): Promise<void> {
  const session = sessions.get(panelMessageId);
  if (!session) return;
  sessions.delete(panelMessageId);
  clearTimeout(session.timer);
  await session.panelMessage.delete().catch(() => null);
  await session.invokingMessage.delete().catch(() => null);
}

function touchSession(panelMessageId: string): void {
  const session = sessions.get(panelMessageId);
  if (!session) return;
  clearTimeout(session.timer);
  session.timer = scheduleTimeout(panelMessageId);
}

function panelMessageId(
  interaction:
    | StringSelectMenuInteraction
    | ChannelSelectMenuInteraction
    | RoleSelectMenuInteraction
    | ModalSubmitInteraction,
): string | null {
  if (interaction.isModalSubmit()) {
    return interaction.isFromMessage() ? interaction.message.id : null;
  }
  return interaction.message.id;
}

export async function handleConfigPrefix(message: Message): Promise<boolean> {
  if (message.content.trim().toLowerCase() !== '-config') return false;
  if (!message.guild || !message.member) return true;

  if (!canUseTicketConfig(message.member)) {
    await message.reply('You do not have permission to use `-config`.');
    return true;
  }

  if (!message.channel.isTextBased() || !('send' in message.channel)) {
    return true;
  }

  const panelMessage = await message.channel.send({
    components: [buildConfigRoot()],
    flags: V2_FLAGS,
  });
  sessions.set(panelMessage.id, {
    invokerId: message.author.id,
    panelMessage,
    invokingMessage: message,
    timer: scheduleTimeout(panelMessage.id),
  });
  void logPrefixCommand(message, '-config');
  return true;
}

export async function handleConfigInteraction(interaction: Interaction): Promise<boolean> {
  if (
    !interaction.isStringSelectMenu() &&
    !interaction.isChannelSelectMenu() &&
    !interaction.isRoleSelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return false;
  }

  const id = interaction.customId;
  if (!id.startsWith('config:')) return false;

  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'Guild only.', ephemeral: true });
    return true;
  }

  const msgId = panelMessageId(interaction);
  const session = msgId ? sessions.get(msgId) : undefined;
  if (session && session.invokerId !== interaction.user.id) {
    await interaction.reply({
      content: 'Only the person who ran `-config` can use this.',
      ephemeral: true,
    });
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!canUseTicketConfig(member)) {
    await interaction.reply({ content: 'You do not have permission.', ephemeral: true });
    return true;
  }

  if (msgId) touchSession(msgId);

  if (interaction.isStringSelectMenu()) {
    await onStringSelect(interaction);
    return true;
  }
  if (interaction.isChannelSelectMenu()) {
    await onChannelSelect(interaction);
    return true;
  }
  if (interaction.isRoleSelectMenu()) {
    await onRoleSelect(interaction);
    return true;
  }
  if (interaction.isModalSubmit()) {
    await onModal(interaction);
    return true;
  }

  return true;
}

async function onStringSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;
  const value = interaction.values[0];

  if (id === 'config:root') {
    const map = {
      channels: buildConfigChannelsPicker,
      roles: buildConfigRolesPicker,
      permissions: buildConfigPermissionsPicker,
      auto_replies: buildConfigAutoRepliesPicker,
    } as const;
    const build = map[value as keyof typeof map];
    if (!build) {
      await interaction.reply({ content: 'Unknown category.', ephemeral: true });
      return;
    }
    await interaction.update({ components: [build()], flags: V2_FLAGS });
    return;
  }

  if (id === 'config:channels:pick') {
    await interaction.update({
      components: [buildConfigChannelSelect(value as ChannelSettingKey)],
      flags: V2_FLAGS,
    });
    return;
  }

  if (id === 'config:roles:pick') {
    await interaction.update({
      components: [buildConfigRoleSelect(value as RoleSettingKey)],
      flags: V2_FLAGS,
    });
    return;
  }

  if (id === 'config:permissions:pick') {
    const key = value as PermissionSettingKey;
    const current = String(getConfig().permissions[key]);
    const modal = new ModalBuilder()
      .setCustomId(`config:permissions:modal:${key}`)
      .setTitle(PERM_LABELS[key].slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel('New value (number)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(current)
            .setMaxLength(10),
        ),
      );
    await interaction.showModal(modal);
    return;
  }

  if (id === 'config:auto_replies:pick') {
    const key = value as AutoReplyKey;
    const current = getContainerText(key);
    const modal = new ModalBuilder()
      .setCustomId(`config:auto_replies:modal:${key}`)
      .setTitle(REPLY_LABELS[key].slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel('Message text')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue(current.slice(0, 4000))
            .setMaxLength(2000),
        ),
      );
    await interaction.showModal(modal);
  }
}

async function onChannelSelect(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const key = interaction.customId.replace('config:channels:set:', '') as ChannelSettingKey;
  const channelId = interaction.values[0];
  updateConfig({ [key]: channelId } as Partial<ReturnType<typeof getConfig>>);
  await interaction.update({ components: [buildConfigRoot()], flags: V2_FLAGS });
}

async function onRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const key = interaction.customId.replace('config:roles:set:', '') as RoleSettingKey;
  const roleId = interaction.values[0];
  updateConfig({ [key]: roleId } as Partial<ReturnType<typeof getConfig>>);
  await interaction.update({ components: [buildConfigRoot()], flags: V2_FLAGS });
}

async function onModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;
  const value = interaction.fields.getTextInputValue('value').trim();

  if (id.startsWith('config:permissions:modal:')) {
    const key = id.replace('config:permissions:modal:', '') as PermissionSettingKey;
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      await interaction.reply({ content: 'Enter a valid non-negative number.', ephemeral: true });
      return;
    }
    if (key === 'max_open_tickets' && (num < 1 || num > 25)) {
      await interaction.reply({ content: 'Max open tickets must be 1–25.', ephemeral: true });
      return;
    }
    updateConfig({
      permissions: { ...getConfig().permissions, [key]: Math.floor(num) },
    });
    await returnToRoot(interaction);
    return;
  }

  if (id.startsWith('config:auto_replies:modal:')) {
    const key = id.replace('config:auto_replies:modal:', '') as AutoReplyKey;
    setContainerText(key, value);
    await returnToRoot(interaction);
  }
}

async function returnToRoot(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.isFromMessage()) return;
  await interaction.update({ components: [buildConfigRoot()], flags: V2_FLAGS });
}
