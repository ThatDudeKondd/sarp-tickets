import { SlashCommandBuilder } from 'discord.js';

export const slashCommands = [
  new SlashCommandBuilder().setName('claim').setDescription('Claim this ticket'),
  new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Unclaim this ticket (claimant only)'),
  new SlashCommandBuilder()
    .setName('forceunclaim')
    .setDescription('Force-unclaim this ticket (senior staff)'),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket')
    .addStringOption((o) =>
      o.setName('reason').setDescription('Close reason').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('closerequest')
    .setDescription('Ask the opener to close this ticket')
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer this claimed ticket to another staff member')
    .addUserOption((o) =>
      o.setName('user').setDescription('Staff member').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user or role to this ticket')
    .addMentionableOption((o) =>
      o.setName('input').setDescription('User or role to add').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user or role from this ticket')
    .addMentionableOption((o) =>
      o.setName('input').setDescription('User or role to remove').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('switchpanel')
    .setDescription('Change the ticket type')
    .addStringOption((o) =>
      o
        .setName('panel')
        .setDescription('Ticket type')
        .setRequired(true)
        .addChoices(
          { name: 'General Support', value: 'general' },
          { name: 'Supervisory Support', value: 'supervisor' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename this ticket channel')
    .addStringOption((o) =>
      o.setName('input').setDescription('New channel name').setRequired(true),
    ),
].map((c) => c.toJSON());
