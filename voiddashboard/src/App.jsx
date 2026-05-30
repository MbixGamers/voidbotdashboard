import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const fallbackDashboard = {
  profile: {
    discord_id: '000000000000000000',
    username: 'Void Staff',
    avatar_url: null
  },
  isAdmin: true,
  modCheck: {
    weekly_ticket_goal: 30,
    message_goal: 100,
    active_from: new Date().toISOString(),
    active_to: null
  },
  stats: {
    tickets_claimed_total: 86,
    tickets_claimed_week: 18,
    messages_total: 421,
    messages_week: 96,
    last_claimed_at: new Date().toISOString()
  },
  staff: [
    { discord_id: '1001', username: 'Astra', tickets_claimed_week: 32, messages_week: 142 },
    { discord_id: '1002', username: 'Nova', tickets_claimed_week: 24, messages_week: 109 },
    { discord_id: '1003', username: 'Echo', tickets_claimed_week: 18, messages_week: 96 }
  ],
  settings: {
    auth_guild_id: '1351362266246680626',
    auth_role_id: '1444524137526853723',
    admin_discord_ids: []
  },
  transcripts: [
    {
      id: 'sample-1',
      ticket_channel_name: 'support-night-rider',
      ticket_type: 'Support',
      opener_username: 'NightRider',
      claimed_by_username: 'Echo',
      closer_username: 'Astra',
      close_reason: 'Issue resolved',
      closed_at: new Date().toISOString(),
      discord_message_url: 'https://discord.com/channels/000/000/000',
      transcript_text: 'Sample transcript content appears here after the bot pushes closed tickets to Supabase through the dashboard API.'
    }
  ]
};

