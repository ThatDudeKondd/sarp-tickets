import type { Message } from 'discord.js';
import { etaDb, ticketsDb } from '../db';
import { handleAntiPing } from '../services/antiPing';
import { isStaffMember } from '../utils/permissions';
import { handlePrefixCommand } from './interactions';

export async function handleMessageCreate(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  await handlePrefixCommand(message);

  if (!message.channel.isTextBased()) return;
  const ticket = await ticketsDb.getByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  await handleAntiPing(message, ticket, member);

  const staff = isStaffMember(member);

  if (staff) {
    if (ticket.pending_member_message_at) {
      const delay = Date.now() - ticket.pending_member_message_at;
      if (delay >= 0 && delay < 7 * 24 * 60 * 60 * 1000) {
        await etaDb.addSample(ticket.id, delay);
      }
    }
    await ticketsDb.onActivity(message.channel.id, {
      lastStaffSpeakerId: message.author.id,
      clearPending: true,
    });
    return;
  }

  // Opener or added member: start or keep the pending timestamp used for ETA samples.
  await ticketsDb.onActivity(message.channel.id, { setPendingIfEmpty: true });
}
