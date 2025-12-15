import { useEffect, useMemo, useState } from 'react';
import { Cog, ListMusic, Mic2 } from 'lucide-react';
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
};

export type AppSettings = {
  repeatSettings: RepeatSetting[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

function buildApiUrl(path: string) {
  if (!API_BASE_URL) return '';

  const trimmed = API_BASE_URL.replace(/\/$/, '');
  const baseWithApi = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;

  return `${baseWithApi}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchRecordings() {
  if (!API_BASE_URL) {
    return [];
  }

  const response = await fetch(buildApiUrl('/sounds'));
  if (!response.ok) {
    console.error('[App] Failed to fetch recordings', response.status, response.statusText);
    return [];
  }

  const data = (await response.json()) as Array<{
    id: string;
    file_name: string;
    file_url: string;
    created_at?: string;
  }>;

  const now = Date.now();

  return data
    .map(
      item =>
        ({
          id: item.id,
          name: item.file_name,
          url: item.file_url,
          createdAt: item.created_at ? new Date(item.created_at).getTime() : now,
        } satisfies Recording),
    )
    .filter(recording => recording.createdAt + RECORDING_TTL_MS > now);
}

function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activePage, setActivePage] = useState<'record' | 'playlist' | 'settings'>('record');
  const [settings, setSettings] = useState<AppSettings>({
    repeatSettings: [
      { gapSeconds: 0, playbackRate: 1 },
      { gapSeconds: 30, playbackRate: 1 },
      { gapSeconds: 30, playbackRate: 1 },
      { gapSeconds: 30, playbackRate: 1 },
      { gapSeconds: 30, playbackRate: 1 },
      { gapSeconds: 30, playbackRate: 1 },
    ],
  });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const latest = await fetchRecordings();
      if (isMounted) {
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
    const latest = await fetchRecordings();
    setRecordings(latest);
    setActivePage('playlist');
  };

  const subtitle = useMemo(() => {
    if (activePage === 'record') return 'התחילו, עצרו ושמרו בלחיצה אחת';
    if (activePage === 'playlist') return 'כל הקלטה נכנסת לתור מסודר';
    return 'קובעים פעם אחת והכול פועל לבד';
  }, [activePage]);

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
              <h1 className="text-xl font-semibold">תזמון הקלטות בקלות</h1>
              <p className="text-sm text-slate-300">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-900/70 border border-slate-800 rounded-full p-1 shadow-inner">
            <button
              onClick={() => setActivePage('record')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                activePage === 'record'
                  ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Mic2 className="w-4 h-4" />
              הקלטה
            </button>
            <button
              onClick={() => setActivePage('playlist')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                activePage === 'playlist'
                  ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ListMusic className="w-4 h-4" />
              השמעות
            </button>
            <button
              onClick={() => setActivePage('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition ${
                activePage === 'settings'
                  ? 'bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cog className="w-4 h-4" />
              הגדרות
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <div className={activePage === 'record' ? 'block' : 'hidden'} aria-hidden={activePage !== 'record'}>
          <Recorder onRecordingSaved={refreshRecordings} settings={settings} />
        </div>
        <div className={activePage === 'playlist' ? 'block' : 'hidden'} aria-hidden={activePage !== 'playlist'}>
          <Playlist recordings={recordings} settings={settings} />
        </div>
        <div className={activePage === 'settings' ? 'block' : 'hidden'} aria-hidden={activePage !== 'settings'}>
          <Settings settings={settings} onChange={setSettings} />
        </div>
      </main>
    </div>
  );
}

export default App;
