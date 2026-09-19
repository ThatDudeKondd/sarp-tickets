import { prisma } from './database/client';
import { ETA_MIN_SAMPLES, type TicketType } from './config';

// Prisma stores epoch-ms timestamps as BigInt (Postgres int4 overflows at ~2^31,
// well below current epoch ms). Converted to number at this boundary so every
// caller keeps using plain numbers, same as when this was better-sqlite3/node:sqlite.
function n(v: bigint | null): number | null {
  return v === null ? null : Number(v);
}

export interface TicketRow {
  id: number;
  channel_id: string;
  guild_id: string;
  opener_id: string;
  type: TicketType;
  reason: string;
  claimed_by: string | null;
  status: 'open' | 'closed';
  opened_at: number;
  closed_at: number | null;
  close_reason: string | null;
  closed_by: string | null;
  last_message_at: number;
  checkup_sent: number;
  last_staff_speaker_id: string | null;
  pending_member_message_at: number | null;
  control_message_id: string | null;
  times_claimed: number;
  first_claimed_by: string | null;
  last_claimed_by: string | null;
}

export interface AntiPingRow {
  user_id: string;
  offence_count: number;
  auto_timeout_count: number;
  last_mute_at: number | null;
  last_unmute_at: number | null;
  last_offence_at: number | null;
}

function toTicketRow(row: {
  id: number;
  channel_id: string;
  guild_id: string;
  opener_id: string;
  type: string;
  reason: string;
  claimed_by: string | null;
  status: string;
  opened_at: bigint;
  closed_at: bigint | null;
  close_reason: string | null;
  closed_by: string | null;
  last_message_at: bigint;
  checkup_sent: number;
  last_staff_speaker_id: string | null;
  pending_member_message_at: bigint | null;
  control_message_id: string | null;
  times_claimed: number;
  first_claimed_by: string | null;
  last_claimed_by: string | null;
}): TicketRow {
  return {
    ...row,
    type: row.type as TicketType,
    status: row.status as 'open' | 'closed',
    opened_at: Number(row.opened_at),
    closed_at: n(row.closed_at),
    last_message_at: Number(row.last_message_at),
    pending_member_message_at: n(row.pending_member_message_at),
  };
}

function toAntiPingRow(row: {
  user_id: string;
  offence_count: number;
  auto_timeout_count: number;
  last_mute_at: bigint | null;
  last_unmute_at: bigint | null;
  last_offence_at: bigint | null;
}): AntiPingRow {
  return {
    ...row,
    last_mute_at: n(row.last_mute_at),
    last_unmute_at: n(row.last_unmute_at),
    last_offence_at: n(row.last_offence_at),
  };
}

