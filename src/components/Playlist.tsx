import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, Play } from 'lucide-react';
import type { AppSettings, Recording } from '../App';
import { RECORDING_TTL_MS } from '../constants';

type PlaylistProps = {
  recordings: Recording[];
  settings: AppSettings;
  serverOffsetMs: number;
};

type PlaylistItem = Recording & {
  status: 'scheduled' | 'ready' | 'queued' | 'playing' | 'done' | 'error';
  playNumber: number;
  scheduledAt: number;
  playbackRate: number;
  recordingId: string;
  expiresAt: number;
  errorMessage?: string;
  slotNumber: number;
  scheduledOffsetSeconds: number;
};

const MAX_PLAYS = 6;

function Playlist({ recordings, settings, serverOffsetMs }: PlaylistProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const getServerNow = useCallback(() => Date.now() + serverOffsetMs, [serverOffsetMs]);
  const [currentTime, setCurrentTime] = useState(() => getServerNow());
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
      .slice(0, MAX_PLAYS)
      .map(repeat => ({
        gapSeconds: Math.max(0, repeat.gapSeconds),
        playbackRate: Math.min(3, Math.max(0.5, repeat.playbackRate)),
        enabled: repeat.enabled !== false,
      }));

    while (normalized.length < MAX_PLAYS) {
      normalized.push({ gapSeconds: 30, playbackRate: 1, enabled: true });
    }

    if (!normalized.some(repeat => repeat.enabled)) {
      normalized[0].enabled = true;
    }

    return normalized;
  }, [settings.repeatSettings]);

  const scheduleKey = JSON.stringify(sanitizedRepeats);
  const previousScheduleKeyRef = useRef<string>(scheduleKey);
  const scheduledOffsets = useMemo(() => {
    let total = 0;
    return sanitizedRepeats.map(repeat => {
      if (!repeat.enabled) {
        return null;
      }
      total += repeat.gapSeconds;
      return total;
    });
  }, [sanitizedRepeats]);

  const activeRepeats = useMemo(() => {
    let accumulatedMs = 0;
    return sanitizedRepeats
      .map((repeat, index) => ({ ...repeat, slotNumber: index + 1 }))
      .filter(repeat => repeat.enabled)
      .map((repeat, enabledIndex) => {
        accumulatedMs += repeat.gapSeconds * 1000;
        return {
          ...repeat,
          slotNumber: repeat.slotNumber,
          playNumber: enabledIndex + 1,
          scheduledOffsetMs: accumulatedMs,
        };
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

  const stopOtherPlaybacks = (currentId: string) => {
    const stoppedIds = new Set<string>();

    Object.entries(audiosRef.current).forEach(([id, audio]) => {
      if (id !== currentId && audio) {
        audio.pause();
        audio.currentTime = 0;
        audiosRef.current[id] = null;
        stoppedIds.add(id);
      }
    });

    if (stoppedIds.size === 0) return;

    updateItems(prev =>
      prev.map(item =>
        stoppedIds.has(item.id)
          ? { ...item, status: 'queued', errorMessage: undefined }
          : item,
      ),
    );

    stoppedIds.forEach(enqueuePlayback);
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

  const removeRecording = (recordingId: string) => {
    const itemsToRemove = itemsRef.current.filter(item => item.recordingId === recordingId);
    itemsToRemove.forEach(item => removeItem(item.id));
    scheduledRecordingsRef.current.delete(recordingId);
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
    audio.onplay = () => stopOtherPlaybacks(id);

    updateItems(prev => prev.map(item => (item.id === id ? { ...item, status: 'playing', errorMessage: undefined } : item)));
    stopOtherPlaybacks(id);

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

    audio.onerror = () => handleError('Playback failed. Check that the file exists and is supported.');

    try {
      await audio.play();
    } catch (error) {
      console.error('Playback error', error);
      handleError(
        manualTrigger
          ? 'Playback failed. Please try again.'
          : 'The browser blocked autoplay. Retrying automatically.',
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
      updateItems(prev =>
        prev.map(item => (item.id === id ? { ...item, status: 'queued', errorMessage: undefined } : item)),
      );
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

  useEffect(() => {
    if (!getCurrentlyPlayingId() && playbackQueueRef.current.length > 0) {
      startNextInQueue();
    }
  }, [items]);

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
      if (recording.createdAt + RECORDING_TTL_MS <= getServerNow()) {
        removeRecording(recording.id);
        return;
      }

      if (scheduledRecordingsRef.current.has(recording.id)) return;

      scheduledRecordingsRef.current.add(recording.id);
      const baseTime = getServerNow();

      activeRepeats.forEach(repeat => {
        const playId = `${recording.id}-play-${repeat.slotNumber}`;
        const scheduledAt = baseTime + repeat.scheduledOffsetMs;
        const delay = Math.max(0, scheduledAt - getServerNow());

        const newItem: PlaylistItem = {
          ...recording,
          id: playId,
          status: 'scheduled',
          playNumber: repeat.playNumber,
          slotNumber: repeat.slotNumber,
          scheduledAt,
          playbackRate: repeat.playbackRate,
          recordingId: recording.id,
          expiresAt: recording.createdAt + RECORDING_TTL_MS,
          scheduledOffsetSeconds: Math.round(repeat.scheduledOffsetMs / 1000),
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
  }, [activeRepeats, attemptAutoplayUnlock, getServerNow, recordings]);

  useEffect(() => {
    setCurrentTime(getServerNow());
  }, [getServerNow]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(getServerNow());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [getServerNow]);

  useEffect(() => {
    const expiredItems = itemsRef.current.filter(item => item.expiresAt <= currentTime);
    const expiredRecordings = Array.from(
      new Map(
        expiredItems.map(item => [
          item.recordingId,
          {
            id: item.recordingId,
            name: item.name,
            expiredAt: item.expiresAt,
            createdAt: item.createdAt,
            ageSeconds: Math.round((currentTime - item.createdAt) / 1000),
            serverNow: currentTime,
          },
        ]),
      ).values(),
    );

    if (expiredRecordings.length > 0) {
      console.info(
        '[Playlist] Removing expired recordings (server-clock aligned)',
        expiredRecordings,
      );
    }

    expiredRecordings.forEach(recording => removeRecording(recording.id));
  }, [currentTime]);

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
  const enabledPlayCount = Math.max(1, activeRepeats.length);

  return (
    <section className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-emerald-900/10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">Playback</p>
          <h2 className="text-2xl font-semibold">Scheduled queue</h2>
        </div>
        <div className="flex flex-col gap-3 text-sm text-slate-200 md:items-end">
          <div className="flex flex-wrap gap-2 justify-end text-[11px]">
            {sanitizedRepeats.map((repeat, index) => {
              const offset = scheduledOffsets[index];
              const isEnabled = repeat.enabled;
              return (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full border bg-slate-950/60 shadow-inner shadow-emerald-900/30 ${
                    isEnabled ? 'border-slate-700/80 text-emerald-100' : 'border-slate-800 text-slate-500 line-through'
                  }`}
                >
                  {isEnabled && offset !== null
                    ? `Play ${index + 1}: T+${offset}s @ ${repeat.playbackRate.toFixed(2)}x`
                    : `Play ${index + 1}: Disabled`}
                </span>
              );
            })}
          </div>
          <div className="px-3 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-100">
            {enabledPlayCount} plays enabled{enabledPlayCount < MAX_PLAYS ? ` (skipping ${MAX_PLAYS - enabledPlayCount})` : ''}
          </div>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="p-10 border border-dashed border-slate-800 rounded-3xl text-center text-slate-300 bg-slate-900/60">
          No recordings captured yet, or the scheduled play time has not arrived.
        </div>
      ) : (
        <ul className="space-y-4">
          {sortedItems.map(item => (
            <li
              key={item.id}
              className="border border-slate-800 bg-slate-900/80 rounded-3xl p-5 shadow-xl shadow-emerald-900/10 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-lg font-medium text-white">{item.name}</p>
                  <p className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2 text-xs text-slate-200 text-right">
                  <span className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/70 border border-slate-700 shadow-inner shadow-slate-900">
                    <Play className="w-4 h-4" /> {item.playNumber}/{enabledPlayCount || 1}
                  </span>
                  <span className="text-[12px] font-semibold text-emerald-300">{renderCountdown(item.scheduledAt)}</span>
                  <span className="text-[11px] text-slate-500">Slot {item.slotNumber}</span>
                  <span className="text-[11px] text-slate-500">{new Date(item.scheduledAt).toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-200">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-emerald-300" />
                  {item.status === 'playing'
                    ? 'Playing now'
                    : item.status === 'done'
                      ? 'Completed'
                      : item.status === 'scheduled'
                        ? 'Waiting for its time'
                        : item.status === 'queued'
                          ? 'Waiting for current playback'
                          : item.status === 'error'
                            ? 'Error'
                            : 'Ready'}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-4 py-1 rounded-full text-xs border shadow-sm ${
                      item.status === 'playing'
                        ? 'border-emerald-400 text-emerald-100 bg-emerald-500/15'
                        : item.status === 'done'
                          ? 'border-slate-500 text-slate-200 bg-slate-500/10'
                          : item.status === 'error'
                            ? 'border-rose-500 text-rose-200 bg-rose-500/15'
                            : item.status === 'scheduled'
                              ? 'border-slate-700 text-slate-200 bg-slate-700/20'
                              : item.status === 'queued'
                                ? 'border-amber-400 text-amber-100 bg-amber-500/15'
                                : 'border-emerald-400 text-emerald-100 bg-emerald-500/15'
                    }`}
                  >
                    {item.status === 'playing'
                      ? 'Playing'
                      : item.status === 'done'
                        ? 'Finished'
                        : item.status === 'error'
                          ? 'Error'
                          : item.status === 'scheduled'
                            ? 'Scheduled'
                            : item.status === 'queued'
                              ? 'Queued'
                              : 'Ready'}
                  </span>

                  {(item.status === 'ready' || item.status === 'queued' || item.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => retryPlay(item.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-emerald-500/60 text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 transition shadow-sm"
                    >
                      Play now
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>T+{item.scheduledOffsetSeconds}s</span>
                <span>{item.playbackRate.toFixed(2)}x</span>
              </div>

              {item.status === 'error' && item.errorMessage && (
                <div className="flex items-center gap-2 text-rose-200 text-sm bg-rose-500/5 border border-rose-500/40 rounded-xl px-3 py-2">
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
