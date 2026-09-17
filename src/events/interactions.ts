import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  Role,
  type ChatInputCommandInteraction,
  type Interaction,
  type Message,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { getConfig, type TicketType } from '../config';
import {
  buildCloseConfirm,
  buildCloseRequest,
  buildCloseRequestDenied,
  V2_FLAGS,
} from '../components/builders';
import { blacklistDb, ticketsDb } from '../db';
import { canForceUnclaim, canManagePanel, isStaffMember, sanitizeChannelName } from '../utils/permissions';
import {
  addToTicket,
  claimTicket,
  createTicket,
  removeFromTicket,
  switchPanel,
  transferTicket,
  unclaimTicket,
} from '../services/tickets';
import { closeTicket, isClosing } from '../services/close';
import { blacklistUser } from '../services/blacklist';
import { refreshAssistancePanel } from '../services/panelSchedule';
import { shareTicketDataFireAndForget } from '../services/ticketShare';
import { logPrefixCommand, logSlashCommand } from '../services/commandLog';
import { handleConfigInteraction, handleConfigPrefix } from './config';

export async function handlePrefixCommand(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;

  if (await handleConfigPrefix(message)) return;

  const content = message.content.trim();

  if (content.toLowerCase() === '-panel tickets') {
    if (!canManagePanel(message.member)) {
      await message.reply('You do not have permission to send the ticket panel.');
      return;
    }
    await refreshAssistancePanel(message.client);
    await message.reply(
      'Ticket panel refreshed. The Assistance channel now contains a single panel message.',
    );
    void logPrefixCommand(message, '-panel tickets');
    return;
  }

  const blacklistMatch = content.match(/^-tickets\s+blacklist\s+(\d{17,20})$/i);
  if (blacklistMatch) {
    if (!canManagePanel(message.member)) {
      await message.reply('You do not have permission to manage the ticket blacklist.');
      return;
    }
    const userId = blacklistMatch[1];
    if (blacklistDb.isBlacklisted(userId)) {
      blacklistDb.remove(userId);
      await message.reply(`Removed <@${userId}> from the ticket blacklist.`);
      void logPrefixCommand(message, `-tickets blacklist ${userId}`);
      return;
    }
    const user = await message.client.users.fetch(userId).catch(() => null);
    await blacklistUser(message.client, userId, 'Manually blacklisted by staff', {
      username: user?.username,
    });
    await message.reply(`Blacklisted <@${userId}> from tickets.`);
    void logPrefixCommand(message, `-tickets blacklist ${userId}`);
  }
}

async function requireTicketChannel(interaction: Interaction) {
  if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
    return null;
  }
  const ticket = ticketsDb.getByChannel(interaction.channel.id);
  if (!ticket || ticket.status !== 'open') return null;
  return { ticket, channel: interaction.channel as TextChannel };
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (await handleConfigInteraction(interaction)) return;

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:select') {
    await onPanelSelect(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:reason:')) {
    await onReasonModal(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket:close:reason:modal') {
    await onCloseReasonModal(interaction);
    return;
  }

  if (interaction.isButton()) {
    await onButton(interaction);
    return;
  }

  if (interaction.isChatInputCommand()) {
    void logSlashCommand(interaction);
    await onSlash(interaction);
  }
}

async function onPanelSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const type = interaction.values[0] as TicketType;
  const modal = new ModalBuilder()
    .setCustomId(`ticket:reason:${type}`)
    .setTitle(type === 'general' ? 'General Support' : 'Supervisory Support')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
  await interaction.showModal(modal);
}

async function onReasonModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.customId.replace('ticket:reason:', '') as TicketType;
  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (!interaction.guild || !interaction.member) {
    await interaction.editReply('Could not resolve guild.');
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const result = await createTicket({
    guild: interaction.guild,
    opener: member,
    selectedType: type,
    reason,
  });

  if (!result.ok) {
    await interaction.editReply(result.error);
    return;
  }

  await interaction.editReply(`Ticket created: ${result.channel}`);
}

async function onCloseReasonModal(interaction: ModalSubmitInteraction): Promise<void> {
  const ctx = await requireTicketChannel(interaction);
  if (!ctx) {
    await interaction.reply({ content: 'Not a ticket channel.', ephemeral: true });
    return;
  }
  const reason = interaction.fields.getTextInputValue('reason').trim() || 'No reason provided';
  await interaction.reply({ content: 'Closing…', ephemeral: true });
  await closeTicket(ctx.channel, ctx.ticket, interaction.user.id, reason);
}

