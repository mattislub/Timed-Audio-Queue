import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Trash2, Clock, Send, Settings, Square, Mic } from 'lucide-react';
import { deleteSound, fetchSounds, type Sound, updateSound } from '../lib/api';
import { ShareSounds } from './ShareSounds';

interface AudioSystemProps {
  onNavigateToInput: () => void;
}

export function AudioSystem({ onNavigateToInput }: AudioSystemProps) {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [timeUntilNextPlay, setTimeUntilNextPlay] = useState<Record<string, number>>({});
  const [selectedSoundForSettings, setSelectedSoundForSettings] = useState<string | null>(null);
  const [showSharePage, setShowSharePage] = useState(false);
  const [playbackSpeeds, setPlaybackSpeeds] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const formatCountdown = (totalSeconds: number) => {
    const clamped = Math.max(0, totalSeconds);
    const minutes = Math.floor(clamped / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (clamped % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `${timestamp} – ${message}`;

    setDebugLogs(prev => [formatted, ...prev].slice(0, 100));
    console.log(`[AudioSystem] ${formatted}`);
  }, []);

  const getMimeFromUrl = useCallback((url: string) => {
    const extension = url.split('.').pop()?.split('?')[0]?.toLowerCase();
    switch (extension) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'webm':
        return 'audio/webm';
      default:
        return undefined;
    }
  }, []);

  const getSecureAudioUrl = useCallback(
    (url: string) => {
      try {
        const parsed = new URL(url);

        if (parsed.protocol === 'http:') {
          parsed.protocol = 'https:';
          addDebugLog(`שודרג מקור שמע ל-HTTPS עבור ${parsed.href}`);
        }

        return parsed.href;
      } catch (error) {
        console.warn('Failed to normalize audio URL', error);
        return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
      }
    },
    [addDebugLog],
  );

  const isSourceSupported = useCallback(
    (audioEl: HTMLAudioElement, url: string) => {
      const mime = getMimeFromUrl(url);
      if (!mime) return true;

      const support = audioEl.canPlayType(mime);
      return support === 'probably' || support === 'maybe';
    },
    [getMimeFromUrl]
  );

  const waitForAudioReady = useCallback(async (audioEl: HTMLAudioElement) => {
    await new Promise<void>((resolve, reject) => {
      let timeoutId: number | undefined;

      const onCanPlay = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('הקובץ לא נתמך או לא נטען בהצלחה.'));
      };

      const cleanup = () => {
        audioEl.removeEventListener('canplaythrough', onCanPlay);
        audioEl.removeEventListener('error', onError);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      audioEl.addEventListener('canplaythrough', onCanPlay, { once: true });
      audioEl.addEventListener('error', onError, { once: true });

      audioEl.load();
      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('הטענת הקובץ חרגה מהזמן המותר.'));
      }, 7000);
    });
  }, []);

  const updateCountdownTimers = useCallback(() => {
    const now = new Date().getTime();
    const newCountdowns: Record<string, number> = {};

    sounds.forEach(sound => {
      if (!sound.is_playing && sound.plays_completed < sound.total_plays) {
        const nextPlayTime = new Date(sound.next_play_at).getTime();
        const timeLeft = Math.max(0, Math.ceil((nextPlayTime - now) / 1000));
        newCountdowns[sound.id] = timeLeft;
      }
    });

    setTimeUntilNextPlay(newCountdowns);
  }, [sounds]);

  const startPlayback = useCallback(async (soundId: string, freshSound?: Sound) => {
    const sound = freshSound ?? sounds.find(s => s.id === soundId);
    if (!sound || sound.is_playing || sound.plays_completed >= sound.total_plays) return;

    const nextPlayTime = new Date(sound.next_play_at).getTime();
    if (Date.now() < nextPlayTime) {
      const waitSeconds = Math.ceil((nextPlayTime - Date.now()) / 1000);
      addDebugLog(
        `ניסיון הפעלה נדחה עבור ${sound.file_name}. יש להמתין עוד ${waitSeconds} שניות כדי לשמור על מרווח של 30 שניות בין השמעות`,
      );
      return;
    }

    if (!sound.file_url) {
      setLoadError('קובץ השמע לא נמצא. נסו להעלות מחדש.');
      addDebugLog(`הפעלה נכשלה: חסר קובץ שמע עבור ${sound.file_name}`);
      return;
    }

    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!isSourceSupported(audioEl, sound.file_url)) {
      setLoadError('פורמט הקובץ אינו נתמך על ידי הדפדפן. נסו להעלות קובץ אחר.');
      addDebugLog(`הפעלה נכשלה: פורמט לא נתמך (${sound.file_url})`);
      await updateSound(soundId, {
        is_playing: false,
        next_play_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });
      return;
    }

    const speeds =
      playbackSpeeds[soundId] ||
      freshSound?.playback_speeds ||
      ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
    const currentSpeed = parseFloat(speeds[sound.plays_completed] || '1.0');

    addDebugLog(`מנסה להפעיל ${sound.file_name} (${sound.id}) במהירות ${currentSpeed}x`);
    addDebugLog(`כתובת ההקלטה להשמעה: ${sound.file_url}`);
    setCurrentlyPlaying(soundId);
    await updateSound(soundId, { is_playing: true });

    try {
      audioEl.pause();
      audioEl.currentTime = 0;
      const playbackUrl = getSecureAudioUrl(sound.file_url);
      audioEl.src = encodeURI(playbackUrl);
      audioEl.playbackRate = currentSpeed;
      await waitForAudioReady(audioEl);
      await audioEl.play();
      setLoadError(null);
      addDebugLog(`ההשמעה התחילה בהצלחה עבור ${sound.file_name}`);
    } catch (error) {
      console.error('Playback error:', error);
      addDebugLog(`שגיאת הפעלה עבור ${sound.file_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoadError('הקובץ לא ניתן להשמעה. בדקו את פורמט הקובץ או נסו להעלות מחדש.');
      setCurrentlyPlaying(null);
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.src = '';
      await updateSound(soundId, {
        is_playing: false,
        next_play_at: new Date(Date.now() + 30 * 1000).toISOString(),
      });
    }
  }, [addDebugLog, getSecureAudioUrl, isSourceSupported, playbackSpeeds, sounds, waitForAudioReady]);

  const loadSounds = useCallback(async () => {
    try {
      addDebugLog('טוען רשימת קבצי שמע מהשרת');
      const data = await fetchSounds();
      setLoadError(null);
      setSounds(data);
      addDebugLog(`הטענה הצליחה: נמצאו ${data.length} קבצי שמע`);
      const speeds: Record<string, string[]> = {};
      data.forEach(sound => {
        speeds[sound.id] = sound.playback_speeds || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
      });
      setPlaybackSpeeds(speeds);

      for (const sound of data) {
        if (!sound.is_playing && sound.plays_completed < sound.total_plays) {
          const now = new Date().getTime();
          const nextPlayTime = new Date(sound.next_play_at).getTime();

          if (now >= nextPlayTime && !currentlyPlaying) {
            await startPlayback(sound.id, sound);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load sounds', error);
      addDebugLog(`טעינת קבצים נכשלה: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoadError(error instanceof Error ? error.message : 'Unable to load sounds.');
      setSounds([]);
    }
  }, [addDebugLog, currentlyPlaying, startPlayback]);

  const stopPlayback = useCallback(
    async (soundId: string) => {
      const audioEl = audioRef.current;
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }

      setCurrentlyPlaying(null);
      addDebugLog(`עצירת השמעה יזומה עבור ${soundId}. מתזמן ניסיון נוסף בעוד 30 שניות`);

      const retryAt = new Date(Date.now() + 30 * 1000).toISOString();

      await updateSound(soundId, {
        is_playing: false,
        next_play_at: retryAt,
      });

      await loadSounds();
    },
    [addDebugLog, loadSounds]
  );

  const handlePlaybackEnd = useCallback(async () => {
    if (!currentlyPlaying) return;

    const sound = sounds.find(s => s.id === currentlyPlaying);
    if (!sound) {
      addDebugLog(`סיום השמעה עבור מזהה לא ידוע: ${currentlyPlaying}`);
      return;
    }

    const newPlaysCompleted = sound.plays_completed + 1;
    const hasMorePlays = newPlaysCompleted < sound.total_plays;

    if (hasMorePlays) {
      const nextPlayTime = new Date(Date.now() + 30 * 1000);
      await updateSound(currentlyPlaying, {
        plays_completed: newPlaysCompleted,
        is_playing: false,
        next_play_at: nextPlayTime.toISOString(),
      });
      addDebugLog(`ההשמעה הסתיימה (${sound.file_name}). תוזמנה השמעה נוספת בעוד 30 שניות`);
    } else {
      await updateSound(currentlyPlaying, {
        plays_completed: newPlaysCompleted,
        is_playing: false,
      });
      addDebugLog(`ההשמעה הסתיימה (${sound.file_name}). הושלמו כל ההשמעות`);

      try {
        await deleteSound(currentlyPlaying);
        setSounds(prev => prev.filter(item => item.id !== currentlyPlaying));
        setTimeUntilNextPlay(prev => {
          const { [currentlyPlaying]: _removed, ...rest } = prev;
          return rest;
        });
        setPlaybackSpeeds(prev => {
          const { [currentlyPlaying]: _removed, ...rest } = prev;
          return rest;
        });
        addDebugLog(`הקובץ ${sound.file_name} נמחק אוטומטית לאחר ${sound.total_plays} השמעות`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        addDebugLog(`מחיקה אוטומטית נכשלה עבור ${sound.file_name}: ${message}`);
        await updateSound(currentlyPlaying, {
          plays_completed: newPlaysCompleted,
          is_playing: false,
        });
      }
    }

    setCurrentlyPlaying(null);
    await loadSounds();
  }, [addDebugLog, currentlyPlaying, loadSounds, sounds]);

  useEffect(() => {
    loadSounds();
    const interval = setInterval(loadSounds, 1000);
    return () => clearInterval(interval);
  }, [loadSounds]);

  useEffect(() => {
    if (currentlyPlaying && audioRef.current) {
      const audioEl = audioRef.current;
      audioEl.addEventListener('ended', handlePlaybackEnd);
      return () => audioEl.removeEventListener('ended', handlePlaybackEnd);
    }
  }, [currentlyPlaying, handlePlaybackEnd]);

  useEffect(() => {
    updateCountdownTimers();
    const interval = setInterval(updateCountdownTimers, 1000);
    return () => clearInterval(interval);
  }, [updateCountdownTimers]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleAudioError = () => {
      const { error } = audioEl;
      const htmlMediaErrorMessages: Record<number, string> = {
        1: 'המשתמש ביטל את ההשמעה',
        2: 'שגיאת רשת בזמן הטעינה',
        3: 'קידוד קובץ לא נתמך',
        4: 'לא ניתן לטעון מקור שמע',
      };

      const message = error
        ? `קוד שגיאה ${error.code}: ${htmlMediaErrorMessages[error.code] || 'לא ידוע'}`
        : 'שגיאת שמע לא מזוהה';
      addDebugLog(`אירעה שגיאה בנגן: ${message}`);
    };

    audioEl.addEventListener('error', handleAudioError);
    return () => audioEl.removeEventListener('error', handleAudioError);
  }, [addDebugLog]);

  const deleteSoundItem = async (id: string) => {
    const sound = sounds.find(item => item.id === id);
    const confirmationMessage =
      `למחוק את "${sound?.file_name ?? 'ההקלטה'}"? הפעולה תמחק את כל נתוני ההשמעה שלה.`;

    if (!window.confirm(confirmationMessage)) return;

    try {
      if (currentlyPlaying === id && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setCurrentlyPlaying(null);
      }

      await deleteSound(id);
      setSounds(prev => prev.filter(soundItem => soundItem.id !== id));
      setSelectedSoundForSettings(prev => (prev === id ? null : prev));
      setTimeUntilNextPlay(prev => {
        const { [id]: _deletedCountdown, ...rest } = prev;
        return rest;
      });
      addDebugLog(`הקובץ נמחק: ${sound?.file_name ?? id}`);
    } catch (error) {
      alert('Error deleting sound: ' + (error instanceof Error ? error.message : 'Unknown error'));
      addDebugLog(`מחיקה נכשלה עבור ${sound?.file_name ?? id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const updatePlaybackSpeed = async (soundId: string, playIndex: number, speed: string) => {
    const newSpeeds = [...(playbackSpeeds[soundId] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'])];
    newSpeeds[playIndex] = speed;
    setPlaybackSpeeds({ ...playbackSpeeds, [soundId]: newSpeeds });

    await updateSound(soundId, { playback_speeds: newSpeeds });
    addDebugLog(`עודכנה מהירות השמעה ${playIndex + 1} עבור ${soundId} ל-${speed}x`);
  };

  if (showSharePage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-emerald-200">שיתוף השמעות</p>
            <h2 className="text-2xl font-semibold">שיתוף קבצי שמע למשתמשים</h2>
          </div>
          <button
            onClick={() => setShowSharePage(false)}
            className="text-slate-200 hover:text-white transition"
          >
            ← חזרה למערכת
          </button>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <ShareSounds />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-emerald-200">סשן חדש</p>
          <h2 className="text-3xl font-bold">מערכת ההשמעה החכמה</h2>
          <p className="text-slate-300 mt-2">הגדירו מהירויות ותזמון להשמעה. העלאות והקלטות זמינות בדף הקלטים.</p>
        </div>
        {loadError && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {loadError}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={onNavigateToInput}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded-lg transition shadow-lg shadow-emerald-500/30"
          >
            <Mic className="w-4 h-4" />
            דף הקלטים
          </button>
          <button
            onClick={() => setShowSharePage(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded-lg transition shadow-lg shadow-emerald-500/30"
          >
            <Send className="w-4 h-4" />
            שיתוף משתמשים
          </button>
          <button
            onClick={() => setShowDebugPanel(prev => !prev)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-800 bg-slate-900/60 hover:border-emerald-500 text-sm rounded-lg transition"
          >
            לוג מערכת
            <span className="text-xs text-emerald-300">{showDebugPanel ? 'מוסתר' : 'גלוי'}</span>
          </button>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/60">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-slate-300">מצב מערכת פעיל</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <audio ref={audioRef} className="hidden" />
          {sounds.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl">אין עדיין קבצי שמע במערכת</div>
          ) : (
            sounds.map(sound => {
              const isEligible = !sound.is_playing && sound.plays_completed < sound.total_plays;
              const countdown = timeUntilNextPlay[sound.id] || 0;
              const isReadyForPlayback = isEligible && countdown === 0;
              const nextPlayTimeLabel = new Date(sound.next_play_at).toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
              const progress = (sound.plays_completed / sound.total_plays) * 100;

              const soundSpeeds = playbackSpeeds[sound.id] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
              const isExpanded = selectedSoundForSettings === sound.id;

              return (
                <div
                  key={sound.id}
                  className={`bg-slate-900/70 rounded-xl border transition shadow-lg ${
                    sound.is_playing ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{sound.file_name}</p>
                        <div className="mt-2 space-y-2">
                          <div className="w-full bg-slate-800 rounded-full h-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-3 items-center text-sm text-slate-300">
                            <span className="px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs">{sound.plays_completed} / {sound.total_plays} השמעות</span>
                            {isEligible && countdown > 0 && (
                              <span className="flex items-center gap-1 text-emerald-200">
                                <Clock className="w-3 h-3" />
                                השמעה הבאה בעוד {formatCountdown(countdown)}
                              </span>
                            )}
                            {isReadyForPlayback && (
                              <span className="flex items-center gap-1 text-emerald-200">
                                <Clock className="w-3 h-3" />
                                מוכן להפעלה מיידית
                              </span>
                            )}
                            {sound.is_playing && (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <Play className="w-3 h-3" />
                                מתנגן עכשיו
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                            <span className="px-2 py-1 rounded-full bg-slate-800/70 border border-slate-700">
                              תזמון הבא: {nextPlayTimeLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isReadyForPlayback && !sound.is_playing && (
                          <button
                            onClick={() => startPlayback(sound.id)}
                            className="p-2 hover:bg-slate-800 rounded-lg text-emerald-300 hover:text-emerald-200 transition"
                            title="הפעל השמעה"
                            disabled={!!currentlyPlaying}
                          >
                            <Play className="w-5 h-5" />
                          </button>
                        )}
                        {sound.is_playing && (
                          <button
                            onClick={() => stopPlayback(sound.id)}
                            className="p-2 hover:bg-slate-800 rounded-lg text-red-300 hover:text-red-200 transition"
                            title="עצור השמעה"
                          >
                            <Square className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedSoundForSettings(isExpanded ? null : sound.id)}
                          className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-emerald-300 transition"
                          title="הגדרות מהירות"
                        >
                          <Settings className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteSoundItem(sound.id)}
                          className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-red-400 transition"
                          title="מחק הקלטה"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                        <p className="text-sm font-medium text-slate-200">מהירות לכל השמעה:</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                          {soundSpeeds.map((speed, index) => (
                            <div key={index} className="space-y-1">
                              <label className="text-xs text-slate-400">השמעה {index + 1}</label>
                              <select
                                value={speed}
                                onChange={(e) => updatePlaybackSpeed(sound.id, index, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                              >
                                <option value="0.5">0.5x</option>
                                <option value="0.75">0.75x</option>
                                <option value="1.0">1.0x</option>
                                <option value="1.25">1.25x</option>
                                <option value="1.5">1.5x</option>
                                <option value="1.75">1.75x</option>
                                <option value="2.0">2.0x</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-6 shadow-lg sticky top-24 space-y-3">
            <h3 className="text-lg font-semibold text-white">ניהול קלט</h3>
            <p className="text-sm text-slate-300">
              העברו לדף ההעלאות כדי להעלות קובץ חדש או להקליט אותו. כל הקבצים יופיעו כאן ברגע שיסתיימו.
            </p>
            <button
              onClick={onNavigateToInput}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
            >
              <Mic className="w-4 h-4" />
              פתח דף הקלטים
            </button>
          </div>

          {showDebugPanel && (
            <div className="bg-slate-900/70 rounded-2xl border border-emerald-800 p-4 shadow-lg space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-emerald-200 font-semibold">לוג מערכת</h3>
                <button
                  onClick={() => setDebugLogs([])}
                  className="text-xs text-slate-300 hover:text-white transition"
                >
                  נקה
                </button>
              </div>
              {debugLogs.length === 0 ? (
                <p className="text-slate-400">אין נתוני לוג להצגה.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {debugLogs.map((log, index) => (
                    <div key={index} className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-emerald-100">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
