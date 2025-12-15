import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppSettings, RepeatSetting } from '../App';

type SettingsProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
};

function Settings({ settings, onChange }: SettingsProps) {
  const [repeatSettings, setRepeatSettings] = useState<RepeatSetting[]>(settings.repeatSettings);

  useEffect(() => {
    setRepeatSettings(settings.repeatSettings);
  }, [settings.repeatSettings]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const sanitizedRepeats: RepeatSetting[] = repeatSettings.slice(0, 6).map(repeat => ({
      gapSeconds: Math.max(0, Math.round(repeat.gapSeconds)),
      playbackRate: Math.min(3, Math.max(0.5, Number(repeat.playbackRate.toFixed(2)))),
    }));

    while (sanitizedRepeats.length < 6) {
      sanitizedRepeats.push({ gapSeconds: 30, playbackRate: 1 });
    }

    onChange({ repeatSettings: sanitizedRepeats });
  };

  const nextPlayTimes = useMemo(() => {
    const times: number[] = [];
    let total = 0;
    repeatSettings.forEach((repeat, index) => {
      total += Math.max(0, repeat.gapSeconds);
      times[index] = total;
    });
    return times;
  }, [repeatSettings]);

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-200">הגדרות תזמון</p>
          <h2 className="text-2xl font-semibold">התאמה אישית של זמני השמעה</h2>
          <p className="text-sm text-slate-400">הגדירו לכל אחת מ-6 ההשמעות את המרווח והמהירות הרצויה.</p>
        </div>
        <div className="text-right text-sm text-slate-300">
          <p className="text-xs text-slate-500">ברירת מחדל</p>
          <p>השמעה ראשונה מיידית, ולאחר מכן 30 שניות הפרש | מהירות 1x</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-2">
          {repeatSettings.map((repeat, index) => (
            <div key={index} className="space-y-3 bg-slate-800/60 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span className="font-semibold text-emerald-200">השמעה {index + 1}</span>
                <span className="text-xs text-slate-500">מרחק עד השמעה זו</span>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-slate-300">הפרש בשניות עד השמעה {index + 1}</span>
                <input
                  type="number"
                  min={0}
                  value={repeat.gapSeconds}
                  onChange={event => {
                    const next = [...repeatSettings];
                    next[index] = { ...repeat, gapSeconds: Number(event.target.value) };
                    setRepeatSettings(next);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm text-slate-300">מהירות השמעה</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={repeat.playbackRate}
                  onChange={event => {
                    const next = [...repeatSettings];
                    next[index] = { ...repeat, playbackRate: Number(event.target.value) };
                    setRepeatSettings(next);
                  }}
                  className="accent-emerald-500"
                />
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>0.5x</span>
                  <span className="text-emerald-200 text-sm font-semibold">{repeat.playbackRate.toFixed(1)}x</span>
                  <span>3x</span>
                </div>
              </label>
            </div>
          ))}
        </div>

        <div className="bg-slate-800/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 space-y-2">
          <p className="font-semibold text-emerald-200">תצוגה מקדימה</p>
          <p>6 ההשמעות המתוזמנות יופעלו במרווחים מוגדרים מראש עבור כל השמעה:</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
            {nextPlayTimes.map((seconds, index) => (
              <span key={index} className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/80">
                השמעה {index + 1}: T+{seconds}s @ {repeatSettings[index].playbackRate.toFixed(1)}x
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
