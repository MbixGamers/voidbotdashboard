const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

const DEFAULT_AUTH_GUILD_ID = '1351362266246680626';
const DEFAULT_AUTH_ROLE_ID = '1444524137526853723';
const ENV_AUTH_GUILD_ID = process.env.DASHBOARD_AUTH_GUILD_ID || process.env.DISCORD_GUILD_ID || null;
const ENV_AUTH_ROLE_IDS = process.env.DASHBOARD_AUTH_ROLE_IDS || process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID || null;
const MAIN_ADMIN_DISCORD_ID = '928635423465537579';

export const defaultDashboardSettings = {
  auth_guild_id: ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID,
  auth_role_id: ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID,
  admin_discord_ids: []
};

function requireEnv() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

function restUrl(table, query = '') {
  return `${supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

function authHeaders(key = serviceRoleKey) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`
  };
}

async function supabaseFetch(url, options = {}) {
  requireEnv();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || response.statusText);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

export async function selectRows(table, query) {
  return supabaseFetch(restUrl(table, query));
}

export async function upsertRows(table, rows, conflictColumn) {
  const query = conflictColumn ? `on_conflict=${encodeURIComponent(conflictColumn)}` : '';
  return supabaseFetch(restUrl(table, query), {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  });
}

export async function insertRows(table, rows) {
  return supabaseFetch(restUrl(table), {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(rows)
  });
}

export async function updateRows(table, query, patch) {
  return supabaseFetch(restUrl(table, query), {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
}

export async function verifySupabaseToken(accessToken) {
  if (!supabaseUrl || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    const error = new Error(data?.msg || data?.message || 'Invalid or expired authorization token');
    error.statusCode = 401;
    throw error;
  }
  return data;
}

export function getDiscordId(user) {
  return (
    user?.user_metadata?.provider_id ||
    user?.user_metadata?.sub ||
    user?.identities?.find((identity) => identity.provider === 'discord')?.identity_data?.id ||
    user?.identities?.find((identity) => identity.provider === 'discord')?.id ||
    null
  );
}

export function getDiscordUsername(user) {
  const metadata = user?.user_metadata || {};
  return metadata.full_name || metadata.name || metadata.user_name || metadata.preferred_username || metadata.global_name || 'Discord User';
}

export function getDiscordAvatar(user) {
  const metadata = user?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || null;
}

function normalizeDiscordIds(value) {
  if (Array.isArray(value)) return value.map((id) => String(id).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean);
  return [];
}

function normalizeRoleIds(value) {
  return normalizeDiscordIds(value);
}

function getConfiguredAuthGuildId(row = {}) {
  return row.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID;
}

export function getConfiguredAuthRoleIds(settings = {}) {
  const ids = normalizeRoleIds(settings.auth_role_ids || settings.auth_role_id || ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID);
  return ids.length ? ids : [DEFAULT_AUTH_ROLE_ID];
}

export function getConfiguredAdminDiscordIds(settings = null) {
  return normalizeDiscordIds(settings?.admin_discord_ids);
}

export function getAdminDiscordIds(settings = null) {
  return Array.from(new Set([
    MAIN_ADMIN_DISCORD_ID,
    ...(process.env.DASHBOARD_ADMIN_DISCORD_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    ...getConfiguredAdminDiscordIds(settings)
  ]));
}

export function isAdminDiscordId(discordId, settings = null) {
  return getAdminDiscordIds(settings).includes(String(discordId));
}

function normalizeDashboardSettings(row = {}) {
  const authRoleIds = getConfiguredAuthRoleIds(row);
  return {
    ...defaultDashboardSettings,
    ...row,
    auth_guild_id: getConfiguredAuthGuildId(row),
    auth_role_id: authRoleIds.join(','),
    auth_role_ids: authRoleIds,
    admin_discord_ids: normalizeDiscordIds(row.admin_discord_ids)
  };
}

export async function getDashboardSettings() {
  try {
    const rows = await selectRows('dashboard_settings', 'select=*&id=eq.global&limit=1');
    return normalizeDashboardSettings(rows[0] || {});
  } catch (error) {
    if (error.statusCode === 404 || /dashboard_settings|relation/i.test(error.message || '')) {
      const settings = normalizeDashboardSettings(defaultDashboardSettings);
      console.log('Dashboard settings not found in database, using defaults:', settings);
      return settings;
    }
    throw error;
  }
}

export async function saveDashboardSettings(settings) {
  const authRoleIds = normalizeRoleIds(settings.auth_role_id || settings.auth_role_ids);
  const rows = await upsertRows('dashboard_settings', [{
    id: 'global',
    auth_guild_id: String(settings.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID).trim(),
    auth_role_id: (authRoleIds.length ? authRoleIds : getConfiguredAuthRoleIds(defaultDashboardSettings)).join(','),
    admin_discord_ids: normalizeDiscordIds(settings.admin_discord_ids).filter((id) => id !== MAIN_ADMIN_DISCORD_ID),
    updated_by: settings.updated_by || null,
    updated_at: new Date().toISOString()
  }], 'id');
  return normalizeDashboardSettings(rows[0] || {});
}

function getDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null;
}

export async function fetchDiscordGuildMember(guildId, discordId) {
  const token = getDiscordBotToken();

  if (!token) {
    const error = new Error('Dashboard staff verification is not configured. Add DISCORD_BOT_TOKEN to the dashboard environment.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${token}` }
  });
  const member = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(member?.message || 'Could not verify Discord server membership');
    error.statusCode = response.status;
    throw error;
  }

  return member;
}

export async function fetchDiscordGuildMembers(guildId, options = {}) {
  const token = getDiscordBotToken();

  if (!token) {
    const error = new Error('Dashboard staff directory is not configured. Add DISCORD_BOT_TOKEN to the dashboard environment.');
    error.statusCode = 503;
    throw error;
  }

  const limit = Math.min(Math.max(Number(options.limit || 1000), 1), 1000);
  const maxPages = Math.max(Number(options.maxPages || 10), 1);
  const members = [];
  let after = '0';

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: String(limit), after });
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?${params.toString()}`, {
      headers: { Authorization: `Bot ${token}` }
    });
    const pageMembers = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(pageMembers?.message || 'Could not load Discord guild members');
      error.statusCode = response.status;
      throw error;
    }

    if (!Array.isArray(pageMembers) || !pageMembers.length) break;
    members.push(...pageMembers);

    const lastId = pageMembers[pageMembers.length - 1]?.user?.id;
    if (!lastId || pageMembers.length < limit) break;
    after = lastId;
  }

  return members;
}


export async function fetchDiscordCurrentUserGuildMember(guildId, discordId, discordAccessToken) {
  if (!discordAccessToken) return null;

  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${discordAccessToken}` }
  });
  const user = await userResponse.json().catch(() => null);

  if (!userResponse.ok || String(user?.id || '') !== String(discordId)) {
    const error = new Error('Discord OAuth token did not match the signed-in dashboard user. Please sign out and sign in again.');
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${discordAccessToken}` }
  });
  const member = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(member?.message || 'Could not verify Discord server membership from OAuth');
    error.statusCode = response.status;
    throw error;
  }

  return member;
}

export function getDiscordMemberDisplayName(member, fallback = 'Discord User') {
  return member?.nick || member?.user?.global_name || member?.user?.username || fallback;
}

export function getDiscordMemberAvatar(member) {
  const avatarHash = member?.user?.avatar;
  const userId = member?.user?.id;
  if (!avatarHash || !userId) return null;
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=128`;
}

