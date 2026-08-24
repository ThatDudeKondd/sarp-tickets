import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface PermissionSettings {
  max_open_tickets: number;
  inactivity_checkup_hours: number;
  inactivity_close_hours: number;
  anti_ping_window_hours: number;
  close_delay_seconds: number;
}

export interface BotConfig {
  banner: string;
  footer: string;
  Assistance_Channel: string;
  Transcript_Channel: string;
  Blacklist_Alert_Channel: string;
  Command_Log_Channel: string;
  General_support_role: string;
  Supervisor_support_role: string;
  General_category: string;
  Supervisor_category: string;
  Panel_min_role: string;
  Force_unclaim_role: string;
  Blacklist_Alert_Role: string;
  permissions: PermissionSettings;
}

const DEFAULT_PERMISSIONS: PermissionSettings = {
  max_open_tickets: 3,
  inactivity_checkup_hours: 24,
  inactivity_close_hours: 48,
  anti_ping_window_hours: 24,
  close_delay_seconds: 3,
};

export const configPath = path.join(process.cwd(), 'config.json');

function req(raw: Record<string, unknown>, key: string): string {
  const value = String(raw[key] ?? '').trim();
  if (!value) throw new Error(`Missing config.json key: ${key}`);
  return value;
}

function loadRaw(): BotConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const perms = { ...DEFAULT_PERMISSIONS, ...((raw.permissions as object) ?? {}) };

  return {
    banner: String(raw.banner ?? '').trim(),
    footer: String(raw.footer ?? '').trim(),
    Assistance_Channel: req(raw, 'Assistance_Channel'),
    Transcript_Channel: req(raw, 'Transcript_Channel'),
    Blacklist_Alert_Channel:
      String(raw.Blacklist_Alert_Channel ?? '1532512356708651038').trim() ||
      '1532512356708651038',
    Command_Log_Channel:
      String(raw.Command_Log_Channel ?? '1538980774114492496').trim() ||
      '1538980774114492496',
    General_support_role: req(raw, 'General_support_role'),
    Supervisor_support_role: req(raw, 'Supervisor_support_role'),
    General_category: req(raw, 'General_category'),
    Supervisor_category: req(raw, 'Supervisor_category'),
    Panel_min_role: req(raw, 'Panel_min_role'),
    Force_unclaim_role: req(raw, 'Force_unclaim_role'),
    Blacklist_Alert_Role:
      String(raw.Blacklist_Alert_Role ?? raw.Panel_min_role ?? '').trim() ||
      req(raw, 'Panel_min_role'),
    permissions: perms,
  };
}

/** Live config. Always read via `getConfig()` and mutate via the setters. */
export let config: BotConfig = loadRaw();

export function getConfig(): BotConfig {
  return config;
}

export function saveConfig(next: BotConfig): void {
  config = next;
  const { permissions, ...rest } = next;
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...rest, permissions }, null, 4) + '\n',
    'utf8',
  );
}

export function updateConfig(patch: Partial<BotConfig>): BotConfig {
  const next: BotConfig = {
    ...config,
    ...patch,
    permissions: { ...config.permissions, ...(patch.permissions ?? {}) },
  };
  saveConfig(next);
  return next;
}

export const env = {
  token: process.env.SARP_TICKETS_BOT_TOKEN?.replace(/^"|"$/g, '') ?? '',
  clientId: process.env.SARP_TICKETS_CLIENT_ID?.trim() ?? '',
  bloxlinkApiKey: process.env.BLOXLINK_API_KEY?.trim() ?? '',
  /** Public site origin for ticket/transcript sharing (no trailing slash). */
  domain: (process.env.DOMAIN ?? 'http://127.0.0.1:3000').replace(/\/$/, ''),
};

if (!env.token) throw new Error('Missing SARP_TICKETS_BOT_TOKEN');
if (!env.clientId) throw new Error('Missing SARP_TICKETS_CLIENT_ID');

export type TicketType = 'general' | 'supervisor';

export function supportRoleForType(type: TicketType): string {
  return type === 'general'
    ? getConfig().General_support_role
    : getConfig().Supervisor_support_role;
}

export function categoryForType(type: TicketType): string {
  return type === 'general'
    ? getConfig().General_category
    : getConfig().Supervisor_category;
}

export const SUPERVISOR_REASON_RE =
  /\b(fast[\s-]?pass|staff\s*fast[\s-]?pass|staff\s*transfer|transfer)\b/i;

export function maxOpenTickets(): number {
  return config.permissions.max_open_tickets;
}

export function inactivityCheckupMs(): number {
  return config.permissions.inactivity_checkup_hours * 60 * 60 * 1000;
}

export function inactivityCloseMs(): number {
  return config.permissions.inactivity_close_hours * 60 * 60 * 1000;
}

export function antiPingWindowMs(): number {
  return config.permissions.anti_ping_window_hours * 60 * 60 * 1000;
}

export function closeDelayMs(): number {
  return config.permissions.close_delay_seconds * 1000;
}

export const ETA_MIN_SAMPLES = 5;

export const CHANNEL_SETTING_KEYS = [
  'Assistance_Channel',
  'Transcript_Channel',
  'Blacklist_Alert_Channel',
  'General_category',
  'Supervisor_category',
] as const;

export const ROLE_SETTING_KEYS = [
  'General_support_role',
  'Supervisor_support_role',
  'Panel_min_role',
  'Force_unclaim_role',
  'Blacklist_Alert_Role',
] as const;

export const PERMISSION_SETTING_KEYS = [
  'max_open_tickets',
  'inactivity_checkup_hours',
  'inactivity_close_hours',
  'anti_ping_window_hours',
  'close_delay_seconds',
] as const;

export const AUTO_REPLY_KEYS = [
  'checkup',
  'claim',
  'unclaim',
  'anti_ping_1',
  'anti_ping_2',
  'timeout',
  'closing',
  'inactivity_close_reason',
  'leave_close_reason',
  'ping_close_reason',
] as const;

export type ChannelSettingKey = (typeof CHANNEL_SETTING_KEYS)[number];
export type RoleSettingKey = (typeof ROLE_SETTING_KEYS)[number];
export type PermissionSettingKey = (typeof PERMISSION_SETTING_KEYS)[number];
export type AutoReplyKey = (typeof AUTO_REPLY_KEYS)[number];
