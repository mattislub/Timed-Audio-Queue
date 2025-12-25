import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Mic, StopCircle } from 'lucide-react';
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
  const [waveformValues, setWaveformValues] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const visualizerFrameRef = useRef<number | null>(null);

  const preferredMimeType = useMemo(() => {
    const available = NON_WEBM_TYPES.find(type => MediaRecorder.isTypeSupported(type));
    return available ?? 'audio/webm';
  }, []);

  const stopVisualizer = useCallback(() => {
    if (visualizerFrameRef.current) {
      cancelAnimationFrame(visualizerFrameRef.current);
      visualizerFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();

    audioContextRef.current?.close().catch(() => undefined);
    analyserRef.current = null;
    sourceNodeRef.current = null;
    audioContextRef.current = null;
    dataArrayRef.current = null;
  }, []);

  const startVisualizer = useCallback(
    (stream: MediaStream) => {
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        sourceNodeRef.current = source;
        dataArrayRef.current = dataArray;

        const render = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
          let sum = 0;
          for (let i = 0; i < dataArrayRef.current.length; i += 1) {
            const value = dataArrayRef.current[i] / 128 - 1;
            sum += Math.abs(value);
          }

          const amplitude = Math.min(sum / dataArrayRef.current.length, 1);
          setWaveformValues(prev => [...prev.slice(-48), amplitude]);
          visualizerFrameRef.current = requestAnimationFrame(render);
        };

        render();
      } catch (visualizerError) {
        console.warn('Visualizer unavailable', visualizerError);
      }
    },
    []
  );

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
      setWaveformValues([]);
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      mediaRecorderRef.current = recorder;
      setSelectedMimeType(preferredMimeType);
      chunksRef.current = [];

      startVisualizer(stream);

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
  }, [onRecordingSaved, preferredMimeType, selectedMimeType, settings.repeatSettings, startVisualizer]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    recorder.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
    stopVisualizer();
  }, [stopVisualizer]);

  const handlePressStart = useCallback(() => {
    if (isRecording || isUploading) return;

    startRecording();
  }, [isRecording, isUploading, startRecording]);

  const handlePressEnd = useCallback(() => {
    if (!isRecording) return;

    stopRecording();
  }, [isRecording, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
      chunksRef.current = [];
      stopVisualizer();
    };
  }, [stopRecording, stopVisualizer]);

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

      <div className="flex flex-col items-center justify-center gap-6 p-6 bg-slate-800/60 rounded-xl border border-slate-800">
        <div className="flex flex-col items-center gap-2">
          <button
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onKeyDown={event => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                handlePressStart();
              }
            }}
            onKeyUp={event => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                handlePressEnd();
              }
            }}
            disabled={isUploading}
            aria-pressed={isRecording}
            className={`relative w-32 h-32 rounded-full flex items-center justify-center text-white transition disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 border-2 ${
              isRecording
                ? 'bg-rose-600/95 border-rose-400 ring-4 ring-rose-500/30'
                : 'bg-emerald-600/95 border-emerald-300 hover:bg-emerald-500'
            }`}
          >
            <div
              className={`absolute inset-2 rounded-full flex items-center justify-center transition ${
                isRecording ? 'bg-rose-700/70' : 'bg-emerald-700/50'
              }`}
            >
              {isRecording ? <StopCircle className="w-12 h-12" /> : <Mic className="w-12 h-12" />}
            </div>
          </button>
          <div className="text-sm text-slate-200 font-semibold">
            {isRecording
              ? 'Recording... release to save'
              : isUploading
                ? 'Uploading recording to server...'
                : isConverting
                  ? 'Converting the file to a supported format...'
                  : 'Hold to record a new clip'}
          </div>
        </div>

        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-300">
            <p className="font-semibold text-slate-100">Preview</p>
            <p>{waveformValues.length ? "What's been recorded so far" : "Record and you'll see the waveform"}</p>
          </div>
          <div className="h-20 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 flex items-center">
            {waveformValues.length ? (
              <div className="flex items-end gap-1 w-full h-full">
                {waveformValues.map((value, index) => (
                  <div
                    key={`${index}-${value}`}
                    className="flex-1 rounded-full bg-emerald-400/80"
                    style={{ height: `${Math.max(8, value * 100)}%` }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">The recording waveform will appear here while recording.</div>
            )}
          </div>
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