export const ticketsDb = {
  async create(input: {
    channel_id: string;
    guild_id: string;
    opener_id: string;
    type: TicketType;
    reason: string;
    opened_at: number;
  }): Promise<TicketRow> {
    const row = await prisma.ticket.create({
      data: {
        channel_id: input.channel_id,
        guild_id: input.guild_id,
        opener_id: input.opener_id,
        type: input.type,
        reason: input.reason,
        opened_at: BigInt(input.opened_at),
        last_message_at: BigInt(input.opened_at),
      },
    });
    await ticketStatsDb.recordOpened(input.type);
    return toTicketRow(row);
  },

  async getById(id: number): Promise<TicketRow | undefined> {
    const row = await prisma.ticket.findUnique({ where: { id } });
    return row ? toTicketRow(row) : undefined;
  },

  async getByChannel(channelId: string): Promise<TicketRow | undefined> {
    const row = await prisma.ticket.findUnique({ where: { channel_id: channelId } });
    return row ? toTicketRow(row) : undefined;
  },

  async getOpenByOpener(openerId: string): Promise<TicketRow[]> {
    const rows = await prisma.ticket.findMany({
      where: { opener_id: openerId, status: 'open' },
    });
    return rows.map(toTicketRow);
  },

  async getAllByOpener(openerId: string): Promise<TicketRow[]> {
    const rows = await prisma.ticket.findMany({
      where: { opener_id: openerId },
      orderBy: { opened_at: 'desc' },
    });
    return rows.map(toTicketRow);
  },

  async countOpenByOpener(openerId: string): Promise<number> {
    return prisma.ticket.count({ where: { opener_id: openerId, status: 'open' } });
  },

  async countOpen(): Promise<number> {
    return prisma.ticket.count({ where: { status: 'open' } });
  },

  async getOpenAll(): Promise<TicketRow[]> {
    const rows = await prisma.ticket.findMany({ where: { status: 'open' } });
    return rows.map(toTicketRow);
  },

  async setClaimed(channelId: string, userId: string | null): Promise<void> {
    await prisma.ticket.update({
      where: { channel_id: channelId },
      data: { claimed_by: userId },
    });
  },

  /** Records a claim or transfer-in against per-ticket fields, claim stats, and history. */
  async recordClaim(
    ticket: TicketRow,
    staffId: string,
    action: 'claim' | 'transfer_in' = 'claim',
  ): Promise<void> {
    await prisma.ticket.update({
      where: { channel_id: ticket.channel_id },
      data: {
        claimed_by: staffId,
        times_claimed: { increment: 1 },
        first_claimed_by: ticket.first_claimed_by ?? staffId,
        last_claimed_by: staffId,
      },
    });

    await claimStatsDb.increment(staffId, ticket.type);
    await claimHistoryDb.add({
      ticket_id: ticket.id,
      channel_id: ticket.channel_id,
      staff_id: staffId,
      type: ticket.type,
      action,
    });
  },

  async recordUnclaim(
    ticket: TicketRow,
    staffId: string,
    action: 'unclaim' | 'force_unclaim' | 'transfer_out' | 'switchpanel' = 'unclaim',
  ): Promise<void> {
    await prisma.ticket.update({
      where: { channel_id: ticket.channel_id },
      data: { claimed_by: null },
    });
    await claimHistoryDb.add({
      ticket_id: ticket.id,
      channel_id: ticket.channel_id,
      staff_id: staffId,
      type: ticket.type,
      action,
      meta: ticket.claimed_by ? JSON.stringify({ previous: ticket.claimed_by }) : null,
    });
  },

  async setControlMessage(channelId: string, messageId: string): Promise<void> {
    await prisma.ticket.update({
      where: { channel_id: channelId },
      data: { control_message_id: messageId },
    });
  },

  async setType(channelId: string, type: TicketType): Promise<void> {
    await prisma.ticket.update({ where: { channel_id: channelId }, data: { type } });
  },

  async setPendingMember(channelId: string, at: number | null): Promise<void> {
    await prisma.ticket.update({
      where: { channel_id: channelId },
      data: { pending_member_message_at: at === null ? null : BigInt(at) },
    });
  },

  async onActivity(
    channelId: string,
    opts: {
      lastStaffSpeakerId?: string;
      clearPending?: boolean;
      setPendingIfEmpty?: boolean;
    } = {},
  ): Promise<void> {
    const ticket = await ticketsDb.getByChannel(channelId);
    if (!ticket || ticket.status !== 'open') return;

    let pending = ticket.pending_member_message_at;
    if (opts.clearPending) pending = null;
    else if (opts.setPendingIfEmpty && pending == null) pending = Date.now();

    await prisma.ticket.update({
      where: { channel_id: channelId },
      data: {
        last_message_at: BigInt(Date.now()),
        checkup_sent: 0,
        last_staff_speaker_id: opts.lastStaffSpeakerId ?? ticket.last_staff_speaker_id,
        pending_member_message_at: pending === null ? null : BigInt(pending),
      },
    });
  },

  async markCheckupSent(channelId: string): Promise<void> {
    await prisma.ticket.update({ where: { channel_id: channelId }, data: { checkup_sent: 1 } });
  },

  async close(
    channelId: string,
    closedBy: string,
    closeReason: string,
  ): Promise<TicketRow | undefined> {
    const before = await ticketsDb.getByChannel(channelId);
    await prisma.ticket.updateMany({
      where: { channel_id: channelId, status: 'open' },
      data: {
        status: 'closed',
        closed_at: BigInt(Date.now()),
        closed_by: closedBy,
        close_reason: closeReason,
        pending_member_message_at: null,
      },
    });
    const closed = await ticketsDb.getByChannel(channelId);
    if (before && closed?.status === 'closed') {
      await ticketStatsDb.recordClosed(before.type);
      if (before.claimed_by) {
        await claimHistoryDb.add({
          ticket_id: before.id,
          channel_id: before.channel_id,
          staff_id: before.claimed_by,
          type: before.type,
          action: 'closed_while_claimed',
          meta: JSON.stringify({ closed_by: closedBy }),
        });
      }
    }
    return closed;
  },
};

export const blacklistDb = {
  async isBlacklisted(userId: string): Promise<boolean> {
    return (await prisma.blacklist.findUnique({ where: { user_id: userId } })) !== null;
  },

  async add(userId: string, reason?: string): Promise<void> {
    if (await blacklistDb.isBlacklisted(userId)) return;
    await prisma.blacklist.create({
      data: { user_id: userId, created_at: BigInt(Date.now()), reason: reason ?? null },
    });
  },

  async remove(userId: string): Promise<void> {
    await prisma.blacklist.deleteMany({ where: { user_id: userId } });
  },

  async toggle(userId: string, reason?: string): Promise<'added' | 'removed'> {
    if (await blacklistDb.isBlacklisted(userId)) {
      await blacklistDb.remove(userId);
      return 'removed';
    }
    await blacklistDb.add(userId, reason);
    return 'added';
  },
};

export const metaDb = {
  async get(key: string): Promise<string | null> {
    const row = await prisma.meta.findUnique({ where: { key } });
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    await prisma.meta.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  },
};

