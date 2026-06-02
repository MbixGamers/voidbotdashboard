import {
  fetchDiscordGuildMember,
  getDashboardSettings,
  getDiscordAvatar,
  getDiscordMemberAvatar,
  getDiscordMemberDisplayName,
  getDiscordUsername,
  handleApiError,
  isAdminDiscordId,
  requireUser,
  selectRows,
  sendJson,
  updateRows,
  upsertProfile,
  verifyDiscordStaffAccess
} from './_supabase.js';

async function refreshStaffNames(staffRows, settings) {
  if (!staffRows.length) return staffRows;

  return Promise.all(staffRows.map(async (row) => {
    try {
      const member = await fetchDiscordGuildMember(settings.auth_guild_id, row.discord_id);
      const username = getDiscordMemberDisplayName(member, row.username);
      const avatarUrl = getDiscordMemberAvatar(member) || row.avatar_url;

      if (username !== row.username || avatarUrl !== row.avatar_url) {
        await Promise.all([
          upsertProfile({
            discord_id: row.discord_id,
            username,
            avatar_url: avatarUrl,
            role: isAdminDiscordId(row.discord_id, settings) ? 'admin' : 'staff'
          }),
          updateRows('staff_stats', `discord_id=eq.${encodeURIComponent(row.discord_id)}`, {
            username,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
          })
        ]);
      }

      return { ...row, username, avatar_url: avatarUrl };
    } catch (error) {
      console.warn(`Could not refresh Discord name for ${row.discord_id}:`, error.message);
      return row;
    }
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user, discordId } = await requireUser(req);
    const settings = await getDashboardSettings();
    const access = await verifyDiscordStaffAccess(discordId, settings);
    const discordUsername = access.member ? getDiscordMemberDisplayName(access.member, getDiscordUsername(user)) : getDiscordUsername(user);
    const discordAvatar = access.member ? getDiscordMemberAvatar(access.member) || getDiscordAvatar(user) : getDiscordAvatar(user);

    const profile = await upsertProfile({
      discord_id: discordId,
      username: discordUsername,
      avatar_url: discordAvatar,
      role: isAdminDiscordId(discordId, settings) ? 'admin' : 'staff'
    });

    const isAdmin = profile.role === 'admin' || isAdminDiscordId(discordId, settings);

    const [modChecks, statsRows] = await Promise.all([
      selectRows('mod_checks', 'select=*&is_active=eq.true&order=created_at.desc&limit=1'),
      selectRows('staff_stats', `select=*&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`)
    ]);

    const transcriptFilter = isAdmin
      ? 'select=*&order=closed_at.desc&limit=25'
      : `select=*&or=(opener_id.eq.${discordId},claimed_by.eq.${discordId},closed_by.eq.${discordId})&order=closed_at.desc&limit=12`;
    const transcripts = await selectRows('ticket_transcripts', transcriptFilter);

    const staffRows = isAdmin
      ? await selectRows('staff_stats', 'select=discord_id,username,avatar_url,tickets_claimed_total,tickets_claimed_week,messages_total,messages_week,last_claimed_at&order=tickets_claimed_week.desc&limit=50')
      : [];
    const staff = isAdmin ? await refreshStaffNames(staffRows, settings) : [];

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
        auth_role_id: settings.auth_role_id,
        admin_discord_ids: settings.admin_discord_ids || []
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
}
