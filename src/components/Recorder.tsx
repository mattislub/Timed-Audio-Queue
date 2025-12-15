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
    reader.onerror = () => reject(new Error('File read failed, please try again.'));
  reader.readAsDataURL(blob);
  });

async function uploadRecording(blob: Blob, fileName: string) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not set. Update your .env with the server URL.');
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

    throw new Error(message || 'Uploading the file to the server failed.');
  }

  const data = (await response.json()) as { publicUrl?: string };
  if (!data.publicUrl) {
    console.error('[Recorder] No publicUrl in upload response', { url: requestUrl, data });
    throw new Error('The server did not return a public URL for the file.');
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

async function encodeWithMediaRecorder(audioBuffer: AudioBuffer, mimeType: string) {
  const context = new AudioContext({ sampleRate: audioBuffer.sampleRate });
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(destination);

  const chunks: BlobPart[] = [];

  return new Promise<Blob>((resolve, reject) => {
    const recorder = new MediaRecorder(destination.stream, { mimeType });

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = event => {
      reject(event.error ?? new Error('Error while converting the file to OGG'));
    };

    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
      source.disconnect();
      destination.disconnect();
      context.close().catch(() => undefined);
    };

    source.onended = () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    recorder.start();
    source.start();
  });
}

function interleaveChannels(channels: Float32Array[]) {
  const totalLength = channels[0].length * channels.length;
  const result = new Float32Array(totalLength);
  let offset = 0;

  for (let i = 0; i < channels[0].length; i += 1) {
    for (let channel = 0; channel < channels.length; channel += 1) {
      result[offset] = channels[channel][i];
      offset += 1;
    }
  }

  return result;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    let sample = input[i];
    sample = Math.max(-1, Math.min(1, sample));
    output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function audioBufferToWav(audioBuffer: AudioBuffer) {
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    channelData.push(audioBuffer.getChannelData(channel));
  }

  const interleaved = interleaveChannels(channelData);
  const buffer = new ArrayBuffer(44 + interleaved.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + interleaved.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, audioBuffer.numberOfChannels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * audioBuffer.numberOfChannels * 2, true);
  view.setUint16(32, audioBuffer.numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, interleaved.length * 2, true);

  floatTo16BitPCM(view, 44, interleaved);
  return buffer;
}

async function convertWebmToPlayable(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  await audioContext.close();

  const oggMime = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : null;

  if (oggMime) {
    const oggBlob = await encodeWithMediaRecorder(audioBuffer, oggMime);
    return { blob: oggBlob, extension: 'ogg' };
  }

  const wavBuffer = audioBufferToWav(audioBuffer);
  return { blob: new Blob([wavBuffer], { type: 'audio/wav' }), extension: 'wav' };
}

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
    throw new Error(message || 'Saving the recording details on the server failed.');
  }
}

function Recorder({ onRecordingSaved, settings }: RecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<RecordingError | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const preferredMimeType = useMemo(() => {
    const available = NON_WEBM_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    return available ?? 'audio/webm';
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!API_BASE_URL) {
      setError({
        title: 'Missing API URL',
        message: 'Set VITE_API_BASE_URL so recordings save to the server and not only locally.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      mediaRecorderRef.current = recorder;
      setSelectedMimeType(preferredMimeType);
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: selectedMimeType ?? preferredMimeType });
        chunksRef.current = [];

        const extensionMap: Record<string, string> = {
          'audio/mpeg': 'mp3',
          'audio/ogg': 'ogg',
          'audio/wav': 'wav',
        };

        let finalBlob = blob;
        let extension = extensionMap[blob.type] ?? blob.type.split('/')[1] ?? 'audio';

        if (blob.type.includes('webm')) {
          try {
            setIsConverting(true);
            const conversionResult = await convertWebmToPlayable(blob);
            finalBlob = conversionResult.blob;
            extension = conversionResult.extension;
          } catch (conversionError) {
            console.error('Failed to convert WebM to playable format', conversionError);
            setError({
              title: 'WebM conversion failed',
              message:
                conversionError instanceof Error
                  ? conversionError.message
                  : 'The file could not be converted. Try again or check permissions.',
            });
            setIsConverting(false);
            return;
          } finally {
            setIsConverting(false);
          }
        }

        const timestamp = new Date()
          .toISOString()
          .replace(/[-:]/g, '')
          .replace('T', '-')
          .slice(0, 15);
        const fileName = `Recording-${timestamp}.${extension}`;

        try {
          setIsUploading(true);
          const publicUrl = await uploadRecording(finalBlob, fileName);
          const playbackRates = settings.repeatSettings.map(repeat => repeat.playbackRate);
          await createSoundRecord(fileName, publicUrl, playbackRates);
          onRecordingSaved();
        } catch (uploadError) {
          console.error('Upload failed', uploadError);
          setError({
            title: 'Save to server failed',
            message:
              uploadError instanceof Error
                ? uploadError.message
                : 'There was a problem uploading the file to the server. Try again or check the API URL.',
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
        title: 'Microphone error',
        message: 'Check microphone permissions and try again. We will convert automatically if WebM is recorded.',
      });
    }
  }, [onRecordingSaved, preferredMimeType, selectedMimeType, settings.repeatSettings]);

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

  const supportedMessage = preferredMimeType
    ? `Recordings will be saved as ${preferredMimeType.replace('audio/', '').toUpperCase()}. WebM files will be converted automatically.`
    : 'Recording is not supported in a compatible format in this browser.';

  return (
    <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-emerald-200">Recording</p>
          <h2 className="text-2xl font-semibold">Quick start</h2>
          <p className="text-sm text-slate-400">Recordings save automatically and flow into the playback queue.</p>
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
              Stop & save
            </>
          ) : isUploading ? (
            <>
              <Circle className="w-6 h-6 animate-pulse" />
              Uploading recording to server...
            </>
          ) : (
            <>
              <Circle className="w-6 h-6" />
              Start recording
            </>
          )}
        </button>
        <div className="text-sm text-slate-300">
          {isRecording
            ? 'Recording now...'
            : isUploading
              ? 'Sending the file to the server, please wait for the upload to finish.'
              : isConverting
                ? 'Converting the file to a supported format...'
                : 'Ready for a new recording'}
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
