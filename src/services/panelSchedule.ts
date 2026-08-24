import type { Client, TextChannel } from 'discord.js';
import { getConfig } from '../config';
import { buildPanelContainer, V2_FLAGS } from '../components/builders';
import { metaDb } from '../db';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** Clears the Assistance channel and posts a single panel message. */
export async function refreshAssistancePanel(client: Client): Promise<void> {
  const channel = await client.channels.fetch(getConfig().Assistance_Channel).catch(() => null);
  if (!channel?.isTextBased() || !('messages' in channel) || !('send' in channel)) {
    throw new Error('Assistance channel not found or not text-based.');
  }
  const text = channel as TextChannel;

  let safety = 0;
  while (safety++ < 50) {
    const batch = await text.messages.fetch({ limit: 100 });
    if (batch.size === 0) break;

    const recent = [...batch.values()].filter(
      (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000,
    );
    const older = [...batch.values()].filter(
      (m) => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000,
    );

    if (recent.length > 1) {
      await text.bulkDelete(recent, true).catch(async () => {
        for (const m of recent) await m.delete().catch(() => null);
      });
    } else if (recent.length === 1) {
      await recent[0].delete().catch(() => null);
    }

    for (const m of older) await m.delete().catch(() => null);
    if (batch.size < 100) break;
  }

  await text.send({
    components: [buildPanelContainer()],
    flags: V2_FLAGS,
  });
  metaDb.set('last_panel_at', String(Date.now()));
}

function msUntilNextMidnightGmt(): number {
  const now = Date.now();
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next - now);
}

async function runMidnightJob(client: Client): Promise<void> {
  const last = Number(metaDb.get('last_panel_at') ?? '0');
  const now = Date.now();
  if (!last || now - last >= THREE_DAYS_MS) {
    try {
      await refreshAssistancePanel(client);
      console.log('Assistance panel refreshed (3-day schedule).');
    } catch (err) {
      console.error('Failed to refresh assistance panel:', err);
    }
  }
}

export function startPanelScheduler(client: Client): void {
  const scheduleNext = () => {
    const delay = msUntilNextMidnightGmt();
    setTimeout(() => {
      void runMidnightJob(client).finally(() => scheduleNext());
    }, delay);
  };
  scheduleNext();
}
