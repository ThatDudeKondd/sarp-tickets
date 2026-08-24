import type { Client } from 'discord.js';
import { env } from '../config';
import { claimHistoryDb, ticketsDb, type TicketRow } from '../db';

async function resolveUser(
  client: Client | undefined,
  userId: string | null | undefined,
): Promise<{ id: string; username: string; display_name: string } | null> {
  if (!userId) return null;
  if (!client) return { id: userId, username: userId, display_name: userId };
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return { id: userId, username: userId, display_name: userId };
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName || user.globalName || user.username,
  };
}

async function resolveChannelName(
  client: Client | undefined,
  channelId: string,
  knownName?: string,
): Promise<string> {
  if (knownName) return knownName;
  if (!client) return channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && 'name' in channel && typeof channel.name === 'string') return channel.name;
  return channelId;
}

function transcriptUrlFor(
  openerId: string,
  ticketId: number,
  status: string,
): string | null {
  if (status !== 'closed') return null;
  return `${env.domain}/tickets/transcript/${openerId}-${ticketId}.html`;
}

async function serializeTicket(
  ticket: TicketRow,
  channelName: string,
  client?: Client,
) {
  const [claimedBy, closedBy, firstClaimedBy, lastClaimedBy, lastStaffSpeaker] =
    await Promise.all([
      resolveUser(client, ticket.claimed_by),
      resolveUser(client, ticket.closed_by),
      resolveUser(client, ticket.first_claimed_by),
      resolveUser(client, ticket.last_claimed_by),
      resolveUser(client, ticket.last_staff_speaker_id),
    ]);

  const transcript_url = transcriptUrlFor(ticket.opener_id, ticket.id, ticket.status);

  return {
    id: ticket.id,
    status: ticket.status,
    type: ticket.type,
    reason: ticket.reason,
    close_reason: ticket.close_reason,

    channel_id: ticket.channel_id,
    channel_name: channelName,
    guild_id: ticket.guild_id,
    control_message_id: ticket.control_message_id,

    opener_id: ticket.opener_id,
    claimed_by: claimedBy,
    claimed_by_id: ticket.claimed_by,
    closed_by: closedBy,
    closed_by_id: ticket.closed_by,
    first_claimed_by: firstClaimedBy,
    first_claimed_by_id: ticket.first_claimed_by,
    last_claimed_by: lastClaimedBy,
    last_claimed_by_id: ticket.last_claimed_by,
    last_staff_speaker: lastStaffSpeaker,
    last_staff_speaker_id: ticket.last_staff_speaker_id,

    times_claimed: ticket.times_claimed,
    checkup_sent: Boolean(ticket.checkup_sent),
    pending_member_message_at: ticket.pending_member_message_at,
    last_message_at: ticket.last_message_at,
    opened_at: ticket.opened_at,
    closed_at: ticket.closed_at,

    transcript_url,
    claim_history: claimHistoryDb.forTicket(ticket.id),
  };
}

/** Builds `{userid}.json` payload with every ticket for that opener. */
export async function buildUserTicketsSharePayload(
  openerId: string,
  currentChannelId: string,
  currentChannelName: string,
  client?: Client,
) {
  const rows = ticketsDb.getAllByOpener(openerId);
  const opener = await resolveUser(client, openerId);

  const tickets = await Promise.all(
    rows.map(async (row) => {
      const channelName = await resolveChannelName(
        client,
        row.channel_id,
        row.channel_id === currentChannelId ? currentChannelName : undefined,
      );
      return serializeTicket(row, channelName, client);
    }),
  );

  return {
    opener_id: openerId,
    opener,
    tickets,
    shared_at: Date.now(),
  };
}

async function putShareFile(
  urlPath: string,
  body: string | Buffer,
  contentType: string,
): Promise<void> {
  const url = urlPath.startsWith('http')
    ? urlPath
    : `${env.domain}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!res.ok) {
      console.error(
        `Ticket share failed (${res.status}) for ${url}: ${await res.text().catch(() => '')}`,
      );
    }
  } catch (err) {
    console.error(`Ticket share error for ${url}:`, err);
  }
}

/** Saves HTML transcript to `/tickets/transcript/{openerId}-{ticketId}.html`. */
export async function shareTicketTranscript(
  openerId: string,
  ticketId: number,
  html: string,
): Promise<void> {
  const fileName = `${openerId}-${ticketId}.html`;
  await putShareFile(
    `/tickets/transcript/${fileName}`,
    html,
    'text/html; charset=utf-8',
  );
}

/** Saves all of the opener's tickets to `…/data/tickets/{userid}.json`. */
export async function shareTicketData(
  ticket: TicketRow,
  channelName: string,
  client?: Client,
): Promise<void> {
  const fileName = `${ticket.opener_id}.json`;
  const body = JSON.stringify(
    await buildUserTicketsSharePayload(
      ticket.opener_id,
      ticket.channel_id,
      channelName,
      client,
    ),
    null,
    2,
  );
  await putShareFile(`/data/tickets/${fileName}`, body, 'application/json');
}

export function shareTicketDataFireAndForget(
  ticket: TicketRow,
  channelName: string,
  client?: Client,
): void {
  void shareTicketData(ticket, channelName, client);
}
