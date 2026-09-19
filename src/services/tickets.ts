import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import {
  categoryForType,
  getConfig,
  maxOpenTickets,
  SUPERVISOR_REASON_RE,
  supportRoleForType,
  type TicketType,
} from '../config';
import {
  buildClaimNotice,
  buildTicketControlContainer,
  buildTransferNotice,
  buildUnclaimNotice,
  buildForceUnclaimNotice,
  V2_FLAGS,
} from '../components/builders';
import { blacklistDb, etaDb, ticketsDb, type TicketRow } from '../db';
import { resolveRoblox, relativeTimestamp } from './bloxlink';
import { closeTicket } from './close';
import { shareTicketDataFireAndForget } from './ticketShare';
import {
  discordCreatedAt,
  formatDuration,
  hasClaimRole,
  TICKET_OVERWRITES,
  uniqueChannelName,
} from '../utils/permissions';

const TICKET_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.UseExternalStickers,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

async function buildControl(ticket: TicketRow, guild: Guild) {
  const opener = await guild.members.fetch(ticket.opener_id).catch(() => null);
  const nick = opener?.nickname ?? null;
  const roblox = opener
    ? await resolveRoblox(opener.id, guild.id, nick ?? opener.displayName)
    : { username: null, profileUrl: null, createdAtUnix: null };

  // Display order: server nickname, then Bloxlink username, then Discord display name.
  const robloxName = nick || roblox.username || opener?.displayName || 'Unknown';
  const robloxDisplay = roblox.profileUrl
    ? `[${robloxName}](${roblox.profileUrl})`
    : robloxName;

  const discordUsername = opener?.user.username ?? ticket.opener_id;
  const discordDisplay = `${discordUsername} (${ticket.opener_id})`;
  const discordCreatedUnix = Math.floor(discordCreatedAt(ticket.opener_id).getTime() / 1000);
  const etaAvg = await etaDb.averageMs();
  const openCount = await ticketsDb.countOpenByOpener(ticket.opener_id);

  return buildTicketControlContainer({
    openerId: ticket.opener_id,
    teamRoleId: supportRoleForType(ticket.type),
    robloxDisplay,
    robloxCreatedAt: relativeTimestamp(roblox.createdAtUnix),
    discordDisplay,
    discordCreatedAt: relativeTimestamp(discordCreatedUnix),
    reason: ticket.reason,
    ticketId: ticket.id,
    openCount,
    etaText: etaAvg !== null ? formatDuration(etaAvg) : null,
    claimedBy: ticket.claimed_by,
  });
}

export async function refreshControlMessage(
  channel: TextChannel,
  ticket: TicketRow,
): Promise<void> {
  if (!ticket.control_message_id) return;
  const container = await buildControl(ticket, channel.guild);
  const msg = await channel.messages.fetch(ticket.control_message_id).catch(() => null);
  if (msg) await msg.edit({ components: [container], flags: V2_FLAGS });
}

export async function createTicket(opts: {
  guild: Guild;
  opener: GuildMember;
  selectedType: TicketType;
  reason: string;
}): Promise<{ ok: true; channel: TextChannel; ticket: TicketRow } | { ok: false; error: string }> {
  const { guild, opener, reason } = opts;

  if (await blacklistDb.isBlacklisted(opener.id)) {
    return { ok: false, error: 'You are blacklisted from opening tickets.' };
  }

  if ((await ticketsDb.countOpenByOpener(opener.id)) >= maxOpenTickets()) {
    return { ok: false, error: `You already have ${maxOpenTickets()} open tickets.` };
  }

  let type: TicketType = opts.selectedType;
  let channelBase = opener.user.username;
  if (SUPERVISOR_REASON_RE.test(reason)) {
    type = 'supervisor';
    channelBase = '⚪-ss';
  }

  const name = await uniqueChannelName(guild, channelBase);
  const teamRoleId = supportRoleForType(type);
  const parentId = categoryForType(type);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: opener.id, allow: TICKET_ALLOW },
      { id: teamRoleId, allow: TICKET_ALLOW },
      {
        id: guild.members.me!.id,
        allow: [
          ...TICKET_ALLOW,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  const ticket = await ticketsDb.create({
    channel_id: channel.id,
    guild_id: guild.id,
    opener_id: opener.id,
    type,
    reason,
    opened_at: Date.now(),
  });

  const container = await buildControl(ticket, guild);
  const msg = await channel.send({
    components: [container],
    flags: V2_FLAGS,
    allowedMentions: { users: [opener.id], roles: [teamRoleId] },
  });
  await ticketsDb.setControlMessage(channel.id, msg.id);

  const shared = (await ticketsDb.getByChannel(channel.id)) ?? ticket;
  shareTicketDataFireAndForget(shared, channel.name, guild.client);

  return { ok: true, channel, ticket: shared };
}

export async function claimTicket(
  ticket: TicketRow,
  member: GuildMember,
  channel: TextChannel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ticket.status !== 'open') return { ok: false, error: 'This ticket is closed.' };
  if (member.id === ticket.opener_id) {
    return { ok: false, error: 'You cannot claim your own ticket.' };
  }
  if (ticket.claimed_by) return { ok: false, error: 'This ticket is already claimed.' };
  if (!hasClaimRole(member, ticket.type)) {
    return { ok: false, error: 'You do not have the required role to claim this ticket.' };
  }

  await ticketsDb.recordClaim(ticket, member.id, 'claim');
  const updated = (await ticketsDb.getByChannel(channel.id)) ?? { ...ticket, claimed_by: member.id };
  await refreshControlMessage(channel, updated);
  await channel.send({
    components: [buildClaimNotice(member.id)],
    flags: V2_FLAGS,
    allowedMentions: { users: [member.id] },
  });
  shareTicketDataFireAndForget(updated, channel.name, channel.client);
  return { ok: true };
}

