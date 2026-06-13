import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isServerlessReadOnlyRuntime = Boolean(process.env.VERCEL) || __dirname.startsWith('/var/task');
const DEFAULT_STORE_DIR = isServerlessReadOnlyRuntime ? path.join('/tmp', 'voiddashboard-data') : path.join(__dirname, '..', 'data');
const STORE_DIR = process.env.DASHBOARD_JSON_DIR || DEFAULT_STORE_DIR;
const STORE_FILE = process.env.DASHBOARD_JSON_FILE || path.join(STORE_DIR, 'dashboard-store.json');
const anonKey = process.env.SUPABASE_ANON_KEY;

const DEFAULT_AUTH_GUILD_ID = '1454879351605690522';
const DEFAULT_AUTH_ROLE_ID = '1454916770912534706,1478605157523787916,1478604846708822087,1458995834984206560';
const ENV_AUTH_GUILD_ID = process.env.DASHBOARD_AUTH_GUILD_ID || process.env.DISCORD_GUILD_ID || null;
const ENV_AUTH_ROLE_IDS = process.env.DASHBOARD_AUTH_ROLE_IDS || process.env.DASHBOARD_AUTH_ROLE_ID || process.env.DASHBOARD_STAFF_ROLE_ID || null;
const MAIN_ADMIN_DISCORD_ID = '928635423465537579';

export const defaultDashboardSettings = {
  id: 'global',
  auth_guild_id: ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID,
  auth_role_id: ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID,
  auth_role_ids: normalizeDiscordIds(ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID),
  tracked_role_ids: normalizeDiscordIds(ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID),
  admin_discord_ids: []
};

const DEFAULT_STORE = {
  dashboard_settings: [defaultDashboardSettings],
  mod_checks: [],
  profiles: [],
  staff_stats: [],
  ticket_transcripts: [],
  dashboard_message_events: []
};

let writeQueue = Promise.resolve();

async function ensureStoreDirectory() {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
  } catch (error) {
    const message = `Dashboard JSON storage directory is not writable: ${STORE_DIR}. `
      + 'Set Supabase environment variables for persistent storage, or set DASHBOARD_JSON_DIR to a writable path such as /tmp/voiddashboard-data.';
    error.message = `${message} Original error: ${error.message}`;
    throw error;
  }
}

async function createDefaultStoreFile() {
  await ensureStoreDirectory();
  await fs.writeFile(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
}

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await createDefaultStoreFile();
    return structuredClone(DEFAULT_STORE);
  }
}

async function writeStore(store) {
  await ensureStoreDirectory();
  writeQueue = writeQueue.then(() => fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf8'));
  await writeQueue;
}

function decodeValue(value = '') { return decodeURIComponent(String(value)).replace(/^"|"$/g, ''); }
function matches(row, key, opValue) {
  const [op, ...rest] = String(opValue).split('.');
  const value = decodeValue(rest.join('.'));
  if (op === 'eq') return String(row[key] ?? '') === value;
  return true;
}
function applyQuery(rows, query = '') {
  const params = new URLSearchParams(query || '');
  let result = [...rows];
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    if (key === 'or') {
      const clauses = String(value).replace(/^\(|\)$/g, '').split(',');
      result = result.filter((row) => clauses.some((clause) => {
        const [field, op, ...rest] = clause.split('.');
        return matches(row, field, `${op}.${rest.join('.')}`);
      }));
      continue;
    }
    result = result.filter((row) => matches(row, key, value));
  }
  const order = params.get('order');
  if (order) {
    const specs = order.split(',').map((item) => {
      const [field, direction] = item.split('.');
      return { field, desc: direction === 'desc' };
    });
    result.sort((a, b) => {
      for (const spec of specs) {
        const av = a[spec.field] ?? ''; const bv = b[spec.field] ?? '';
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        if (cmp) return spec.desc ? -cmp : cmp;
      }
      return 0;
    });
  }
  const limit = Number(params.get('limit') || 0);
  return limit > 0 ? result.slice(0, limit) : result;
}

