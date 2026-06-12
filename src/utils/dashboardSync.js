const config = require('../config');

const DEFAULT_MAX_TRANSCRIPT_CHARS = 900000;
const DEFAULT_DASHBOARD_SYNC_TIMEOUT_MS = 10000;
const DEFAULT_DASHBOARD_SETTINGS_TTL_MS = 5 * 60 * 1000;

let dashboardSettingsCache = { timestamp: 0, settings: null };

function isDashboardSyncConfigured() {
  return Boolean(config.dashboardBaseUrl && config.dashboardApiKey);
}

async function requestDashboard(path = '/api/bot/sync', options = {}) {
  if (!isDashboardSyncConfigured()) return null;

  const endpoint = `${config.dashboardBaseUrl.replace(/\/$/, '')}${path}`;
  const timeoutMs = Number(process.env.DASHBOARD_SYNC_TIMEOUT_MS || DEFAULT_DASHBOARD_SYNC_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'x-bot-api-key': config.dashboardApiKey,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`⚠️ Dashboard request failed for ${path}: ${response.status} ${body}`);
      return null;
    }

    return response.json().catch(() => null);
  } catch (error) {
    console.warn(`⚠️ Dashboard request error for ${path}:`, error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function postDashboardEvent(event, payload) {
  return requestDashboard('/api/bot/sync', {
    method: 'POST',
    body: JSON.stringify({ event, payload })
  });
}


function normalizeRoleIds(value) {
  const ids = Array.isArray(value) ? value : String(value || '').split(/[,\n]+/);
  return Array.from(new Set(ids.map(id => String(id).trim()).filter(Boolean)));
}

async function fetchDashboardSettings({ force = false } = {}) {
  const now = Date.now();
  const ttlMs = Number(process.env.DASHBOARD_SETTINGS_TTL_MS || DEFAULT_DASHBOARD_SETTINGS_TTL_MS);
  if (!force && dashboardSettingsCache.settings && now - dashboardSettingsCache.timestamp < ttlMs) {
    return dashboardSettingsCache.settings;
  }

  const data = await requestDashboard('/api/bot/sync?resource=settings', { method: 'GET' });
  const settings = data?.settings;
  if (!settings) return dashboardSettingsCache.settings;

  dashboardSettingsCache = {
    timestamp: now,
    settings: {
      ...settings,
      auth_role_ids: normalizeRoleIds(settings.auth_role_ids || settings.auth_role_id),
      tracked_role_ids: normalizeRoleIds(settings.tracked_role_ids || settings.auth_role_ids || settings.auth_role_id)
    }
  };
  return dashboardSettingsCache.settings;
}

function getCachedDashboardSettings() {
  return dashboardSettingsCache.settings;
}

function userPayload(user) {
  if (!user) return {};
  return {
    discord_id: user.id,
    username: user.tag || user.globalName || user.displayName || user.username || 'Discord User',
    avatar_url: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : null
  };
}

async function syncTicketClaim(user, context = {}) {
  return postDashboardEvent('staff_stat', {
    ...userPayload(user),
    guild_id: context.guild_id || context.guildId || context.guild?.id || null,
    ticket_channel_id: context.ticket_channel_id || context.channel_id || context.channelId || null,
    tickets_claimed_increment: 1,
    messages_increment: 0,
    last_claimed_at: new Date().toISOString()
  });
}

async function syncStaffMessage(user, message = null) {
  return postDashboardEvent('staff_stat', {
    ...userPayload(user),
    tickets_claimed_increment: 0,
    messages_increment: 1,
    message_id: message?.id || null,
    channel_id: message?.channelId || message?.channel?.id || null,
    guild_id: message?.guildId || message?.guild?.id || null,
    message_created_at: message?.createdAt?.toISOString?.() || new Date().toISOString()
  });
}


async function syncStaffSnapshot(user, stats = {}) {
  return postDashboardEvent('staff_stat', {
    ...userPayload(user),
    discord_id: user?.id || stats.discord_id,
    username: user?.tag || user?.globalName || user?.displayName || user?.username || stats.username || 'Discord User',
    avatar_url: typeof user?.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : stats.avatar_url || null,
    tickets_claimed_increment: 0,
    messages_increment: 0,
    tickets_claimed_total: Number(stats.tickets_claimed_total || 0),
    tickets_claimed_week: Number(stats.tickets_claimed_week || 0),
    messages_total: Number(stats.messages_total || 0),
    messages_week: Number(stats.messages_week || 0),
    last_claimed_at: stats.last_claimed_at || null,
    guild_id: stats.guild_id || stats.guildId || null
  });
}

async function syncTicketTranscript(payload) {
  const maxTranscriptChars = Number(process.env.DASHBOARD_MAX_TRANSCRIPT_CHARS || DEFAULT_MAX_TRANSCRIPT_CHARS);
  const transcriptText = String(payload?.transcript_text || '');
  const shouldTrimTranscript = maxTranscriptChars > 0 && transcriptText.length > maxTranscriptChars;

  return postDashboardEvent('ticket_transcript', {
    ...payload,
    transcript_text: shouldTrimTranscript
      ? `${transcriptText.slice(0, maxTranscriptChars)}\n\n[Transcript trimmed before dashboard sync: ${transcriptText.length - maxTranscriptChars} additional characters are available in the Discord transcript attachment.]`
      : transcriptText,
    metadata: {
      ...(payload?.metadata || {}),
      transcript_trimmed_for_dashboard: shouldTrimTranscript,
      original_transcript_characters: transcriptText.length
    }
  });
}

module.exports = {
  isDashboardSyncConfigured,
  fetchDashboardSettings,
  getCachedDashboardSettings,
  syncStaffMessage,
  syncStaffSnapshot,
  syncTicketClaim,
  syncTicketTranscript,
  userPayload
};
