import {
  type GuildMember,
  type Message,
  type TextChannel,
} from 'discord.js';
import { antiPingWindowMs } from '../config';
import {
  buildAntiPingWarning,
  buildTimeoutFailedNotice,
  buildTimeoutNotice,
  getAutoReplyText,
  V2_FLAGS,
} from '../components/builders';
import { antiPingDb, type TicketRow } from '../db';
import { isStaffMember } from '../utils/permissions';
import { closeTicket } from './close';
import { getConfig } from '../config';
function messagePingsStaff(message: Message, ticket: TicketRow): boolean {
  const mentionedUsers = [...message.mentions.users.keys()];
  const mentionedRoles = [...message.mentions.roles.keys()];
  const c = getConfig();

  const staffRoles = new Set([
    c.General_support_role,
    c.Supervisor_support_role,
    c.Force_unclaim_role,
    c.Panel_min_role,
  ]);

  if (mentionedRoles.some((id) => staffRoles.has(id))) return true;
  if (message.mentions.everyone) return true;

  for (const userId of mentionedUsers) {
    if (userId === message.author.id) continue;
    if (userId === ticket.opener_id) continue;
    if (ticket.claimed_by && userId === ticket.claimed_by) continue;

    const member = message.mentions.members?.get(userId);
    if (member && isStaffMember(member)) return true;
  }

  return false;
}

function isAllowedClaimantPing(message: Message, ticket: TicketRow): boolean {
  if (!ticket.claimed_by) return false;
  return (
    message.mentions.users.size === 1 &&
    message.mentions.users.has(ticket.claimed_by) &&
    message.mentions.roles.size === 0 &&
    !message.mentions.everyone
  );
}

export async function handleAntiPing(
  message: Message,
  ticket: TicketRow,
  member: GuildMember,
): Promise<boolean> {
  if (message.author.id !== ticket.opener_id) return false;
  if (Date.now() - ticket.opened_at > antiPingWindowMs()) return false;
  if (!messagePingsStaff(message, ticket)) return false;
  if (isAllowedClaimantPing(message, ticket)) return false;

  const state = await antiPingDb.get(member.id);
  const now = Date.now();

  if (state.last_offence_at && now - state.last_offence_at > 12 * 60 * 60 * 1000) {
    state.offence_count = 0;
  }

  state.offence_count += 1;
  state.last_offence_at = now;

  const channel = message.channel as TextChannel;

  if (state.offence_count === 1) {
    await antiPingDb.save(state);
    await channel.send({
      components: [buildAntiPingWarning(1)],
      flags: V2_FLAGS,
    });
    return true;
  }

  if (state.offence_count === 2) {
    await antiPingDb.save(state);
    await channel.send({
      components: [buildAntiPingWarning(2)],
      flags: V2_FLAGS,
    });
    return true;
  }

  let durationMs = 60 * 60 * 1000;
  if (state.last_unmute_at) {
    const sinceUnmute = now - state.last_unmute_at;
    if (sinceUnmute <= 60 * 60 * 1000) {
      durationMs = 6 * 60 * 60 * 1000;
    } else if (sinceUnmute <= 12 * 60 * 60 * 1000) {
      durationMs = 60 * 60 * 1000;
    } else {
      state.offence_count = 1;
      await antiPingDb.save(state);
      await channel.send({
        components: [buildAntiPingWarning(1)],
        flags: V2_FLAGS,
      });
      return true;
    }
  }

  const reason = 'pinging staff';
  if (!member.moderatable) {
    await antiPingDb.save(state);
    await channel.send({
      components: [buildTimeoutFailedNotice(reason)],
      flags: V2_FLAGS,
      allowedMentions: { users: [member.id] },
    });
    return true;
  }

  state.last_mute_at = now;
  state.last_unmute_at = now + durationMs;
  state.auto_timeout_count += 1;
  await antiPingDb.save(state);

  await member.timeout(durationMs, `Ticket anti-ping: ${reason}`);

  const hours = durationMs / (60 * 60 * 1000);
  await channel.send({
    components: [buildTimeoutNotice(member.id, hours)],
    flags: V2_FLAGS,
    allowedMentions: { users: [member.id] },
  });

  if (state.auto_timeout_count >= 3) {
    await closeTicket(
      channel,
      ticket,
      message.client.user!.id,
      getAutoReplyText('ping_close_reason'),
    );
  }

  if (state.auto_timeout_count >= 5) {
    const { blacklistUser } = await import('./blacklist');
    await blacklistUser(
      message.client,
      member.id,
      'Timed out five times for spam-pinging staff',
      { username: member.user.username },
    );
  }

  return true;
}
