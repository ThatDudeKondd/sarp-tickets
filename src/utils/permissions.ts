import type { Guild, GuildMember } from 'discord.js';
import { getConfig } from '../config';

export function hasMinRole(member: GuildMember, minRoleId: string): boolean {
  const minRole = member.guild.roles.cache.get(minRoleId);
  if (!minRole) return member.roles.cache.has(minRoleId);
  return member.roles.highest.position >= minRole.position;
}

export function canForceUnclaim(member: GuildMember): boolean {
  return hasMinRole(member, getConfig().Force_unclaim_role);
}

export function canManagePanel(member: GuildMember): boolean {
  return hasMinRole(member, getConfig().Panel_min_role);
}

/** Roles allowed to use the `/config` panel, hardcoded regardless of the configurable Panel_min_role. */
const CONFIG_ROLE_IDS = ['1529230390693462156', '1539455699913019483'];

export function canUseTicketConfig(member: GuildMember): boolean {
  return CONFIG_ROLE_IDS.some((id) => member.roles.cache.has(id));
}

export function isStaffMember(member: GuildMember): boolean {
  const c = getConfig();
  return (
    member.roles.cache.has(c.General_support_role) ||
    member.roles.cache.has(c.Supervisor_support_role) ||
    canForceUnclaim(member)
  );
}

export function hasClaimRole(member: GuildMember, type: 'general' | 'supervisor'): boolean {
  const c = getConfig();
  if (type === 'general') return member.roles.cache.has(c.General_support_role);
  return member.roles.cache.has(c.Supervisor_support_role);
}

/** Discord shortcodes mapped to Unicode; channel names cannot keep `:name:` text. */
const EMOJI_SHORTCODES: Record<string, string> = {
  white_circle: '⚪',
  black_circle: '⚫',
  red_circle: '🔴',
  blue_circle: '🔵',
  green_circle: '🟢',
  yellow_circle: '🟡',
  orange_circle: '🟠',
  purple_circle: '🟣',
  brown_circle: '🟤',
  white_check_mark: '✅',
  x: '❌',
  warning: '⚠️',
  sos: '🆘',
  star: '⭐',
  sparkles: '✨',
  fire: '🔥',
  ticket: '🎫',
  lock: '🔒',
  unlock: '🔓',
};

/**
 * Converts `:shortcode:` tokens to Unicode emoji, then sanitizes for Discord channel names.
 * Discord strips colon shortcodes from channel names entirely.
 */
export function sanitizeChannelName(name: string): string {
  let out = name.trim();

  out = out.replace(/:([a-z0-9_]+):/gi, (_, code: string) => {
    const emoji = EMOJI_SHORTCODES[code.toLowerCase()];
    return emoji ?? code;
  });

  out = out.replace(/:/g, '');

  out = out
    .replace(/[A-Z]/g, (ch) => ch.toLowerCase())
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}_-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  return out || 'ticket';
}


export async function uniqueChannelName(guild: Guild, base: string): Promise<string> {
  const name = sanitizeChannelName(base);
  if (!guild.channels.cache.find((c) => c.name === name)) return name;

  for (let i = 1; i < 100; i++) {
    const candidate = `${name}-${i}`.slice(0, 100);
    if (!guild.channels.cache.find((c) => c.name === candidate)) return candidate;
  }
  return `${name}-${Date.now().toString(36)}`.slice(0, 100);
}

export function formatGmt(ms: number): string {
  return new Date(ms).toUTCString();
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  if (totalMinutes < 60) return `~${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `~${hours}h ${minutes}m` : `~${hours}h`;
}

export function discordCreatedAt(userId: string): Date {
  const snowflake = BigInt(userId);
  const timestamp = Number((snowflake >> 22n) + 1420070400000n);
  return new Date(timestamp);
}

export const TICKET_OVERWRITES = {
  ViewChannel: true,
  SendMessages: true,
  AddReactions: true,
  UseApplicationCommands: true,
  ReadMessageHistory: true,
  UseExternalEmojis: true,
  UseExternalStickers: true,
  AttachFiles: true,
  EmbedLinks: true,
} as const;
