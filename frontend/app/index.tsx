import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { selectCohort } from '../lib/api';
import { saveSession, loadSession, clearSession } from '../lib/session';
import ChatView from '../components/ChatView';

type Session = { token: string; cohort: 'A' | 'B' };

export default function AppScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [loading, setLoading] = useState<'A' | 'B' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSession().then((s) => {
      if (s) setSession(s);
      setRestoring(false);
    });
  }, []);

  async function handleSelect(cohort: 'A' | 'B') {
    setLoading(cohort);
    setError(null);
    try {
      const token = await selectCohort(cohort);
      await saveSession(token, cohort);
      setSession({ token, cohort });
    } catch {
      setError('Unable to connect to API. Check EXPO_PUBLIC_API_URL.');
    } finally {
      setLoading(null);
    }
  }

  async function handleLogout() {
    await clearSession();
    setSession(null);
  }

  if (restoring) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  // Single screen: render the chat once a cohort is selected, otherwise the
  // picker. No route navigation, so no router keys appear in the URL.
  if (session) {
    return <ChatView token={session.token} cohort={session.cohort} onLogout={handleLogout} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Carebrain Patient Q&A</Text>
      <Text style={styles.subtitle}>Select your cohort to continue</Text>

      <Pressable style={styles.button} onPress={() => handleSelect('A')} disabled={!!loading}>
        {loading === 'A' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cohort A</Text>}
      </Pressable>

      <Pressable style={styles.button} onPress={() => handleSelect('B')} disabled={!!loading}>
        {loading === 'B' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cohort B</Text>}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: '#f7f7f7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 12, color: '#444' },
  button: {
    backgroundColor: '#1f6feb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  error: { color: '#b00020', textAlign: 'center' },
});