export const etaDb = {
  async addSample(ticketId: number, delayMs: number): Promise<void> {
    await prisma.responseSample.create({
      data: { ticket_id: ticketId, delay_ms: delayMs, recorded_at: BigInt(Date.now()) },
    });
  },

  async sampleCount(): Promise<number> {
    return prisma.responseSample.count();
  },

  async averageMs(): Promise<number | null> {
    if ((await etaDb.sampleCount()) < ETA_MIN_SAMPLES) return null;
    const result = await prisma.responseSample.aggregate({ _avg: { delay_ms: true } });
    return result._avg.delay_ms;
  },
};

export const antiPingDb = {
  async get(userId: string): Promise<AntiPingRow> {
    const existing = await prisma.antiPing.findUnique({ where: { user_id: userId } });
    if (existing) return toAntiPingRow(existing);
    const created = await prisma.antiPing.create({
      data: { user_id: userId, offence_count: 0, auto_timeout_count: 0 },
    });
    return toAntiPingRow(created);
  },

  async save(row: AntiPingRow): Promise<void> {
    await prisma.antiPing.upsert({
      where: { user_id: row.user_id },
      create: {
        user_id: row.user_id,
        offence_count: row.offence_count,
        auto_timeout_count: row.auto_timeout_count,
        last_mute_at: row.last_mute_at === null ? null : BigInt(row.last_mute_at),
        last_unmute_at: row.last_unmute_at === null ? null : BigInt(row.last_unmute_at),
        last_offence_at: row.last_offence_at === null ? null : BigInt(row.last_offence_at),
      },
      update: {
        offence_count: row.offence_count,
        auto_timeout_count: row.auto_timeout_count,
        last_mute_at: row.last_mute_at === null ? null : BigInt(row.last_mute_at),
        last_unmute_at: row.last_unmute_at === null ? null : BigInt(row.last_unmute_at),
        last_offence_at: row.last_offence_at === null ? null : BigInt(row.last_offence_at),
      },
    });
  },
};

export const claimStatsDb = {
  async increment(userId: string, type: TicketType): Promise<void> {
    await prisma.claimStat.upsert({
      where: { user_id_type: { user_id: userId, type } },
      create: { user_id: userId, type, claims: 1 },
      update: { claims: { increment: 1 } },
    });
  },

  async getForUser(userId: string): Promise<{ type: TicketType; claims: number }[]> {
    const rows = await prisma.claimStat.findMany({
      where: { user_id: userId },
      orderBy: { type: 'asc' },
    });
    return rows.map((r) => ({ type: r.type as TicketType, claims: r.claims }));
  },

  async getAll(): Promise<{ user_id: string; type: TicketType; claims: number }[]> {
    const rows = await prisma.claimStat.findMany({ orderBy: { claims: 'desc' } });
    return rows.map((r) => ({ user_id: r.user_id, type: r.type as TicketType, claims: r.claims }));
  },

  async totalForUser(userId: string): Promise<number> {
    const result = await prisma.claimStat.aggregate({
      where: { user_id: userId },
      _sum: { claims: true },
    });
    return result._sum.claims ?? 0;
  },
};

export const claimHistoryDb = {
  async add(input: {
    ticket_id: number;
    channel_id: string;
    staff_id: string;
    type: TicketType;
    action: string;
    meta?: string | null;
  }): Promise<void> {
    await prisma.claimHistory.create({
      data: {
        ticket_id: input.ticket_id,
        channel_id: input.channel_id,
        staff_id: input.staff_id,
        type: input.type,
        action: input.action,
        at: BigInt(Date.now()),
        meta: input.meta ?? null,
      },
    });
  },

  async forTicket(ticketId: number) {
    const rows = await prisma.claimHistory.findMany({
      where: { ticket_id: ticketId },
      orderBy: { at: 'asc' },
    });
    return rows.map((r) => ({ ...r, at: Number(r.at) }));
  },

  async forStaff(staffId: string, limit = 50) {
    const rows = await prisma.claimHistory.findMany({
      where: { staff_id: staffId },
      orderBy: { at: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({ ...r, at: Number(r.at) }));
  },
};

export const ticketStatsDb = {
  async recordOpened(type: TicketType): Promise<void> {
    await prisma.ticketTypeStat.upsert({
      where: { type },
      create: { type, opened: 1, closed: 0 },
      update: { opened: { increment: 1 } },
    });
  },

  async recordClosed(type: TicketType): Promise<void> {
    await prisma.ticketTypeStat.upsert({
      where: { type },
      create: { type, opened: 0, closed: 1 },
      update: { closed: { increment: 1 } },
    });
  },

  async getAll(): Promise<{ type: TicketType; opened: number; closed: number }[]> {
    const rows = await prisma.ticketTypeStat.findMany({ orderBy: { type: 'asc' } });
    return rows.map((r) => ({ type: r.type as TicketType, opened: r.opened, closed: r.closed }));
  },
};