function memberHasAnyConfiguredRole(member, roleIds) {
  return Array.isArray(member?.roles) && roleIds.some((roleId) => member.roles.includes(roleId));
}

export async function verifyDiscordStaffAccess(discordId, settings = defaultDashboardSettings, options = {}) {
  const guildId = settings?.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID;
  const roleIds = getConfiguredAuthRoleIds(settings);

  // Check if user is admin first - admins bypass Discord role verification.
  if (isAdminDiscordId(discordId, settings)) {
    return { guildId, roleIds, member: null, bypassed: true };
  }

  let member = null;
  let botVerificationError = null;
  let oauthVerificationError = null;

  try {
    member = await fetchDiscordGuildMember(guildId, discordId);
  } catch (error) {
    botVerificationError = error;
  }

  // Discord/Supabase provider tokens are only available immediately after Discord OAuth sign-in.
  // Use them as a second source of truth when the bot token is missing, stale, or returned a
  // member payload that does not include the current staff roles. This prevents a valid staff
  // member from being accepted once and then rejected on the next dashboard load because one
  // verification path had stale role data.
  if ((!member || !memberHasAnyConfiguredRole(member, roleIds)) && options.discordAccessToken) {
    try {
      const oauthMember = await fetchDiscordCurrentUserGuildMember(guildId, discordId, options.discordAccessToken);
      if (memberHasAnyConfiguredRole(oauthMember, roleIds) || !member) member = oauthMember;
    } catch (error) {
      oauthVerificationError = error;
      if (!member && (!botVerificationError || ![403, 404].includes(Number(botVerificationError.statusCode)))) throw error;
    }
  }

  if (!member) {
    if (botVerificationError && (botVerificationError.statusCode === 404 || botVerificationError.statusCode === 403)) {
      const authError = new Error('Invalid staff authorization: you are not in the configured Discord server or do not have one of the configured dashboard staff roles.');
      authError.statusCode = 403;
      throw authError;
    }
    throw botVerificationError || oauthVerificationError || new Error('Could not verify Discord staff authorization');
  }

  if (!Array.isArray(member?.roles)) {
    console.log(`Staff verification failed: member.roles is not an array. Received: ${JSON.stringify(member?.roles)}`);
    const error = new Error('Invalid staff authorization: Discord did not return role data for this member. Make sure the dashboard requests guilds.members.read and the bot token can read guild members.');
    error.statusCode = 403;
    throw error;
  }

  const hasRequiredRole = memberHasAnyConfiguredRole(member, roleIds);
  if (!hasRequiredRole) {
    console.log(`Staff verification failed. Guild: ${guildId}, user roles: ${JSON.stringify(member.roles)}, required roles: ${JSON.stringify(roleIds)}`);
    const error = new Error('Invalid staff authorization: you are not a staff member or do not have one of the configured dashboard staff roles.');
    error.statusCode = 403;
    throw error;
  }

  return { guildId, roleIds, member };
}

export async function requireUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    const error = new Error('Missing authorization token');
    error.statusCode = 401;
    throw error;
  }

  const user = await verifySupabaseToken(token);
  const discordId = getDiscordId(user);
  if (!discordId) {
    const error = new Error('Discord identity was not found on this Supabase user');
    error.statusCode = 403;
    throw error;
  }
  return { user, discordId };
}

export async function upsertProfile(profile) {
  const rows = await upsertRows('profiles', [{
    discord_id: profile.discord_id,
    username: profile.username || 'Discord User',
    avatar_url: profile.avatar_url || null,
    role: profile.role || 'staff',
    updated_at: new Date().toISOString()
  }], 'discord_id');
  return rows[0];
}

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function handleApiError(res, error) {
  console.error(error);
  sendJson(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
}
