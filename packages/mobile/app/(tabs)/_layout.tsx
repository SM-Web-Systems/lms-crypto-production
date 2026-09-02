import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { Home, Coins, Image, ArrowLeftRight, DollarSign } from "lucide-react-native";

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#111827",
          borderTopColor: "#1f2937",
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#6b7280",
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.dashboard", "Home"),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tokens"
        options={{
          title: t("nav.tokens", "Tokens"),
          tabBarIcon: ({ color, size }) => <Coins size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nfts"
        options={{
          title: t("nav.nfts", "NFTs"),
          tabBarIcon: ({ color, size }) => <Image size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="swap"
        options={{
          title: t("nav.swap", "Swap"),
          tabBarIcon: ({ color, size }) => (
            <ArrowLeftRight size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: t("nav.send", "Send"),
          tabBarIcon: () => null,
          href: null,
        }}
      />
      <Tabs.Screen
        name="receive"
        options={{
          title: t("nav.receive", "Receive"),
          tabBarIcon: () => null,
          href: null,
        }}
      />
    </Tabs>
  );
}
