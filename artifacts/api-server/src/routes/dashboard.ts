import { Router } from "express";
import {
  fetchDiscordGuildMember,
  fetchDiscordGuildMembers,
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
  verifyDiscordStaffAccess,
  insertRows,
  saveDashboardSettings,
  upsertRows,
} from "../lib/dashboardStore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const router = Router();

function buildGuildFilter(settings: AnyRecord) {
  const guildId = settings?.auth_guild_id;
  return guildId ? `guild_id=eq.${encodeURIComponent(guildId)}` : "";
}

function withGuildFilter(baseQuery: string, settings: AnyRecord) {
  const guildFilter = buildGuildFilter(settings);
  return guildFilter ? `${baseQuery}&${guildFilter}` : baseQuery;
}

function isCurrentGuildStat(row: AnyRecord, settings: AnyRecord) {
  return (
    !settings?.auth_guild_id || !row.guild_id || row.guild_id === settings.auth_guild_id
  );
}

function hasRequiredDashboardRole(
  member: AnyRecord,
  row: AnyRecord,
  settings: AnyRecord,
) {
  if (isAdminDiscordId(row.discord_id, settings)) return true;
  if (!Array.isArray(member?.roles)) return false;
  const roleIds = getConfiguredAuthRoleIds(settings);
  return roleIds.some((roleId: string) => member.roles.includes(roleId));
}

async function refreshStaffNames(
  staffRows: AnyRecord[],
  settings: AnyRecord,
): Promise<AnyRecord[]> {
  if (!staffRows.length) return staffRows;

  const refreshedRows = await Promise.all(
    staffRows.map(async (row) => {
      if (row.verified_staff) {
        const { verified_staff: _vs, ...staffRow } = row;
        return staffRow;
      }
      try {
        const member = await fetchDiscordGuildMember(settings.auth_guild_id, row.discord_id);
        if (!hasRequiredDashboardRole(member, row, settings))
          return isAdminDiscordId(row.discord_id, settings) ? row : null;
        const username = getDiscordMemberDisplayName(member, row.username);
        const avatarUrl = getDiscordMemberAvatar(member) || row.avatar_url;
        if (
          username !== row.username ||
          avatarUrl !== row.avatar_url ||
          row.guild_id !== settings.auth_guild_id
        ) {
          await Promise.all([
            upsertProfile({
              discord_id: row.discord_id,
              username,
              avatar_url: avatarUrl,
              role: isAdminDiscordId(row.discord_id, settings) ? "admin" : "staff",
            }),
            updateRows(
              "staff_stats",
              `discord_id=eq.${encodeURIComponent(row.discord_id)}`,
              {
                username,
                avatar_url: avatarUrl,
                guild_id: settings.auth_guild_id,
                updated_at: new Date().toISOString(),
              },
            ),
          ]);
        }
        return { ...row, username, avatar_url: avatarUrl, guild_id: settings.auth_guild_id };
      } catch (error: unknown) {
        console.warn(`Could not refresh Discord name for ${row.discord_id}:`, (error as Error).message);
        return row;
      }
    }),
  );
  return refreshedRows.filter(Boolean) as AnyRecord[];
}

async function fetchStaffDirectory(settings: AnyRecord): Promise<AnyRecord[]> {
  if (!settings?.auth_guild_id) return [];
  try {
    const roleIds = getConfiguredAuthRoleIds(settings);
    const members = await fetchDiscordGuildMembers(settings.auth_guild_id);
    return members
      .filter(
        (member) =>
          Array.isArray(member?.roles) &&
          roleIds.some((roleId: string) => member.roles.includes(roleId)),
      )
      .map((member) => ({
        discord_id: member.user.id,
        username: getDiscordMemberDisplayName(
          member,
          member.user.username || "Discord User",
        ),
        avatar_url: getDiscordMemberAvatar(member),
        guild_id: settings.auth_guild_id,
        tickets_claimed_total: 0,
        tickets_claimed_week: 0,
        messages_total: 0,
        messages_week: 0,
        last_claimed_at: null,
        verified_staff: true,
      }));
  } catch (error: unknown) {
    console.warn("Could not load Discord staff directory for leaderboard:", (error as Error).message);
    return [];
  }
}

