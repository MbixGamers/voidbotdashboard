const config = require('../config');

function isDashboardSyncConfigured() {
  return Boolean(config.dashboardBaseUrl && config.dashboardApiKey);
}

async function postDashboardEvent(event, payload) {
  if (!isDashboardSyncConfigured()) return null;

  const endpoint = `${config.dashboardBaseUrl.replace(/\/$/, '')}/api/bot/sync`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-api-key': config.dashboardApiKey
      },
      body: JSON.stringify({ event, payload })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`⚠️ Dashboard sync failed for ${event}: ${response.status} ${body}`);
      return null;
    }

    return response.json().catch(() => null);
  } catch (error) {
    console.warn(`⚠️ Dashboard sync error for ${event}:`, error.message);
    return null;
  }
}

function userPayload(user) {
  if (!user) return {};
  return {
    discord_id: user.id,
    username: user.tag || user.username || 'Discord User',
    avatar_url: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : null
  };
}

async function syncTicketClaim(user) {
  return postDashboardEvent('staff_stat', {
    ...userPayload(user),
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
    username: user?.tag || user?.username || stats.username || 'Discord User',
    avatar_url: typeof user?.displayAvatarURL === 'function' ? user.displayAvatarURL({ size: 128 }) : stats.avatar_url || null,
    tickets_claimed_increment: 0,
    messages_increment: 0,
    tickets_claimed_total: Number(stats.tickets_claimed_total || 0),
    tickets_claimed_week: Number(stats.tickets_claimed_week || 0),
    messages_total: Number(stats.messages_total || 0),
    messages_week: Number(stats.messages_week || 0),
    last_claimed_at: stats.last_claimed_at || null
  });
}

async function syncTicketTranscript(payload) {
  return postDashboardEvent('ticket_transcript', payload);
}

module.exports = {
  isDashboardSyncConfigured,
  syncStaffMessage,
  syncStaffSnapshot,
  syncTicketClaim,
  syncTicketTranscript,
  userPayload
};
