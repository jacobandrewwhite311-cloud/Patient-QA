import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChatMessage, clearSession, getStoredToken, sendChat } from '../lib/api';

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cohort, setCohort] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getStoredToken();
      if (!stored) {
        router.replace('/');
        return;
      }
      setCohort(stored.group);
      setReady(true);
    })();
  }, [router]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await sendChat(text);
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        confidence: res.confidence,
        citations: res.citations,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: e instanceof Error ? e.message : 'Request failed',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.cohortBadge}>Cohort {cohort}</Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Change cohort</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text style={styles.bubbleText}>{item.content}</Text>
            {item.confidence ? (
              <Text style={styles.confidence}>Confidence: {item.confidence}</Text>
            ) : null}
            {item.citations?.map((c, i) => (
              <Text key={i} style={styles.citation}>
                [{c.table}] {c.recordId.slice(0, 8)}… — {c.excerpt.slice(0, 80)}
              </Text>
            ))}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about a patient..."
          multiline
          onSubmitEditing={send}
        />
        <Pressable style={styles.sendBtn} onPress={send} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  cohortBadge: { fontWeight: '600', color: '#2563eb' },
  logout: { color: '#64748b' },
  list: { padding: 12, flexGrow: 1 },
  bubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: '90%',
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  bubbleText: { color: '#0f172a' },
  confidence: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#059669' },
  citation: { marginTop: 4, fontSize: 11, color: '#64748b' },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '600' },
});
