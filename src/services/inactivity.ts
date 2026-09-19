import type { Client, TextChannel } from 'discord.js';
import { inactivityCheckupMs, inactivityCloseMs } from '../config';
import { buildCheckup, getAutoReplyText, V2_FLAGS } from '../components/builders';
import { ticketsDb } from '../db';
import { closeTicket } from './close';

export function startInactivityScheduler(client: Client): void {
  const tick = async () => {
    const open = await ticketsDb.getOpenAll();
    const now = Date.now();
    const checkupMs = inactivityCheckupMs();
    const closeMs = inactivityCloseMs();

    for (const ticket of open) {
      const idleFor = now - ticket.last_message_at;
      const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
      if (!channel?.isTextBased() || !('send' in channel)) continue;
      const text = channel as TextChannel;

      if (idleFor >= closeMs) {
        await closeTicket(
          text,
          ticket,
          client.user!.id,
          getAutoReplyText('inactivity_close_reason'),
        );
        continue;
      }

      if (idleFor >= checkupMs && !ticket.checkup_sent) {
        const staffId = ticket.claimed_by ?? ticket.last_staff_speaker_id;
        await text.send({
          components: [buildCheckup(ticket.opener_id, staffId)],
          flags: V2_FLAGS,
          allowedMentions: {
            users: [ticket.opener_id, ...(staffId ? [staffId] : [])],
          },
        });
        await ticketsDb.markCheckupSent(ticket.channel_id);
      }
    }
  };

  void tick();
  setInterval(() => void tick(), 60_000);
}
