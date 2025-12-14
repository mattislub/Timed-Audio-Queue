import { useMemo, useState } from 'react';
import { ListMusic, Mic2 } from 'lucide-react';
import Recorder from './components/Recorder';
import Playlist from './components/Playlist';

export type Recording = {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  createdAt: number;
};

function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activePage, setActivePage] = useState<'record' | 'playlist'>('record');

  const handleNewRecording = (recording: Recording) => {
    setRecordings(prev => [recording, ...prev]);
    setActivePage('playlist');
  };

  const subtitle = useMemo(() => {
    return activePage === 'record'
      ? 'דף מיוחד להקלטות'
      : 'רשימת השמעה אוטומטית אחרי כל הקלטה';
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
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {activePage === 'record' ? (
          <Recorder onRecordingReady={handleNewRecording} />
        ) : (
          <Playlist recordings={recordings} />
        )}
      </main>
    </div>
  );
}

export default App;
