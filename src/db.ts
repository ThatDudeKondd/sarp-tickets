import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { ETA_MIN_SAMPLES, type TicketType } from './config';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'tickets.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL UNIQUE,
  guild_id TEXT NOT NULL,
  opener_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('general', 'supervisor')),
  reason TEXT NOT NULL,
  claimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  close_reason TEXT,
  closed_by TEXT,
  last_message_at INTEGER NOT NULL,
  checkup_sent INTEGER NOT NULL DEFAULT 0,
  last_staff_speaker_id TEXT,
  pending_member_message_at INTEGER,
  control_message_id TEXT,
  times_claimed INTEGER NOT NULL DEFAULT 0,
  first_claimed_by TEXT,
  last_claimed_by TEXT
);

CREATE TABLE IF NOT EXISTS blacklist (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS response_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  delay_ms INTEGER NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS anti_ping (
  user_id TEXT PRIMARY KEY,
  offence_count INTEGER NOT NULL DEFAULT 0,
  auto_timeout_count INTEGER NOT NULL DEFAULT 0,
  last_mute_at INTEGER,
  last_unmute_at INTEGER,
  last_offence_at INTEGER
);

CREATE TABLE IF NOT EXISTS claim_stats (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('general', 'supervisor')),
  claims INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, type)
);

