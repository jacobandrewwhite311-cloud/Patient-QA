import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createSession, saveToken } from '../lib/api';

export default function CohortSelectScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectCohort = async (group: 'A' | 'B') => {
    setLoading(group);
    setError(null);
    try {
      const { token, group: g } = await createSession(group);
      await saveToken(token, g);
      router.push('/chat');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Patient Q&A Assistant</Text>
      <Text style={styles.subtitle}>Select your patient cohort to begin</Text>

      <Pressable
        style={[styles.button, styles.buttonA]}
        onPress={() => selectCohort('A')}
        disabled={!!loading}
      >
        {loading === 'A' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Group A</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.button, styles.buttonB]}
        onPress={() => selectCohort('B')}
        disabled={!!loading}
      >
        {loading === 'B' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Group B</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 32 },
  button: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  buttonA: { backgroundColor: '#2563eb' },
  buttonB: { backgroundColor: '#7c3aed' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  error: { color: '#dc2626', marginTop: 16 },
});
