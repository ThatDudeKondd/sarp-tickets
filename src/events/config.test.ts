import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { handleConfigInteraction, handleConfigSlash } from './config';
import { buildConfigPage, buildConfigRoot } from '../components/configPanel';
import { getConfig, updateConfig } from '../config';

const ADMIN_ROLE = getConfig().Panel_min_role;

/** Flattens a rendered panel into its text and component custom IDs. */
function describeView(container: any) {
  const json = container.toJSON();
  const text = json.components.filter((c: any) => c.type === 10).map((c: any) => c.content).join('\n');
  const ids = json.components
    .filter((c: any) => c.type === 1)
    .flatMap((row: any) => row.components.map((c: any) => ({ id: c.custom_id, disabled: !!c.disabled })));
  return { text, ids };
}

describe('config panel views', () => {
  test('the overview has page tabs and Cancel instead of a dropdown', () => {
    const { ids } = describeView(buildConfigRoot());
    assert.deepEqual(ids.map((b: any) => b.id), [
      'config:page:channels', 'config:page:roles', 'config:page:permissions', 'config:page:auto_replies', 'config:cancel',
    ]);
  });

  for (const page of ['channels', 'roles', 'permissions', 'auto_replies'] as const) {
    test(`the ${page} page disables only its own tab`, () => {
      const { ids } = describeView(buildConfigPage(page));
      const tabs = ids.filter((b: any) => b.id?.startsWith('config:page:'));
      assert.deepEqual(tabs.filter((b: any) => b.disabled).map((b: any) => b.id), [`config:page:${page}`]);
      assert.ok(ids.some((b: any) => b.id === 'config:cancel'));
    });
  }

  test('the channels and roles pages list current values', () => {
    assert.match(describeView(buildConfigPage('channels')).text, /Assistance Channel: <#100000000000000001>/);
    assert.match(describeView(buildConfigPage('roles')).text, /General Support Role: <@&200000000000000001>/);
  });

  test('unset values show as "not set" and the overview lists them', () => {
    const real = getConfig().Transcript_Channel;
    updateConfig({ Transcript_Channel: 'FILL_ME' });
    try {
      assert.match(describeView(buildConfigPage('channels')).text, /Transcript Channel: \*not set\*/);
      assert.match(describeView(buildConfigRoot()).text, /Not set yet:.*Transcript Channel/);
    } finally {
      updateConfig({ Transcript_Channel: real });
    }
  });
});

// --- Interaction flow ---

let seq = 0;
function guildMember(roles: string[]) {
  return {
    roles: { cache: { has: (id: string) => roles.includes(id) }, highest: { position: roles.includes(ADMIN_ROLE) ? 1 : 0 } },
    permissions: { has: () => false },
    guild: { roles: { cache: { get: (id: string) => (id === ADMIN_ROLE ? { position: 1 } : undefined), has: (id: string) => id === ADMIN_ROLE } } },
  };
}

/** Opens /config as `userId` and returns the panel message ID. */
async function openPanel(userId = 'owner') {
  const msgId = `panel${++seq}`;
  const panel: any = { id: msgId, deleted: false, delete: async () => void (panel.deleted = true) };
  const replies: any[] = [];
  await handleConfigSlash({
    guild: { members: { fetch: async () => guildMember([ADMIN_ROLE]) } },
    member: {},
    user: { id: userId },
    reply: async (p: any) => void replies.push(p),
    fetchReply: async () => panel,
  } as any);
  return { panel, replies };
}

function interaction(kind: 'button' | 'role' | 'channel', customId: string, panel: any, extra: Record<string, unknown> = {}) {
  const i: any = {
    customId,
    message: panel,
    user: { id: 'owner' },
    guild: { members: { fetch: async () => guildMember([ADMIN_ROLE]) } },
    member: {},
    updates: [] as any[],
    replies: [] as any[],
    update: async (p: any) => void i.updates.push(p),
    reply: async (p: any) => void i.replies.push(p),
    deferUpdate: async () => {},
    isButton: () => kind === 'button',
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => kind === 'channel',
    isRoleSelectMenu: () => kind === 'role',
    isModalSubmit: () => false,
    ...extra,
  };
  return i;
}

describe('/config interactions', () => {
  test('page buttons switch pages in place', async () => {
    const { panel } = await openPanel();
    const i = interaction('button', 'config:page:roles', panel);
    assert.equal(await handleConfigInteraction(i), true);
    assert.match(describeView(i.updates[0].components[0]).text, /\*\*Roles\*\*/);
  });

  test('Cancel deletes the panel', async () => {
    const { panel } = await openPanel();
    await handleConfigInteraction(interaction('button', 'config:cancel', panel));
    assert.equal(panel.deleted, true);
  });

  test('saving a role returns to the Roles page and persists', async () => {
    const { panel } = await openPanel();
    const real = getConfig().Force_unclaim_role;
    const i = interaction('role', 'config:roles:set:Force_unclaim_role', panel, { values: ['300000000000000001'] });
    try {
      await handleConfigInteraction(i);
      assert.equal(getConfig().Force_unclaim_role, '300000000000000001');
      assert.match(describeView(i.updates[0].components[0]).text, /\*\*Roles\*\*/);
    } finally {
      updateConfig({ Force_unclaim_role: real });
    }
  });

  test('saving a channel returns to the Channels page', async () => {
    const { panel } = await openPanel();
    const real = getConfig().Command_Log_Channel;
    const i = interaction('channel', 'config:channels:set:Command_Log_Channel', panel, { values: ['100000000000000099'] });
    try {
      await handleConfigInteraction(i);
      assert.match(describeView(i.updates[0].components[0]).text, /\*\*Channels\*\*/);
    } finally {
      updateConfig({ Command_Log_Channel: real });
    }
  });

  test('only the person who opened the panel can use it', async () => {
    const { panel } = await openPanel('owner');
    const i = interaction('button', 'config:cancel', panel, { user: { id: 'someone-else' } });
    await handleConfigInteraction(i);
    assert.equal(panel.deleted, false);
    assert.match(i.replies[0].content, /Only the person who ran/);
  });

  test('members without config access are refused', async () => {
    const { panel } = await openPanel();
    const i = interaction('button', 'config:page:roles', panel, {
      guild: { members: { fetch: async () => guildMember([]) } },
    });
    await handleConfigInteraction(i);
    assert.equal(i.updates.length, 0);
    assert.match(i.replies[0].content, /do not have permission/);
  });

  test('non-config interactions are passed through', async () => {
    const i = interaction('button', 'ticket:claim', { id: 'x' });
    assert.equal(await handleConfigInteraction(i), false);
  });
});
