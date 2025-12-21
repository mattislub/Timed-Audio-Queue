import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Mic, Square } from 'lucide-react-native';
import {
  createRemoteSound,
  fetchRemoteSounds,
  fetchAuthState,
  uploadRecordingMultipart,
  RecorderUser,
} from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Recording {
  id: string;
  uri: string;
  duration: number;
  filename: string;
  isPlaying: boolean;
}

type UploadStatus = 'uploading' | 'success' | 'failed';

interface LocalRecording {
  id: string;
  filename: string;
  status: UploadStatus;
}

const STORAGE_KEY = 'audio-queue/session';

export default function HomeScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObject, setRecordingObject] = useState<Audio.Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recorderUsers, setRecorderUsers] = useState<RecorderUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [localRecordings, setLocalRecordings] = useState<LocalRecording[]>([]);
  const [waveformSamples, setWaveformSamples] = useState<number[]>([]);
  const stopRequestedRef = useRef(false);
  const waveformTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setupAudio();
    loadAuthState();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadRecordings();
    } else {
      setRecordings([]);
    }
  }, [currentUser]);

  const setupAudio = async () => {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  };

  const loadAuthState = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      const state = await fetchAuthState();
      setRecorderUsers(state.recorderUsers || []);

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.username && parsed?.password) {
          const match = state.recorderUsers.find(
            (user) =>
              user.username.trim().toLowerCase() === parsed.username.trim().toLowerCase() &&
              user.password === parsed.password
          );

          if (match) {
            setCurrentUser(match.username);
          }
        }
      }
    } catch (error) {
      console.error('Error loading auth state:', error);
      setAuthError('Failed to load login settings from the server.');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadRecordings = async () => {
    if (!currentUser) return;

    try {
      const data = await fetchRemoteSounds();
      setRecordings(
        data.map((sound) => ({
          id: sound.id,
          uri: sound.file_url,
          duration: sound.duration || 0,
          filename: sound.file_name || 'Recording',
          isPlaying: false,
        }))
      );
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const stopRecording = async (activeRecording: Audio.Recording | null = recordingObject) => {
    if (!activeRecording) return;

    try {
      await activeRecording.stopAndUnloadAsync();
      const uri = activeRecording.getURI();

      if (!uri) {
        Alert.alert('Error', 'Failed to save recording');
        return;
      }

      const filename = `recording-${Date.now()}.mp3`;

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'Recording file not found');
        return;
      }

      const status = await activeRecording.getStatusAsync();

      const newRecording: Recording = {
        id: filename,
        uri,
        duration: status.isDoneRecording ? (status.durationMillis ?? 0) / 1000 : 0,
        filename,
        isPlaying: false,
      };

      setIsRecording(false);
      stopWaveform();
      stopRequestedRef.current = false;
      setRecordingObject(null);

      setRecordings((prev) => [newRecording, ...prev]);
      setLocalRecordings((prev) => [
        { id: filename, filename, status: 'uploading' },
        ...prev,
      ].slice(0, 5));
      await uploadRecording(newRecording);
    } catch (error) {
      Alert.alert('Error', 'Failed to stop recording');
      console.error('Error stopping recording:', error);
    } finally {
      stopRequestedRef.current = false;
    }
  };

  const startWaveform = () => {
    if (waveformTimerRef.current) {
      clearInterval(waveformTimerRef.current);
    }

    waveformTimerRef.current = setInterval(() => {
      setWaveformSamples((prev) => {
        const lastValue = prev[prev.length - 1] ?? 0.5;
        const nextValue = Math.min(1, Math.max(0, lastValue + (Math.random() - 0.5) * 0.4));
        return [...prev.slice(-48), nextValue];
      });
    }, 140);
  };

  const stopWaveform = () => {
    if (waveformTimerRef.current) {
      clearInterval(waveformTimerRef.current);
      waveformTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopWaveform();
    };
  }, []);

  const startRecording = async () => {
    if (!currentUser) {
      Alert.alert('דרושה התחברות', 'התחבר לפני הקלטה חדשה.');
      return;
    }

    if (loading || isRecording) {
      return;
    }

    try {
      stopRequestedRef.current = false;
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync({
        android: {
          extension: '.mp3',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.mp3',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
      });

      await newRecording.startAsync();
      setRecordingObject(newRecording);
      setIsRecording(true);
      setWaveformSamples([]);
      startWaveform();

      if (stopRequestedRef.current) {
        await stopRecording(newRecording);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start recording');
      console.error('Error starting recording:', error);
    }
  };

  const handlePressIn = () => {
    stopRequestedRef.current = false;
    startRecording();
  };

  const handlePressOut = () => {
    stopRequestedRef.current = true;
    if (recordingObject) {
      stopRecording();
    }
  };

  const uploadRecording = async (recording: Recording) => {
    if (!currentUser) return;

    try {
      setLoading(true);

      const { publicUrl } = await uploadRecordingMultipart(recording.uri, recording.filename);

      await createRemoteSound({
        file_name: recording.filename,
        file_url: publicUrl,
        duration: recording.duration,
      });

      setLocalRecordings((prev) =>
        prev.map((local) =>
          local.id === recording.id ? { ...local, status: 'success' } : local
        )
      );
      loadRecordings();
    } catch (error) {
      console.error('Error uploading recording:', error);
      setLocalRecordings((prev) =>
        prev.map((local) =>
          local.id === recording.id ? { ...local, status: 'failed' } : local
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('שגיאה', 'נא להזין שם משתמש וסיסמה');
      return;
    }

    const match = recorderUsers.find(
      (user) =>
        user.username.trim().toLowerCase() === username.trim().toLowerCase() &&
        user.password === password
    );

    if (!match) {
      Alert.alert('התחברות נכשלה', 'שם המשתמש או הסיסמה אינם נכונים.');
      return;
    }

    setCurrentUser(match.username);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ username: match.username, password })
    );
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.content, styles.centered]}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>טוען נתוני התחברות...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.contentPadding, styles.centered]}>
          <View style={styles.authCard}>
            <View style={styles.headerRow}>
              <Mic size={22} color="#2563eb" />
              <Text style={styles.title}>Audio Queue</Text>
            </View>
            <Text style={styles.authSubtitle}>התחבר כדי להעלות הקלטות ישירות לשרת</Text>

            {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
            {recorderUsers.length === 0 ? (
              <Text style={styles.errorText}>אין משתמשי מקליטים זמינים בשרת.</Text>
            ) : null}

            <TextInput
              style={styles.input}
              placeholder="שם משתמש"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="סיסמה"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.loginButton, (!username || !password || recorderUsers.length === 0) && styles.disabledButton]}
              onPress={handleLogin}
              disabled={!username || !password || recorderUsers.length === 0}
            >
              <Text style={styles.loginButtonText}>התחבר</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Mic size={22} color="#2563eb" />
          <Text style={styles.title}>Audio Queue</Text>
        </View>
        <View style={styles.userBadge}>
          <Text style={styles.userText}>{currentUser}</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>התנתק</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
        <View style={styles.recordingSection}>
          <View style={styles.recordButtonWrapper}>
            <TouchableOpacity
              style={[styles.recordCircle, isRecording ? styles.recordingActiveCircle : styles.recordIdleCircle]}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={loading}
            >
              <View style={[styles.recordCircleInner, isRecording && styles.recordCircleInnerActive]}>
                {isRecording ? <Square size={32} color="white" /> : <Mic size={32} color="white" />}
              </View>
            </TouchableOpacity>
            <Text style={styles.recordHint}>{isRecording ? 'שחרר כדי לשמור' : 'החזק כדי להתחיל להקליט'}</Text>
          </View>

          <View style={styles.waveformCard}>
            <View style={styles.waveformHeader}>
              <Text style={styles.sectionTitle}>תצוגה מקדימה</Text>
              <Text style={styles.waveformSubtitle}>
                {waveformSamples.length ? 'גל הקול של ההקלטה הנוכחית' : 'תראה כאן גרף בזמן הקלטה'}
              </Text>
            </View>
            <View style={styles.waveformBars}>
              {waveformSamples.length ? (
                waveformSamples.map((value, index) => (
                  <View
                    key={`${index}-${value}`}
                    style={[styles.waveformBar, { height: `${Math.max(15, value * 100)}%` }]}
                  />
                ))
              ) : (
                <Text style={styles.waveformPlaceholder}>הגרף יופיע בזמן הקלטה, כמו וואטסאפ.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>הקלטות אחרונות במכשיר</Text>
          {localRecordings.length === 0 ? (
            <Text style={styles.emptyText}>עוד לא בוצעו הקלטות מהמכשיר.</Text>
          ) : (
            localRecordings.map((recording) => (
              <View key={recording.id} style={styles.recordingRow}>
                <View>
                  <Text style={styles.recordingName}>{recording.filename}</Text>
                  <Text style={styles.recordingStatus}>
                    {recording.status === 'success'
                      ? 'נשלח בהצלחה'
                      : recording.status === 'failed'
                      ? 'ההעלאה נכשלה'
                      : 'מעלה לשרת...'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusDot,
                    recording.status === 'success'
                      ? styles.statusSuccess
                      : recording.status === 'failed'
                      ? styles.statusFailed
                      : styles.statusUploading,
                  ]}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  userText: {
    color: '#1f2937',
    fontWeight: '600',
  },
  logoutText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  authCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
    gap: 12,
  },
  authSubtitle: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  loginButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorText: {
    color: '#ef4444',
  },
  recordingSection: {
    marginBottom: 32,
    gap: 16,
  },
  listSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  emptyText: {
    color: '#6b7280',
  },
  recordingRow: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recordingName: {
    fontWeight: '700',
    color: '#111827',
  },
  recordingStatus: {
    color: '#4b5563',
    marginTop: 2,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusSuccess: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  statusFailed: {
    backgroundColor: '#ef4444',
  },
  statusUploading: {
    backgroundColor: '#facc15',
  },
  recordButtonWrapper: {
    alignItems: 'center',
    gap: 10,
  },
  recordCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 3,
  },
  recordIdleCircle: {
    backgroundColor: '#10b981',
    borderColor: '#a7f3d0',
  },
  recordingActiveCircle: {
    backgroundColor: '#ef4444',
    borderColor: '#fecdd3',
    shadowColor: '#ef4444',
  },
  recordCircleInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#bbf7d0',
  },
  recordCircleInnerActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#fecdd3',
  },
  recordHint: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  waveformCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  waveformHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waveformSubtitle: {
    color: '#6b7280',
    fontSize: 12,
  },
  waveformBars: {
    height: 80,
    backgroundColor: '#e5e7eb',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  waveformBar: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    minHeight: 10,
  },
  waveformPlaceholder: {
    color: '#6b7280',
    fontSize: 13,
  },
  loadingText: {
    color: '#1f2937',
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
