import { useMemo, useState } from 'react';
import { Cog, ListMusic, Mic2 } from 'lucide-react';
import Recorder from './components/Recorder';
import Playlist from './components/Playlist';
import Settings from './components/Settings';

export type Recording = {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  createdAt: number;
};

export type RepeatSetting = {
  gapSeconds: number;
  playbackRate: number;
};

export type AppSettings = {
  repeatSettings: RepeatSetting[];
};

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

  const handleNewRecording = (recording: Recording) => {
    setRecordings(prev => [recording, ...prev]);
    setActivePage('playlist');
  };

  const subtitle = useMemo(() => {
    if (activePage === 'record') return 'דף מיוחד להקלטות';
    if (activePage === 'playlist') return 'רשימת השמעה אוטומטית אחרי כל הקלטה';
    return 'התאמה אישית של זמני השמע ומהירות ההשמעה';
  }, [activePage]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Mic2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-200 uppercase tracking-[0.2em]">Timed Audio Queue</p>
              <h1 className="text-xl font-semibold">ניהול הקלטה והשמעות חוזרות</h1>
              <p className="text-sm text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setActivePage('record')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                activePage === 'record'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-emerald-400/50'
              }`}
            >
              <Mic2 className="w-4 h-4" />
              הקלטה
            </button>
            <button
              onClick={() => setActivePage('playlist')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                activePage === 'playlist'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-emerald-400/50'
              }`}
            >
              <ListMusic className="w-4 h-4" />
              רשימת השמעה
            </button>
            <button
              onClick={() => setActivePage('settings')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                activePage === 'settings'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-emerald-400/50'
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
          <Recorder onRecordingReady={handleNewRecording} settings={settings} />
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
