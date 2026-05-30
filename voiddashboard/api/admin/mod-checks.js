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
    await verifyDiscordStaffAccess(discordId, currentSettings);

    if (!isAdminDiscordId(discordId)) {
      return sendJson(res, 403, { error: 'Only dashboard admins can update mod-check requirements' });
    }

    const weeklyTicketGoal = Math.max(0, Number(req.body?.weekly_ticket_goal || 0));
    const messageGoal = Math.max(0, Number(req.body?.message_goal || 0));
    const authGuildId = String(req.body?.auth_guild_id || currentSettings.auth_guild_id || '').trim();
    const authRoleId = String(req.body?.auth_role_id || currentSettings.auth_role_id || '').trim();
    const now = new Date().toISOString();

    const settings = await saveDashboardSettings({
      auth_guild_id: authGuildId,
      auth_role_id: authRoleId,
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
