import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { sendChatMessage, ChatResponse } from '../lib/api';
import { formatAnswerForDisplay } from '../lib/formatAnswer';

function confidenceColor(confidence: string): string {
  if (confidence === 'High') return '#1b7f3b';
  if (confidence === 'Medium') return '#b78103';
  return '#b00020';
}

interface ChatViewProps {
  token: string;
  cohort: 'A' | 'B';
  onLogout: () => void;
}

export default function ChatView({ token, cohort, onLogout }: ChatViewProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ChatResponse | null>(null);

  async function handleSend() {
    if (!token || !message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await sendChatMessage(token, message.trim());
      setResponse(result);
    } catch {
      setError('Failed to send message.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.meta}>Active cohort: {cohort}</Text>

      <TextInput
        style={styles.input}
        placeholder="Ask about a patient in your cohort..."
        value={message}
        onChangeText={setMessage}
        multiline
      />

      <Pressable style={styles.button} onPress={handleSend} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send</Text>}
      </Pressable>

      <Pressable style={styles.linkButton} onPress={onLogout}>
        <Text style={styles.linkText}>Switch cohort</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {response ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Answer</Text>
          <Text style={styles.answer}>{formatAnswerForDisplay(response.answer)}</Text>

          <View style={[styles.badge, { backgroundColor: confidenceColor(response.confidence) }]}>
            <Text style={styles.badgeText}>Confidence: {response.confidence}</Text>
          </View>

          <Text style={styles.cardTitle}>Citations</Text>
          {response.citations.length === 0 ? (
            <Text style={styles.empty}>No citations</Text>
          ) : (
            response.citations.map((citation) => (
              <Text key={`${citation.table}-${citation.record_id}`} style={styles.citation}>
                {citation.table} / {citation.record_id}
              </Text>
            ))
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: '#f7f7f7' },
  meta: { fontSize: 14, color: '#555' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#1f6feb',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  linkButton: { alignItems: 'center', padding: 8 },
  linkText: { color: '#1f6feb' },
  error: { color: '#b00020' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    gap: 8,
  },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  answer: { fontSize: 15, lineHeight: 22 },
  badge: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '600' },
  citation: { fontSize: 13, color: '#333' },
  empty: { color: '#777' },
});
