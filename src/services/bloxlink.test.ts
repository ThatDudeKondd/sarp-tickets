import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { relativeTimestamp, resolveRoblox } from './bloxlink';
import { env } from '../config';

const realFetch = globalThis.fetch;
let calls: { url: string; body?: string }[];
let routes: Record<string, () => Response>;

beforeEach(() => {
  calls = [];
  routes = {};
  globalThis.fetch = (async (url: string, init: any = {}) => {
    calls.push({ url: String(url), body: init.body });
    const route = Object.keys(routes).find((prefix) => String(url).startsWith(prefix));
    return route ? routes[route]() : new Response('not found', { status: 404 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  env.bloxlinkApiKey = '';
});

const USER = 'https://users.roblox.com/v1/users/';
const BY_NAME = 'https://users.roblox.com/v1/usernames/users';
const BLOX = 'https://api.blox.link/';
const robloxUser = () => Response.json({ id: 42, name: 'KonRoblox', displayName: 'Kon', created: '2015-01-01T00:00:00Z' });

describe('resolveRoblox', () => {
  test('uses Bloxlink when a key is set', async () => {
    env.bloxlinkApiKey = 'key';
    routes[BLOX] = () => Response.json({ robloxID: '42' });
    routes[USER] = robloxUser;
    const info = await resolveRoblox('d1', 'g1');
    assert.deepEqual(info, {
      username: 'KonRoblox',
      profileUrl: 'https://www.roblox.com/users/42/profile',
      createdAtUnix: 1420070400,
    });
    assert.match(calls[0].url, /guilds\/g1\/discord-to-roblox\/d1/);
  });

  test('accepts the alternative Bloxlink response shapes', async () => {
    env.bloxlinkApiKey = 'key';
    routes[USER] = robloxUser;
    for (const body of [{ robloxId: '42' }, { roblox: { id: 42 } }]) {
      routes[BLOX] = () => Response.json(body);
      assert.equal((await resolveRoblox('d', 'g')).username, 'KonRoblox');
    }
  });

  test('falls back to the nickname as a Roblox username', async () => {
    routes[BY_NAME] = () => Response.json({ data: [{ id: 42, name: 'KonRoblox' }] });
    routes[USER] = robloxUser;
    const info = await resolveRoblox('d', 'g', 'KonRoblox');
    assert.equal(info.username, 'KonRoblox');
    assert.deepEqual(JSON.parse(calls[0].body!).usernames, ['KonRoblox']);
  });

  test('also falls back when Bloxlink errors or has no link', async () => {
    env.bloxlinkApiKey = 'key';
    routes[BLOX] = () => new Response('', { status: 404 });
    routes[BY_NAME] = () => Response.json({ data: [{ id: 42 }] });
    routes[USER] = robloxUser;
    assert.equal((await resolveRoblox('d', 'g', 'nick')).username, 'KonRoblox');
  });

  test('keeps the profile link even when the user lookup fails', async () => {
    env.bloxlinkApiKey = 'key';
    routes[BLOX] = () => Response.json({ robloxID: '42' });
    const info = await resolveRoblox('d', 'g');
    assert.deepEqual(info, { username: null, profileUrl: 'https://www.roblox.com/users/42/profile', createdAtUnix: null });
  });

  test('returns all nulls when nothing resolves, without throwing on network errors', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    env.bloxlinkApiKey = 'key';
    assert.deepEqual(await resolveRoblox('d', 'g', 'nick'), { username: null, profileUrl: null, createdAtUnix: null });
  });

  test('makes no requests without a key or a nickname', async () => {
    await resolveRoblox('d', 'g');
    assert.equal(calls.length, 0);
  });
});

describe('relativeTimestamp', () => {
  test('formats a Discord relative timestamp, or Unknown', () => {
    assert.equal(relativeTimestamp(1420070400), '<t:1420070400:R>');
    assert.equal(relativeTimestamp(null), 'Unknown');
    assert.equal(relativeTimestamp(Number.NaN), 'Unknown');
  });
});
