import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { ContainerBuilder, type TextChannel } from 'discord.js';
import { closeTicket } from './close';
import { ticketsDb, type TicketRow } from '../db';
import { V2_FLAGS } from '../components/builders';

const ticket = { status: 'open', channel_id: 'chan' } as TicketRow;

function fakeChannel() {
  const sent: any[] = [];
  const channel = { id: 'chan', send: async (p: unknown) => void sent.push(p) } as unknown as TextChannel;
  return { channel, sent };
}

// Runs closeTicket past the close delay. The DB then says the ticket is no
// longer open, so it stops right after the notice (no transcript/delete).
async function close(channel: TextChannel, notify?: (n: ContainerBuilder) => Promise<unknown>) {
  const done = closeTicket(channel, ticket, 'staff', 'reason', notify ? { notify } : undefined);
  await new Promise((r) => setImmediate(r));
  mock.timers.tick(60_000);
  await done;
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(ticketsDb, 'getByChannel', async () => null);
});
afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

describe('closeTicket closing notice', () => {
  test('goes to notify (the clicked message) instead of a new channel message', async () => {
    const { channel, sent } = fakeChannel();
    const notices: ContainerBuilder[] = [];
    await close(channel, async (n) => void notices.push(n));
    assert.equal(notices.length, 1);
    assert.ok(notices[0] instanceof ContainerBuilder);
    assert.equal(sent.length, 0);
  });

  test('is sent to the channel when there is no interaction to reuse', async () => {
    const { channel, sent } = fakeChannel();
    await close(channel);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].flags, V2_FLAGS);
    assert.ok(sent[0].components[0] instanceof ContainerBuilder);
  });
});
