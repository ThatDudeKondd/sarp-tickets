import { getConfig, type AutoReplyKey, type ChannelSettingKey, type RoleSettingKey } from '../config';
import { buildNamedContainer, getContainerText } from './containerStore';
import { V2_FLAGS } from './builders';

export const CHANNEL_LABELS: Record<ChannelSettingKey, string> = {
  Assistance_Channel: 'Assistance Channel',
  Transcript_Channel: 'Transcript Channel',
  Blacklist_Alert_Channel: 'Blacklist Alert Channel',
  General_category: 'General Category',
  Supervisor_category: 'Supervisor Category',
};

export const ROLE_LABELS: Record<RoleSettingKey, string> = {
  General_support_role: 'General Support Role',
  Supervisor_support_role: 'Supervisor Support Role',
  Panel_min_role: 'Panel / Config Min Role',
  Force_unclaim_role: 'Force-Unclaim Role',
  Blacklist_Alert_Role: 'Blacklist Alert Role',
};

export const PERM_LABELS = {
  max_open_tickets: 'Max open tickets per user',
  inactivity_checkup_hours: 'Inactivity checkup (hours)',
  inactivity_close_hours: 'Inactivity close (hours)',
  anti_ping_window_hours: 'Anti-ping window (hours)',
  close_delay_seconds: 'Close delay (seconds)',
} as const;

export const REPLY_LABELS: Record<AutoReplyKey, string> = {
  checkup: 'Inactivity checkup',
  claim: 'Claim notice',
  unclaim: 'Unclaim notice',
  anti_ping_1: 'Anti-ping warning 1',
  anti_ping_2: 'Anti-ping warning 2',
  timeout: 'Anti-ping timeout notice',
  closing: 'Closing countdown',
  inactivity_close_reason: 'Inactivity close reason',
  leave_close_reason: 'Leave close reason',
  ping_close_reason: 'Ping-punish close reason',
};

export { V2_FLAGS };

function currentSummary(): string {
  const c = getConfig();
  return [
    '**Ticket Bot Configuration**',
    'Select a category to customize.',
    '',
    `- Assistance: <#${c.Assistance_Channel}>`,
    `- Transcript: <#${c.Transcript_Channel}>`,
    `- General category: <#${c.General_category}>`,
    `- Supervisor category: <#${c.Supervisor_category}>`,
    `- General role: <@&${c.General_support_role}>`,
    `- Supervisor role: <@&${c.Supervisor_support_role}>`,
    `- Max open tickets: ${c.permissions.max_open_tickets}`,
  ].join('\n');
}

export function buildConfigRoot() {
  return buildNamedContainer('config_root', { summary: currentSummary() });
}

export function buildConfigChannelsPicker() {
  const c = getConfig();
  return buildNamedContainer('config_channels', {
    Assistance_Channel: c.Assistance_Channel,
    Transcript_Channel: c.Transcript_Channel,
    Blacklist_Alert_Channel: c.Blacklist_Alert_Channel,
    General_category: c.General_category,
    Supervisor_category: c.Supervisor_category,
  });
}

export function buildConfigChannelSelect(key: ChannelSettingKey) {
  const isCategory = key.includes('category');
  return buildNamedContainer(isCategory ? 'config_channel_set_category' : 'config_channel_set', {
    key,
    label: CHANNEL_LABELS[key],
    current: `<#${getConfig()[key]}>`,
  });
}

export function buildConfigRolesPicker() {
  const c = getConfig();
  return buildNamedContainer('config_roles', {
    General_support_role: c.General_support_role,
    Supervisor_support_role: c.Supervisor_support_role,
    Panel_min_role: c.Panel_min_role,
    Force_unclaim_role: c.Force_unclaim_role,
    Blacklist_Alert_Role: c.Blacklist_Alert_Role,
  });
}

export function buildConfigRoleSelect(key: RoleSettingKey) {
  return buildNamedContainer('config_role_set', {
    key,
    label: ROLE_LABELS[key],
    current: `<@&${getConfig()[key]}>`,
  });
}

export function buildConfigPermissionsPicker() {
  const p = getConfig().permissions;
  return buildNamedContainer('config_permissions', {
    summary: [
      '**Permissions**',
      `Max open tickets: **${p.max_open_tickets}**`,
      `Checkup after: **${p.inactivity_checkup_hours}h**`,
      `Close after: **${p.inactivity_close_hours}h**`,
      `Anti-ping window: **${p.anti_ping_window_hours}h**`,
      `Close delay: **${p.close_delay_seconds}s**`,
    ].join('\n'),
    max_open_tickets: String(p.max_open_tickets),
    inactivity_checkup_hours: String(p.inactivity_checkup_hours),
    inactivity_close_hours: String(p.inactivity_close_hours),
    anti_ping_window_hours: String(p.anti_ping_window_hours),
    close_delay_seconds: String(p.close_delay_seconds),
  });
}

export function buildConfigAutoRepliesPicker() {
  const keys = Object.keys(REPLY_LABELS) as AutoReplyKey[];
  const vars: Record<string, string> = {};
  for (const key of keys) {
    vars[`${key}_preview`] = getContainerText(key).slice(0, 90);
  }
  return buildNamedContainer('config_auto_replies', vars);
}
