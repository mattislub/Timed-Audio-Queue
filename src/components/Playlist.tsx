import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Play } from 'lucide-react';
import type { AppSettings, Recording } from '../App';

type PlaylistProps = {
  recordings: Recording[];
  settings: AppSettings;
};

type PlaylistItem = Recording & {
  status: 'scheduled' | 'ready' | 'playing' | 'done' | 'error';
  playNumber: number;
  scheduledAt: number;
  playbackRate: number;
  errorMessage?: string;
};

const TOTAL_PLAYS = 6;

function Playlist({ recordings, settings }: PlaylistProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const timersRef = useRef<Record<string, number | undefined>>({});
  const retryTimersRef = useRef<Record<string, number | undefined>>({});
  const audiosRef = useRef<Record<string, HTMLAudioElement | null>>({});
  const itemsRef = useRef<PlaylistItem[]>([]);
  const scheduledRecordingsRef = useRef<Set<string>>(new Set());
  const pendingAutoplayRef = useRef<Set<string>>(new Set());
  const autoplayUnlockedRef = useRef(false);

  const updateItems = (updater: (prev: PlaylistItem[]) => PlaylistItem[]) => {
    setItems(prev => {
      const next = updater(prev);
      itemsRef.current = next;
      return next;
    });
  };
  const getItem = (id: string) => itemsRef.current.find(item => item.id === id);
  const playbackQueueRef = useRef<string[]>([]);
  const sanitizedRepeats = useMemo(() => {
    const normalized = settings.repeatSettings
      .slice(0, TOTAL_PLAYS)
      .map(repeat => ({
        gapSeconds: Math.max(0, repeat.gapSeconds),
        playbackRate: Math.min(3, Math.max(0.5, repeat.playbackRate)),
      }));

    while (normalized.length < TOTAL_PLAYS) {
      normalized.push({ gapSeconds: 30, playbackRate: 1 });
    }

    return normalized;
  }, [settings.repeatSettings]);

  const scheduleKey = JSON.stringify(sanitizedRepeats);
  const previousScheduleKeyRef = useRef<string>(scheduleKey);
  const scheduledOffsets = useMemo(() => {
    let total = 0;
    return sanitizedRepeats.map(repeat => {
      total += repeat.gapSeconds;
      return total;
    });
  }, [sanitizedRepeats]);

  const enqueuePlayback = (id: string) => {
    if (playbackQueueRef.current.includes(id)) return;
    playbackQueueRef.current.push(id);
  };

  const dequeuePlayback = () => playbackQueueRef.current.shift();

  const removeFromQueue = (id: string) => {
    playbackQueueRef.current = playbackQueueRef.current.filter(queuedId => queuedId !== id);
  };

  const getCurrentlyPlayingId = () => itemsRef.current.find(item => item.status === 'playing')?.id;

  const removeItem = (id: string) => {
    const existingTimer = timersRef.current[id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const retryTimer = retryTimersRef.current[id];
    if (retryTimer) {
      window.clearTimeout(retryTimer);
    }

    const audio = audiosRef.current[id];
    audio?.pause();

    delete timersRef.current[id];
    delete retryTimersRef.current[id];
    delete audiosRef.current[id];
    pendingAutoplayRef.current.delete(id);
    removeFromQueue(id);

    updateItems(prev => prev.filter(item => item.id !== id));
  };

  const queueRetry = (id: string, delay = 2000) => {
    const existing = retryTimersRef.current[id];
    if (existing) {
      window.clearTimeout(existing);
    }

    retryTimersRef.current[id] = window.setTimeout(() => {
      playWhenAvailable(id);
    }, delay);
  };

  const playOnce = async (id: string, manualTrigger = false) => {
    const currentItem = getItem(id);
    if (!currentItem) return;

    const existingTimer = timersRef.current[id];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete timersRef.current[id];
    }

    const existingAudio = audiosRef.current[id];
    const audio = existingAudio ?? new Audio(currentItem.url);
    audio.currentTime = 0;
    audio.playbackRate = currentItem.playbackRate;
    audiosRef.current[id] = audio;

    updateItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'playing', errorMessage: undefined } : item)));

    const handleError = (message: string, shouldQueueAutoplay = false, shouldRetry = false) => {
      audiosRef.current[id] = null;
      updateItems(prev =>
        prev.map(item =>
          item.id === id
            ? {
                ...item,
                status: shouldRetry ? 'ready' : 'error',
                errorMessage: message,
              }
            : item,
        ),
      );

      if (shouldQueueAutoplay) {
        pendingAutoplayRef.current.add(id);
      }

      if (shouldRetry) {
        queueRetry(id);
        return;
      }

      removeItem(id);
      startNextInQueue();
    };

    audio.onended = () => {
      audiosRef.current[id] = null;
      updateItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'done' } : item)));
      removeItem(id);
      startNextInQueue();
    };

    audio.onerror = () => handleError('השמעה נכשלה. בדקו שהקובץ קיים ונתמך.');

    try {
      await audio.play();
    } catch (error) {
      console.error('Playback error', error);
      handleError(
        manualTrigger
          ? 'ההשמעה נכשלה. נסו שוב.'
          : 'הדפדפן חסם השמעה אוטומטית. מנסים שוב אוטומטית.',
        !manualTrigger,
        !manualTrigger,
      );

      if (!manualTrigger) {
        attemptAutoplayUnlock();
      }
    }
  };

  const retryPlay = (id: string) => {
    playWhenAvailable(id, true);
  };

  const playWhenAvailable = (id: string, manualTrigger = false) => {
    const currentlyPlayingId = getCurrentlyPlayingId();

    if (currentlyPlayingId && currentlyPlayingId !== id) {
      enqueuePlayback(id);
      return;
    }

    removeFromQueue(id);
    playOnce(id, manualTrigger);
  };

  const startNextInQueue = () => {
    const nextId = dequeuePlayback();
    if (nextId) {
      playWhenAvailable(nextId);
    }
  };

  const retryPendingAutoplay = useCallback(() => {
    const pending = Array.from(pendingAutoplayRef.current);
    pendingAutoplayRef.current.clear();
    pending.forEach(pendingId => playWhenAvailable(pendingId, true));
  }, []);

  const attemptAutoplayUnlock = useCallback(() => {
    if (autoplayUnlockedRef.current) return;

    autoplayUnlockedRef.current = true;
    const silentAudio = new Audio();
    silentAudio.muted = true;
    silentAudio.play().catch(() => undefined).finally(() => {
      retryPendingAutoplay();
    });
  }, [retryPendingAutoplay]);

  useEffect(() => {
    if (previousScheduleKeyRef.current !== scheduleKey) {
      Object.values(timersRef.current).forEach(timeoutId => window.clearTimeout(timeoutId));
      Object.values(retryTimersRef.current).forEach(timeoutId => window.clearTimeout(timeoutId));
      Object.values(audiosRef.current).forEach(audio => audio?.pause());
      timersRef.current = {};
      retryTimersRef.current = {};
      audiosRef.current = {};
      pendingAutoplayRef.current.clear();
      playbackQueueRef.current = [];
      scheduledRecordingsRef.current.clear();
      updateItems(() => []);
      previousScheduleKeyRef.current = scheduleKey;
    }
  }, [scheduleKey]);

  useEffect(() => {
    recordings.forEach(recording => {
      if (scheduledRecordingsRef.current.has(recording.id)) return;

      scheduledRecordingsRef.current.add(recording.id);
      const baseTime = Date.now();

      let accumulatedMs = 0;

      sanitizedRepeats.forEach((repeat, index) => {
        accumulatedMs += repeat.gapSeconds * 1000;
        const playNumber = index + 1;
        const playId = `${recording.id}-play-${playNumber}`;
        const scheduledAt = baseTime + accumulatedMs;
        const delay = Math.max(0, scheduledAt - Date.now());

        const newItem: PlaylistItem = {
          ...recording,
          id: playId,
          status: 'scheduled',
          playNumber,
          scheduledAt,
          playbackRate: repeat.playbackRate,
        };

        updateItems(prev => [...prev, newItem]);

        const timeoutId = window.setTimeout(() => {
          updateItems(prev =>
            prev.map(item => (item.id === playId ? { ...item, status: 'ready' } : item)),
          );
          playWhenAvailable(playId);
        }, delay);

        timersRef.current[playId] = timeoutId;
      });

      attemptAutoplayUnlock();
    });
  }, [attemptAutoplayUnlock, recordings, sanitizedRepeats]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(timeoutId => window.clearTimeout(timeoutId));
      Object.values(retryTimersRef.current).forEach(timeoutId => window.clearTimeout(timeoutId));
      Object.values(audiosRef.current).forEach(audio => audio?.pause());
    },
    [],
  );

  useEffect(() => {
    const unlockHandler = () => attemptAutoplayUnlock();
    window.addEventListener('pointerdown', unlockHandler, { once: true });
    window.addEventListener('keydown', unlockHandler, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
    };
  }, [attemptAutoplayUnlock]);

  const renderCountdown = (scheduledAt: number) => {
    const remaining = Math.max(0, scheduledAt - currentTime);
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');

    return `${minutes}:${seconds}`;
  };

  const sortedItems = [...items].sort((a, b) => a.scheduledAt - b.scheduledAt || a.playNumber - b.playNumber);

  return (
    <section className="space-y-4">
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-emerald-200">רשימת השמעה</p>
          <h2 className="text-2xl font-semibold">כל קובץ נכנס לתור אוטומטי</h2>
          <p className="text-sm text-slate-400">ההשמעות מתוזמנות מראש ומופעלות לבד כשהזמן מגיע.</p>
        </div>
        <div className="text-sm text-slate-300 text-right space-y-2">
          <div className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700">סה"כ {TOTAL_PLAYS} השמעות לכל קובץ</div>
          <div className="flex flex-wrap gap-2 justify-end text-[11px] text-slate-200">
            {sanitizedRepeats.map((repeat, index) => (
              <span
                key={index}
                className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/70 text-right"
              >
                {index + 1}: T+{scheduledOffsets[index]}s @ {repeat.playbackRate.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="p-6 border border-dashed border-slate-800 rounded-2xl text-center text-slate-400">
          טרם הוקלטו קבצים, או שזמן ההשמעה המתוזמן טרם הגיע.
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {sortedItems.map(item => (
            <li key={item.id} className="border border-slate-800 bg-slate-900/70 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm text-slate-100">{item.name}</p>
                  <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-slate-200 text-right">
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800/70 border border-slate-700">
                    <Play className="w-4 h-4" /> {item.playNumber}/{TOTAL_PLAYS}
                  </span>
                  <span className="text-[11px] text-emerald-300">{renderCountdown(item.scheduledAt)}</span>
                  <span className="text-[11px] text-slate-500">{new Date(item.scheduledAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-emerald-300" />
                  {item.status === 'playing'
                    ? 'משמיע כעת'
                    : item.status === 'done'
                      ? 'הושלם'
                      : item.status === 'scheduled'
                        ? 'מחכה לזמן שלו'
                        : item.status === 'error'
                          ? 'שגיאה'
                          : 'מוכן'}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs border ${
                      item.status === 'playing'
                        ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10'
                        : item.status === 'done'
                          ? 'border-slate-500 text-slate-200 bg-slate-500/10'
                          : item.status === 'error'
                            ? 'border-rose-500 text-rose-200 bg-rose-500/10'
                            : item.status === 'scheduled'
                              ? 'border-slate-700 text-slate-200 bg-slate-700/20'
                              : 'border-emerald-400 text-emerald-200 bg-emerald-500/10'
                    }`}
                  >
                    {item.status === 'playing'
                      ? 'מתנגן'
                      : item.status === 'done'
                        ? 'הסתיים'
                        : item.status === 'error'
                          ? 'שגיאה'
                          : item.status === 'scheduled'
                            ? 'מתוזמן'
                            : 'מוכן'}
                  </span>

                  {(item.status === 'ready' || item.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => retryPlay(item.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-emerald-500/60 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                    >
                      נגן עכשיו
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>T+{scheduledOffsets[item.playNumber - 1]}s</span>
                <span>{item.playbackRate.toFixed(2)}x</span>
              </div>

              {item.status === 'error' && item.errorMessage && (
                <div className="flex items-center gap-2 text-rose-200 text-sm">
                  <AlertTriangle className="w-4 h-4" /> {item.errorMessage}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Playlist;