function getAvatarUrl(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(profile?.discord_id || 'void')}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function ProgressCard({ label, value, goal, helper }) {
  const percent = goal > 0 ? clampPercent((value / goal) * 100) : 0;
  return (
    <article className="progress-card">
      <div className="metric-heading">
        <span>{label}</span>
        <strong>{formatNumber(value)} / {formatNumber(goal)}</strong>
      </div>
      <div className="progress-track" aria-label={`${label} progress`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p>{Math.round(percent)}% complete · {helper}</p>
    </article>
  );
}

function TranscriptPreview({ transcript }) {
  return (
    <article className="transcript-card">
      <div>
        <p className="eyebrow">{transcript.ticket_type || 'Ticket'}</p>
        <h3>{transcript.ticket_channel_name || 'Closed ticket'}</h3>
        <p>
          Opened by <strong>{transcript.opener_username || transcript.opener_id || 'Unknown'}</strong>
          {transcript.claimed_by_username ? <> · Claimed by <strong>{transcript.claimed_by_username}</strong></> : null}
        </p>
      </div>
      <div className="transcript-meta">
        <span>{formatDate(transcript.closed_at)}</span>
        <span>{transcript.close_reason || 'No reason provided'}</span>
      </div>
      <pre>{transcript.transcript_text || 'Transcript text was not provided by the bot.'}</pre>
      {transcript.discord_message_url ? (
        <a className="button button-secondary" href={transcript.discord_message_url} target="_blank" rel="noreferrer">
          View online transcript in Discord
        </a>
      ) : null}
    </article>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [modForm, setModForm] = useState({ weekly_ticket_goal: 30, message_goal: 100, auth_guild_id: '1351362266246680626', auth_role_id: '1444524137526853723', admin_discord_ids: '' });

  const loadDashboard = useCallback(async (activeSession) => {
    if (!activeSession?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotice('');
    try {
      const response = await fetch('/api/dashboard', {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load dashboard');
      setDashboard(data);
      setModForm({
        weekly_ticket_goal: data.modCheck?.weekly_ticket_goal || 0,
        message_goal: data.modCheck?.message_goal || 0,
        auth_guild_id: data.settings?.auth_guild_id || '1351362266246680626',
        auth_role_id: data.settings?.auth_role_id || '1444524137526853723',
        admin_discord_ids: (data.settings?.admin_discord_ids || []).join('\n')
      });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setNotice('Supabase environment variables are not configured yet, so sample data is shown.');
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      loadDashboard(data.session || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) loadDashboard(nextSession);
      else setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadDashboard]);

  const stats = dashboard.stats || {};
  const modCheck = dashboard.modCheck || {};
  const ticketGoal = modCheck.weekly_ticket_goal || 0;
  const messageGoal = modCheck.message_goal || 0;
  const profile = dashboard.profile || {};

  const completion = useMemo(() => {
    const ticketPercent = ticketGoal > 0 ? (stats.tickets_claimed_week || 0) / ticketGoal : 0;
    const messagePercent = messageGoal > 0 ? (stats.messages_week || 0) / messageGoal : 0;
    return clampPercent(((ticketPercent + messagePercent) / 2) * 100);
  }, [messageGoal, stats.messages_week, stats.tickets_claimed_week, ticketGoal]);

  async function signInWithDiscord() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin
      }
    });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  }

  async function saveModCheck(event) {
    event.preventDefault();
    if (!session?.access_token) return;

    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/mod-checks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          weekly_ticket_goal: Number(modForm.weekly_ticket_goal),
          message_goal: Number(modForm.message_goal),
          auth_guild_id: modForm.auth_guild_id,
          auth_role_id: modForm.auth_role_id,
          admin_discord_ids: modForm.admin_discord_ids
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save mod-check settings');
      setDashboard((current) => ({ ...current, modCheck: data.modCheck, settings: data.settings }));
      setNotice('Dashboard requirements updated. Staff goals, authorization checks, and admin bypass IDs now use the new settings.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  const isAuthError = /invalid staff authorization|not a staff member|required authority|not a Void staff/i.test(notice);
  const showLogin = isSupabaseConfigured && !session;
  const showDashboard = !showLogin && !isAuthError;

  return (
    <div className="app-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">V</span>
          <div>
            <p className="brand-title">Void Dashboard</p>
            <p className="brand-subtitle">Discord staff performance hub</p>
          </div>
        </div>
        <div className="topbar-actions">
          {session ? (
            <>
              <button className="button button-secondary" onClick={() => loadDashboard(session)} disabled={loading}>Refresh</button>
              <button className="button button-primary" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="button button-primary" onClick={signInWithDiscord} disabled={!isSupabaseConfigured}>
              Login with Discord
            </button>
          )}
        </div>
      </nav>

      <header className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Void staff operations</p>
          <h1>A clean command center for ticket support performance.</h1>
          <p>
            Track claims, ticket replies, weekly mod-check goals, and closed-ticket transcripts from one polished dashboard.
            Discord authorization is verified against the Void Server and Ticket Support role before staff data is shown.
          </p>
          <div className="hero-tags">
            <span>Role-gated access</span>
            <span>Live staff metrics</span>
            <span>Transcript archive</span>
          </div>
        </div>
        <aside className="profile-panel">
          <img src={getAvatarUrl(profile)} alt="Discord avatar" />
          <div>
            <p>{session ? 'Signed in as' : 'Previewing as'}</p>
            <h2>{profile.username || 'Void Staff'}</h2>
            <span className={dashboard.isAdmin ? 'role-pill admin' : 'role-pill'}>{dashboard.isAdmin ? 'Admin panel enabled' : 'Staff dashboard'}</span>
          </div>
        </aside>
      </header>

      {showLogin ? (
        <section className="login-card">
          <h2>Login required</h2>
          <p>Use Discord OAuth through Supabase to view your personal Void server dashboard.</p>
          <button className="button button-primary" onClick={signInWithDiscord}>Continue with Discord</button>
        </section>
      ) : null}

      {notice ? <p className={isAuthError ? 'notice notice-error' : 'notice'}>{notice}</p> : null}
      {isAuthError ? (
        <section className="invalid-card">
          <p className="eyebrow">Invalid authorization</p>
          <h2>You are not a staff member or do not have the required authority.</h2>
          <p>Access requires membership in the configured Void Server and the configured Ticket Support role. If this is a mistake, ask an admin to update your Discord role or adjust the dashboard authorization IDs.</p>
          <button className="button button-secondary" onClick={signOut}>Sign out</button>
        </section>
      ) : null}
      {loading ? <p className="notice">Loading live dashboard data…</p> : null}

      {showDashboard ? <main className="dashboard-grid">
        <section className="card progress-summary">
          <div className="section-heading">
            <p className="eyebrow">Your weekly progress</p>
            <h2>{Math.round(completion)}% overall completion</h2>
          </div>
          <ProgressCard
            label="Tickets claimed"
            value={stats.tickets_claimed_week || 0}
            goal={ticketGoal}
            helper={`${formatNumber(stats.tickets_claimed_total)} lifetime claims`}
          />
          <ProgressCard
            label="Ticket messages"
            value={stats.messages_week || 0}
            goal={messageGoal}
            helper={`${formatNumber(stats.messages_total)} lifetime messages`}
          />
          <p className="muted">Last claimed ticket: {formatDate(stats.last_claimed_at)}</p>
        </section>

        <section className="card stat-strip">
          <div>
            <span>Total claimed</span>
            <strong>{formatNumber(stats.tickets_claimed_total)}</strong>
          </div>
          <div>
            <span>This week</span>
            <strong>{formatNumber(stats.tickets_claimed_week)}</strong>
          </div>
          <div>
            <span>Messages</span>
            <strong>{formatNumber(stats.messages_week)}</strong>
          </div>
        </section>

        {dashboard.isAdmin ? (
          <section className="card admin-panel">
            <div className="section-heading">
              <p className="eyebrow">Admin controls</p>
              <h2>Requirements and staff overview</h2>
              <p>Keep weekly goals and Discord access rules in one tidy panel.</p>
            </div>
            <form onSubmit={saveModCheck} className="mod-form admin-form">
              <div className="form-section">
                <span className="form-section-title">Weekly mod check</span>
                <div className="form-grid two-col">
                  <label>
                    Tickets per week
                    <input
                      type="number"
                      min="0"
                      value={modForm.weekly_ticket_goal}
                      onChange={(event) => setModForm((current) => ({ ...current, weekly_ticket_goal: event.target.value }))}
                    />
                  </label>
                  <label>
                    Ticket messages per week
                    <input
                      type="number"
                      min="0"
                      value={modForm.message_goal}
                      onChange={(event) => setModForm((current) => ({ ...current, message_goal: event.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div className="form-section">
                <span className="form-section-title">Discord authorization</span>
                <div className="form-grid">
                  <label>
                    Required server ID
                    <input
                      inputMode="numeric"
                      value={modForm.auth_guild_id}
                      onChange={(event) => setModForm((current) => ({ ...current, auth_guild_id: event.target.value.trim() }))}
                    />
                  </label>
                  <label>
                    Required role ID
                    <input
                      inputMode="numeric"
                      value={modForm.auth_role_id}
                      onChange={(event) => setModForm((current) => ({ ...current, auth_role_id: event.target.value.trim() }))}
                    />
                  </label>
                  <label className="full-span">
                    Admin bypass user IDs
                    <textarea
                      rows="4"
                      placeholder="One Discord user ID per line. Your master admin ID is always kept automatically."
                      value={modForm.admin_discord_ids}
                      onChange={(event) => setModForm((current) => ({ ...current, admin_discord_ids: event.target.value }))}
                    />
                  </label>
                </div>
                <p className="muted">These Discord user IDs bypass the server/role check and receive the same admin dashboard access as the master admin.</p>
              </div>
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save dashboard settings'}</button>
            </form>
            <div className="staff-table-card">
              <div className="table-title">
                <strong>Staff leaderboard</strong>
                <span>This week</span>
              </div>
              <div className="staff-table">
                <div className="table-row table-head"><span>Staff</span><span>Tickets</span><span>Messages</span></div>
                {(dashboard.staff || []).map((staffer) => (
                  <div className="table-row" key={staffer.discord_id}>
                    <span>{staffer.username || staffer.discord_id}</span>
                    <span>{formatNumber(staffer.tickets_claimed_week)}</span>
                    <span>{formatNumber(staffer.messages_week)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="card transcripts-panel">
          <div className="section-heading">
            <p className="eyebrow">Closed tickets</p>
            <h2>Transcript library</h2>
            <p>Closed ticket transcripts are pushed by the bot and linked back to the Discord ticket logs channel.</p>
          </div>
          <div className="transcript-list">
            {(dashboard.transcripts || []).map((transcript) => (
              <TranscriptPreview key={transcript.id} transcript={transcript} />
            ))}
          </div>
        </section>
      </main> : null}
    </div>
  );
}

export default App;