CREATE TABLE IF NOT EXISTS claim_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('general', 'supervisor')),
  action TEXT NOT NULL,
  at INTEGER NOT NULL,
  meta TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE IF NOT EXISTS ticket_type_stats (
  type TEXT PRIMARY KEY CHECK(type IN ('general', 'supervisor')),
  opened INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0
);
`);

// Schema migrations for databases created before these columns existed.
try {
  db.exec('ALTER TABLE blacklist ADD COLUMN reason TEXT');
} catch {
  /* column already present */
}
try {
  db.exec('ALTER TABLE tickets ADD COLUMN times_claimed INTEGER NOT NULL DEFAULT 0');
} catch {
  /* column already present */
}
try {
  db.exec('ALTER TABLE tickets ADD COLUMN first_claimed_by TEXT');
} catch {
  /* column already present */
}
try {
  db.exec('ALTER TABLE tickets ADD COLUMN last_claimed_by TEXT');
} catch {
  /* column already present */
}

// Backfill type counters from existing tickets when the stats table is empty.
{
  const row = db.prepare('SELECT COUNT(*) AS c FROM ticket_type_stats').get() as { c: number };
  if (row.c === 0) {
    db.prepare(
      `INSERT INTO ticket_type_stats (type, opened, closed)
       SELECT type, COUNT(*), SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END)
       FROM tickets GROUP BY type`,
    ).run();
    for (const t of ['general', 'supervisor'] as const) {
      db.prepare(
        `INSERT OR IGNORE INTO ticket_type_stats (type, opened, closed) VALUES (?, 0, 0)`,
      ).run(t);
    }
  }
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

export const ticketsDb = {
  create(input: {
    channel_id: string;
    guild_id: string;
    opener_id: string;
    type: TicketType;
    reason: string;
    opened_at: number;
  }): TicketRow {
    const result = db
      .prepare(
        `INSERT INTO tickets (channel_id, guild_id, opener_id, type, reason, opened_at, last_message_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.channel_id,
        input.guild_id,
        input.opener_id,
        input.type,
        input.reason,
        input.opened_at,
        input.opened_at,
      );
    ticketStatsDb.recordOpened(input.type);
    return ticketsDb.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): TicketRow | undefined {
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as TicketRow | undefined;
  },

  getByChannel(channelId: string): TicketRow | undefined {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) as
      | TicketRow
      | undefined;
  },

  getOpenByOpener(openerId: string): TicketRow[] {
    return db
      .prepare(`SELECT * FROM tickets WHERE opener_id = ? AND status = 'open'`)
      .all(openerId) as unknown as TicketRow[];
  },

  getAllByOpener(openerId: string): TicketRow[] {
    return db
      .prepare(`SELECT * FROM tickets WHERE opener_id = ? ORDER BY opened_at DESC`)
      .all(openerId) as unknown as TicketRow[];
  },

  countOpenByOpener(openerId: string): number {
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM tickets WHERE opener_id = ? AND status = 'open'`)
      .get(openerId) as { c: number };
    return row.c;
  },

  countOpen(): number {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'`).get() as {
      c: number;
    };
    return row.c;
  },

  getOpenAll(): TicketRow[] {
    return db.prepare(`SELECT * FROM tickets WHERE status = 'open'`).all() as unknown as TicketRow[];
  },

  setClaimed(channelId: string, userId: string | null): void {
    db.prepare(`UPDATE tickets SET claimed_by = ? WHERE channel_id = ?`).run(userId, channelId);
  },

  /** Records a claim or transfer-in against per-ticket fields, claim stats, and history. */
  recordClaim(
    ticket: TicketRow,
    staffId: string,
    action: 'claim' | 'transfer_in' = 'claim',
  ): void {
    db.prepare(
      `UPDATE tickets SET
        claimed_by = ?,
        times_claimed = times_claimed + 1,
        first_claimed_by = COALESCE(first_claimed_by, ?),
        last_claimed_by = ?
       WHERE channel_id = ?`,
    ).run(staffId, staffId, staffId, ticket.channel_id);

    claimStatsDb.increment(staffId, ticket.type);
    claimHistoryDb.add({
      ticket_id: ticket.id,
      channel_id: ticket.channel_id,
      staff_id: staffId,
      type: ticket.type,
      action,
    });
  },

  recordUnclaim(
    ticket: TicketRow,
    staffId: string,
    action: 'unclaim' | 'force_unclaim' | 'transfer_out' | 'switchpanel' = 'unclaim',
  ): void {
    db.prepare(`UPDATE tickets SET claimed_by = NULL WHERE channel_id = ?`).run(ticket.channel_id);
    claimHistoryDb.add({
      ticket_id: ticket.id,
      channel_id: ticket.channel_id,
      staff_id: staffId,
      type: ticket.type,
      action,
      meta: ticket.claimed_by ? JSON.stringify({ previous: ticket.claimed_by }) : null,
    });
  },

  setControlMessage(channelId: string, messageId: string): void {
    db.prepare(`UPDATE tickets SET control_message_id = ? WHERE channel_id = ?`).run(
      messageId,
      channelId,
    );
  },

  setType(channelId: string, type: TicketType): void {
    db.prepare(`UPDATE tickets SET type = ? WHERE channel_id = ?`).run(type, channelId);
  },

  setPendingMember(channelId: string, at: number | null): void {
    db.prepare(`UPDATE tickets SET pending_member_message_at = ? WHERE channel_id = ?`).run(
      at,
      channelId,
    );
  },

  onActivity(
    channelId: string,
    opts: {
      lastStaffSpeakerId?: string;
      clearPending?: boolean;
      setPendingIfEmpty?: boolean;
    } = {},
  ): void {
    const ticket = ticketsDb.getByChannel(channelId);
    if (!ticket || ticket.status !== 'open') return;

    let pending = ticket.pending_member_message_at;
    if (opts.clearPending) pending = null;
    else if (opts.setPendingIfEmpty && pending == null) pending = Date.now();

    db.prepare(
      `UPDATE tickets SET
        last_message_at = ?,
        checkup_sent = 0,
        last_staff_speaker_id = COALESCE(?, last_staff_speaker_id),
        pending_member_message_at = ?
       WHERE channel_id = ?`,
    ).run(Date.now(), opts.lastStaffSpeakerId ?? null, pending, channelId);
  },

  markCheckupSent(channelId: string): void {
    db.prepare(`UPDATE tickets SET checkup_sent = 1 WHERE channel_id = ?`).run(channelId);
  },

  close(channelId: string, closedBy: string, closeReason: string): TicketRow | undefined {
    const before = ticketsDb.getByChannel(channelId);
    db.prepare(
      `UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ?,
        pending_member_message_at = NULL
       WHERE channel_id = ? AND status = 'open'`,
    ).run(Date.now(), closedBy, closeReason, channelId);
    const closed = ticketsDb.getByChannel(channelId);
    if (before && closed?.status === 'closed') {
      ticketStatsDb.recordClosed(before.type);
      if (before.claimed_by) {
        claimHistoryDb.add({
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
  isBlacklisted(userId: string): boolean {
    return Boolean(db.prepare('SELECT 1 AS x FROM blacklist WHERE user_id = ?').get(userId));
  },

  add(userId: string, reason?: string): void {
    if (blacklistDb.isBlacklisted(userId)) return;
    db.prepare('INSERT INTO blacklist (user_id, created_at, reason) VALUES (?, ?, ?)').run(
      userId,
      Date.now(),
      reason ?? null,
    );
  },

  remove(userId: string): void {
    db.prepare('DELETE FROM blacklist WHERE user_id = ?').run(userId);
  },

  toggle(userId: string, reason?: string): 'added' | 'removed' {
    if (blacklistDb.isBlacklisted(userId)) {
      blacklistDb.remove(userId);
      return 'removed';
    }
    blacklistDb.add(userId, reason);
    return 'added';
  },
};

export const metaDb = {
  get(key: string): string | null {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  },

  set(key: string, value: string): void {
    db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
  },
};

export const etaDb = {
  addSample(ticketId: number, delayMs: number): void {
    db.prepare(
      `INSERT INTO response_samples (ticket_id, delay_ms, recorded_at) VALUES (?, ?, ?)`,
    ).run(ticketId, delayMs, Date.now());
  },

  sampleCount(): number {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM response_samples`).get() as { c: number };
    return row.c;
  },

  averageMs(): number | null {
    if (etaDb.sampleCount() < ETA_MIN_SAMPLES) return null;
    const row = db.prepare(`SELECT AVG(delay_ms) AS avg FROM response_samples`).get() as {
      avg: number;
    };
    return row.avg;
  },
};

export const antiPingDb = {
  get(userId: string): AntiPingRow {
    const existing = db.prepare('SELECT * FROM anti_ping WHERE user_id = ?').get(userId) as
      | AntiPingRow
      | undefined;
    if (existing) return existing;
    db.prepare(
      `INSERT INTO anti_ping (user_id, offence_count, auto_timeout_count) VALUES (?, 0, 0)`,
    ).run(userId);
    return antiPingDb.get(userId);
  },

  save(row: AntiPingRow): void {
    db.prepare(
      `INSERT INTO anti_ping (user_id, offence_count, auto_timeout_count, last_mute_at, last_unmute_at, last_offence_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         offence_count = excluded.offence_count,
         auto_timeout_count = excluded.auto_timeout_count,
         last_mute_at = excluded.last_mute_at,
         last_unmute_at = excluded.last_unmute_at,
         last_offence_at = excluded.last_offence_at`,
    ).run(
      row.user_id,
      row.offence_count,
      row.auto_timeout_count,
      row.last_mute_at,
      row.last_unmute_at,
      row.last_offence_at,
    );
  },
};

export const claimStatsDb = {
  increment(userId: string, type: TicketType): void {
    db.prepare(
      `INSERT INTO claim_stats (user_id, type, claims) VALUES (?, ?, 1)
       ON CONFLICT(user_id, type) DO UPDATE SET claims = claims + 1`,
    ).run(userId, type);
  },

  getForUser(userId: string): { type: TicketType; claims: number }[] {
    return db
      .prepare(`SELECT type, claims FROM claim_stats WHERE user_id = ? ORDER BY type`)
      .all(userId) as { type: TicketType; claims: number }[];
  },

  getAll(): { user_id: string; type: TicketType; claims: number }[] {
    return db
      .prepare(`SELECT user_id, type, claims FROM claim_stats ORDER BY claims DESC`)
      .all() as { user_id: string; type: TicketType; claims: number }[];
  },

  totalForUser(userId: string): number {
    const row = db
      .prepare(`SELECT COALESCE(SUM(claims), 0) AS c FROM claim_stats WHERE user_id = ?`)
      .get(userId) as { c: number };
    return row.c;
  },
};

export const claimHistoryDb = {
  add(input: {
    ticket_id: number;
    channel_id: string;
    staff_id: string;
    type: TicketType;
    action: string;
    meta?: string | null;
  }): void {
    db.prepare(
      `INSERT INTO claim_history (ticket_id, channel_id, staff_id, type, action, at, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.ticket_id,
      input.channel_id,
      input.staff_id,
      input.type,
      input.action,
      Date.now(),
      input.meta ?? null,
    );
  },

  forTicket(ticketId: number) {
    return db
      .prepare(`SELECT * FROM claim_history WHERE ticket_id = ? ORDER BY at ASC`)
      .all(ticketId);
  },

  forStaff(staffId: string, limit = 50) {
    return db
      .prepare(
        `SELECT * FROM claim_history WHERE staff_id = ? ORDER BY at DESC LIMIT ?`,
      )
      .all(staffId, limit);
  },
};

export const ticketStatsDb = {
  recordOpened(type: TicketType): void {
    db.prepare(
      `INSERT INTO ticket_type_stats (type, opened, closed) VALUES (?, 1, 0)
       ON CONFLICT(type) DO UPDATE SET opened = opened + 1`,
    ).run(type);
  },

  recordClosed(type: TicketType): void {
    db.prepare(
      `INSERT INTO ticket_type_stats (type, opened, closed) VALUES (?, 0, 1)
       ON CONFLICT(type) DO UPDATE SET closed = closed + 1`,
    ).run(type);
  },

  getAll(): { type: TicketType; opened: number; closed: number }[] {
    return db
      .prepare(`SELECT type, opened, closed FROM ticket_type_stats ORDER BY type`)
      .all() as { type: TicketType; opened: number; closed: number }[];
  },
};
