import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { earnApi } from "../src/shared/lib/api";
import { useAuthStore } from "../src/shared/store/auth";
import { ChevronLeft, Droplets, ChevronDown, ChevronUp, Search } from "lucide-react-native";

export default function EarnScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [assetFilter, setAssetFilter] = useState("");
  const [expandedPool, setExpandedPool] = useState<string | null>(null);

  const { data: poolsData, isLoading } = useQuery({
    queryKey: ["earn-pools", assetFilter],
    queryFn: () => earnApi.pools({ asset: assetFilter || undefined, limit: 20 }),
  });

  const pools = poolsData?.pools || [];

  const getReserveNames = (reserves: any[]) =>
    reserves?.map((r: any) => r.asset === "native" ? "XLM" : r.asset?.split(":")[0]).join(" / ") || "—";

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1f2937" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeft size={24} color="#9ca3af" />
        </TouchableOpacity>
        <Droplets size={20} color="#3b82f6" style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" }}>{t("nav.earn", "Earn")}</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#111827", borderWidth: 1, borderColor: "#1f2937", borderRadius: 8, paddingHorizontal: 12 }}>
          <Search size={16} color="#6b7280" />
          <TextInput
            placeholder={t("earn.filterAsset", "Filter by asset code...")}
            placeholderTextColor="#6b7280"
            value={assetFilter}
            onChangeText={(v) => setAssetFilter(v.toUpperCase())}
            style={{ flex: 1, paddingVertical: 10, paddingLeft: 8, color: "#fff", fontSize: 14 }}
          />
        </View>
      </View>

      <Text style={{ color: "#6b7280", fontSize: 12, fontWeight: "500", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
        {t("earn.availablePools", "Available Pools")} {poolsData?.total ? `(${poolsData.total})` : ""}
      </Text>

      {isLoading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={pools}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: "#6b7280", marginTop: 40 }}>
              {t("earn.noPools", "No pools found")}
            </Text>
          }
          renderItem={({ item }: { item: any }) => {
            const isExpanded = expandedPool === item.id;
            return (
              <View style={{ backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1f2937", overflow: "hidden" }}>
                <TouchableOpacity
                  onPress={() => setExpandedPool(isExpanded ? null : item.id)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>{getReserveNames(item.reserves)}</Text>
                    <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {t("earn.fee", "Fee")}: {item.fee || "0.30"}% · {t("earn.shares", "Shares")}: {Number(item.totalShares || 0).toFixed(2)}
                    </Text>
                  </View>
                  {isExpanded ? <ChevronUp size={18} color="#6b7280" /> : <ChevronDown size={18} color="#6b7280" />}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: "#1f2937" }}>
                    <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 8, marginBottom: 4 }}>{t("earn.reserves", "Reserves")}:</Text>
                    {item.reserves?.map((r: any, i: number) => (
                      <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                        <Text style={{ fontSize: 12, color: "#fff" }}>{r.asset === "native" ? "XLM" : r.asset?.split(":")[0]}</Text>
                        <Text style={{ fontSize: 12, color: "#6b7280" }}>{Number(r.amount).toFixed(4)}</Text>
                      </View>
                    ))}
                    <Text style={{ fontSize: 10, color: "#6b7280", marginTop: 8 }}>
                      {t("earn.depositHint", "Deposit via the web app at ammawallet.com to provide liquidity and earn fees.")}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