export async function selectRows(table, query) {
  const store = await readStore();
  return applyQuery(store[table] || [], query);
}
export async function upsertRows(table, rows, conflictColumn) {
  const store = await readStore();
  store[table] = store[table] || [];
  const saved = [];
  for (const row of rows) {
    const record = { ...row };
    if (!record.id && !conflictColumn) record.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = conflictColumn || 'id';
    const idx = store[table].findIndex((item) => String(item[key]) === String(record[key]));
    if (idx >= 0) store[table][idx] = { ...store[table][idx], ...record };
    else store[table].push(record);
    saved.push(idx >= 0 ? store[table][idx] : record);
  }
  await writeStore(store);
  return saved;
}
export async function insertRows(table, rows) {
  const withIds = rows.map((row) => ({ id: row.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`, created_at: row.created_at || new Date().toISOString(), ...row }));
  const store = await readStore(); store[table] = store[table] || [];
  if (table === 'dashboard_message_events') {
    for (const row of withIds) if (store[table].some((item) => item.message_id && item.message_id === row.message_id)) { const e = new Error('duplicate key'); e.statusCode = 409; throw e; }
  }
  store[table].push(...withIds); await writeStore(store); return withIds;
}
export async function updateRows(table, query, patch) {
  const store = await readStore(); store[table] = store[table] || [];
  const matched = applyQuery(store[table], query);
  const ids = new Set(matched.map((row) => row.id || row.discord_id || row.ticket_channel_id));
  store[table] = store[table].map((row) => ids.has(row.id || row.discord_id || row.ticket_channel_id) ? { ...row, ...patch } : row);
  await writeStore(store); return store[table].filter((row) => ids.has(row.id || row.discord_id || row.ticket_channel_id));
}

export async function verifySupabaseToken(accessToken) {
  if (!accessToken) { const e = new Error('Missing authorization token'); e.statusCode = 401; throw e; }
  if (process.env.DASHBOARD_DEV_AUTH === 'true') return { id: accessToken, user_metadata: { provider_id: accessToken, user_name: `Discord ${accessToken}` } };
  if (!anonKey) { const e = new Error('Dashboard auth is not configured. Set SUPABASE_ANON_KEY or DASHBOARD_DEV_AUTH=true.'); e.statusCode = 503; throw e; }
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) { const e = new Error(data?.msg || data?.message || 'Invalid or expired authorization token'); e.statusCode = 401; throw e; }
  return data;
}
export function getDiscordId(user) { return user?.user_metadata?.provider_id || user?.user_metadata?.sub || user?.identities?.find((i) => i.provider === 'discord')?.identity_data?.id || user?.identities?.find((i) => i.provider === 'discord')?.id || null; }
export function getDiscordUsername(user) { const m = user?.user_metadata || {}; return m.full_name || m.name || m.user_name || m.preferred_username || m.global_name || 'Discord User'; }
export function getDiscordAvatar(user) { const m = user?.user_metadata || {}; return m.avatar_url || m.picture || null; }
function normalizeDiscordIds(value) { if (Array.isArray(value)) return value.map((id) => String(id).trim()).filter(Boolean); if (typeof value === 'string') return value.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean); return []; }
const normalizeRoleIds = normalizeDiscordIds;
function getConfiguredAuthGuildId(row = {}) { return row.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID; }
export function getConfiguredAuthRoleIds(settings = {}) { const ids = normalizeRoleIds(settings.auth_role_ids || settings.auth_role_id || ENV_AUTH_ROLE_IDS || DEFAULT_AUTH_ROLE_ID); return ids.length ? ids : normalizeRoleIds(DEFAULT_AUTH_ROLE_ID); }
export function getConfiguredAdminDiscordIds(settings = null) { return normalizeDiscordIds(settings?.admin_discord_ids); }
export function getAdminDiscordIds(settings = null) { return Array.from(new Set([MAIN_ADMIN_DISCORD_ID, ...(process.env.DASHBOARD_ADMIN_DISCORD_IDS || '').split(',').map((id) => id.trim()).filter(Boolean), ...getConfiguredAdminDiscordIds(settings)])); }
export function isAdminDiscordId(discordId, settings = null) { return getAdminDiscordIds(settings).includes(String(discordId)); }
function normalizeDashboardSettings(row = {}) { const authRoleIds = getConfiguredAuthRoleIds(row); const trackedRoleIds = normalizeRoleIds(row.tracked_role_ids || row.tracked_role_id || row.auth_role_ids || row.auth_role_id); return { ...defaultDashboardSettings, ...row, auth_guild_id: getConfiguredAuthGuildId(row), auth_role_id: authRoleIds.join(','), auth_role_ids: authRoleIds, tracked_role_ids: trackedRoleIds.length ? trackedRoleIds : authRoleIds, admin_discord_ids: normalizeDiscordIds(row.admin_discord_ids) }; }
export async function getDashboardSettings() { const rows = await selectRows('dashboard_settings', 'id=eq.global&limit=1'); return normalizeDashboardSettings(rows[0] || defaultDashboardSettings); }
export async function saveDashboardSettings(settings) { const authRoleIds = normalizeRoleIds(settings.auth_role_id || settings.auth_role_ids); const trackedRoleIds = normalizeRoleIds(settings.tracked_role_ids || settings.tracked_role_id || settings.auth_role_id || settings.auth_role_ids); const rows = await upsertRows('dashboard_settings', [{ id: 'global', auth_guild_id: String(settings.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID).trim(), auth_role_id: (authRoleIds.length ? authRoleIds : getConfiguredAuthRoleIds(defaultDashboardSettings)).join(','), auth_role_ids: authRoleIds.length ? authRoleIds : getConfiguredAuthRoleIds(defaultDashboardSettings), tracked_role_ids: trackedRoleIds.length ? trackedRoleIds : (authRoleIds.length ? authRoleIds : getConfiguredAuthRoleIds(defaultDashboardSettings)), admin_discord_ids: normalizeDiscordIds(settings.admin_discord_ids).filter((id) => id !== MAIN_ADMIN_DISCORD_ID), updated_by: settings.updated_by || null, updated_at: new Date().toISOString() }], 'id'); return normalizeDashboardSettings(rows[0] || {}); }
function getDiscordBotToken() { return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null; }
export async function fetchDiscordGuildMember(guildId, discordId) { const token = getDiscordBotToken(); if (!token) { const e = new Error('Dashboard staff verification is not configured. Add DISCORD_BOT_TOKEN to the dashboard environment.'); e.statusCode = 503; throw e; } const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${token}` } }); const m = await r.json().catch(() => null); if (!r.ok) { const e = new Error(m?.message || 'Could not verify Discord server membership'); e.statusCode = r.status; throw e; } return m; }
export async function fetchDiscordGuildMembers(guildId, options = {}) { const token = getDiscordBotToken(); if (!token) { const e = new Error('Dashboard staff directory is not configured. Add DISCORD_BOT_TOKEN to the dashboard environment.'); e.statusCode = 503; throw e; } const limit = Math.min(Math.max(Number(options.limit || 1000), 1), 1000); const maxPages = Math.max(Number(options.maxPages || 10), 1); const members = []; let after = '0'; for (let page = 0; page < maxPages; page += 1) { const params = new URLSearchParams({ limit: String(limit), after }); const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members?${params}`, { headers: { Authorization: `Bot ${token}` } }); const p = await r.json().catch(() => null); if (!r.ok) { const e = new Error(p?.message || 'Could not load Discord guild members'); e.statusCode = r.status; throw e; } if (!Array.isArray(p) || !p.length) break; members.push(...p); const lastId = p[p.length - 1]?.user?.id; if (!lastId || p.length < limit) break; after = lastId; } return members; }
export async function fetchDiscordCurrentUserGuildMember(guildId, discordId, discordAccessToken) { if (!discordAccessToken) return null; const userResponse = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${discordAccessToken}` } }); const user = await userResponse.json().catch(() => null); if (!userResponse.ok || String(user?.id || '') !== String(discordId)) { const e = new Error('Discord OAuth token did not match the signed-in dashboard user. Please sign out and sign in again.'); e.statusCode = 401; throw e; } const response = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, { headers: { Authorization: `Bearer ${discordAccessToken}` } }); const member = await response.json().catch(() => null); if (!response.ok) { const e = new Error(member?.message || 'Could not verify Discord server membership from OAuth'); e.statusCode = response.status; throw e; } return member; }
export function getDiscordMemberDisplayName(member, fallback = 'Discord User') { return member?.nick || member?.user?.global_name || member?.user?.username || fallback; }
export function getDiscordMemberAvatar(member) { const h = member?.user?.avatar; const id = member?.user?.id; if (!h || !id) return null; return `https://cdn.discordapp.com/avatars/${id}/${h}.${h.startsWith('a_') ? 'gif' : 'png'}?size=128`; }
function memberHasAnyConfiguredRole(member, roleIds) { return Array.isArray(member?.roles) && roleIds.some((roleId) => member.roles.includes(roleId)); }
export async function verifyDiscordStaffAccess(discordId, settings = defaultDashboardSettings, options = {}) { const guildId = settings?.auth_guild_id || ENV_AUTH_GUILD_ID || DEFAULT_AUTH_GUILD_ID; const roleIds = Array.from(new Set([...getConfiguredAuthRoleIds(settings), ...normalizeRoleIds(settings.tracked_role_ids)])); if (isAdminDiscordId(discordId, settings)) return { guildId, roleIds, member: null, bypassed: true }; let member = null; let err = null; try { member = await fetchDiscordGuildMember(guildId, discordId); } catch (e) { err = e; } if ((!member || !memberHasAnyConfiguredRole(member, roleIds)) && options.discordAccessToken) member = await fetchDiscordCurrentUserGuildMember(guildId, discordId, options.discordAccessToken).catch(() => member); if (!member) throw err || new Error('Could not verify Discord staff authorization'); if (!memberHasAnyConfiguredRole(member, roleIds)) { const e = new Error('Invalid staff authorization: you are not a staff member or do not have one of the configured dashboard staff roles.'); e.statusCode = 403; throw e; } return { guildId, roleIds, member }; }
export async function requireUser(req) { const header = req.headers.authorization || ''; const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null; if (!token) { const e = new Error('Missing authorization token'); e.statusCode = 401; throw e; } const user = await verifySupabaseToken(token); const discordId = getDiscordId(user); if (!discordId) { const e = new Error('Discord identity was not found on this user'); e.statusCode = 403; throw e; } return { user, discordId }; }
export async function upsertProfile(profile) { const rows = await upsertRows('profiles', [{ discord_id: profile.discord_id, username: profile.username || 'Discord User', avatar_url: profile.avatar_url || null, role: profile.role || 'staff', updated_at: new Date().toISOString() }], 'discord_id'); return rows[0]; }
export function sendJson(res, status, payload) { res.status(status).json(payload); }
export function handleApiError(res, error) { console.error(error); sendJson(res, error.statusCode || 500, { error: error.message || 'Internal server error' }); }