export async function unclaimTicket(
  ticket: TicketRow,
  member: GuildMember,
  channel: TextChannel,
  opts?: { force?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fresh = (await ticketsDb.getByChannel(channel.id)) ?? ticket;
  if (fresh.status !== 'open') return { ok: false, error: 'This ticket is closed.' };
  if (!fresh.claimed_by) return { ok: false, error: 'This ticket is not claimed.' };

  await ticketsDb.recordUnclaim(
    fresh,
    member.id,
    opts?.force ? 'force_unclaim' : 'unclaim',
  );
  const updated = (await ticketsDb.getByChannel(channel.id)) ?? { ...fresh, claimed_by: null };
  await refreshControlMessage(channel, updated);
  await channel.send({
    components: [
      opts?.force
        ? buildForceUnclaimNotice(member.id)
        : buildUnclaimNotice(member.id),
    ],
    flags: V2_FLAGS,
    allowedMentions: { users: [member.id] },
  });
  shareTicketDataFireAndForget(updated, channel.name, channel.client);
  return { ok: true };
}

export async function transferTicket(
  ticket: TicketRow,
  channel: TextChannel,
  from: GuildMember,
  to: GuildMember,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fresh = (await ticketsDb.getByChannel(channel.id)) ?? ticket;
  if (!fresh.claimed_by) return { ok: false, error: 'Ticket must be claimed before transferring.' };
  if (fresh.claimed_by !== from.id) return { ok: false, error: 'Only the claimant can transfer.' };
  const canReceive =
    to.roles.cache.has(getConfig().General_support_role) ||
    to.roles.cache.has(getConfig().Supervisor_support_role);
  if (!canReceive) return { ok: false, error: 'Target must have a support role.' };

  await ticketsDb.recordUnclaim(fresh, from.id, 'transfer_out');
  const afterOut = (await ticketsDb.getByChannel(channel.id)) ?? { ...fresh, claimed_by: null };
  await ticketsDb.recordClaim(afterOut, to.id, 'transfer_in');
  await channel.permissionOverwrites.edit(to.id, { ...TICKET_OVERWRITES });
  const updated = (await ticketsDb.getByChannel(channel.id)) ?? { ...fresh, claimed_by: to.id };
  await refreshControlMessage(channel, updated);
  await channel.send({
    components: [buildTransferNotice(from.id, to.id)],
    flags: V2_FLAGS,
    allowedMentions: { users: [from.id, to.id] },
  });
  shareTicketDataFireAndForget(updated, channel.name, channel.client);
  return { ok: true };
}

export async function switchPanel(
  ticket: TicketRow,
  channel: TextChannel,
  newType: TicketType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ticket.type === newType) return { ok: false, error: 'Ticket is already that type.' };

  const fresh = (await ticketsDb.getByChannel(channel.id)) ?? ticket;
  const oldRole = supportRoleForType(fresh.type);
  const newRole = supportRoleForType(newType);
  await channel.setParent(categoryForType(newType), { lockPermissions: false });
  await channel.permissionOverwrites.delete(oldRole).catch(() => null);
  await channel.permissionOverwrites.edit(newRole, { ...TICKET_OVERWRITES });
  if (fresh.claimed_by) {
    await ticketsDb.recordUnclaim(fresh, fresh.claimed_by, 'switchpanel');
  }
  await ticketsDb.setType(channel.id, newType);
  const updated = (await ticketsDb.getByChannel(channel.id)) ?? {
    ...fresh,
    type: newType,
    claimed_by: null,
  };
  await refreshControlMessage(channel, updated);
  shareTicketDataFireAndForget(updated, channel.name, channel.client);
  return { ok: true };
}

export async function addToTicket(channel: TextChannel, targetId: string): Promise<void> {
  await channel.permissionOverwrites.edit(targetId, { ...TICKET_OVERWRITES });
}

export async function removeFromTicket(
  channel: TextChannel,
  ticket: TicketRow,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (targetId === ticket.opener_id) {
    return { ok: false, error: 'Cannot remove the ticket opener.' };
  }
  if (targetId === supportRoleForType(ticket.type)) {
    return { ok: false, error: 'Cannot remove the support team role.' };
  }
  await channel.permissionOverwrites.delete(targetId);
  return { ok: true };
}

export async function closeOpenTicketsForUser(
  client: Client,
  userId: string,
  reason: string,
): Promise<void> {
  const open = await ticketsDb.getOpenByOpener(userId);
  for (const ticket of open) {
    const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
    if (channel?.isTextBased() && 'guild' in channel) {
      await closeTicket(channel as TextChannel, ticket, client.user!.id, reason);
    }
  }
}
