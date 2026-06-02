import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'carebrain_jwt';
const COHORT_KEY = 'carebrain_cohort';

export async function saveSession(token: string, cohort: 'A' | 'B'): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [COHORT_KEY, cohort],
  ]);
}

export async function loadSession(): Promise<{ token: string; cohort: 'A' | 'B' } | null> {
  const values = await AsyncStorage.multiGet([TOKEN_KEY, COHORT_KEY]);
  const token = values[0][1];
  const cohort = values[1][1] as 'A' | 'B' | null;
  if (!token || !cohort) return null;
  return { token, cohort };
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, COHORT_KEY]);
}
