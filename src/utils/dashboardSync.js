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

async function syncStaffMessage(user) {
  return postDashboardEvent('staff_stat', {
    ...userPayload(user),
    tickets_claimed_increment: 0,
    messages_increment: 1
  });
}

async function syncTicketTranscript(payload) {
  return postDashboardEvent('ticket_transcript', payload);
}

module.exports = {
  isDashboardSyncConfigured,
  syncStaffMessage,
  syncTicketClaim,
  syncTicketTranscript,
  userPayload
};
