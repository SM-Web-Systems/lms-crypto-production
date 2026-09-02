import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../src/shared/store/auth";
import { useWalletStore } from "../src/shared/store/wallet";

export default function Index() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const { isAuthenticated, hasPin, isLocked, loadProfile } = useAuthStore();
  const accounts = useWalletStore((s) => s.accounts);

  useEffect(() => {
    const init = async () => {
      await loadProfile();
      setReady(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      router.replace("/login");
    } else if (!hasPin) {
      router.replace("/setup-pin");
    } else if (isLocked) {
      router.replace("/lock-screen");
    } else if (accounts.length === 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)");
    }
  }, [ready, isAuthenticated, hasPin, isLocked, accounts.length]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
      <ActivityIndicator size="large" color="#818cf8" />
    </View>
  );
}
