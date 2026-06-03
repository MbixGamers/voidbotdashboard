import {
  fetchDiscordGuildMember,
  getConfiguredAuthRoleIds,
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

function buildGuildFilter(settings) {
  const guildId = settings?.auth_guild_id;
  return guildId ? `guild_id=eq.${encodeURIComponent(guildId)}` : '';
}

function withGuildFilter(baseQuery, settings) {
  const guildFilter = buildGuildFilter(settings);
  return guildFilter ? `${baseQuery}&${guildFilter}` : baseQuery;
}

function hasRequiredDashboardRole(member, row, settings) {
  if (isAdminDiscordId(row.discord_id, settings)) return true;
  if (!Array.isArray(member?.roles)) return false;
  const roleIds = getConfiguredAuthRoleIds(settings);
  return roleIds.some((roleId) => member.roles.includes(roleId));
}

async function refreshStaffNames(staffRows, settings) {
  if (!staffRows.length) return staffRows;

  const refreshedRows = await Promise.all(staffRows.map(async (row) => {
    try {
      const member = await fetchDiscordGuildMember(settings.auth_guild_id, row.discord_id);
      if (!hasRequiredDashboardRole(member, row, settings)) return null;

      const username = getDiscordMemberDisplayName(member, row.username);
      const avatarUrl = getDiscordMemberAvatar(member) || row.avatar_url;

      if (username !== row.username || avatarUrl !== row.avatar_url || row.guild_id !== settings.auth_guild_id) {
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
            guild_id: settings.auth_guild_id,
            updated_at: new Date().toISOString()
          })
        ]);
      }

      return { ...row, username, avatar_url: avatarUrl, guild_id: settings.auth_guild_id };
    } catch (error) {
      console.warn(`Could not refresh Discord name for ${row.discord_id}:`, error.message);
      return null;
    }
  }));

  return refreshedRows.filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { user, discordId } = await requireUser(req);
    const settings = await getDashboardSettings();
    const access = await verifyDiscordStaffAccess(discordId, settings, {
      discordAccessToken: req.headers['x-discord-provider-token']
    });
    const discordUsername = access.member ? getDiscordMemberDisplayName(access.member, getDiscordUsername(user)) : getDiscordUsername(user);
    const discordAvatar = access.member ? getDiscordMemberAvatar(access.member) || getDiscordAvatar(user) : getDiscordAvatar(user);

    const profile = await upsertProfile({
      discord_id: discordId,
      username: discordUsername,
      avatar_url: discordAvatar,
      role: isAdminDiscordId(discordId, settings) ? 'admin' : 'staff'
    });

    const isAdmin = profile.role === 'admin' || isAdminDiscordId(discordId, settings);
    const guildFilter = buildGuildFilter(settings);

    const [modChecks, statsRows] = await Promise.all([
      selectRows('mod_checks', 'select=*&is_active=eq.true&order=created_at.desc&limit=1'),
      selectRows('staff_stats', withGuildFilter(`select=*&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`, settings))
    ]);

    const transcriptFilter = isAdmin
      ? withGuildFilter('select=*&order=closed_at.desc&limit=25', settings)
      : `${withGuildFilter(`select=*&or=(opener_id.eq.${discordId},claimed_by.eq.${discordId},closed_by.eq.${discordId})&order=closed_at.desc&limit=12`, settings)}`;
    const transcripts = await selectRows('ticket_transcripts', transcriptFilter);

    const staffRows = isAdmin
      ? await selectRows('staff_stats', `${guildFilter ? `${guildFilter}&` : ''}select=discord_id,username,avatar_url,guild_id,tickets_claimed_total,tickets_claimed_week,messages_total,messages_week,last_claimed_at&order=tickets_claimed_week.desc,messages_week.desc&limit=100`)
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
        guild_id: settings.auth_guild_id,
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
