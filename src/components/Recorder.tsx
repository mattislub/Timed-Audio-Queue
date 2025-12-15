import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Circle, StopCircle } from 'lucide-react';
import type { AppSettings } from '../App';

const NON_WEBM_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/wav'];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

function buildApiUrl(path: string) {
  if (!API_BASE_URL) return '';

  const trimmed = API_BASE_URL.replace(/\/$/, '');
  const baseWithApi = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;

  return `${baseWithApi}${path.startsWith('/') ? path : `/${path}`}`;
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('קריאת הקובץ כשלה, נסו שוב.'));
    reader.readAsDataURL(blob);
  });

async function uploadRecording(blob: Blob, fileName: string) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL לא הוגדר. עדכנו את קובץ .env עם כתובת השרת.');
  }

  const fileContent = await blobToBase64(blob);
  const requestUrl = buildApiUrl('/sounds/upload/base64');

  console.info('[Recorder] Starting upload', {
    url: requestUrl,
    fileName,
    blobType: blob.type,
    blobSize: blob.size,
  });

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileContent }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');

    console.error('[Recorder] Upload failed', {
      status: response.status,
      statusText: response.statusText,
      url: requestUrl,
      responseText: message,
    });

    throw new Error(message || 'העלאת הקובץ לשרת נכשלה.');
  }

  const data = (await response.json()) as { publicUrl?: string };
  if (!data.publicUrl) {
    console.error('[Recorder] No publicUrl in upload response', { url: requestUrl, data });
    throw new Error('השרת לא החזיר כתובת ציבורית לקובץ.');
  }

  console.info('[Recorder] Upload succeeded', { url: requestUrl, publicUrl: data.publicUrl });
  return data.publicUrl;
}

type RecorderProps = {
  onRecordingSaved: () => void;
  settings: AppSettings;
};

type RecordingError = {
  title: string;
  message: string;
};

async function createSoundRecord(fileName: string, publicUrl: string, playbackRates: number[]) {
  const requestUrl = buildApiUrl('/sounds');
  console.info('[Recorder] Creating sound record', { requestUrl, fileName });

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: fileName,
      file_url: publicUrl,
      plays_completed: 0,
      total_plays: 6,
      is_playing: 0,
      next_play_at: new Date().toISOString(),
      playback_speeds: playbackRates,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    console.error('[Recorder] Failed to create sound record', { status: response.status, statusText: response.statusText, message });
    throw new Error(message || 'שמירת פרטי ההקלטה בשרת נכשלה.');
  }
}

function Recorder({ onRecordingSaved, settings }: RecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<RecordingError | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const supportedMimeType = useMemo(() => {
    const available = NON_WEBM_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    return available ?? null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!API_BASE_URL) {
      setError({
        title: 'כתובת API חסרה',
        message: 'הגדירו VITE_API_BASE_URL כדי שההקלטה תישמר בשרת ולא רק מקומית.',
      });
      return;
    }

    if (!supportedMimeType) {
      setError({
        title: 'לא ניתן להתחיל הקלטה',
        message: 'הדפדפן תומך רק ב-WebM. הקלטה תתבצע רק כאשר קיימת תמיכה בפורמטים אחרים.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
      mediaRecorderRef.current = recorder;
      setSelectedMimeType(supportedMimeType);
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: selectedMimeType ?? supportedMimeType });
        chunksRef.current = [];

        if (!blob.type || blob.type.includes('webm')) {
          setError({
            title: 'הקלטה נדחתה',
            message: 'נמנענו מלשמור קובץ בפורמט WebM. נסו שנית בדפדפן תומך.',
          });
          return;
        }

        const extensionMap: Record<string, string> = {
          'audio/mpeg': 'mp3',
          'audio/ogg': 'ogg',
        };

        const extension = extensionMap[blob.type] ?? blob.type.split('/')[1] ?? 'audio';
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '-')
          .slice(0, 15);
        const fileName = `Recording-${timestamp}.${extension}`;

        try {
          setIsUploading(true);
          const publicUrl = await uploadRecording(blob, fileName);
          const playbackRates = settings.repeatSettings.map(repeat => repeat.playbackRate);
          await createSoundRecord(fileName, publicUrl, playbackRates);
          onRecordingSaved();
        } catch (uploadError) {
          console.error('Upload failed', uploadError);
          setError({
            title: 'שמירה לשרת נכשלה',
            message:
              uploadError instanceof Error
                ? uploadError.message
                : 'חלה בעיה בהעלאת הקובץ לשרת. נסו שוב או בדקו את כתובת ה-API.',
          });
        } finally {
          setIsUploading(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Recording failed', err);
      setError({
        title: 'שגיאה בהפעלת המיקרופון',
        message: 'בדקו הרשאות מיקרופון ונסו שוב. ודאו שהפורמט אינו WebM.',
      });
    }
  }, [onRecordingSaved, selectedMimeType, supportedMimeType, settings.repeatSettings]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    recorder.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
      chunksRef.current = [];
    };
  }, [stopRecording]);

  const supportedMessage = supportedMimeType
    ? `הקלטה תשמר בפורמט ${supportedMimeType.replace('audio/', '').toUpperCase()}`
    : 'אין תמיכה בפורמט שאינו WebM בדפדפן הנוכחי';

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-emerald-200">הקלטה</p>
          <h2 className="text-2xl font-semibold">התחלה מהירה</h2>
          <p className="text-sm text-slate-400">הקלטה נשמרת אוטומטית וממשיכה לרשימת ההשמעות.</p>
        </div>
        <div className="text-right text-xs text-slate-300 bg-slate-800/70 border border-slate-700 px-3 py-2 rounded-lg">
          {supportedMessage}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 p-6 bg-slate-800/60 rounded-xl border border-slate-800">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isUploading}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl text-lg font-semibold transition border disabled:opacity-70 disabled:cursor-not-allowed ${
            isRecording
              ? 'bg-rose-600/90 border-rose-500 hover:bg-rose-600'
              : 'bg-emerald-600/90 border-emerald-500 hover:bg-emerald-600'
          }`}
        >
          {isRecording ? (
            <>
              <StopCircle className="w-6 h-6" />
              עצור ושמור
            </>
          ) : isUploading ? (
            <>
              <Circle className="w-6 h-6 animate-pulse" />
              מעלה הקלטה לשרת...
            </>
          ) : (
            <>
              <Circle className="w-6 h-6" />
              התחל הקלטה
            </>
          )}
        </button>
        <div className="text-sm text-slate-300">
          {isRecording
            ? 'מקליט עכשיו...'
            : isUploading
              ? 'שולח את הקובץ לשרת, אנא המתן לסיום ההעלאה.'
              : 'מוכן להקלטה חדשה'}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 text-rose-300" />
          <div>
            <p className="font-semibold text-rose-200">{error.title}</p>
            <p className="text-rose-100/80">{error.message}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default Recorder;
