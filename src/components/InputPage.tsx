import { useState, type ChangeEvent } from 'react';
import { Upload, ArrowLeftCircle } from 'lucide-react';
import { Recorder } from './Recorder';
import { createSound, uploadSoundFile } from '../lib/api';

interface InputPageProps {
  onBack: () => void;
}

export function InputPage({ onBack }: InputPageProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatusMessage(null);

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

      setStatusMessage('ההעלאה הושלמה! תוכלו לראות את הקובץ במערכת הראשית.');
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setStatusMessage('אירעה שגיאה בעת ההעלאה, נסו שוב.');
    }

    setIsUploading(false);
    event.target.value = '';
  };

  const handleRecordingUpload = (file: File, fileName: string) => {
    (async () => {
      setIsUploading(true);
      setStatusMessage(null);
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

        setStatusMessage('ההקלטה נשמרה ותופיע מיד בדף הראשי.');
      } catch (error) {
        alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
        setStatusMessage('ההעלאה נכשלה, נסו שוב.');
      }

      setIsUploading(false);
    })();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-200">ניהול קלט</p>
          <h2 className="text-3xl font-bold">העלאת קבצים והקלטות</h2>
          <p className="text-slate-300 mt-2">העלו קבצי שמע או הקליטו חדשים. הם יופיעו אוטומטית במערכת הראשית.</p>
        </div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-800 bg-slate-900/70 hover:border-emerald-500 hover:text-emerald-300 transition"
        >
          <ArrowLeftCircle className="w-5 h-5" />
          חזרה למערכת
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-6 shadow-lg h-fit">
          <h3 className="text-lg font-semibold text-white mb-4">העלאת קובץ מהמחשב</h3>
          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:bg-slate-900 transition">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-12 h-12 text-emerald-400 mb-3" />
              <p className="text-sm text-slate-300 text-center">
                {isUploading ? 'מעלה את הקובץ...' : 'לחצו כאן כדי להעלות קובץ שמע מהתקן מקומי'}
              </p>
            </div>
            <input type="file" accept="audio/*" onChange={handleFileUpload} disabled={isUploading} className="hidden" />
          </label>
        </div>

        <div className="bg-slate-900/70 rounded-2xl border border-slate-800 p-6 shadow-lg h-fit">
          <Recorder onUpload={handleRecordingUpload} isUploading={isUploading} />
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-4 py-3 text-emerald-100 text-sm">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
