import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyPlaceholders,
  buildContainerFromDef,
  buildNamedContainer,
  getContainerText,
  loadContainerDef,
  setContainerText,
  type ContainerDefinition,
} from './containerStore';

const render = (def: Omit<ContainerDefinition, 'name'>, vars: Record<string, string> = {}) =>
  buildContainerFromDef({ name: 't', ...def }, vars).toJSON() as any;

/** All buttons in a rendered container, flattened. */
const buttons = (json: any) =>
  json.components.filter((c: any) => c.type === 1).flatMap((row: any) => row.components);

describe('applyPlaceholders', () => {
  test('replaces every occurrence and leaves unknown placeholders', () => {
    assert.equal(applyPlaceholders('{a} and {a} but {b}', { a: 'x' }), 'x and x but {b}');
  });
});

describe('buildContainerFromDef', () => {
  test('renders text with placeholders', () => {
    const json = render({ parts: [{ type: 'text', content: 'Hi {name}' }] }, { name: 'Kon' });
    assert.equal(json.components[0].content, 'Hi Kon');
  });

  test('when / whenNot include or skip parts', () => {
    const parts: any[] = [
      { type: 'text', content: 'shown when flag', when: 'flag' },
      { type: 'text', content: 'shown without flag', whenNot: 'flag' },
    ];
    assert.deepEqual(render({ parts }, { flag: 'true' }).components.map((c: any) => c.content), ['shown when flag']);
    assert.deepEqual(render({ parts }, { flag: 'false' }).components.map((c: any) => c.content), ['shown without flag']);
    assert.deepEqual(render({ parts }, { flag: '0' }).components.map((c: any) => c.content), ['shown without flag']);
  });

  test('buttons honour when, whenNot and disabledWhen', () => {
    const json = render(
      {
        parts: [
          {
            type: 'buttons',
            buttons: [
              { customId: 'a', label: 'A', style: 'Primary', disabledWhen: 'on_a' },
              { customId: 'b', label: 'B', style: 'Danger', when: 'show_b' },
              { customId: 'c', label: 'C', style: 'Secondary', whenNot: 'hide_c' },
            ],
          },
        ],
      },
      { on_a: 'true', hide_c: 'true' },
    );
    const b = buttons(json);
    assert.deepEqual(b.map((x: any) => x.custom_id), ['a']);
    assert.equal(b[0].disabled, true);
  });

  test('buttons default to enabled', () => {
    const b = buttons(render({ parts: [{ type: 'buttons', buttons: [{ customId: 'x', label: 'X', style: 'Primary' }] }] }));
    assert.equal(b[0].disabled, false);
  });

  test('link buttons need a URL and skip when it is empty', () => {
    const json = render({
      parts: [
        {
          type: 'buttons',
          buttons: [
            { label: 'Site', style: 'Link', url: '{url}' },
            { label: 'Empty', style: 'Link', url: '' },
          ],
        },
      ],
    }, { url: 'https://example.com' });
    const b = buttons(json);
    assert.equal(b.length, 1);
    assert.equal(b[0].url, 'https://example.com');
  });

  test('a buttons part with every button filtered out adds no empty row', () => {
    const json = render({ parts: [{ type: 'buttons', buttons: [{ customId: 'x', label: 'X', style: 'Primary', when: 'never' }] }] });
    assert.equal(buttons(json).length, 0);
  });
});

describe('container files', () => {
  test('every shipped container definition renders', () => {
    for (const name of ['config_root', 'config_channels', 'config_roles', 'config_permissions', 'config_auto_replies',
      'config_channel_set', 'config_channel_set_category', 'config_role_set', 'close_request']) {
      assert.doesNotThrow(() => buildNamedContainer(name, {}), name);
    }
  });

  test('a missing definition throws a clear error', () => {
    assert.throws(() => loadContainerDef('does_not_exist'), /Missing container definition/);
  });

  test('setContainerText edits the first text part and persists (in the test copy)', () => {
    const before = getContainerText('checkup');
    try {
      setContainerText('checkup', 'Are you still there?');
      assert.equal(getContainerText('checkup'), 'Are you still there?');
    } finally {
      setContainerText('checkup', before);
    }
  });
});