async function onButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id === 'ticket:claim' || id === 'ticket:unclaim' || id === 'ticket:close' ||
      id === 'ticket:close:confirm' || id === 'ticket:close:reason' ||
      id === 'ticket:closerequest:accept' || id === 'ticket:closerequest:deny') {
    const ctx = await requireTicketChannel(interaction);
    if (!ctx) {
      await interaction.reply({ content: 'Not an open ticket.', ephemeral: true });
      return;
    }
    if (isClosing(ctx.channel.id)) {
      await interaction.reply({ content: 'Ticket is already closing.', ephemeral: true });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    // Re-read claim state from the database in case it changed since the control message was built.
    const ticket = ticketsDb.getByChannel(ctx.channel.id) ?? ctx.ticket;

    if (id === 'ticket:claim') {
      await interaction.deferReply({ ephemeral: true });
      const result = await claimTicket(ticket, member, ctx.channel);
      await interaction.editReply(result.ok ? 'Claimed.' : result.error);
      return;
    }

    if (id === 'ticket:unclaim') {
      await interaction.deferReply({ ephemeral: true });
      if (ticket.claimed_by !== member.id) {
        await interaction.editReply('Only the claimant can unclaim. Use `/forceunclaim` if you have permission.');
        return;
      }
      const result = await unclaimTicket(ticket, member, ctx.channel);
      await interaction.editReply(result.ok ? 'Unclaimed.' : result.error);
      return;
    }

    if (id === 'ticket:close') {
      await interaction.reply({
        components: [buildCloseConfirm()],
        flags: V2_FLAGS,
      });
      return;
    }

    if (id === 'ticket:close:confirm') {
      await interaction.deferUpdate().catch(() => null);
      await closeTicket(ctx.channel, ticket, interaction.user.id, 'Closed');
      return;
    }

    if (id === 'ticket:close:reason') {
      const modal = new ModalBuilder()
        .setCustomId('ticket:close:reason:modal')
        .setTitle('Close with reason')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Close reason')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(500),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (id === 'ticket:closerequest:accept') {
      if (interaction.user.id !== ctx.ticket.opener_id) {
        await interaction.reply({ content: 'Only the opener can accept.', ephemeral: true });
        return;
      }
      await interaction.deferUpdate().catch(() => null);
      await closeTicket(ctx.channel, ctx.ticket, interaction.user.id, 'Closed via close request');
      return;
    }

    if (id === 'ticket:closerequest:deny') {
      if (interaction.user.id !== ctx.ticket.opener_id) {
        await interaction.reply({ content: 'Only the opener can deny.', ephemeral: true });
        return;
      }
      await interaction.update({
        components: [buildCloseRequestDenied()],
        flags: V2_FLAGS,
      });
    }
  }
}

