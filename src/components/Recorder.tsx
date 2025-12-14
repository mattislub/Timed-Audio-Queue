import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Trash2, Clock } from 'lucide-react';

interface RecorderProps {
  onUpload: (file: File, fileName: string) => void;
  isUploading: boolean;
}

const MAX_RECORDING_DURATION = 60;

const encodeWav = (samples: Float32Array[], sampleRate: number) => {
  if (!samples.length) return new Blob();

  const totalLength = samples.reduce((sum, arr) => sum + arr.length, 0);
  const buffer = new ArrayBuffer(44 + totalLength * 2);
  const view = new DataView(buffer);
  const channelData = new Float32Array(totalLength);
  let offset = 0;
  samples.forEach(chunk => {
    channelData.set(chunk, offset);
    offset += chunk.length;
  });

  const writeString = (viewObj: DataView, offsetIdx: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      viewObj.setUint8(offsetIdx + i, str.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, channelData.length * 2, true);

  let idx = 44;
  for (let i = 0; i < channelData.length; i++, idx += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
};

const formatTime = (seconds: number) => {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const secs = (clamped % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

export function Recorder({ onUpload, isUploading }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(MAX_RECORDING_DURATION);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const recordingFileNameRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmDataRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(44100);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;

      audioContextRef.current = audioContext;
      sourceNodeRef.current = sourceNode;
      processorNodeRef.current = processorNode;
      pcmDataRef.current = [];
      sampleRateRef.current = audioContext.sampleRate;

      processorNode.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        pcmDataRef.current.push(new Float32Array(channelData));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(audioContext.destination);
      recordingFileNameRef.current = `recording-${Date.now()}.wav`;

      setIsRecording(true);
      setRecordingTimeLeft(MAX_RECORDING_DURATION);
    } catch (err) {
      alert('Cannot access microphone: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (!pcmDataRef.current.length) {
      alert('לא נקלטו נתונים מהמיקרופון. נסה שוב.');
      setIsRecording(false);
      setRecordingTimeLeft(MAX_RECORDING_DURATION);
      return;
    }

    const blob = encodeWav(pcmDataRef.current, sampleRateRef.current);
    setRecordedBlob(blob);
    const fileName = recordingFileNameRef.current || `recording-${Date.now()}.wav`;
    const file = new File([blob], fileName, { type: 'audio/wav' });
    onUpload(file, fileName);

    recordingFileNameRef.current = '';
    pcmDataRef.current = [];
    setIsRecording(false);
    setRecordingTimeLeft(MAX_RECORDING_DURATION);
  }, [isRecording, onUpload]);

  useEffect(() => {
    if (!isRecording) return;

    const interval = window.setInterval(() => {
      setRecordingTimeLeft(prev => {
        if (prev <= 1) {
          window.setTimeout(() => stopRecording(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording, stopRecording]);

  const clearRecording = () => {
    setRecordedBlob(null);
    recordingFileNameRef.current = '';
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Record Audio</h3>

      <div className="space-y-4">
        <div className="flex gap-3 items-center">
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
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 text-slate-100 text-sm">
                <Clock className="w-4 h-4 text-emerald-300" />
                {`זמן נותר: ${formatTime(recordingTimeLeft)}`}
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
            <div className="bg-slate-700 rounded p-3 space-y-2">
              <p className="text-sm text-slate-300">ההקלטה נשמרה בהצלחה.</p>
              <p className="text-xs text-slate-400">לא ניתן להשמיע תצוגה מקדימה כאן, ההקלטה תופיע בדף הראשי לאחר העיבוד.</p>
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
