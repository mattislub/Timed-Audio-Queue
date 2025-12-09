import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Trash2, Clock, Send, Settings, Square } from 'lucide-react';
import {
  createSound,
  deleteSound,
  fetchSounds,
  type Sound,
  updateSound,
  uploadSoundFile,
} from '../lib/api';
import { Recorder } from './Recorder';
import { ShareSounds } from './ShareSounds';

export function AudioSystem() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [timeUntilNextPlay, setTimeUntilNextPlay] = useState<Record<string, number>>({});
  const [selectedSoundForSettings, setSelectedSoundForSettings] = useState<string | null>(null);
  const [showSharePage, setShowSharePage] = useState(false);
  const [playbackSpeeds, setPlaybackSpeeds] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const startPlayback = useCallback(async (soundId: string) => {
    const sound = sounds.find(s => s.id === soundId);
    if (!sound || sound.is_playing || sound.plays_completed >= sound.total_plays) return;

    if (!sound.file_url) {
      setLoadError('קובץ השמע לא נמצא. נסו להעלות מחדש.');
      return;
    }

    const audioEl = audioRef.current;
    if (!audioEl) return;

    const speeds = playbackSpeeds[soundId] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
    const currentSpeed = parseFloat(speeds[sound.plays_completed] || '1.0');

    setCurrentlyPlaying(soundId);
    await updateSound(soundId, { is_playing: true });

    try {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.src = sound.file_url;
      audioEl.playbackRate = currentSpeed;
      audioEl.load();
      await audioEl.play();
      setLoadError(null);
    } catch (error) {
      console.error('Playback error:', error);
      setLoadError('הקובץ לא ניתן להשמעה. בדקו את פורמט הקובץ או נסו להעלות מחדש.');
      setCurrentlyPlaying(null);
      await updateSound(soundId, { is_playing: false });
    }
  }, [playbackSpeeds, sounds]);

  const loadSounds = useCallback(async () => {
    try {
      const data = await fetchSounds();
      setLoadError(null);
      setSounds(data);
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
            await startPlayback(sound.id);
            break;
          }
        }
      }
    } catch (error) {
      console.error('Failed to load sounds', error);
      setLoadError(error instanceof Error ? error.message : 'Unable to load sounds.');
      setSounds([]);
    }
  }, [currentlyPlaying, startPlayback]);

  const stopPlayback = useCallback(
    async (soundId: string) => {
      const audioEl = audioRef.current;
      if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
      }

      setCurrentlyPlaying(null);

      await updateSound(soundId, {
        is_playing: false,
        next_play_at: new Date().toISOString(),
      });

      await loadSounds();
    },
    [loadSounds]
  );

  const handlePlaybackEnd = useCallback(async () => {
    if (!currentlyPlaying) return;

    const sound = sounds.find(s => s.id === currentlyPlaying);
    if (!sound) return;

    const newPlaysCompleted = sound.plays_completed + 1;
    const hasMorePlays = newPlaysCompleted < sound.total_plays;

    if (hasMorePlays) {
      const nextPlayTime = new Date(Date.now() + 30 * 1000);
      await updateSound(currentlyPlaying, {
        plays_completed: newPlaysCompleted,
        is_playing: false,
        next_play_at: nextPlayTime.toISOString(),
      });
    } else {
      await updateSound(currentlyPlaying, {
        plays_completed: newPlaysCompleted,
        is_playing: false,
      });
    }

    setCurrentlyPlaying(null);
    await loadSounds();
  }, [currentlyPlaying, loadSounds, sounds]);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const fileName = `${Date.now()}-${file.name}`;
      const uploadResult = await uploadSoundFile(file, fileName);

      await createSound({
        file_name: file.name,
        file_url: uploadResult.publicUrl,
        plays_completed: 0,
        total_plays: 6,
        is_playing: false,
        next_play_at: new Date().toISOString(),
        playback_speeds: ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'],
      });

      await loadSounds();
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }

    setIsUploading(false);
    event.target.value = '';
  };

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
    } catch (error) {
      alert('Error deleting sound: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const updatePlaybackSpeed = async (soundId: string, playIndex: number, speed: string) => {
    const newSpeeds = [...(playbackSpeeds[soundId] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'])];
    newSpeeds[playIndex] = speed;
    setPlaybackSpeeds({ ...playbackSpeeds, [soundId]: newSpeeds });

    await updateSound(soundId, { playback_speeds: newSpeeds });
  };

  const handleRecordingUpload = (file: File, fileName: string) => {
    (async () => {
      setIsUploading(true);
      try {
        const uploadResult = await uploadSoundFile(file, fileName);

        await createSound({
          file_name: file.name,
          file_url: uploadResult.publicUrl,
          plays_completed: 0,
          total_plays: 6,
          is_playing: false,
          next_play_at: new Date().toISOString(),
          playback_speeds: ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'],
        });

        await loadSounds();
      } catch (error) {
        alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }

      setIsUploading(false);
    })();
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
          <p className="text-slate-300 mt-2">העלו קבצי שמע, הגדירו מהירויות והמערכת תדאג להשמיע 6 פעמים עם מרווח של 30 שניות.</p>
        </div>
        {loadError && (
          <div className="rounded-lg border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {loadError}
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowSharePage(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold rounded-lg transition shadow-lg shadow-emerald-500/30"
          >
            <Send className="w-4 h-4" />
            שיתוף משתמשים
          </button>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/60">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-slate-300">מצב מערכת פעיל</span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-6 shadow-lg">
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-900 transition">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="text-sm text-slate-300">
                  {isUploading ? 'מעלה את הקובץ...' : 'לחצו כאן כדי להעלות קובץ שמע'}
                </p>
              </div>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-4">
            <audio ref={audioRef} className="hidden" />
            {sounds.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl">אין עדיין קבצי שמע במערכת</div>
            ) : (
              sounds.map(sound => {
                const isReady = !sound.is_playing && sound.plays_completed < sound.total_plays;
                const countdown = timeUntilNextPlay[sound.id] || 0;
                const progress = (sound.plays_completed / sound.total_plays) * 100;

                const soundSpeeds = playbackSpeeds[sound.id] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
                const isExpanded = selectedSoundForSettings === sound.id;

                return (
                  <div
                    key={sound.id}
                    className={`bg-slate-900/70 rounded-xl border transition shadow-lg ${
                      sound.is_playing
                        ? 'border-emerald-500/60 bg-emerald-500/5'
                        : 'border-slate-800 hover:border-slate-700'
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
                              {isReady && countdown > 0 && (
                                <span className="flex items-center gap-1 text-emerald-200">
                                  <Clock className="w-3 h-3" />
                                  השמעה הבאה בעוד {countdown}s
                                </span>
                              )}
                              {sound.is_playing && (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <Play className="w-3 h-3" />
                                  מתנגן עכשיו
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isReady && !sound.is_playing && (
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
                            onClick={() => setSelectedSoundForSettings(
                              isExpanded ? null : sound.id
                            )}
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
        </div>

        <div className="lg:col-span-1">
          <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-6 shadow-lg sticky top-24">
            <Recorder onUpload={handleRecordingUpload} isUploading={isUploading} />
          </div>
        </div>
      </div>
    </div>
  );
}
