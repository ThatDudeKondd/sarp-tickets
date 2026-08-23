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
  CHANNEL_LABELS,
  PERM_LABELS,
  REPLY_LABELS,
  ROLE_LABELS,
  V2_FLAGS,
} from '../components/configPanel';
import { getContainerText, setContainerText } from '../components/containerStore';
import { canManagePanel } from '../utils/permissions';

export async function handleConfigPrefix(message: Message): Promise<boolean> {
  if (message.content.trim().toLowerCase() !== '-config') return false;
  if (!message.guild || !message.member) return true;

  if (!canManagePanel(message.member)) {
    await message.reply('You do not have permission to use `-config`.');
    return true;
  }

  if (!message.channel.isTextBased() || !('send' in message.channel)) {
    return true;
  }

  await message.channel.send({
    components: [buildConfigRoot()],
    flags: V2_FLAGS,
  });
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

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!canManagePanel(member)) {
    await interaction.reply({ content: 'You do not have permission.', ephemeral: true });
    return true;
  }

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
    await interaction.reply({ components: [build()], flags: V2_FLAGS });
    return;
  }

  if (id === 'config:channels:pick') {
    await interaction.reply({
      components: [buildConfigChannelSelect(value as ChannelSettingKey)],
      flags: V2_FLAGS,
    });
    return;
  }

  if (id === 'config:roles:pick') {
    await interaction.reply({
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
  await interaction.reply({
    content: `Updated **${CHANNEL_LABELS[key]}** to <#${channelId}>.`,
    ephemeral: true,
  });
}

async function onRoleSelect(interaction: RoleSelectMenuInteraction): Promise<void> {
  const key = interaction.customId.replace('config:roles:set:', '') as RoleSettingKey;
  const roleId = interaction.values[0];
  updateConfig({ [key]: roleId } as Partial<ReturnType<typeof getConfig>>);
  await interaction.reply({
    content: `Updated **${ROLE_LABELS[key]}** to <@&${roleId}>.`,
    ephemeral: true,
  });
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
    await interaction.reply({
      content: `Updated **${PERM_LABELS[key]}** to \`${Math.floor(num)}\`.`,
      ephemeral: true,
    });
    return;
  }

  if (id.startsWith('config:auto_replies:modal:')) {
    const key = id.replace('config:auto_replies:modal:', '') as AutoReplyKey;
    setContainerText(key, value);
    await interaction.reply({
      content: `Updated **${REPLY_LABELS[key]}** in \`data/containers/${key}.json\`.`,
      ephemeral: true,
    });
  }
}
