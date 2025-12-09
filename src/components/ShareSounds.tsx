import { useState, useEffect } from 'react';
import { Send, Copy, Check, Trash2 } from 'lucide-react';
import { supabase, type Sound } from '../lib/supabase';

export function ShareSounds() {
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [selectedSound, setSelectedSound] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadSounds();
    loadShares();
  }, []);

  const loadSounds = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('sounds')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    setSounds(data || []);
  };

  const loadShares = async () => {
    const { data } = await supabase
      .from('sound_shares')
      .select('*')
      .order('created_at', { ascending: false });

    setShares(data || []);
  };

  const shareSound = async () => {
    if (!selectedSound || !userEmail.trim()) {
      alert('Please select a sound and enter an email');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from('sound_shares')
      .insert({
        sound_id: selectedSound,
        user_email: userEmail,
      });

    if (error) {
      alert('Error sharing sound: ' + error.message);
    } else {
      setUserEmail('');
      alert('Sound shared successfully!');
      await loadShares();
    }

    setIsLoading(false);
  };

  const deleteShare = async (id: string) => {
    await supabase.from('sound_shares').delete().eq('id', id);
    await loadShares();
  };

  const copyShareLink = (soundId: string) => {
    const shareLink = `${window.location.origin}?shared_sound=${soundId}`;
    navigator.clipboard.writeText(shareLink);
    setCopiedId(soundId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">Share Sounds</h1>
        <p className="text-slate-400 mb-8">Send your sounds to other users</p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Share Panel */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Share a Sound</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Sound
                </label>
                <select
                  value={selectedSound || ''}
                  onChange={(e) => setSelectedSound(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Choose a sound...</option>
                  {sounds.map(sound => (
                    <option key={sound.id} value={sound.id}>
                      {sound.file_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  User Email
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={shareSound}
                disabled={isLoading || !selectedSound || !userEmail}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg transition"
              >
                <Send className="w-4 h-4" />
                {isLoading ? 'Sending...' : 'Share Sound'}
              </button>
            </div>
          </div>

          {/* Shares List */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Recent Shares</h2>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {shares.length === 0 ? (
                <p className="text-slate-400 text-sm">No shares yet</p>
              ) : (
                shares.map(share => {
                  const sound = sounds.find(s => s.id === share.sound_id);
                  return (
                    <div
                      key={share.id}
                      className="bg-slate-700 rounded p-3 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{sound?.file_name}</p>
                        <p className="text-xs text-slate-400">{share.user_email}</p>
                      </div>
                      <button
                        onClick={() => deleteShare(share.id)}
                        className="ml-2 p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Shareable Links */}
        <div className="mt-8 bg-slate-800 rounded-lg border border-slate-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Shareable Links</h2>

          <div className="grid md:grid-cols-2 gap-4">
            {sounds.map(sound => (
              <div
                key={sound.id}
                className="bg-slate-700 rounded p-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">{sound.file_name}</p>
                </div>
                <button
                  onClick={() => copyShareLink(sound.id)}
                  className="ml-2 p-2 hover:bg-slate-600 rounded text-slate-400 hover:text-emerald-400 transition"
                  title="Copy shareable link"
                >
                  {copiedId === sound.id ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
