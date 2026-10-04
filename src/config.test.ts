import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import {
  antiPingWindowMs,
  categoryForType,
  closeDelayMs,
  configPath,
  env,
  getConfig,
  inactivityCheckupMs,
  inactivityCloseMs,
  maxOpenTickets,
  supportRoleForType,
  SUPERVISOR_REASON_RE,
  updateConfig,
} from './config';

const onDisk = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

describe('config', () => {
  test('loads from CONFIG_PATH (the test copy, never the real config.json)', () => {
    assert.match(configPath, /sarp-tickets-test-/);
    assert.equal(getConfig().Assistance_Channel, '100000000000000001');
  });

  test('updateConfig changes the live config and persists it', () => {
    const before = getConfig().Transcript_Channel;
    updateConfig({ Transcript_Channel: '999999999999999999' });
    try {
      assert.equal(getConfig().Transcript_Channel, '999999999999999999');
      assert.equal(onDisk().Transcript_Channel, '999999999999999999');
    } finally {
      updateConfig({ Transcript_Channel: before });
    }
  });

  test('updating one permission keeps the others', () => {
    updateConfig({ permissions: { ...getConfig().permissions, max_open_tickets: 5 } });
    try {
      assert.equal(maxOpenTickets(), 5);
      assert.equal(getConfig().permissions.close_delay_seconds, 3);
      assert.equal(onDisk().permissions.max_open_tickets, 5);
    } finally {
      updateConfig({ permissions: { ...getConfig().permissions, max_open_tickets: 3 } });
    }
  });

  test('time settings convert to milliseconds', () => {
    assert.equal(inactivityCheckupMs(), 24 * 3_600_000);
    assert.equal(inactivityCloseMs(), 48 * 3_600_000);
    assert.equal(antiPingWindowMs(), 24 * 3_600_000);
    assert.equal(closeDelayMs(), 3_000);
  });

  test('ticket types map to their role and category', () => {
    assert.equal(supportRoleForType('general'), getConfig().General_support_role);
    assert.equal(supportRoleForType('supervisor'), getConfig().Supervisor_support_role);
    assert.equal(categoryForType('general'), getConfig().General_category);
    assert.equal(categoryForType('supervisor'), getConfig().Supervisor_category);
  });

  test('env comes from the environment', () => {
    assert.equal(env.token, 'test-token');
    assert.equal(env.clientId, 'test-client');
  });
});

describe('SUPERVISOR_REASON_RE', () => {
  for (const reason of ['fast pass please', 'Staff Fast-Pass', 'staff transfer from LSPD', 'TRANSFER']) {
    test(`routes "${reason}" to supervisors`, () => assert.ok(SUPERVISOR_REASON_RE.test(reason)));
  }
  for (const reason of ['I need help', 'transferring money', 'passing by']) {
    test(`leaves "${reason}" as general`, () => assert.equal(SUPERVISOR_REASON_RE.test(reason), false));
  }
});
