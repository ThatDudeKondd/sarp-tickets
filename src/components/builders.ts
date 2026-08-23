import { MessageFlags, type ContainerBuilder } from 'discord.js';
import { getConfig } from '../config';
import {
  buildNamedContainer,
  getContainerText,
} from './containerStore';

export const V2_FLAGS = MessageFlags.IsComponentsV2;

export function buildPanelContainer(): ContainerBuilder {
  return buildNamedContainer('panel');
}

export function buildTicketControlContainer(opts: {
  openerId: string;
  teamRoleId: string;
  robloxDisplay: string;
  robloxCreatedAt: string;
  discordDisplay: string;
  discordCreatedAt: string;
  reason: string;
  ticketId: number;
  openCount: number;
  etaText: string | null;
  claimedBy: string | null;
}): ContainerBuilder {
  return buildNamedContainer('ticket', {
    openerMention: `<@${opts.openerId}>`,
    teamRoleMention: `<@&${opts.teamRoleId}>`,
    robloxDisplay: opts.robloxDisplay,
    robloxCreatedAt: opts.robloxCreatedAt,
    discordDisplay: opts.discordDisplay,
    discordCreatedAt: opts.discordCreatedAt,
    reason: opts.reason,
    ticketId: String(opts.ticketId),
    openCount: String(opts.openCount),
    etaLine: opts.etaText ? `\nCurrent ETA: ${opts.etaText}` : '',
    claimed: opts.claimedBy ? 'true' : '',
  });
}

export function buildClaimNotice(staffId: string): ContainerBuilder {
  return buildNamedContainer('claim', { staff: `<@${staffId}>` });
}

export function buildUnclaimNotice(staffId: string): ContainerBuilder {
  return buildNamedContainer('unclaim', { staff: `<@${staffId}>` });
}

export function buildForceUnclaimNotice(userId: string): ContainerBuilder {
  return buildNamedContainer('force_unclaim', { user: `<@${userId}>` });
}

export function buildCloseConfirm(): ContainerBuilder {
  return buildNamedContainer('close_confirm');
}

export function buildClosingNotice(seconds?: number): ContainerBuilder {
  const secs = seconds ?? getConfig().permissions.close_delay_seconds;
  return buildNamedContainer('closing', { seconds: String(secs) });
}

export function buildCloseRequest(openerId: string, reason?: string): ContainerBuilder {
  return buildNamedContainer('close_request', {
    openerMention: `<@${openerId}>`,
    reasonLine: reason ? `\nReason: ${reason}` : '',
  });
}

export function buildCheckup(openerId: string, staffId: string | null): ContainerBuilder {
  return buildNamedContainer('checkup', {
    opener: `<@${openerId}>`,
    staff: staffId ? `<@${staffId}>` : 'staff',
  });
}

export function buildAntiPingWarning(level: 1 | 2): ContainerBuilder {
  return buildNamedContainer(level === 1 ? 'anti_ping_1' : 'anti_ping_2');
}

export function buildTimeoutNotice(userId: string, hours: number): ContainerBuilder {
  return buildNamedContainer('timeout', {
    user: `<@${userId}>`,
    hours: String(hours),
  });
}

export function buildTimeoutFailedNotice(reason: string): ContainerBuilder {
  return buildNamedContainer('timeout_failed', { reason });
}

export function buildTranscriptSummary(opts: {
  channelName: string;
  openedBy: string;
  closedBy: string;
  closeReason: string;
  openingReason: string;
  openedAt: string;
  closedAt: string;
  fileName: string;
}): ContainerBuilder {
  return buildNamedContainer('transcript', {
    channelName: opts.channelName,
    openedBy: opts.openedBy,
    closedBy: opts.closedBy,
    closeReason: opts.closeReason,
    openingReason: opts.openingReason,
    openedAt: opts.openedAt,
    closedAt: opts.closedAt,
    fileName: opts.fileName,
  });
}

export function buildBlacklistAlert(opts: {
  alertRoleId: string;
  username: string;
  userId: string;
  reason: string;
  whenUnix: number;
}): ContainerBuilder {
  return buildNamedContainer('blacklist_alert', {
    alertRoleMention: `<@&${opts.alertRoleId}>`,
    username: opts.username,
    userId: opts.userId,
    reason: opts.reason,
    when: `<t:${opts.whenUnix}:R>`,
  });
}

export function buildTransferNotice(fromId: string, toId: string): ContainerBuilder {
  return buildNamedContainer('transfer', {
    from: `<@${fromId}>`,
    to: `<@${toId}>`,
  });
}

export function buildCloseRequestDenied(): ContainerBuilder {
  return buildNamedContainer('close_request_denied');
}

/** Close-reason and auto-reply strings are stored in container JSON text parts. */
export function getAutoReplyText(
  key:
    | 'checkup'
    | 'claim'
    | 'unclaim'
    | 'anti_ping_1'
    | 'anti_ping_2'
    | 'timeout'
    | 'closing'
    | 'inactivity_close_reason'
    | 'leave_close_reason'
    | 'ping_close_reason',
): string {
  return getContainerText(key);
}
