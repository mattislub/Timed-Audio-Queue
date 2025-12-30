import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppSettings, RecorderUser, RepeatSetting } from '../App';

type SettingsProps = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  adminPassword: string;
  onAdminPasswordChange: (password: string) => Promise<boolean>;
  recorderUsers: RecorderUser[];
  onRecorderUsersChange: (users: RecorderUser[]) => Promise<boolean>;
};

function Settings({ settings, onChange, adminPassword, onAdminPasswordChange, recorderUsers, onRecorderUsersChange }: SettingsProps) {
  const [repeatSettings, setRepeatSettings] = useState<RepeatSetting[]>(settings.repeatSettings);
  const [preventOverlappingPlayback, setPreventOverlappingPlayback] = useState<boolean>(settings.preventOverlappingPlayback);
  const [activeTab, setActiveTab] = useState<'playback' | 'auth'>('playback');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [adminPasswordMessage, setAdminPasswordMessage] = useState<string | null>(null);
  const [recorderUsername, setRecorderUsername] = useState('');
  const [recorderPassword, setRecorderPassword] = useState('');
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);
  const [authSaving, setAuthSaving] = useState(false);

  useEffect(() => {
    setRepeatSettings(settings.repeatSettings);
    setPreventOverlappingPlayback(settings.preventOverlappingPlayback);
  }, [settings.preventOverlappingPlayback, settings.repeatSettings]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const sanitizedRepeats: RepeatSetting[] = repeatSettings.slice(0, 6).map(repeat => ({
      gapSeconds: Math.max(0, Math.round(repeat.gapSeconds)),
      playbackRate: Math.min(3, Math.max(0.5, Number(repeat.playbackRate.toFixed(2)))),
      enabled: repeat.enabled !== false,
    }));

    while (sanitizedRepeats.length < 6) {
      sanitizedRepeats.push({ gapSeconds: 30, playbackRate: 1, enabled: true });
    }

    if (!sanitizedRepeats.some(repeat => repeat.enabled !== false)) {
      sanitizedRepeats[0].enabled = true;
    }

    onChange({ repeatSettings: sanitizedRepeats, preventOverlappingPlayback });
  };

  const generatePassword = () => Math.random().toString(36).slice(-10);

  const handleAdminPasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!newAdminPassword || !confirmAdminPassword) {
      setAdminPasswordMessage('Please enter a password and confirm it.');
      return;
    }

    if (newAdminPassword !== confirmAdminPassword) {
      setAdminPasswordMessage('The passwords do not match.');
      return;
    }

    setAuthSaving(true);
    const ok = await onAdminPasswordChange(newAdminPassword);
    setAuthSaving(false);

    if (!ok) {
      setAdminPasswordMessage('Failed to save the password.');
      return;
    }

    setAdminPasswordMessage('Password updated successfully.');
    setNewAdminPassword('');
    setConfirmAdminPassword('');
  };

  const handleAddRecorderUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!recorderUsername || !recorderPassword) {
      setRecorderMessage('Please enter a username and password.');
      return;
    }

    const usernameExists = recorderUsers.some(
      user => user.username.trim().toLowerCase() === recorderUsername.trim().toLowerCase(),
    );

    if (usernameExists) {
      setRecorderMessage('That username already exists.');
      return;
    }

    const user: RecorderUser = {
      id: crypto.randomUUID(),
      username: recorderUsername.trim(),
      password: recorderPassword,
    };

    setAuthSaving(true);
    const ok = await onRecorderUsersChange([...recorderUsers, user]);
    setAuthSaving(false);

    if (!ok) {
      setRecorderMessage('Failed to save the user.');
      return;
    }

    setRecorderUsername('');
    setRecorderPassword('');
    setRecorderMessage('User created successfully.');
  };

  const handleRemoveUser = async (id: string) => {
    const updated = recorderUsers.filter(user => user.id !== id);

    setAuthSaving(true);
    const ok = await onRecorderUsersChange(updated);
    setAuthSaving(false);

    if (!ok) {
      setRecorderMessage('Failed to delete the user.');
    }
  };

  const nextPlayTimes = useMemo<(number | null)[]>(() => {
    const times: Array<number | null> = [];
    let total = 0;
    repeatSettings.forEach((repeat, index) => {
      const isEnabled = repeat.enabled !== false;
      if (!isEnabled) {
        times[index] = null;
        return;
      }

      total += Math.max(0, repeat.gapSeconds);
      times[index] = total;
    });
    return times;
  }, [repeatSettings]);

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-200">Settings</p>
          <h2 className="text-2xl font-semibold">Control the experience</h2>
          <p className="text-sm text-slate-400">Manage scheduling and authentication.</p>
        </div>
        <div className="flex bg-slate-900/60 border border-slate-800 rounded-full p-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('playback')}
            className={`px-4 py-2 rounded-full ${
              activeTab === 'playback'
                ? 'bg-emerald-500/20 text-emerald-100 shadow-inner shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Scheduling
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`px-4 py-2 rounded-full ${
              activeTab === 'auth'
                ? 'bg-emerald-500/20 text-emerald-100 shadow-inner shadow-emerald-500/20'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Authentication
          </button>
        </div>
      </div>

      {activeTab === 'playback' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40 shadow-inner">
            <table className="min-w-full text-sm text-slate-300">
              <thead className="bg-slate-800/70 text-slate-100 text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Play
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Enabled
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Gap (seconds)
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Playback speed
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Estimated result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {repeatSettings.map((repeat, index) => {
                  const isEnabled = repeat.enabled !== false;
                  const nextPlayTime = nextPlayTimes[index];

                  return (
                    <tr key={index} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="text-base font-semibold text-emerald-200">Play {index + 1}</span>
                          <span className="text-xs text-slate-500">Time until this play</span>
                          <span className="text-xs text-slate-400">
                            {isEnabled && nextPlayTime !== null ? `T+${nextPlayTime}s` : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs text-slate-400">Toggle play {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...repeatSettings];
                              next[index] = { ...repeat, enabled: !isEnabled };
                              setRepeatSettings(next);
                            }}
                            className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold transition ${
                              isEnabled
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-100 hover:bg-emerald-500/30'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            {isEnabled ? 'On' : 'Off'}
                          </button>
                          <span className="text-xs text-slate-500">
                            Disable this specific play without affecting others.
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs text-slate-400">Gap in seconds until play {index + 1}</span>
                          <input
                            type="number"
                            min={0}
                            value={repeat.gapSeconds}
                            onChange={event => {
                              const next = [...repeatSettings];
                              next[index] = { ...repeat, gapSeconds: Number(event.target.value) };
                              setRepeatSettings(next);
                            }}
                            disabled={!isEnabled}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </label>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <label className="flex flex-col gap-3">
                          <span className="text-xs text-slate-400">Select speed</span>
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
                            disabled={!isEnabled}
                            className="accent-emerald-500 disabled:opacity-50"
                          />
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>0.5x</span>
                            <span className="text-emerald-200 text-sm font-semibold">{repeat.playbackRate.toFixed(1)}x</span>
                            <span>3x</span>
                          </div>
                        </label>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                          {isEnabled && nextPlayTime !== null ? (
                            <>
                              <span className="text-emerald-200 font-semibold">T+{nextPlayTime}s</span>
                              <span className="text-slate-500">|</span>
                              <span>{repeat.playbackRate.toFixed(1)}x</span>
                            </>
                          ) : (
                            <span className="text-slate-500">Disabled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-800/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 space-y-2">
            <p className="font-semibold text-emerald-200">Preview</p>
            <p>The 6 available plays will run at the predefined intervals. Disabled plays will be skipped:</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              {repeatSettings.map((repeat, index) => {
                const isEnabled = repeat.enabled !== false;
                const nextPlayTime = nextPlayTimes[index];

                return (
                  <span
                    key={index}
                    className={`px-3 py-1 rounded-full border border-slate-700 bg-slate-900/80 ${
                      !isEnabled ? 'opacity-60 line-through' : ''
                    }`}
                  >
                    {isEnabled && nextPlayTime !== null
                      ? `Play ${index + 1}: T+${nextPlayTime}s @ ${repeat.playbackRate.toFixed(1)}x`
                      : `Play ${index + 1}: Disabled`}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-slate-800/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-300">
            <div className="space-y-1">
              <p className="font-semibold text-emerald-200">Prevent overlapping playback</p>
              <p className="text-slate-400">
                When enabled, only one recording will ever play at a time. Additional plays wait in the queue until the current one finishes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreventOverlappingPlayback(prev => !prev)}
              className={`min-w-[140px] px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                preventOverlappingPlayback
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-100 hover:bg-emerald-500/30'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              {preventOverlappingPlayback ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition border border-emerald-500 text-white font-semibold"
            >
              Save settings
            </button>
          </div>
        </form>
      )}

      {activeTab === 'auth' && (
        <div className="space-y-6">
          <form onSubmit={handleAdminPasswordSubmit} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm text-emerald-200">Admin login</p>
              <h3 className="text-lg font-semibold">Set admin password</h3>
              <p className="text-sm text-slate-400">The password restricts access to settings and queues.</p>
              <p className="text-xs text-slate-500 mt-1">Current password: <span className="text-emerald-200">{adminPassword || 'Not set'}</span></p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="space-y-2 text-sm text-slate-200">
                <span>New password</span>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={event => setNewAdminPassword(event.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmAdminPassword}
                  onChange={event => setConfirmAdminPassword(event.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </label>
            </div>
            {adminPasswordMessage && <p className="text-sm text-emerald-200">{adminPasswordMessage}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={authSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-semibold disabled:opacity-60"
              >
                Save password
              </button>
            </div>
          </form>

          <form onSubmit={handleAddRecorderUser} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <p className="text-sm text-emerald-200">Recorder-only users</p>
              <h3 className="text-lg font-semibold">Create a user for the recording page</h3>
              <p className="text-sm text-slate-400">These users log into a separate page with recording-only access.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <label className="space-y-2 text-sm text-slate-200">
                <span>Username</span>
                <input
                  type="text"
                  value={recorderUsername}
                  onChange={event => setRecorderUsername(event.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                <span>Password</span>
                <input
                  type="text"
                  value={recorderPassword}
                  onChange={event => setRecorderPassword(event.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setRecorderPassword(generatePassword())}
                  disabled={authSaving}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 disabled:opacity-60"
                >
                  Generate random password
                </button>
              </div>
            </div>

            {recorderMessage && <p className="text-sm text-emerald-200">{recorderMessage}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={authSaving}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-semibold disabled:opacity-60"
              >
                Create user
              </button>
            </div>
          </form>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-200">User list</p>
                <h3 className="text-lg font-semibold">Manage recording accounts</h3>
              </div>
              <p className="text-xs text-slate-500">Number of accounts: {recorderUsers.length}</p>
            </div>

            {recorderUsers.length === 0 ? (
              <p className="text-sm text-slate-400">No users have been created yet.</p>
            ) : (
              <div className="space-y-2">
                {recorderUsers.map(user => (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 rounded-lg px-4 py-3 bg-slate-950/40"
                  >
                    <div>
                      <p className="text-sm font-semibold text-emerald-200">{user.username}</p>
                      <p className="text-xs text-slate-400">Password: {user.password}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(user.id)}
                      disabled={authSaving}
                      className="text-sm text-rose-300 hover:text-rose-200 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default Settings;
