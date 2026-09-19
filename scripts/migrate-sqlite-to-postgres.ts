// One-off migration: copies data/tickets.sqlite into the Postgres database
// pointed to by DATABASE_URL. Run once per environment, before cutover.
// Usage: npx tsx scripts/migrate-sqlite-to-postgres.ts
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { prisma } from '../src/database/client';

const sqlitePath = path.join(process.cwd(), 'data', 'tickets.sqlite');
const db = new DatabaseSync(sqlitePath, { readOnly: true });

function all<T>(sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

async function main() {
  const tickets = all<any>('SELECT * FROM tickets');
  for (const t of tickets) {
    await prisma.ticket.create({
      data: {
        id: t.id,
        channel_id: t.channel_id,
        guild_id: t.guild_id,
        opener_id: t.opener_id,
        type: t.type,
        reason: t.reason,
        claimed_by: t.claimed_by,
        status: t.status,
        opened_at: BigInt(t.opened_at),
        closed_at: t.closed_at != null ? BigInt(t.closed_at) : null,
        close_reason: t.close_reason,
        closed_by: t.closed_by,
        last_message_at: BigInt(t.last_message_at),
        checkup_sent: t.checkup_sent,
        last_staff_speaker_id: t.last_staff_speaker_id,
        pending_member_message_at:
          t.pending_member_message_at != null ? BigInt(t.pending_member_message_at) : null,
        control_message_id: t.control_message_id,
        times_claimed: t.times_claimed,
        first_claimed_by: t.first_claimed_by,
        last_claimed_by: t.last_claimed_by,
      },
    });
  }
  console.log(`tickets: ${tickets.length}`);

  const blacklist = all<any>('SELECT * FROM blacklist');
  for (const b of blacklist) {
    await prisma.blacklist.create({
      data: {
        user_id: b.user_id,
        created_at: BigInt(b.created_at),
        reason: b.reason,
      },
    });
  }
  console.log(`blacklist: ${blacklist.length}`);

  const meta = all<any>('SELECT * FROM meta');
  for (const m of meta) {
    await prisma.meta.create({ data: { key: m.key, value: m.value } });
  }
  console.log(`meta: ${meta.length}`);

  const responseSamples = all<any>('SELECT * FROM response_samples');
  for (const r of responseSamples) {
    await prisma.responseSample.create({
      data: {
        id: r.id,
        ticket_id: r.ticket_id,
        delay_ms: r.delay_ms,
        recorded_at: BigInt(r.recorded_at),
      },
    });
  }
  console.log(`response_samples: ${responseSamples.length}`);

  const antiPing = all<any>('SELECT * FROM anti_ping');
  for (const a of antiPing) {
    await prisma.antiPing.create({
      data: {
        user_id: a.user_id,
        offence_count: a.offence_count,
        auto_timeout_count: a.auto_timeout_count,
        last_mute_at: a.last_mute_at != null ? BigInt(a.last_mute_at) : null,
        last_unmute_at: a.last_unmute_at != null ? BigInt(a.last_unmute_at) : null,
        last_offence_at: a.last_offence_at != null ? BigInt(a.last_offence_at) : null,
      },
    });
  }
  console.log(`anti_ping: ${antiPing.length}`);

  const claimStats = all<any>('SELECT * FROM claim_stats');
  for (const c of claimStats) {
    await prisma.claimStat.create({
      data: { user_id: c.user_id, type: c.type, claims: c.claims },
    });
  }
  console.log(`claim_stats: ${claimStats.length}`);

  const claimHistory = all<any>('SELECT * FROM claim_history');
  for (const c of claimHistory) {
    await prisma.claimHistory.create({
      data: {
        id: c.id,
        ticket_id: c.ticket_id,
        channel_id: c.channel_id,
        staff_id: c.staff_id,
        type: c.type,
        action: c.action,
        at: BigInt(c.at),
        meta: c.meta,
      },
    });
  }
  console.log(`claim_history: ${claimHistory.length}`);

  const ticketTypeStats = all<any>('SELECT * FROM ticket_type_stats');
  for (const t of ticketTypeStats) {
    await prisma.ticketTypeStat.create({
      data: { type: t.type, opened: t.opened, closed: t.closed },
    });
  }
  console.log(`ticket_type_stats: ${ticketTypeStats.length}`);

  // Explicit IDs were inserted above, so the autoincrement sequences need to
  // be advanced past the max id or the next create() will collide.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('tickets', 'id'), COALESCE((SELECT MAX(id) FROM tickets), 1))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('response_samples', 'id'), COALESCE((SELECT MAX(id) FROM response_samples), 1))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('claim_history', 'id'), COALESCE((SELECT MAX(id) FROM claim_history), 1))`,
  );

  console.log('Migration complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    db.close();
    await prisma.$disconnect();
  });
