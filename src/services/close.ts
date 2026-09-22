import discordTranscripts, { ExportReturnType } from 'discord-html-transcripts-v2';
import { AttachmentBuilder, type TextChannel } from 'discord.js';
import { closeDelayMs, getConfig } from '../config';
import {
  buildClosingNotice,
  buildTranscriptSummary,
  V2_FLAGS,
} from '../components/builders';
import { ticketsDb, type TicketRow } from '../db';
import { shareTicketTranscript } from './ticketShare';
import { formatGmt } from '../utils/permissions';

const closing = new Set<string>();

export function isClosing(channelId: string): boolean {
  return closing.has(channelId);
}

export async function closeTicket(
  channel: TextChannel,
  ticket: TicketRow,
  closedById: string,
  closeReason: string,
  options?: { delay?: boolean },
): Promise<void> {
  if (ticket.status !== 'open') return;
  if (closing.has(channel.id)) return;
  closing.add(channel.id);

  try {
    if (options?.delay !== false) {
      await channel.send({
        components: [buildClosingNotice(3)],
        flags: V2_FLAGS,
      });
      await new Promise((r) => setTimeout(r, closeDelayMs()));
    }

    const fresh = await ticketsDb.getByChannel(channel.id);
    if (!fresh || fresh.status !== 'open') return;

    const closed = await ticketsDb.close(channel.id, closedById, closeReason || 'No reason provided');
    if (!closed) return;

    // HTML from discord-html-transcripts — attached in Discord and shared online.
    // Rendering can throw on certain message content (known upstream bug); a
    // transcript failure must not leave the ticket closed with an orphaned
    // channel, so it's isolated from the rest of the close flow.
    const fileName = `transcript-${channel.name}.html`;
    let attachment: AttachmentBuilder | null = null;
    try {
      const html = (await discordTranscripts.createTranscript(channel, {
        limit: -1,
        filename: fileName,
        saveImages: false,
        poweredBy: false,
        returnType: ExportReturnType.String,
      })) as string;

      await shareTicketTranscript(closed.id, html);
      attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: fileName });
    } catch (err) {
      console.error('Transcript generation failed, closing without it:', err);
    }

    const opener = await channel.client.users.fetch(closed.opener_id).catch(() => null);
    const closer = await channel.client.users.fetch(closedById).catch(() => null);

    const openedBy = opener ? `${opener.username} (${opener.id})` : closed.opener_id;
    const closedBy = closer ? `${closer.username} (${closer.id})` : closedById;

    const transcriptChannel = await channel.client.channels
      .fetch(getConfig().Transcript_Channel)
      .catch(() => null);

    if (transcriptChannel?.isTextBased() && 'send' in transcriptChannel) {
      const summary = buildTranscriptSummary({
        channelName: channel.name,
        openedBy,
        closedBy,
        closeReason: closed.close_reason ?? closeReason,
        openingReason: closed.reason,
        openedAt: formatGmt(closed.opened_at),
        closedAt: formatGmt(closed.closed_at ?? Date.now()),
        fileName,
        hasAttachment: attachment !== null,
      });

      await transcriptChannel.send({
        components: [summary],
        files: attachment ? [attachment] : [],
        flags: V2_FLAGS,
      });
    }

    await channel.delete(`Ticket closed: ${closeReason}`).catch(() => null);
  } finally {
    closing.delete(channel.id);
  }
}
