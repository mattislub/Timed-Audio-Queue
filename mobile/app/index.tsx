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
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Mic, Square, Play, Share2, Trash2, Plus } from 'lucide-react-native';
import { supabase } from '../lib/supabase';

interface Recording {
  id: string;
  uri: string;
  duration: number;
  filename: string;
  isPlaying: boolean;
}

export default function HomeScreen() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObject, setRecordingObject] = useState<Audio.Recording | null>(null);
  const [soundObject, setSoundObject] = useState<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    loadRecordings();
    setupAudio();
  }, []);

  const setupAudio = async () => {
    await Audio.requestPermissionsAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
  };

  const loadRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('sounds')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setRecordings(
          data.map((sound) => ({
            id: sound.id,
            uri: sound.file_url,
            duration: sound.duration || 0,
            filename: sound.filename || 'Recording',
            isPlaying: false,
          }))
        );
      }
    } catch (error) {
      console.error('Error loading recordings:', error);
    }
  };

  const startRecording = async () => {
    try {
      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
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

      const filename = `recording-${Date.now()}.m4a`;

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'Recording file not found');
        return;
      }

      setIsRecording(false);
      setRecordingObject(null);

      const newRecording: Recording = {
        id: filename,
        uri,
        duration: 0,
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
    try {
      setLoading(true);

      const fileContent = await FileSystem.readAsStringAsync(recording.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.functions.invoke('upload-sound', {
        body: {
          filename: recording.filename,
          fileContent,
          duration: recording.duration,
        },
      });

      if (error) throw error;

      Alert.alert('Success', 'Recording uploaded successfully');
      loadRecordings();
    } catch (error) {
      Alert.alert('Error', 'Failed to upload recording');
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

      const { error } = await supabase
        .from('sounds')
        .delete()
        .eq('id', recording.id);

      if (error) throw error;
    } catch (error) {
      Alert.alert('Error', 'Failed to delete recording');
      console.error('Error deleting recording:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Queue</Text>
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
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
