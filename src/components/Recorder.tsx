import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Circle, StopCircle } from 'lucide-react';
import type { Recording } from '../App';

const NON_WEBM_TYPES = ['audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/mpeg'];

type RecorderProps = {
  onRecordingReady: (recording: Recording) => void;
};

type RecordingError = {
  title: string;
  message: string;
};

function Recorder({ onRecordingReady }: RecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<RecordingError | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string | null>(null);

  const supportedMimeType = useMemo(() => {
    const available = NON_WEBM_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    return available ?? null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

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

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: selectedMimeType ?? supportedMimeType });
        chunksRef.current = [];

        if (!blob.type || blob.type.includes('webm')) {
          setError({
            title: 'הקלטה נדחתה',
            message: 'נמנענו מלשמור קובץ בפורמט WebM. נסו שנית בדפדפן תומך.',
          });
          return;
        }

        const extension = blob.type.split('/')[1] || 'audio';
        const timestamp = new Date()
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '-')
          .slice(0, 15);
        const fileName = `Recording-${timestamp}.${extension}`;
        const url = URL.createObjectURL(blob);

        onRecordingReady({
          id: crypto.randomUUID(),
          blob,
          name: fileName,
          url,
          createdAt: Date.now(),
        });
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
  }, [onRecordingReady, selectedMimeType, supportedMimeType]);

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
          <p className="text-sm text-emerald-200">דף הקלטות</p>
          <h2 className="text-2xl font-semibold">התחילו הקלטה חדשה</h2>
          <p className="text-sm text-slate-400">הקובץ יוזמן ל-6 השמעות בהפרש של 30 שניות, וכל השמעה תתווסף אוטומטית ברגע שהגיע זמנה.</p>
        </div>
        <div className="text-right text-xs text-slate-400">{supportedMessage}</div>
      </div>

      <div className="flex items-center justify-center gap-4 p-6 bg-slate-800/60 rounded-xl border border-slate-800">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl text-lg font-semibold transition border ${
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
          ) : (
            <>
              <Circle className="w-6 h-6" />
              התחל הקלטה
            </>
          )}
        </button>
        <div className="text-sm text-slate-300">
          {isRecording ? 'מקליט עכשיו...' : 'מוכן להקלטה חדשה ללא WebM'}
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
