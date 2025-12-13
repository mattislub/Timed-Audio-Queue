import { useState } from 'react';
import { Settings, SlidersHorizontal } from 'lucide-react';
import { AudioSystem } from './components/AudioSystem';
import { InputPage } from './components/InputPage';
import { LoginPage } from './components/LoginPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activePage, setActivePage] = useState<'system' | 'input'>('system');

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-indigo-500/10 to-transparent blur-3xl" aria-hidden="true" />
      <header className="sticky top-0 z-20 backdrop-blur bg-slate-950/80 border-b border-slate-900/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-emerald-200 uppercase tracking-widest">Timed Audio Queue</p>
              <h1 className="text-xl font-semibold">ניהול השמעות ושליטה בקצב</h1>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/70 hover:border-emerald-500 hover:text-emerald-300 transition"
          >
            <Settings className="w-4 h-4" />
            הגדרות
          </button>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-10">
        {!isAuthenticated ? (
          <LoginPage onLogin={() => setIsAuthenticated(true)} />
        ) : activePage === 'input' ? (
          <InputPage onBack={() => setActivePage('system')} />
        ) : (
          <AudioSystem onNavigateToInput={() => setActivePage('input')} />
        )}
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">ניהול חוויה</p>
                <h2 className="text-xl font-semibold">הגדרות כלליות</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white transition"
                aria-label="סגור הגדרות"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-slate-300 text-sm">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <span>התראות על סיום השמעה</span>
                <button className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs">
                  פעיל
                </button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <span>מצב נגישות גבוה</span>
                <button className="px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 transition">
                  כבוי
                </button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <span>הפעלת רקע דינאמי</span>
                <button className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs">
                  פעיל
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
