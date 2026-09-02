import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { portfolioApi } from "../src/shared/lib/api";
import { useWalletStore } from "../src/shared/store/wallet";
import { TouchableOpacity } from "react-native";
import { ChevronLeft, PieChart, TrendingUp, TrendingDown } from "lucide-react-native";

export default function PortfolioScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["portfolio-summary", publicKey],
    queryFn: () => portfolioApi.summary(),
    enabled: !!publicKey,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["portfolio-history", publicKey],
    queryFn: () => portfolioApi.history(30, publicKey),
    enabled: !!publicKey,
  });

  const snapshots = history?.snapshots || [];
  const totalValue = summary?.totalValue || 0;
  const change24h = summary?.change24h || 0;
  const change7d = summary?.change7d || 0;
  const assets = summary?.assets || [];
  const isUp24h = change24h >= 0;
  const isUp7d = change7d >= 0;

  if (!publicKey) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0e1a", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#6b7280" }}>{t("common.noWallet", "No active wallet")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1f2937" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeft size={24} color="#9ca3af" />
        </TouchableOpacity>
        <PieChart size={20} color="#3b82f6" style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" }}>{t("nav.portfolio", "Portfolio")}</Text>
      </View>

      {summaryLoading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ backgroundColor: "#111827", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#1f2937" }}>
            <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{t("portfolio.totalValue", "Total Value")}</Text>
            <Text style={{ fontSize: 28, fontWeight: "700", color: "#fff" }}>${Number(totalValue).toFixed(2)}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {isUp24h ? <TrendingUp size={14} color="#4ade80" /> : <TrendingDown size={14} color="#f87171" />}
                <Text style={{ fontSize: 13, fontWeight: "600", color: isUp24h ? "#4ade80" : "#f87171" }}>
                  {isUp24h ? "+" : ""}{Number(change24h).toFixed(2)}%
                </Text>
                <Text style={{ fontSize: 10, color: "#6b7280" }}>24h</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {isUp7d ? <TrendingUp size={14} color="#4ade80" /> : <TrendingDown size={14} color="#f87171" />}
                <Text style={{ fontSize: 13, fontWeight: "600", color: isUp7d ? "#4ade80" : "#f87171" }}>
                  {isUp7d ? "+" : ""}{Number(change7d).toFixed(2)}%
                </Text>
                <Text style={{ fontSize: 10, color: "#6b7280" }}>7d</Text>
              </View>
            </View>
          </View>

          {assets.length > 0 && (
            <View style={{ backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1f2937", overflow: "hidden" }}>
              <Text style={{ fontSize: 12, color: "#6b7280", paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
                {t("portfolio.breakdown", "Asset Breakdown")}
              </Text>
              {assets.map((asset: any, i: number) => {
                const pct = totalValue > 0 ? (Number(asset.value) / Number(totalValue)) * 100 : 0;
                return (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#1f2937" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(59,130,246,0.15)", justifyContent: "center", alignItems: "center" }}>
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#3b82f6" }}>
                          {(asset.code || "XLM").slice(0, 2)}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>{asset.code || "XLM"}</Text>
                        <Text style={{ fontSize: 11, color: "#6b7280" }}>{Number(asset.balance).toFixed(4)}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 13, color: "#fff" }}>${Number(asset.value).toFixed(2)}</Text>
                      <Text style={{ fontSize: 10, color: "#6b7280" }}>{pct.toFixed(1)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {snapshots.length > 1 && (
            <View style={{ backgroundColor: "#111827", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1f2937" }}>
              <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{t("portfolio.history", "30-Day History")}</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 1, height: 60 }}>
                {snapshots.map((s: any, i: number) => {
                  const max = Math.max(...snapshots.map((x: any) => Number(x.totalValue || 0)));
                  const height = max > 0 ? (Number(s.totalValue || 0) / max) * 100 : 0;
                  return (
                    <View
                      key={i}
                      style={{ flex: 1, backgroundColor: "rgba(59,130,246,0.4)", borderTopLeftRadius: 2, borderTopRightRadius: 2, height: `${Math.max(height, 2)}%` }}
                    />
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: "#6b7280" }}>30d ago</Text>
                <Text style={{ fontSize: 9, color: "#6b7280" }}>{t("common.today", "Today")}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
