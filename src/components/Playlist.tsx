import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Play } from 'lucide-react';
import type { Recording } from '../App';

type PlaylistProps = {
  recordings: Recording[];
};

type PlaylistItem = Recording & {
  status: 'ready' | 'playing' | 'waiting' | 'done' | 'error';
  playsCompleted: number;
  nextPlayTime: number | null;
  errorMessage?: string;
};

const TOTAL_PLAYS = 6;
const GAP_MS = 30_000;

function formatCountdown(target: number | null) {
  if (!target) return '00:00';
  const now = Date.now();
  const seconds = Math.max(0, Math.round((target - now) / 1000));
  const minutesPart = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secondsPart = (seconds % 60).toString().padStart(2, '0');
  return `${minutesPart}:${secondsPart}`;
}

function Playlist({ recordings }: PlaylistProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const timersRef = useRef<Record<string, number | undefined>>({});
  const audiosRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const itemsRef = useRef<PlaylistItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const getItem = (id: string) => itemsRef.current.find(item => item.id === id);

  const scheduleNextPlay = (id: string, delay: number) => {
    window.clearTimeout(timersRef.current[id]);
    const runAt = Date.now() + delay;
    timersRef.current[id] = window.setTimeout(() => playOnce(id), delay);
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, status: 'waiting', nextPlayTime: runAt } : item)),
    );
  };

  const playOnce = async (id: string) => {
    const currentItem = getItem(id);
    if (!currentItem || currentItem.playsCompleted >= TOTAL_PLAYS) return;

    const audio = new Audio(currentItem.url);
    audiosRef.current[id] = audio;

    setItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'playing', nextPlayTime: null } : item)));

    const handleError = (message: string) => {
      setItems(prev =>
        prev.map(item => (item.id === id ? { ...item, status: 'error', errorMessage: message } : item)),
      );
    };

    audio.onended = () => {
      setItems(prev => {
        const nextItems = prev.map(item => {
          if (item.id !== id) return item;

          const updatedCount = item.playsCompleted + 1;
          return {
            ...item,
            playsCompleted: updatedCount,
            status: updatedCount >= TOTAL_PLAYS ? 'done' : 'waiting',
          };
        });

        const updated = nextItems.find(item => item.id === id);
        if (updated && updated.playsCompleted < TOTAL_PLAYS) {
          scheduleNextPlay(id, GAP_MS);
        }

        return nextItems;
      });
    };

    audio.onerror = () => handleError('השמעה נכשלה. בדקו שהקובץ קיים ונתמך.');

    try {
      await audio.play();
    } catch (error) {
      console.error('Playback error', error);
      handleError('לא ניתן להתחיל השמעה.');
    }
  };

  useEffect(() => {
    recordings.forEach(recording => {
      const exists = itemsRef.current.some(item => item.id === recording.id);
      if (!exists) {
        const newItem: PlaylistItem = {
          ...recording,
          status: 'ready',
          playsCompleted: 0,
          nextPlayTime: Date.now(),
        };
        setItems(prev => [newItem, ...prev]);
        scheduleNextPlay(recording.id, 0);
      }
    });
  }, [recordings]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(timeoutId => window.clearTimeout(timeoutId));
      Object.values(audiosRef.current).forEach(audio => audio?.pause());
    },
    [],
  );

  const activeCounters = useMemo(() => items.map(item => ({ id: item.id, target: item.nextPlayTime })), [items]);

  return (
    <section className="space-y-4">
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-200">רשימת השמעה</p>
          <h2 className="text-2xl font-semibold">כל הקלטה מושמעת 6 פעמים עם השהיה של 30 שניות</h2>
          <p className="text-sm text-slate-400">ההפעלה הראשונה מתחילה מיד לאחר שמירת ההקלטה, ולאחר מכן השהיה קבועה.</p>
        </div>
        <div className="text-sm text-slate-400">סה"כ {TOTAL_PLAYS} השמעות לכל קובץ</div>
      </div>

      {items.length === 0 ? (
        <div className="p-6 border border-dashed border-slate-800 rounded-2xl text-center text-slate-400">
          טרם הוקלטו קבצים. התחילו בדף ההקלטה כדי להזרים אותם לכאן אוטומטית.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map(item => {
            const countdown = formatCountdown(item.nextPlayTime);
            const progress = Math.round((item.playsCompleted / TOTAL_PLAYS) * 100);

            return (
              <li key={item.id} className="border border-slate-800 bg-slate-900/70 rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-300">{item.name}</p>
                    <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Play className="w-4 h-4" /> {item.playsCompleted}/{TOTAL_PLAYS}
                  </div>
                </div>

                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${item.status === 'done' ? 'bg-emerald-500' : 'bg-emerald-400/80'}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm text-slate-300">
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-emerald-300" />
                    {item.status === 'playing'
                      ? 'משמיע כעת'
                      : item.status === 'done'
                        ? 'ההשמעות הושלמו'
                        : `הפעלה הבאה בעוד ${countdown}`}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs border ${
                      item.status === 'playing'
                        ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10'
                        : item.status === 'waiting'
                          ? 'border-sky-400 text-sky-200 bg-sky-500/10'
                          : item.status === 'done'
                            ? 'border-slate-500 text-slate-200 bg-slate-500/10'
                            : item.status === 'error'
                              ? 'border-rose-500 text-rose-200 bg-rose-500/10'
                              : 'border-slate-700 text-slate-200 bg-slate-700/20'
                    }`}
                  >
                    {item.status === 'playing'
                      ? 'מתנגן'
                      : item.status === 'waiting'
                        ? 'ממתין'
                        : item.status === 'done'
                          ? 'הסתיים'
                          : item.status === 'error'
                            ? 'שגיאה'
                            : 'מוכן'}
                  </span>
                </div>

                {item.status === 'error' && item.errorMessage && (
                  <div className="flex items-center gap-2 text-rose-200 text-sm">
                    <AlertTriangle className="w-4 h-4" /> {item.errorMessage}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CountdownTicker activeCounters={activeCounters} />
    </section>
  );
}

function CountdownTicker({
  activeCounters,
}: {
  activeCounters: { id: string; target: number | null }[];
}) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => forceRender(prev => prev + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="text-xs text-slate-500 text-center">
      {activeCounters.some(counter => counter.target)
        ? 'השעונים מתעדכנים בזמן אמת כל שנייה'
        : 'הקלטות יופיעו כאן ויתוזמנו להשמעה אוטומטית'}
    </div>
  );
}

export default Playlist;
