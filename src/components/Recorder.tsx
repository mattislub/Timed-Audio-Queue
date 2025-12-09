import { useState, useRef } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

interface RecorderProps {
  onUpload: (file: File, fileName: string) => void;
  isUploading: boolean;
}

export function Recorder({ onUpload, isUploading }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingFileNameRef = useRef<string>('');
  const recordingMimeTypeRef = useRef<string>('');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/mpeg')
        ? 'audio/mpeg'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      recordingMimeTypeRef.current = mimeType;
      const extension = mimeType === 'audio/mpeg' ? 'mp3' : 'webm';
      recordingFileNameRef.current = `recording-${Date.now()}.${extension}`;

      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recordingMimeTypeRef.current || 'audio/webm' });
        setRecordedBlob(blob);
        const fallbackExtension = recordingMimeTypeRef.current === 'audio/mpeg' ? 'mp3' : 'webm';
        const fileName =
          recordingFileNameRef.current || `recording-${Date.now()}.${fallbackExtension}`;
        const file = new File([blob], fileName, { type: recordingMimeTypeRef.current || 'audio/webm' });
        onUpload(file, fileName);
        recordingFileNameRef.current = '';
        recordingMimeTypeRef.current = '';
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Cannot access microphone: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const clearRecording = () => {
    setRecordedBlob(null);
    chunksRef.current = [];
    recordingFileNameRef.current = '';
    if (audioRef.current) {
      audioRef.current.src = '';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Record Audio</h3>

      <div className="space-y-4">
        <div className="flex gap-3">
          {!isRecording && !recordedBlob && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </button>
          )}

          {isRecording && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Recording...
              </div>
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </>
          )}
        </div>

        {recordedBlob && (
          <div className="space-y-3">
            <div className="bg-slate-700 rounded p-3">
              <p className="text-sm text-slate-300 mb-2">Preview:</p>
              <audio
                ref={audioRef}
                src={URL.createObjectURL(recordedBlob)}
                controls
                className="w-full"
              />
            </div>

            <p className="text-xs text-slate-300">ההקלטה נשלחת אוטומטית בעת עצירה. אפשר לנקות את התצוגה כאן:</p>
            <div className="flex gap-2">
              <button
                onClick={clearRecording}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-white rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
