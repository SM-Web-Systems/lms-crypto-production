import "../src/polyfills";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../src/shared/store/auth";
import "../src/shared/i18n";

const queryClient = new QueryClient();

export default function RootLayout() {
  const loadProfile = useAuthStore((s) => s.loadProfile);

  useEffect(() => {
    loadProfile();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="setup-pin" />
        <Stack.Screen name="lock-screen" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="history" />
        <Stack.Screen name="token-detail" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="contacts" />
        <Stack.Screen name="earn" />
        <Stack.Screen name="buy-sell" />
        <Stack.Screen name="portfolio" />
      </Stack>
    </QueryClientProvider>
  );
}
