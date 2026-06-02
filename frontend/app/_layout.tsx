import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Select Cohort' }} />
      <Stack.Screen name="chat" options={{ title: 'Patient Q&A Chat' }} />
    </Stack>
  );
}
