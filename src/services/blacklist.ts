import type { Client } from 'discord.js';
import { getConfig } from '../config';
import { blacklistDb } from '../db';
import { buildBlacklistAlert, V2_FLAGS } from '../components/builders';

export async function blacklistUser(
  client: Client,
  userId: string,
  reason: string,
  opts?: { username?: string; alert?: boolean },
): Promise<'added' | 'already'> {
  if (blacklistDb.isBlacklisted(userId)) return 'already';

  blacklistDb.add(userId, reason);

  if (opts?.alert !== false) {
    await sendBlacklistAlert(client, userId, reason, opts?.username);
  }
  return 'added';
}

export async function sendBlacklistAlert(
  client: Client,
  userId: string,
  reason: string,
  username?: string,
): Promise<void> {
  const c = getConfig();
  const alertChannelId = c.Blacklist_Alert_Channel;
  const alertRoleId = c.Blacklist_Alert_Role;

  let name = username;
  if (!name) {
    const user = await client.users.fetch(userId).catch(() => null);
    name = user?.username ?? 'Unknown';
  }

  const channel = await client.channels.fetch(alertChannelId).catch(() => null);
  if (!channel?.isTextBased() || !('send' in channel)) return;

  await channel.send({
    components: [
      buildBlacklistAlert({
        alertRoleId,
        username: name,
        userId,
        reason,
        whenUnix: Math.floor(Date.now() / 1000),
      }),
    ],
    flags: V2_FLAGS,
    allowedMentions: { roles: [alertRoleId] },
  });
}