function mergeStaffRows(
  statsRows: AnyRecord[],
  directoryRows: AnyRecord[],
  settings: AnyRecord,
): AnyRecord[] {
  const staffById = new Map<string, AnyRecord>();
  for (const row of directoryRows) staffById.set(row.discord_id, row);
  for (const row of statsRows.filter((stat) => isCurrentGuildStat(stat, settings))) {
    const directoryRow = staffById.get(row.discord_id);
    staffById.set(row.discord_id, {
      ...(directoryRow || {}),
      ...row,
      username: directoryRow?.username || row.username,
      avatar_url: directoryRow?.avatar_url || row.avatar_url,
      guild_id: directoryRow?.guild_id || row.guild_id || settings.auth_guild_id,
    });
  }
  return Array.from(staffById.values()).sort(
    (a, b) =>
      Number(b.tickets_claimed_week || 0) - Number(a.tickets_claimed_week || 0) ||
      Number(b.messages_week || 0) - Number(a.messages_week || 0) ||
      String(a.username || a.discord_id).localeCompare(String(b.username || b.discord_id)),
  );
}

// GET /api/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const { user, discordId } = await requireUser(req as { headers: Record<string, string | undefined> });
    const settings = await getDashboardSettings();
    const access = await verifyDiscordStaffAccess(discordId, settings, {
      discordAccessToken: req.headers["x-discord-provider-token"] as string | undefined,
    });
    const discordUsername = access.member
      ? getDiscordMemberDisplayName(access.member, getDiscordUsername(user))
      : getDiscordUsername(user);
    const discordAvatar = access.member
      ? getDiscordMemberAvatar(access.member) || getDiscordAvatar(user)
      : getDiscordAvatar(user);

    const profile = await upsertProfile({
      discord_id: discordId,
      username: discordUsername,
      avatar_url: discordAvatar,
      role: isAdminDiscordId(discordId, settings) ? "admin" : "staff",
    });

    const isAdmin = profile.role === "admin" || isAdminDiscordId(discordId, settings);

    const [modChecks, statsRows] = await Promise.all([
      selectRows("mod_checks", "select=*&is_active=eq.true&order=created_at.desc&limit=1"),
      selectRows(
        "staff_stats",
        withGuildFilter(
          `select=*&discord_id=eq.${encodeURIComponent(discordId)}&limit=1`,
          settings,
        ),
      ),
    ]);

    const transcriptFilter = isAdmin
      ? withGuildFilter("select=*&order=closed_at.desc&limit=25", settings)
      : withGuildFilter(
          `select=*&or=(opener_id.eq.${discordId},claimed_by.eq.${discordId},closed_by.eq.${discordId})&order=closed_at.desc&limit=12`,
          settings,
        );
    const transcripts = await selectRows("ticket_transcripts", transcriptFilter);

    const [staffRows, staffDirectory] = isAdmin
      ? await Promise.all([
          selectRows(
            "staff_stats",
            "select=discord_id,username,avatar_url,guild_id,tickets_claimed_total,tickets_claimed_week,messages_total,messages_week,last_claimed_at&order=tickets_claimed_week.desc,messages_week.desc&limit=250",
          ),
          fetchStaffDirectory(settings),
        ])
      : [[], []];
    const staff = isAdmin
      ? await refreshStaffNames(mergeStaffRows(staffRows, staffDirectory, settings), settings)
      : [];

    return sendJson(res, 200, {
      profile,
      isAdmin,
      modCheck: modChecks[0] || {
        weekly_ticket_goal: settings.weekly_ticket_goal || 0,
        message_goal: settings.message_goal || 0,
        active_from: null,
        active_to: null,
      },
      stats: statsRows[0] || {
        discord_id: discordId,
        username: profile.username,
        guild_id: settings.auth_guild_id,
        tickets_claimed_total: 0,
        tickets_claimed_week: 0,
        messages_total: 0,
        messages_week: 0,
        last_claimed_at: null,
      },
      staff,
      transcripts,
      settings: {
        auth_guild_id: settings.auth_guild_id,
        auth_role_id: settings.auth_role_id,
        admin_discord_ids: settings.admin_discord_ids || [],
        tracked_role_ids: settings.tracked_role_ids || settings.auth_role_ids || [],
      },
    });
  } catch (error) {
    return handleApiError(res, error);
  }
});

