const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sessionKey = 'void-dashboard-session';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || 'null');
  } catch {
    return null;
  }
}

function storeSession(session) {
  if (session?.access_token) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
}

function parseHashSession() {
  if (!window.location.hash.includes('access_token=')) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const session = {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    expires_at: params.get('expires_at'),
    token_type: params.get('token_type') || 'bearer'
  };
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  storeSession(session);
  return session;
}

export const supabaseAuth = {
  getSession() {
    const session = parseHashSession() || readStoredSession();
    return Promise.resolve({ data: { session } });
  },
  onAuthStateChange(callback) {
    const handler = () => callback('SIGNED_IN', readStoredSession());
    window.addEventListener('storage', handler);
    return { data: { subscription: { unsubscribe: () => window.removeEventListener('storage', handler) } } };
  },
  async signInWithOAuth({ options } = {}) {
    const redirectTo = options?.redirectTo || window.location.origin;
    const url = new URL(`${supabaseUrl}/auth/v1/authorize`);
    url.searchParams.set('provider', 'discord');
    url.searchParams.set('redirect_to', redirectTo);
    window.location.href = url.toString();
  },
  async signOut() {
    const session = readStoredSession();
    if (session?.access_token) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`
        }
      }).catch(() => {});
    }
    storeSession(null);
  }
};

export const supabase = isSupabaseConfigured ? { auth: supabaseAuth } : null;
