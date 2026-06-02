import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const TOKEN_KEY = 'session_token';
const GROUP_KEY = 'session_group';

export interface Citation {
  table: string;
  recordId: string;
  excerpt: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  confidence?: string;
  citations?: Citation[];
}

function basicAuthHeader(token: string): string {
  const encoded =
    typeof btoa !== 'undefined'
      ? btoa(`${token}:`)
      : Buffer.from(`${token}:`).toString('base64');
  return `Basic ${encoded}`;
}

export async function createSession(group: 'A' | 'B') {
  const res = await fetch(`${API_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  });
  if (!res.ok) throw new Error(`Session failed: ${res.status}`);
  return res.json() as Promise<{ token: string; group: string }>;
}

export async function saveToken(token: string, group: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(GROUP_KEY, group);
}

export async function getStoredToken() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const group = await AsyncStorage.getItem(GROUP_KEY);
  if (!token || !group) return null;
  return { token, group };
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, GROUP_KEY]);
}

export async function sendChat(message: string): Promise<ChatResponse> {
  const stored = await getStoredToken();
  if (!stored) throw new Error('No session');

  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(stored.token),
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  return res.json();
}
