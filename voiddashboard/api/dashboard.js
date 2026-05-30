import {
  getDashboardSettings,
  getDiscordAvatar,
  getDiscordUsername,
  handleApiError,
  isAdminDiscordId,
  requireUser,
  selectRows,
  sendJson,
  upsertProfile,
  verifyDiscordStaffAccess
} from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user, discordId } = await requireUser(req);
    const settings = await getDashboardSettings();
    await verifyDiscordStaffAccess(discordId, settings);

    const profile = await upsertProfile({
      discord_id: discordId,
      username: getDiscordUsername(user),
      avatar_url: getDiscordAvatar(user),
      role: isAdminDiscordId(discordId) ? 'admin' : 'staff'
    });

    const isAdmin = profile.role === 'admin' || isAdminDiscordId(discordId);

    const [modChecks, statsRows] = await Promise.all([
      selectRows('mod_checks', 'select=*&is_active=eq.true&order=created_at.desc&limit=1'),
      selectRows('staff_stats', `select=*&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`)
    ]);

    const transcriptFilter = isAdmin
      ? 'select=*&order=closed_at.desc&limit=25'
      : `select=*&or=(opener_id.eq.${discordId},claimed_by.eq.${discordId},closed_by.eq.${discordId})&order=closed_at.desc&limit=12`;
    const transcripts = await selectRows('ticket_transcripts', transcriptFilter);

    const staff = isAdmin
      ? await selectRows('staff_stats', 'select=discord_id,username,tickets_claimed_total,tickets_claimed_week,messages_total,messages_week,last_claimed_at&order=tickets_claimed_week.desc&limit=50')
      : [];

    return sendJson(res, 200, {
      profile,
      isAdmin,
      modCheck: modChecks[0] || {
        weekly_ticket_goal: 0,
        message_goal: 0,
        active_from: null,
        active_to: null
      },
      stats: statsRows[0] || {
        discord_id: discordId,
        username: profile.username,
        tickets_claimed_total: 0,
        tickets_claimed_week: 0,
        messages_total: 0,
        messages_week: 0,
        last_claimed_at: null
      },
      staff,
      transcripts,
      settings: {
        auth_guild_id: settings.auth_guild_id,
        auth_role_id: settings.auth_role_id
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
