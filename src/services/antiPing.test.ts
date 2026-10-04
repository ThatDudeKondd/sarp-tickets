import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { handleAntiPing } from './antiPing';
import { antiPingDb, type AntiPingRow, type TicketRow } from '../db';
import { getConfig } from '../config';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const STAFF_ROLE = getConfig().General_support_role;

let state: AntiPingRow;
let saved: AntiPingRow[];

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  state = { user_id: 'opener', offence_count: 0, auto_timeout_count: 0, last_mute_at: null, last_unmute_at: null, last_offence_at: null };
  saved = [];
  mock.method(antiPingDb, 'get', async () => ({ ...state }));
  mock.method(antiPingDb, 'save', async (row: AntiPingRow) => {
    saved.push({ ...row });
    state = { ...row };
  });
});
afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
});

const ticket = (extra: Partial<TicketRow> = {}) =>
  ({ opener_id: 'opener', claimed_by: null, opened_at: NOW - HOUR, ...extra }) as TicketRow;

function ping({ author = 'opener', roles = [STAFF_ROLE], users = [] as string[], everyone = false, staffUsers = [] as string[] } = {}) {
  const sent: any[] = [];
  const staffMember = { roles: { cache: { has: (id: string) => id === STAFF_ROLE } }, guild: { roles: { cache: { get: () => undefined } } } };
  const message: any = {
    author: { id: author },
    mentions: {
      users: new Map(users.map((u) => [u, { id: u }])),
      roles: new Map(roles.map((r) => [r, { id: r }])),
      members: new Map(staffUsers.map((u) => [u, staffMember])),
      everyone,
    },
    channel: { send: async (p: any) => void sent.push(p) },
    client: { user: { id: 'bot' } },
  };
  return { message, sent };
}

function opener({ moderatable = true } = {}) {
  const timeouts: number[] = [];
  return {
    member: { id: 'opener', moderatable, user: { username: 'opener' }, timeout: async (ms: number) => void timeouts.push(ms) } as any,
    timeouts,
  };
}

const offend = async (opts?: Parameters<typeof ping>[0], t = ticket(), m = opener()) => {
  const p = ping(opts);
  const handled = await handleAntiPing(p.message, t, m.member);
  return { handled, ...p, ...m };
};

describe('handleAntiPing: what counts as a staff ping', () => {
  test('ignores messages not from the ticket opener', async () => {
    assert.equal((await offend({ author: 'someone' })).handled, false);
  });

  test('ignores tickets older than the anti-ping window', async () => {
    assert.equal((await offend({}, ticket({ opened_at: NOW - 25 * HOUR }))).handled, false);
  });

  test('ignores messages that ping no staff', async () => {
    assert.equal((await offend({ roles: [] })).handled, false);
  });

  test('pinging only the claimer is allowed', async () => {
    const r = await offend({ roles: [], users: ['claimer'], staffUsers: ['claimer'] }, ticket({ claimed_by: 'claimer' }));
    assert.equal(r.handled, false);
  });

  test('@everyone and staff members count as staff pings', async () => {
    assert.equal((await offend({ roles: [], everyone: true })).handled, true);
    assert.equal((await offend({ roles: [], users: ['mod'], staffUsers: ['mod'] })).handled, true);
  });
});

describe('handleAntiPing: escalation', () => {
  test('first and second offences warn without a timeout', async () => {
    const first = await offend();
    assert.equal(first.handled, true);
    assert.equal(first.timeouts.length, 0);
    assert.equal(state.offence_count, 1);
    const second = await offend();
    assert.equal(second.timeouts.length, 0);
    assert.equal(state.offence_count, 2);
  });

  test('the third offence times out for 1 hour', async () => {
    state.offence_count = 2;
    state.last_offence_at = NOW - 60_000;
    const r = await offend();
    assert.deepEqual(r.timeouts, [HOUR]);
    assert.equal(state.auto_timeout_count, 1);
    assert.equal(state.last_unmute_at, NOW + HOUR);
  });

  test('offending within an hour of the last unmute gives 6 hours', async () => {
    Object.assign(state, { offence_count: 2, last_offence_at: NOW - 60_000, last_unmute_at: NOW - 30 * 60_000 });
    assert.deepEqual((await offend()).timeouts, [6 * HOUR]);
  });

  test('offending more than 12h after the last unmute starts over at a warning', async () => {
    Object.assign(state, { offence_count: 2, last_offence_at: NOW - 60_000, last_unmute_at: NOW - 13 * HOUR });
    const r = await offend();
    assert.equal(r.timeouts.length, 0);
    assert.equal(state.offence_count, 1);
  });

  test('the offence count resets after 12 quiet hours', async () => {
    Object.assign(state, { offence_count: 2, last_offence_at: NOW - 13 * HOUR });
    const r = await offend();
    assert.equal(r.timeouts.length, 0);
    assert.equal(state.offence_count, 1);
  });

  test("members the bot can't time out get a notice instead", async () => {
    Object.assign(state, { offence_count: 2, last_offence_at: NOW - 60_000 });
    const r = await offend({}, ticket(), opener({ moderatable: false }));
    assert.equal(r.timeouts.length, 0);
    assert.equal(r.sent.length, 1);
    assert.equal(state.auto_timeout_count, 0);
  });
});
