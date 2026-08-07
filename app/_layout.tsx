import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="explanation/[sessionId]" />
        <Stack.Screen name="quiz/[sessionId]" />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