// POST /api/admin/mod-checks
router.post("/admin/mod-checks", async (req, res) => {
  try {
    const { discordId } = await requireUser(req as { headers: Record<string, string | undefined> });
    const currentSettings = await getDashboardSettings();
    await verifyDiscordStaffAccess(discordId, currentSettings, {
      discordAccessToken: req.headers["x-discord-provider-token"] as string | undefined,
    });

    if (!isAdminDiscordId(discordId, currentSettings)) {
      return sendJson(res, 403, {
        error: "Only dashboard admins can update mod-check requirements",
      });
    }

    const weeklyTicketGoal = Math.max(0, Number(req.body?.weekly_ticket_goal || 0));
    const messageGoal = Math.max(0, Number(req.body?.message_goal || 0));
    const authGuildId = String(
      req.body?.auth_guild_id !== undefined
        ? req.body.auth_guild_id
        : currentSettings.auth_guild_id,
    ).trim();
    const authRoleId = String(
      req.body?.auth_role_id !== undefined
        ? req.body.auth_role_id
        : currentSettings.auth_role_id,
    ).trim();
    const rawTracked =
      req.body?.tracked_role_ids !== undefined
        ? req.body.tracked_role_ids
        : currentSettings.tracked_role_ids || currentSettings.auth_role_ids || currentSettings.auth_role_id;
    const trackedRoleIds = Array.isArray(rawTracked)
      ? rawTracked
      : String(rawTracked || "")
          .split(/[\n,]+/)
          .map((id: string) => id.trim())
          .filter(Boolean);
    const adminDiscordIds = Array.isArray(req.body?.admin_discord_ids)
      ? req.body.admin_discord_ids
      : String(req.body?.admin_discord_ids || "")
          .split(/[\n,]+/)
          .map((id: string) => id.trim())
          .filter(Boolean);

    if (!authGuildId) return sendJson(res, 400, { error: "Discord server ID is required." });
    if (!authRoleId)
      return sendJson(res, 400, {
        error: "At least one dashboard access role ID is required.",
      });
    if (!trackedRoleIds.length)
      return sendJson(res, 400, {
        error: "At least one mod-command tracking role ID is required.",
      });

    const settings = await saveDashboardSettings({
      auth_guild_id: authGuildId,
      auth_role_id: authRoleId,
      tracked_role_ids: trackedRoleIds,
      admin_discord_ids: adminDiscordIds,
      weekly_ticket_goal: weeklyTicketGoal,
      message_goal: messageGoal,
      updated_by: discordId,
    });

    const now = new Date().toISOString();
    await updateRows("mod_checks", "is_active=eq.true", { is_active: false, active_to: now });
    const rows = await insertRows("mod_checks", [
      {
        weekly_ticket_goal: weeklyTicketGoal,
        message_goal: messageGoal,
        is_active: true,
        created_by: discordId,
        active_from: now,
      },
    ]);

    return sendJson(res, 200, { modCheck: rows[0], settings });
  } catch (error) {
    return handleApiError(res, error);
  }
});

