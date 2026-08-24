import { env } from '../config';

interface BloxlinkResponse {
  robloxID?: string;
  robloxId?: string;
  roblox?: { id?: string | number };
}

interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  created: string;
}

export interface RobloxInfo {
  username: string | null;
  profileUrl: string | null;
  createdAtUnix: number | null;
}

async function fetchRobloxUser(robloxId: string): Promise<RobloxInfo> {
  const profileUrl = `https://www.roblox.com/users/${robloxId}/profile`;
  const userRes = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
  if (!userRes.ok) {
    return { username: null, profileUrl, createdAtUnix: null };
  }
  const user = (await userRes.json()) as RobloxUser;
  const createdAtUnix = user.created
    ? Math.floor(new Date(user.created).getTime() / 1000)
    : null;
  return { username: user.name, profileUrl, createdAtUnix };
}

async function lookupRobloxByUsername(username: string): Promise<RobloxInfo | null> {
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id: number; name: string }[] };
    const hit = data.data?.[0];
    if (!hit?.id) return null;
    return fetchRobloxUser(String(hit.id));
  } catch {
    return null;
  }
}

export async function resolveRoblox(
  discordUserId: string,
  guildId: string,
  nicknameFallback?: string | null,
): Promise<RobloxInfo> {
  let info: RobloxInfo = { username: null, profileUrl: null, createdAtUnix: null };

  if (env.bloxlinkApiKey) {
    try {
      const res = await fetch(
        `https://api.blox.link/v4/public/guilds/${guildId}/discord-to-roblox/${discordUserId}`,
        { headers: { Authorization: env.bloxlinkApiKey } },
      );
      if (res.ok) {
        const data = (await res.json()) as BloxlinkResponse;
        const robloxId = String(data.robloxID ?? data.robloxId ?? data.roblox?.id ?? '');
        if (robloxId) info = await fetchRobloxUser(robloxId);
      }
    } catch {
      /* continue to nickname fallback */
    }
  }

  // If Bloxlink did not resolve a profile, try the nickname or display name as a Roblox username.
  if (!info.profileUrl && nicknameFallback) {
    const byName = await lookupRobloxByUsername(nicknameFallback);
    if (byName) info = byName;
  }

  return info;
}

export function relativeTimestamp(unixSeconds: number | null): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return 'Unknown';
  return `<t:${unixSeconds}:R>`;
}
