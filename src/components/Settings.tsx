import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppSettings } from '../App';

type SettingsProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
};

function Settings({ settings, onChange }: SettingsProps) {
  const [gapSeconds, setGapSeconds] = useState(settings.gapSeconds);
  const [playbackRate, setPlaybackRate] = useState(settings.playbackRate);

  useEffect(() => {
    setGapSeconds(settings.gapSeconds);
    setPlaybackRate(settings.playbackRate);
  }, [settings.gapSeconds, settings.playbackRate]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextSettings: AppSettings = {
      gapSeconds: Math.max(1, Math.round(gapSeconds)),
      playbackRate: Math.min(3, Math.max(0.5, Number(playbackRate.toFixed(2)))),
    };
    onChange(nextSettings);
  };

  const nextPlayTimes = useMemo(
    () => Array.from({ length: 6 }, (_, index) => index * gapSeconds),
    [gapSeconds],
  );

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-200">הגדרות תזמון</p>
          <h2 className="text-2xl font-semibold">התאמה אישית של זמני השמעה</h2>
          <p className="text-sm text-slate-400">
            הגדירו את ההפרש בין כל אחת מ-6 ההשמעות ואת מהירות ההשמעה המועדפת.
          </p>
        </div>
        <div className="text-right text-sm text-slate-300">
          <p className="text-xs text-slate-500">ברירת מחדל</p>
          <p>30 שניות הפרש | מהירות 1x</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 bg-slate-800/60 border border-slate-800 rounded-xl p-4">
            <span className="text-sm text-slate-300">הפרש בין השמעות (בשניות)</span>
            <input
              type="number"
              min={1}
              value={gapSeconds}
              onChange={event => setGapSeconds(Number(event.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
            />
            <span className="text-xs text-slate-500">השמעה חדשה כל {gapSeconds} שניות עד 6 פעמים.</span>
          </label>

          <label className="flex flex-col gap-2 bg-slate-800/60 border border-slate-800 rounded-xl p-4">
            <span className="text-sm text-slate-300">מהירות השמעה</span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={playbackRate}
              onChange={event => setPlaybackRate(Number(event.target.value))}
              className="accent-emerald-500"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>0.5x</span>
              <span className="text-emerald-200 text-sm font-semibold">{playbackRate.toFixed(1)}x</span>
              <span>3x</span>
            </div>
          </label>
        </div>

        <div className="bg-slate-800/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-emerald-200">תצוגה מקדימה</p>
          <p>6 ההשמעות המתוזמנות יופעלו במרווחים של {gapSeconds} שניות:</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            {nextPlayTimes.map((seconds, index) => (
              <span key={index} className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/80">
                השמעה {index + 1}: T+{seconds}s
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition border border-emerald-500 text-white font-semibold"
          >
            שמירת הגדרות
          </button>
        </div>
      </form>
    </section>
  );
}

export default Settings;