// GET/POST /api/bot/sync
router.all("/bot/sync", async (req, res) => {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const expected = process.env.DASHBOARD_BOT_API_KEY;
    const provided = req.headers["x-bot-api-key"];
    if (!expected || provided !== expected) {
      const e = new Error("Invalid bot API key") as Error & { statusCode: number };
      e.statusCode = 401;
      throw e;
    }

    if (req.method === "GET") {
      const settings = await getDashboardSettings();
      return sendJson(res, 200, {
        ok: true,
        settings: {
          auth_guild_id: settings.auth_guild_id,
          auth_role_id: settings.auth_role_id,
          auth_role_ids: settings.auth_role_ids || [],
          tracked_role_ids: settings.tracked_role_ids || settings.auth_role_ids || [],
        },
      });
    }

    const body: AnyRecord =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : (req.body || {});
    const event = body?.event;
    const payload: AnyRecord = body?.payload || {};

    if (event === "staff_stat") {
      if (!payload.discord_id) throw new Error("discord_id is required for staff_stat events");
      await upsertProfile({
        discord_id: payload.discord_id,
        username: payload.username,
        avatar_url: payload.avatar_url,
        role: payload.role || "staff",
      });

      const existingRows = await selectRows(
        "staff_stats",
        `select=*&discord_id=eq.${encodeURIComponent(payload.discord_id)}&limit=1`,
      );
      const existing = existingRows[0];

      function weekStart(date = new Date()) {
        const copy = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        );
        const day = copy.getUTCDay() || 7;
        copy.setUTCDate(copy.getUTCDate() - day + 1);
        copy.setUTCHours(0, 0, 0, 0);
        return copy.toISOString().slice(0, 10);
      }

      const ticketIncrement = Number(payload.tickets_claimed_increment || 0);
      let messageIncrement = Number(payload.messages_increment || 0);
      const currentWeek = weekStart();
      const sameWeek = existing?.week_start === currentWeek;

      if (messageIncrement > 0 && payload.message_id) {
        try {
          await insertRows("dashboard_message_events", [
            {
              message_id: payload.message_id,
              discord_id: payload.discord_id,
              channel_id: payload.channel_id || null,
              guild_id: payload.guild_id || null,
              created_at: payload.message_created_at || new Date().toISOString(),
            },
          ]);
        } catch (err: unknown) {
          const e = err as { statusCode?: number; message?: string };
          if (e.statusCode === 409 || /duplicate key|violates unique/i.test(e.message || "")) {
            messageIncrement = 0;
          } else if (
            !(e.statusCode === 404 || /dashboard_message_events|relation/i.test(e.message || ""))
          ) {
            throw err;
          }
        }
      }

      const rows = await upsertRows(
        "staff_stats",
        [
          {
            discord_id: payload.discord_id,
            username: payload.username || existing?.username || "Discord User",
            avatar_url: payload.avatar_url || existing?.avatar_url || null,
            guild_id: payload.guild_id || existing?.guild_id || null,
            week_start: currentWeek,
            tickets_claimed_total:
              payload.tickets_claimed_total !== undefined
                ? Number(payload.tickets_claimed_total || 0)
                : Number(existing?.tickets_claimed_total || 0) + ticketIncrement,
            tickets_claimed_week:
              payload.tickets_claimed_week !== undefined
                ? Number(payload.tickets_claimed_week || 0)
                : (sameWeek ? Number(existing?.tickets_claimed_week || 0) : 0) + ticketIncrement,
            messages_total:
              payload.messages_total !== undefined
                ? Number(payload.messages_total || 0)
                : Number(existing?.messages_total || 0) + messageIncrement,
            messages_week:
              payload.messages_week !== undefined
                ? Number(payload.messages_week || 0)
                : (sameWeek ? Number(existing?.messages_week || 0) : 0) + messageIncrement,
            last_claimed_at:
              payload.last_claimed_at ||
              (ticketIncrement > 0 ? new Date().toISOString() : existing?.last_claimed_at || null),
            updated_at: new Date().toISOString(),
          },
        ],
        "discord_id",
      );
      return sendJson(res, 200, { ok: true, staffStat: rows[0] });
    }

    if (event === "ticket_transcript") {
      if (!payload.ticket_channel_id)
        throw new Error("ticket_channel_id is required for transcript events");
      const rows = await upsertRows(
        "ticket_transcripts",
        [
          {
            ticket_channel_id: payload.ticket_channel_id,
            guild_id: payload.guild_id,
            ticket_channel_name: payload.ticket_channel_name,
            ticket_type: payload.ticket_type,
            opener_id: payload.opener_id,
            opener_username: payload.opener_username,
            claimed_by: payload.claimed_by,
            claimed_by_username: payload.claimed_by_username,
            closed_by: payload.closed_by,
            closer_username: payload.closer_username,
            close_reason: payload.close_reason,
            transcript_text: payload.transcript_text,
            discord_message_url: payload.discord_message_url,
            closed_at: payload.closed_at || new Date().toISOString(),
            metadata: payload.metadata || {},
            updated_at: new Date().toISOString(),
          },
        ],
        "ticket_channel_id",
      );
      return sendJson(res, 200, { ok: true, transcript: rows[0] });
    }

    return sendJson(res, 400, { error: "Unknown sync event" });
  } catch (error) {
    return handleApiError(res, error);
  }
});

export default router;
