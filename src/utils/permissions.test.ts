import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canForceUnclaim,
  canManagePanel,
  canUseTicketConfig,
  discordCreatedAt,
  formatDuration,
  formatGmt,
  hasClaimRole,
  hasMinRole,
  isStaffMember,
  sanitizeChannelName,
  uniqueChannelName,
} from './permissions';
import { getConfig, updateConfig } from '../config';

const c = () => getConfig();

/**
 * A member with the given role IDs. Guild roles get positions by array order
 * in `hierarchy` (later = higher); `highest` is the member's top role.
 */
function memberWith(
  roleIds: string[],
  { hierarchy = [], admin = false, guildRoles }: { hierarchy?: string[]; admin?: boolean; guildRoles?: string[] } = {},
) {
  guildRoles ??= hierarchy;
  const position = (id: string) => hierarchy.indexOf(id);
  const highest = roleIds.reduce((best, id) => (position(id) > position(best) ? id : best), roleIds[0] ?? '');
  const guild = {
    roles: {
      cache: {
        get: (id: string) => (guildRoles.includes(id) ? { id, position: position(id) } : undefined),
        has: (id: string) => guildRoles.includes(id),
      },
    },
  };
  return {
    guild,
    roles: { cache: { has: (id: string) => roleIds.includes(id) }, highest: { position: position(highest) } },
    permissions: { has: () => admin },
  } as any;
}

describe('role hierarchy checks', () => {
  test('hasMinRole compares positions, so higher roles also pass', () => {
    const hierarchy = ['low', 'min', 'high'];
    assert.equal(hasMinRole(memberWith(['high'], { hierarchy }), 'min'), true);
    assert.equal(hasMinRole(memberWith(['min'], { hierarchy }), 'min'), true);
    assert.equal(hasMinRole(memberWith(['low'], { hierarchy }), 'min'), false);
  });

  test('hasMinRole falls back to plain membership when the role is not cached', () => {
    assert.equal(hasMinRole(memberWith(['ghost'], { guildRoles: [] }), 'ghost'), true);
    assert.equal(hasMinRole(memberWith([], { guildRoles: [] }), 'ghost'), false);
  });

  test('panel and force-unclaim use their configured roles', () => {
    const hierarchy = [c().Panel_min_role, c().Force_unclaim_role];
    assert.equal(canManagePanel(memberWith([c().Panel_min_role], { hierarchy })), true);
    assert.equal(canForceUnclaim(memberWith([c().Panel_min_role], { hierarchy })), false);
    assert.equal(canForceUnclaim(memberWith([c().Force_unclaim_role], { hierarchy })), true);
  });
});

describe('canUseTicketConfig', () => {
  test('with Config_roles set, only those roles may open /config', () => {
    updateConfig({ Config_roles: ['cfg'] });
    try {
      assert.equal(canUseTicketConfig(memberWith(['cfg'])), true);
      assert.equal(canUseTicketConfig(memberWith([c().Panel_min_role], { hierarchy: [c().Panel_min_role], admin: true })), false);
    } finally {
      updateConfig({ Config_roles: [] });
    }
  });

  test('without Config_roles it falls back to Panel_min_role', () => {
    const hierarchy = [c().Panel_min_role];
    assert.equal(canUseTicketConfig(memberWith([c().Panel_min_role], { hierarchy })), true);
    assert.equal(canUseTicketConfig(memberWith([], { hierarchy })), false);
  });

  test('on a fresh config (Panel_min_role not a real role) only admins get in', () => {
    const real = c().Panel_min_role;
    updateConfig({ Panel_min_role: 'FILL_ME' });
    try {
      assert.equal(canUseTicketConfig(memberWith([], { admin: true })), true);
      assert.equal(canUseTicketConfig(memberWith([], { admin: false })), false);
    } finally {
      updateConfig({ Panel_min_role: real });
    }
  });
});

describe('staff checks', () => {
  test('support roles and force-unclaimers count as staff', () => {
    assert.equal(isStaffMember(memberWith([c().General_support_role])), true);
    assert.equal(isStaffMember(memberWith([c().Supervisor_support_role])), true);
    assert.equal(isStaffMember(memberWith(['random'])), false);
  });

  test('hasClaimRole is per ticket type', () => {
    const general = memberWith([c().General_support_role]);
    assert.equal(hasClaimRole(general, 'general'), true);
    assert.equal(hasClaimRole(general, 'supervisor'), false);
  });
});

describe('sanitizeChannelName', () => {
  test('lowercases and hyphenates', () => {
    assert.equal(sanitizeChannelName('  General Support  Ticket '), 'general-support-ticket');
  });

  test('turns known :shortcodes: into emoji and drops unknown colons', () => {
    assert.equal(sanitizeChannelName(':green_circle: open'), '🟢-open');
    assert.equal(sanitizeChannelName(':notreal: x'), 'notreal-x');
  });

  test('strips punctuation, collapses dashes and trims them', () => {
    assert.equal(sanitizeChannelName('--Hello!!  World??--'), 'hello-world');
  });

  test('caps at 100 characters and never returns empty', () => {
    assert.equal(sanitizeChannelName('a'.repeat(150)).length, 100);
    assert.equal(sanitizeChannelName('!!!'), 'ticket');
  });
});

describe('uniqueChannelName', () => {
  const guildWith = (...names: string[]) => ({ channels: { cache: { find: (fn: any) => names.map((name) => ({ name })).find(fn) } } }) as any;

  test('returns the sanitized name when free', async () => {
    assert.equal(await uniqueChannelName(guildWith(), 'My Ticket'), 'my-ticket');
  });

  test('appends the first free number', async () => {
    assert.equal(await uniqueChannelName(guildWith('my-ticket', 'my-ticket-1'), 'My Ticket'), 'my-ticket-2');
  });
});

describe('formatting helpers', () => {
  test('formatDuration rounds to minutes and hours', () => {
    assert.equal(formatDuration(0), '~1m');
    assert.equal(formatDuration(5 * 60_000), '~5m');
    assert.equal(formatDuration(60 * 60_000), '~1h');
    assert.equal(formatDuration(90 * 60_000), '~1h 30m');
  });

  test('formatGmt is a UTC string', () => {
    assert.equal(formatGmt(0), 'Thu, 01 Jan 1970 00:00:00 GMT');
  });

  test('discordCreatedAt decodes the snowflake timestamp', () => {
    // Discord's own example snowflake, created 2016-04-30T11:18:25.796Z.
    assert.equal(discordCreatedAt('175928847299117063').toISOString(), '2016-04-30T11:18:25.796Z');
  });
});
