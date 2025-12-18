import React, { useState, useEffect } from 'react';
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
import { Mic, Square, Play, Share2, Trash2, Plus } from 'lucide-react-native';
import {
  createRemoteSound,
  deleteRemoteSound,
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

const STORAGE_KEY = 'audio-queue/session';

export default function HomeScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObject, setRecordingObject] = useState<Audio.Recording | null>(null);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recorderUsers, setRecorderUsers] = useState<RecorderUser[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);

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

  const startRecording = async () => {
    if (!currentUser) {
      Alert.alert('דרושה התחברות', 'התחבר לפני הקלטה חדשה.');
      return;
    }

    try {
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
    } catch (error) {
      Alert.alert('Error', 'Failed to start recording');
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recordingObject) return;

    try {
      await recordingObject.stopAndUnloadAsync();
      const uri = recordingObject.getURI();

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

      setIsRecording(false);
      setRecordingObject(null);

      const status = await recordingObject.getStatusAsync();

      const newRecording: Recording = {
        id: filename,
        uri,
        duration: status.isDoneRecording ? (status.durationMillis ?? 0) / 1000 : 0,
        filename,
        isPlaying: false,
      };

      setRecordings([newRecording, ...recordings]);
      await uploadRecording(newRecording);
    } catch (error) {
      Alert.alert('Error', 'Failed to stop recording');
      console.error('Error stopping recording:', error);
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

      Alert.alert('Success', 'Recording uploaded successfully');
      loadRecordings();
    } catch (error) {
      console.error('Error uploading recording:', error);
    } finally {
      setLoading(false);
    }
  };

  const playRecording = async (recording: Recording) => {
    try {
      if (soundObject) {
        await soundObject.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync({
        uri: recording.uri,
      });

      setSoundObject(sound);
      setPlayingId(recording.id);
      await sound.playAsync();

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
        }
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to play recording');
      console.error('Error playing recording:', error);
    }
  };

  const deleteRecording = async (recording: Recording) => {
    try {
      await FileSystem.deleteAsync(recording.uri);
      setRecordings(recordings.filter((r) => r.id !== recording.id));

      await deleteRemoteSound(recording.id);
    } catch (error) {
      Alert.alert('Error', 'Failed to delete recording');
      console.error('Error deleting recording:', error);
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
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordingActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading}
          >
            {isRecording ? (
              <>
                <Square size={24} color="white" />
                <Text style={styles.recordButtonText}>Stop Recording</Text>
              </>
            ) : (
              <>
                <Mic size={24} color="white" />
                <Text style={styles.recordButtonText}>Start Recording</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Your Recordings</Text>

          {recordings.length === 0 ? (
            <View style={styles.emptyState}>
              <Plus size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>No recordings yet</Text>
              <Text style={styles.emptyStateSubtext}>Start recording to create your first audio</Text>
            </View>
          ) : (
            recordings.map((recording) => (
              <View key={recording.id} style={styles.recordingItem}>
                <View style={styles.recordingInfo}>
                  <Text style={styles.recordingName}>{recording.filename}</Text>
                  <Text style={styles.recordingDuration}>
                    {Math.round(recording.duration)}s
                  </Text>
                </View>

                <View style={styles.recordingActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      playingId === recording.id && styles.actionButtonActive,
                    ]}
                    onPress={() => playRecording(recording)}
                    disabled={loading}
                  >
                    <Play size={20} color={playingId === recording.id ? '#3b82f6' : '#6b7280'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => uploadRecording(recording)}
                    disabled={loading}
                  >
                    <Share2 size={20} color="#6b7280" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => deleteRecording(recording)}
                    disabled={loading}
                  >
                    <Trash2 size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
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
  },
  recordButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#3b82f6',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  recordingActive: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  listSection: {
    marginBottom: 32,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
  },
  recordingItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  recordingDuration: {
    fontSize: 14,
    color: '#6b7280',
  },
  recordingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  actionButtonActive: {
    backgroundColor: '#dbeafe',
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
