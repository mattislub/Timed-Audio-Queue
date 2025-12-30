import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Cog, ListMusic, LogOut, Mic2, Shield, UserRound } from 'lucide-react';
import Recorder from './components/Recorder';
import Playlist from './components/Playlist';
import Settings from './components/Settings';
import { RECORDING_TTL_MS } from './constants';

export type Recording = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
};

export type RepeatSetting = {
  gapSeconds: number;
  playbackRate: number;
  enabled?: boolean;
};

export type AppSettings = {
  repeatSettings: RepeatSetting[];
  preventOverlappingPlayback: boolean;
};

export type RecorderUser = {
  id: string;
  username: string;
  password: string;
};

type AuthState = {
  adminPassword: string;
  recorderUsers: RecorderUser[];
};

const defaultAuthState: AuthState = {
  adminPassword: 'admin123',
  recorderUsers: [],
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

const STORAGE_KEYS = {
  role: 'taq.activeRole',
} as const;

function AdminLoginCard({ onLogin, muted = false }: { onLogin: (password: string) => boolean; muted?: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const ok = onLogin(password);
    if (!ok) {
      setError('Incorrect admin password.');
      return;
    }
    setError(null);
  };

  return (
    <section
      className={`border rounded-2xl p-6 bg-slate-900/70 ${
        muted ? 'border-slate-900/40 opacity-70' : 'border-emerald-800/40 shadow-lg shadow-emerald-500/10'
      }`}
    >
      <div className="flex items-center gap-2 text-sm text-emerald-200">
        <Shield className="w-4 h-4" /> Admin area
      </div>
      <h2 className="text-xl font-semibold mt-2">Sign in as admin</h2>
      <p className="text-sm text-slate-400 mb-4">Access the playlist, settings, and user management.</p>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="text-sm text-slate-300 space-y-2 block">
          <span>Admin password</span>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={muted}
            required
          />
        </label>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={muted}
          className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition text-white font-semibold disabled:opacity-60"
        >
          Login as admin
        </button>
      </form>
    </section>
  );
}

function RecorderLoginCard({
  recorderUsers,
  onLogin,
  muted = false,
}: {
  recorderUsers: RecorderUser[];
  onLogin: (username: string, password: string) => boolean;
  muted?: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const ok = onLogin(username, password);
    if (!ok) {
      setError('Username or password are incorrect.');
      return;
    }
    setError(null);
  };

  return (
    <section
      className={`border rounded-2xl p-6 bg-slate-900/70 ${
        muted ? 'border-slate-900/40 opacity-70' : 'border-emerald-800/40 shadow-lg shadow-emerald-500/10'
      }`}
    >
      <div className="flex items-center gap-2 text-sm text-emerald-200">
        <UserRound className="w-4 h-4" /> Recorder access
      </div>
      <h2 className="text-xl font-semibold mt-2">Login for recording only</h2>
      <p className="text-sm text-slate-400 mb-4">Captures audio without exposing playlist or settings.</p>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="text-sm text-slate-300 space-y-2 block">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={event => setUsername(event.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={muted}
            required
          />
        </label>
        <label className="text-sm text-slate-300 space-y-2 block">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={muted}
            required
          />
        </label>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={muted}
          className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition text-white font-semibold disabled:opacity-60"
        >
          Login for recording
        </button>
      </form>

      <div className="mt-4 text-xs text-slate-400">
        {recorderUsers.length === 0 ? (
          <p>No recorder accounts created yet. Ask an admin to add users from Settings.</p>
        ) : (
          <div className="space-y-1">
            <p className="font-semibold text-slate-300">Available usernames:</p>
            <ul className="list-disc list-inside space-y-1">
              {recorderUsers.map(user => (
                <li key={user.id} className="text-slate-400">
                  <span className="font-semibold text-emerald-200">{user.username}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function buildApiUrl(path: string) {
  if (!API_BASE_URL) return '';

  const trimmed = API_BASE_URL.replace(/\/$/, '');
  const baseWithApi = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;

  return `${baseWithApi}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchAuthStateFromServer(): Promise<AuthState> {
  if (!API_BASE_URL) {
    return defaultAuthState;
  }

  try {
    const response = await fetch(buildApiUrl('/auth'));
    if (!response.ok) {
      console.error('[Auth] Failed to load auth state', response.status, response.statusText);
      return defaultAuthState;
    }

    const data = (await response.json()) as Partial<AuthState>;
    return {
      adminPassword: typeof data.adminPassword === 'string' ? data.adminPassword : defaultAuthState.adminPassword,
      recorderUsers: Array.isArray(data.recorderUsers)
        ? data.recorderUsers.map(user => ({
            id: user.id || crypto.randomUUID(),
            username: user.username ?? '',
            password: user.password ?? '',
          }))
        : defaultAuthState.recorderUsers,
    };
  } catch (error) {
    console.error('[Auth] Error fetching auth state', error);
    return defaultAuthState;
  }
}

async function saveAuthStateToServer(state: AuthState): Promise<AuthState | null> {
  if (!API_BASE_URL) {
    return state;
  }

  try {
    const response = await fetch(buildApiUrl('/auth'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      console.error('[Auth] Failed to persist auth state', response.status, response.statusText);
      return null;
    }

    const data = (await response.json()) as AuthState;
    return data;
  } catch (error) {
    console.error('[Auth] Error saving auth state', error);
    return null;
  }
}

async function fetchRecordings() {
  if (!API_BASE_URL) {
    return { recordings: [], serverNow: undefined };
  }

  const response = await fetch(buildApiUrl('/sounds'));
  if (!response.ok) {
    console.error('[App] Failed to fetch recordings', response.status, response.statusText);
    return { recordings: [], serverNow: undefined };
  }

  const clientNow = Date.now();
  const data = (await response.json()) as Array<{
    id: string;
    file_name: string;
    file_url: string;
    created_at?: string;
  }>;

  const serverNowHeader = response.headers.get('date');
  const serverNow = serverNowHeader ? new Date(serverNowHeader).getTime() : undefined;
  const offsetMs = serverNow ? serverNow - clientNow : 0;
  const now = serverNow ?? clientNow;

  const clockInfo = {
    source: serverNow ? 'server' : 'client',
    serverNow,
    clientNow,
    offsetMs,
    reason: serverNow ? 'date header exposed by server' : 'missing Date header; using client clock',
  } as const;

  console.info('[Clock]', clockInfo, `source=${clockInfo.source}; serverNow=${clockInfo.serverNow}; clientNow=${clockInfo.clientNow}; offsetMs=${clockInfo.offsetMs}; reason=${clockInfo.reason}`);

  const parseServerTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return now;

    const trimmed = timestamp.trim();

    // MySQL timestamps do not include a timezone; treat them as UTC to avoid client timezone skew
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)
      ? trimmed
      : `${trimmed.replace(' ', 'T')}Z`;

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : now;
  };

  const mappedRecordings = data
    .map(
      item =>
        ({
          id: item.id,
          name: item.file_name,
          url: item.file_url,
          createdAt: parseServerTimestamp(item.created_at),
        } satisfies Recording),
    );

  const expiredRecordings = mappedRecordings.filter(
    recording => recording.createdAt + RECORDING_TTL_MS <= now,
  );

  if (expiredRecordings.length > 0) {
    console.info(
      '[Recordings] Skipping expired recordings (server-clock aligned)',
      expiredRecordings.map(recording => ({
        id: recording.id,
        name: recording.name,
        ageSeconds: Math.round((now - recording.createdAt) / 1000),
        expiresAt: recording.createdAt + RECORDING_TTL_MS,
        serverNow: now,
      })),
    );
  }

  return {
    recordings: mappedRecordings.filter(recording => recording.createdAt + RECORDING_TTL_MS > now),
    serverNow,
  };
}

function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [activePage, setActivePage] = useState<'record' | 'playlist' | 'settings'>('record');
  const [settings, setSettings] = useState<AppSettings>({
    repeatSettings: [
      { gapSeconds: 0, playbackRate: 1, enabled: true },
      { gapSeconds: 2, playbackRate: 1, enabled: true },
      { gapSeconds: 30, playbackRate: 1, enabled: true },
      { gapSeconds: 30, playbackRate: 1, enabled: true },
      { gapSeconds: 30, playbackRate: 1, enabled: true },
      { gapSeconds: 30, playbackRate: 1, enabled: true },
    ],
    preventOverlappingPlayback: true,
  });
  const [adminPassword, setAdminPassword] = useState<string>(defaultAuthState.adminPassword);
  const [recorderUsers, setRecorderUsers] = useState<RecorderUser[]>(defaultAuthState.recorderUsers);
  const [role, setRole] = useState<'admin' | 'recorder' | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEYS.role);
    return stored === 'admin' || stored === 'recorder' ? stored : null;
  });
  const [loginView, setLoginView] = useState<'admin' | 'recorder'>('admin');
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAuth = async () => {
      const state = await fetchAuthStateFromServer();
      if (!cancelled) {
        setAdminPassword(state.adminPassword);
        setRecorderUsers(state.recorderUsers);
        setAuthLoading(false);
      }
    };

    loadAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const { recordings: latest, serverNow } = await fetchRecordings();
      if (isMounted) {
        if (serverNow) {
          setServerOffsetMs(serverNow - Date.now());
        }
        setRecordings(latest);
      }
    };

    load();
    const intervalId = window.setInterval(load, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const refreshRecordings = async () => {
    const { recordings: latest, serverNow } = await fetchRecordings();
    if (serverNow) {
      setServerOffsetMs(serverNow - Date.now());
    }
    setRecordings(latest);
    setActivePage('playlist');
  };

  const subtitle = useMemo(() => {
    if (activePage === 'record') return 'Start, stop, and save in one tap';
    if (activePage === 'playlist') return 'Every recording joins the organized queue';
    return 'Set it once and everything runs automatically';
  }, [activePage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (role) {
        localStorage.setItem(STORAGE_KEYS.role, role);
      } else {
        localStorage.removeItem(STORAGE_KEYS.role);
      }
    }
  }, [role]);

  const persistAuthState = async (nextAuth: AuthState) => {
    const previousState: AuthState = {
      adminPassword,
      recorderUsers,
    };

    setAdminPassword(nextAuth.adminPassword);
    setRecorderUsers(nextAuth.recorderUsers);

    const saved = await saveAuthStateToServer(nextAuth);
    if (saved) {
      setAdminPassword(saved.adminPassword);
      setRecorderUsers(saved.recorderUsers);
      return true;
    }

    setAdminPassword(previousState.adminPassword);
    setRecorderUsers(previousState.recorderUsers);
    return false;
  };

  const handleAdminLogin = (password: string) => {
    if (password.trim() === adminPassword) {
      setRole('admin');
      return true;
    }
    return false;
  };

  const handleRecorderLogin = (username: string, password: string) => {
    const match = recorderUsers.find(
      user => user.username.trim().toLowerCase() === username.trim().toLowerCase() && user.password === password,
    );

    if (match) {
      setRole('recorder');
      return true;
    }
    return false;
  };

  const handleAdminPasswordChange = async (password: string) => {
    const success = await persistAuthState({ adminPassword: password, recorderUsers });
    return success;
  };

  const handleRecorderUsersChange = async (users: RecorderUser[]) => {
    const success = await persistAuthState({ adminPassword, recorderUsers: users });
    return success;
  };

  const logout = () => {
    setRole(null);
    setActivePage('record');
    setLoginView('admin');
  };

  const isRecorderOnly = role === 'recorder';
  const effectivePage = isRecorderOnly ? 'record' : activePage;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center px-6 py-12">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse" />
          <p className="text-lg font-semibold text-emerald-100">Loading user data...</p>
          <p className="text-sm text-slate-400">Please wait while the server returns the login settings.</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center px-6 py-12">
        <div className="max-w-4xl w-full space-y-8">
          <div className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Mic2 className="w-6 h-6" />
            </div>
            <p className="text-sm text-emerald-200 uppercase tracking-[0.2em]">Timed Audio Queue</p>
            <h1 className="text-3xl font-semibold">Welcome back</h1>
            <p className="text-slate-300">Sign in as an admin to manage settings or as a recorder to capture audio only.</p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setLoginView('admin')}
              className={`px-4 py-2 rounded-full border ${
                loginView === 'admin'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white'
              }`}
            >
              <Shield className="inline w-4 h-4 mr-2" />
              Admin login
            </button>
            <button
              type="button"
              onClick={() => setLoginView('recorder')}
              className={`px-4 py-2 rounded-full border ${
                loginView === 'recorder'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white'
              }`}
            >
              <UserRound className="inline w-4 h-4 mr-2" />
              Recorder login
            </button>
          </div>

          <div className="max-w-2xl mx-auto">
            {loginView === 'admin' ? (
              <AdminLoginCard onLogin={handleAdminLogin} />
            ) : (
              <RecorderLoginCard recorderUsers={recorderUsers} onLogin={handleRecorderLogin} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-slate-900/60 bg-slate-900/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Mic2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-200 uppercase tracking-[0.2em]">Timed Audio Queue</p>
              <h1 className="text-xl font-semibold">Schedule recordings with ease</h1>
              <p className="text-sm text-slate-300">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm bg-slate-900/70 border border-slate-800 rounded-full p-1 shadow-inner">
              <button
                onClick={() => setActivePage('record')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                  effectivePage === 'record'
                    ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Mic2 className="w-4 h-4" />
                Record
              </button>
              {!isRecorderOnly && (
                <>
                  <button
                    onClick={() => setActivePage('playlist')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                      effectivePage === 'playlist'
                        ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <ListMusic className="w-4 h-4" />
                    Plays
                  </button>
                  <button
                    onClick={() => setActivePage('settings')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                      effectivePage === 'settings'
                        ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Cog className="w-4 h-4" />
                    Settings
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-full px-3 py-1">
              {isRecorderOnly ? (
                <>
                  <UserRound className="w-4 h-4 text-emerald-300" />
                  Recorder access
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 text-emerald-300" />
                  Admin access
                </>
              )}
              <span className="text-slate-700">|</span>
              <button onClick={logout} className="flex items-center gap-1 text-slate-200 hover:text-white">
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className={effectivePage === 'record' ? 'block' : 'hidden'} aria-hidden={effectivePage !== 'record'}>
          <Recorder onRecordingSaved={refreshRecordings} settings={settings} />
        </div>
        {!isRecorderOnly && (
          <>
            <div className={effectivePage === 'playlist' ? 'block' : 'hidden'} aria-hidden={effectivePage !== 'playlist'}>
              <Playlist recordings={recordings} settings={settings} serverOffsetMs={serverOffsetMs} />
            </div>
            <div className={effectivePage === 'settings' ? 'block' : 'hidden'} aria-hidden={effectivePage !== 'settings'}>
              <Settings
                settings={settings}
                onChange={setSettings}
                adminPassword={adminPassword}
                onAdminPasswordChange={handleAdminPasswordChange}
                recorderUsers={recorderUsers}
                onRecorderUsersChange={handleRecorderUsersChange}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
