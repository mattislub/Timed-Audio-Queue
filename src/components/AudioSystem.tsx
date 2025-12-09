import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause, Trash2, Clock, Send, Settings } from 'lucide-react';
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

    setCurrentlyPlaying(soundId);

    await updateSound(soundId, { is_playing: true });

    if (audioRef.current) {
      const speeds = playbackSpeeds[soundId] || ['1.0', '1.0', '1.0', '1.0', '1.0', '1.0'];
      const currentSpeed = parseFloat(speeds[sound.plays_completed] || '1.0');

      audioRef.current.src = sound.file_url;
      audioRef.current.playbackRate = currentSpeed;
      audioRef.current.play().catch(err => console.error('Playback error:', err));
    }
  }, [playbackSpeeds, sounds]);

  const loadSounds = useCallback(async () => {
    const data = await fetchSounds();

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
  }, [currentlyPlaying, startPlayback]);

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
    await deleteSound(id);
    await loadSounds();
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
      <div>
        <div className="fixed top-0 left-0 right-0 bg-slate-800 border-b border-slate-700 p-4">
          <button
            onClick={() => setShowSharePage(false)}
            className="text-slate-400 hover:text-white transition"
          >
            ← Back to Audio System
          </button>
        </div>
        <div className="pt-20">
          <ShareSounds />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Audio System</h1>
            <p className="text-slate-400">Upload audio files to play them 6 times with 30-second intervals</p>
          </div>
          <button
            onClick={() => setShowSharePage(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
          >
            <Send className="w-4 h-4" />
            Share with Users
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 mb-8">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700/50 transition">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 text-slate-400 mb-2" />
                  <p className="text-sm text-slate-300">
                    {isUploading ? 'Uploading...' : 'Click to upload audio file'}
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
          </div>
          <div className="lg:col-span-1">
            <Recorder onUpload={handleRecordingUpload} isUploading={isUploading} />
          </div>
        </div>

        <audio ref={audioRef} className="hidden" />

        <div className="space-y-4">
          {sounds.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>No audio files uploaded yet</p>
            </div>
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
                  className={`bg-slate-800 rounded-lg border transition ${
                    sound.is_playing
                      ? 'border-emerald-500 bg-slate-800/80'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white font-medium truncate">{sound.file_name}</p>
                        <div className="mt-2 space-y-2">
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-sm text-slate-400">
                            <span>{sound.plays_completed} / {sound.total_plays} plays</span>
                            {isReady && countdown > 0 && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Next in {countdown}s
                              </span>
                            )}
                            {sound.is_playing && (
                              <span className="text-emerald-500 flex items-center gap-1">
                                <Play className="w-3 h-3" />
                                Playing...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="ml-4 flex items-center gap-2">
                        <button
                          onClick={() => setSelectedSoundForSettings(
                            isExpanded ? null : sound.id
                          )}
                          className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400 transition"
                          title="Speed settings"
                        >
                          <Settings className="w-5 h-5" />
                        </button>
                        {sound.plays_completed >= sound.total_plays ? (
                          <button
                            onClick={() => deleteSoundItem(sound.id)}
                            className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        ) : (
                          <div className="w-10 h-10 flex items-center justify-center rounded bg-slate-700">
                            <Pause className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                        <p className="text-sm font-medium text-slate-300">Playback speeds for each play:</p>
                        <div className="grid grid-cols-6 gap-2">
                          {soundSpeeds.map((speed, index) => (
                            <div key={index} className="space-y-1">
                              <label className="text-xs text-slate-400">Play {index + 1}</label>
                              <select
                                value={speed}
                                onChange={(e) => updatePlaybackSpeed(sound.id, index, e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
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
    </div>
  );
}
