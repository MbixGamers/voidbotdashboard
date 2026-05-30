const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

const DEFAULT_AUTH_GUILD_ID = '1351362266246680626';
const DEFAULT_AUTH_ROLE_ID = '1444524137526853723';
const MAIN_ADMIN_DISCORD_ID = '928635423465537579';

export const defaultDashboardSettings = {
  auth_guild_id: DEFAULT_AUTH_GUILD_ID,
  auth_role_id: DEFAULT_AUTH_ROLE_ID,
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
  return getAdminDiscordIds(settings).includes(discordId);
}

export async function getDashboardSettings() {
  try {
    const rows = await selectRows('dashboard_settings', 'select=*&id=eq.global&limit=1');
    const row = rows[0] || {};
    return {
      ...defaultDashboardSettings,
      ...row,
      admin_discord_ids: normalizeDiscordIds(row.admin_discord_ids)
    };
  } catch (error) {
    if (error.statusCode === 404 || /dashboard_settings|relation/i.test(error.message || '')) {
      return defaultDashboardSettings;
    }
    throw error;
  }
}

export async function saveDashboardSettings(settings) {
  const rows = await upsertRows('dashboard_settings', [{
    id: 'global',
    auth_guild_id: settings.auth_guild_id || defaultDashboardSettings.auth_guild_id,
    auth_role_id: settings.auth_role_id || defaultDashboardSettings.auth_role_id,
    admin_discord_ids: normalizeDiscordIds(settings.admin_discord_ids).filter((id) => id !== MAIN_ADMIN_DISCORD_ID),
    updated_by: settings.updated_by || null,
    updated_at: new Date().toISOString()
  }], 'id');
  return rows[0];
}

function getDiscordBotToken() {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null;
}

export async function verifyDiscordStaffAccess(discordId, settings = defaultDashboardSettings) {
  const guildId = settings.auth_guild_id || defaultDashboardSettings.auth_guild_id;
  const roleId = settings.auth_role_id || defaultDashboardSettings.auth_role_id;

  if (isAdminDiscordId(discordId, settings)) {
    return { guildId, roleId, member: null, bypassed: true };
  }

  const token = getDiscordBotToken();

  if (!token) {
    const error = new Error('Dashboard staff verification is not configured. Add DISCORD_BOT_TOKEN to the dashboard environment.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
    headers: { Authorization: `Bot ${token}` }
  });

  if (response.status === 404 || response.status === 403) {
    const error = new Error('Invalid staff authorization: you are not a Void staff member or do not have the required authority.');
    error.statusCode = 403;
    throw error;
  }

  const member = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(member?.message || 'Could not verify Discord server membership');
    error.statusCode = response.status;
    throw error;
  }

  if (!Array.isArray(member?.roles) || !member.roles.includes(roleId)) {
    const error = new Error('Invalid staff authorization: you are not a staff member or do not have the required authority.');
    error.statusCode = 403;
    throw error;
  }

  return { guildId, roleId, member };
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
