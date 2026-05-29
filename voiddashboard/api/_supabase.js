const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

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

export function getAdminDiscordIds() {
  return (process.env.DASHBOARD_ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdminDiscordId(discordId) {
  return getAdminDiscordIds().includes(discordId);
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
