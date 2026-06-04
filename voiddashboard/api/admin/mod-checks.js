import {
  getDashboardSettings,
  handleApiError,
  insertRows,
  isAdminDiscordId,
  requireUser,
  saveDashboardSettings,
  sendJson,
  updateRows,
  verifyDiscordStaffAccess
} from '../_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { discordId } = await requireUser(req);
    const currentSettings = await getDashboardSettings();
    await verifyDiscordStaffAccess(discordId, currentSettings, {
      discordAccessToken: req.headers['x-discord-provider-token']
    });

    if (!isAdminDiscordId(discordId, currentSettings)) {
      return sendJson(res, 403, { error: 'Only dashboard admins can update mod-check requirements' });
    }

    const weeklyTicketGoal = Math.max(0, Number(req.body?.weekly_ticket_goal || 0));
    const messageGoal = Math.max(0, Number(req.body?.message_goal || 0));
    const requestedAuthGuildId = req.body?.auth_guild_id !== undefined ? req.body.auth_guild_id : currentSettings.auth_guild_id;
    const requestedAuthRoleId = req.body?.auth_role_id !== undefined ? req.body.auth_role_id : currentSettings.auth_role_id;
    const authGuildId = String(requestedAuthGuildId || '').trim();
    const authRoleId = String(requestedAuthRoleId || '').trim();
    const adminDiscordIds = Array.isArray(req.body?.admin_discord_ids)
      ? req.body.admin_discord_ids
      : String(req.body?.admin_discord_ids || '')
        .split(/[\n,]+/)
        .map((id) => id.trim())
        .filter(Boolean);
    const now = new Date().toISOString();

    if (!authGuildId) return sendJson(res, 400, { error: 'Discord server ID is required.' });
    if (!authRoleId) return sendJson(res, 400, { error: 'At least one staff role ID is required.' });

    const settings = await saveDashboardSettings({
      auth_guild_id: authGuildId,
      auth_role_id: authRoleId,
      admin_discord_ids: adminDiscordIds,
      updated_by: discordId
    });

    await updateRows('mod_checks', 'is_active=eq.true', { is_active: false, active_to: now });
    const rows = await insertRows('mod_checks', [{
      weekly_ticket_goal: weeklyTicketGoal,
      message_goal: messageGoal,
      is_active: true,
      created_by: discordId,
      active_from: now
    }]);

    return sendJson(res, 200, { modCheck: rows[0], settings });
  } catch (error) {
    return handleApiError(res, error);
  }
}