async function onSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.commandName;

  const ticketCommands = new Set([
    'claim', 'unclaim', 'forceunclaim', 'close', 'closerequest', 'transfer',
    'add', 'remove', 'switchpanel', 'rename',
  ]);

  if (ticketCommands.has(name)) {
    const ctx = await requireTicketChannel(interaction);
    if (!ctx) {
      await interaction.reply({ content: 'This command can only be used in an open ticket.', ephemeral: true });
      return;
    }
    if (isClosing(ctx.channel.id)) {
      await interaction.reply({ content: 'Ticket is already closing.', ephemeral: true });
      return;
    }

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const ticket = ticketsDb.getByChannel(ctx.channel.id) ?? ctx.ticket;

    switch (name) {
      case 'claim': {
        await interaction.deferReply({ ephemeral: true });
        const result = await claimTicket(ticket, member, ctx.channel);
        await interaction.editReply(result.ok ? 'Claimed.' : result.error);
        return;
      }
      case 'unclaim': {
        await interaction.deferReply({ ephemeral: true });
        if (ticket.claimed_by !== member.id) {
          await interaction.editReply('Only the claimant can unclaim. Use `/forceunclaim` if you have permission.');
          return;
        }
        const result = await unclaimTicket(ticket, member, ctx.channel);
        await interaction.editReply(result.ok ? 'Unclaimed.' : result.error);
        return;
      }
      case 'forceunclaim': {
        await interaction.deferReply({ ephemeral: true });
        if (!canForceUnclaim(member)) {
          await interaction.editReply('You do not have permission to force-unclaim.');
          return;
        }
        if (!ticket.claimed_by) {
          await interaction.editReply(
            'This ticket is not claimed (no claimant in the database). Claim it first, then force-unclaim if needed.',
          );
          return;
        }
        const result = await unclaimTicket(ticket, member, ctx.channel, { force: true });
        await interaction.editReply(result.ok ? 'Force-unclaimed.' : result.error);
        return;
      }
      case 'close': {
        const reason = interaction.options.getString('reason') ?? 'Closed';
        await interaction.reply({ content: 'Closing ticket…', ephemeral: true });
        await closeTicket(ctx.channel, ticket, interaction.user.id, reason);
        return;
      }
      case 'closerequest': {
        if (!isStaffMember(member)) {
          await interaction.reply({ content: 'Staff only.', ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason') ?? undefined;
        await interaction.reply({
          components: [buildCloseRequest(ticket.opener_id, reason)],
          flags: V2_FLAGS,
          allowedMentions: { users: [ticket.opener_id] },
        });
        return;
      }
      case 'transfer': {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('user', true);
        const target = await interaction.guild!.members.fetch(user.id).catch(() => null);
        if (!target) {
          await interaction.editReply('User not found in this server.');
          return;
        }
        const result = await transferTicket(ticket, ctx.channel, member, target);
        await interaction.editReply(result.ok ? 'Transferred.' : result.error);
        return;
      }
      case 'add': {
        const target = interaction.options.getMentionable('input', true);
        if (target instanceof Role) {
          await addToTicket(ctx.channel, target.id);
          await interaction.reply({
            content: `Added <@&${target.id}>.`,
            allowedMentions: { roles: [target.id] },
          });
          return;
        }
        const userId =
          'user' in target && target.user
            ? target.user.id
            : 'id' in target
              ? target.id
              : null;
        if (!userId) {
          await interaction.reply({ content: 'Could not resolve that user.', ephemeral: true });
          return;
        }
        await addToTicket(ctx.channel, userId);
        await interaction.reply({
          content: `Added <@${userId}>.`,
          allowedMentions: { users: [userId] },
        });
        return;
      }
      case 'remove': {
        const target = interaction.options.getMentionable('input', true);
        if (target instanceof Role) {
          const result = await removeFromTicket(ctx.channel, ticket, target.id);
          if (!result.ok) {
            await interaction.reply({ content: result.error, ephemeral: true });
            return;
          }
          await interaction.reply({
            content: `Removed <@&${target.id}>.`,
            allowedMentions: { roles: [target.id] },
          });
          return;
        }
        const userId =
          'user' in target && target.user
            ? target.user.id
            : 'id' in target
              ? (target as { id: string }).id
              : null;
        if (!userId) {
          await interaction.reply({ content: 'Could not resolve that user.', ephemeral: true });
          return;
        }
        const result = await removeFromTicket(ctx.channel, ticket, userId);
        if (!result.ok) {
          await interaction.reply({ content: result.error, ephemeral: true });
          return;
        }
        await interaction.reply({
          content: `Removed <@${userId}>.`,
          allowedMentions: { users: [userId] },
        });
        return;
      }
      case 'switchpanel': {
        await interaction.deferReply({ ephemeral: true });
        if (!isStaffMember(member)) {
          await interaction.editReply('Staff only.');
          return;
        }
        const panel = interaction.options.getString('panel', true) as TicketType;
        const result = await switchPanel(ticket, ctx.channel, panel);
        await interaction.editReply(result.ok ? `Switched to ${panel}.` : result.error);
        return;
      }
      case 'rename': {
        await interaction.deferReply({ ephemeral: true });
        const input = interaction.options.getString('input', true);
        const name = sanitizeChannelName(input);
        if (!name) {
          await interaction.editReply('Invalid name.');
          return;
        }
        const updated = await ctx.channel.setName(name);
        const fresh = ticketsDb.getByChannel(ctx.channel.id) ?? ticket;
        shareTicketDataFireAndForget(fresh, updated.name, interaction.client);
        await interaction.editReply(
          `Renamed to \`${updated.name}\`.` +
            (input.includes(':') && updated.name !== input
              ? '\nNote: `:shortcode:` was converted to emoji. Discord cannot use colon shortcodes in channel names.'
              : ''),
        );
        return;
      }
      default:
        return;
    }
  }
}
