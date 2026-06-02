import { formatAnswerForDisplay } from './formatAnswer';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface ChatResponse {
  answer: string;
  citations: Array<{ table: string; record_id: string }>;
  confidence: 'High' | 'Medium' | 'Low';
  request_id?: string;
  ambiguous?: boolean;
}

export async function selectCohort(cohort: 'A' | 'B'): Promise<string> {
  const response = await fetch(`${API_URL}/cohort/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cohort }),
  });

  if (!response.ok) {
    throw new Error('Failed to select cohort');
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function sendChatMessage(token: string, message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error('Chat request failed');
  }

  const data = (await response.json()) as Omit<ChatResponse, 'answer'> & { answer: unknown };
  return {
    ...data,
    answer: formatAnswerForDisplay(data.answer),
  };
}
