import { getDashboardSettings, handleApiError, insertRows, selectRows, sendJson, upsertProfile, upsertRows } from '../_supabase.js';

const useSupabaseRest = Boolean(
  process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE)
);

function requireBotKey(req) {
  // Accept DASHBOARD_BOT_API_KEY (preferred) or the shorter DASHBOARD_BOT_API alias
  const expected = process.env.DASHBOARD_BOT_API_KEY || process.env.DASHBOARD_BOT_API;
  const provided = req.headers['x-bot-api-key'];
  if (!expected || provided !== expected) {
    const error = new Error('Invalid bot API key');
    error.statusCode = 401;
    throw error;
  }
}

// On Vercel, each serverless function invocation runs in an isolated Lambda
// container with its own ephemeral /tmp. Without Supabase, data written by
// one invocation is invisible to every other invocation — stats are silently
// lost. Reject sync writes so the bot sees the error in its logs instead.
function requireSupabase(res) {
  if (!useSupabaseRest) {
    console.error(
      '❌ Dashboard bot sync requires Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
      'to Vercel environment variables, then redeploy. ' +
      'Without Supabase, stats written by the bot are lost between serverless function invocations.'
    );
    sendJson(res, 503, {
      error: 'Dashboard data storage is not configured. ' +
        'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your Vercel environment variables and redeploy. ' +
        'The JSON file fallback does not work on Vercel because each function invocation runs in an isolated container.'
    });
    return false;
  }
  return true;
}

function weekStart(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

async function recordMessageEvent(payload) {
  if (!payload.message_id) return true;

  try {
    await insertRows('dashboard_message_events', [{
      message_id: payload.message_id,
      discord_id: payload.discord_id,
      channel_id: payload.channel_id || null,
      guild_id: payload.guild_id || null,
      created_at: payload.message_created_at || new Date().toISOString()
    }]);
    return true;
  } catch (error) {
    if (error.statusCode === 409 || /duplicate key|violates unique/i.test(error.message || '')) {
      return false;
    }
    if (error.statusCode === 404 || /dashboard_message_events|relation/i.test(error.message || '')) {
      return true;
    }
    throw error;
  }
}

async function syncStaffStat(payload) {
  if (!payload.discord_id) throw new Error('discord_id is required for staff_stat events');

  const ticketIncrement = Number(payload.tickets_claimed_increment || 0);
  let messageIncrement = Number(payload.messages_increment || 0);
  const hasAbsoluteTicketTotal = payload.tickets_claimed_total !== undefined;
  const hasAbsoluteTicketWeek = payload.tickets_claimed_week !== undefined;
  const hasAbsoluteMessageTotal = payload.messages_total !== undefined;
  const hasAbsoluteMessageWeek = payload.messages_week !== undefined;

  if (messageIncrement > 0) {
    const isNewMessage = await recordMessageEvent(payload);
    if (!isNewMessage) messageIncrement = 0;
  }

  await upsertProfile({
    discord_id: payload.discord_id,
    username: payload.username,
    avatar_url: payload.avatar_url,
    role: payload.role || 'staff'
  });

  const existingRows = await selectRows('staff_stats', `select=*&discord_id=eq.${encodeURIComponent(payload.discord_id)}&limit=1`);
  const existing = existingRows[0];
  const currentWeek = weekStart();
  const sameWeek = existing?.week_start === currentWeek;

  const rows = await upsertRows('staff_stats', [{
    discord_id: payload.discord_id,
    username: payload.username || existing?.username || 'Discord User',
    avatar_url: payload.avatar_url || existing?.avatar_url || null,
    guild_id: payload.guild_id || existing?.guild_id || null,
    week_start: currentWeek,
    tickets_claimed_total: hasAbsoluteTicketTotal ? Number(payload.tickets_claimed_total || 0) : Number(existing?.tickets_claimed_total || 0) + ticketIncrement,
    tickets_claimed_week: hasAbsoluteTicketWeek ? Number(payload.tickets_claimed_week || 0) : (sameWeek ? Number(existing?.tickets_claimed_week || 0) : 0) + ticketIncrement,
    messages_total: hasAbsoluteMessageTotal ? Number(payload.messages_total || 0) : Number(existing?.messages_total || 0) + messageIncrement,
    messages_week: hasAbsoluteMessageWeek ? Number(payload.messages_week || 0) : (sameWeek ? Number(existing?.messages_week || 0) : 0) + messageIncrement,
    last_claimed_at: payload.last_claimed_at || (ticketIncrement > 0 ? new Date().toISOString() : existing?.last_claimed_at || null),
    updated_at: new Date().toISOString()
  }], 'discord_id');

  return rows[0];
}

async function syncTranscript(payload) {
  if (!payload.ticket_channel_id) throw new Error('ticket_channel_id is required for transcript events');

  const rows = await upsertRows('ticket_transcripts', [{
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
    updated_at: new Date().toISOString()
  }], 'ticket_channel_id');

  return rows[0];
}

function getRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString()); } catch { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    requireBotKey(req);

    if (req.method === 'GET') {
      // Settings reads work even without Supabase (uses defaults)
      const settings = await getDashboardSettings();
      return sendJson(res, 200, {
        ok: true,
        supabase_configured: useSupabaseRest,
        settings: {
          auth_guild_id: settings.auth_guild_id,
          auth_role_id: settings.auth_role_id,
          auth_role_ids: settings.auth_role_ids || [],
          tracked_role_ids: settings.tracked_role_ids || settings.auth_role_ids || []
        }
      });
    }

    // POST — requires Supabase for data to persist across Vercel invocations
    if (!requireSupabase(res)) return;

    const body = getRequestBody(req);
    const event = body?.event;
    const payload = body?.payload || {};

    if (event === 'staff_stat') {
      const staffStat = await syncStaffStat(payload);
      return sendJson(res, 200, { ok: true, staffStat });
    }

    if (event === 'ticket_transcript') {
      const transcript = await syncTranscript(payload);
      return sendJson(res, 200, { ok: true, transcript });
    }

    return sendJson(res, 400, { error: 'Unknown sync event' });
  } catch (error) {
    return handleApiError(res, error);
  }
}
