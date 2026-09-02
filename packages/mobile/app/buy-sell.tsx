import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fiatApi, moneygramApi } from "../src/shared/lib/api";
import { useWalletStore } from "../src/shared/store/wallet";
import { ChevronLeft, DollarSign, Banknote, ArrowDownUp } from "lucide-react-native";

export default function BuySellScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [method, setMethod] = useState<"moneygram" | "quote" | "transak">("transak");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");

  const { data: mgInfo } = useQuery<{ rate?: string; amount?: string; fee?: string; limits?: any; supportedAssets?: string[]; feePercent?: number; status?: string }>({
    queryKey: ["moneygram-info"],
    queryFn: () => moneygramApi.info() as any,
  });

  const quoteMutation = useMutation({
    mutationFn: () =>
      tab === "buy"
        ? fiatApi.quoteBuy({ fiatCurrency: currency, fiatAmount: Number(amount) })
        : fiatApi.quoteSell({ fiatCurrency: currency, cryptoAmount: Number(amount) }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const mgDepositMutation = useMutation({
    mutationFn: () => moneygramApi.deposit({ publicKey, amount }),
    onSuccess: (data: any) => {
      if (data.interactiveUrl) {
        Linking.openURL(data.interactiveUrl);
      }
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const mgWithdrawMutation = useMutation({
    mutationFn: () => moneygramApi.withdraw({ publicKey, amount }),
    onSuccess: (data: any) => {
      if (data.interactiveUrl) {
        Linking.openURL(data.interactiveUrl);
      }
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleMoneyGram = () => {
    if (!publicKey) return Alert.alert("Error", t("common.noWallet", "No active wallet"));
    if (tab === "buy") mgDepositMutation.mutate();
    else mgWithdrawMutation.mutate();
  };

  const mgLoading = mgDepositMutation.isPending || mgWithdrawMutation.isPending;
  const limits = mgInfo ? (tab === "buy" ? mgInfo.limits?.onRamp : mgInfo.limits?.offRamp) : null;
  const currencies = ["USD", "EUR", "GBP", "ZAR", "NGN", "KES", "BRL"];

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1f2937" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <ChevronLeft size={24} color="#9ca3af" />
        </TouchableOpacity>
        <DollarSign size={20} color="#3b82f6" style={{ marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#fff" }}>{t("nav.buysell", "Buy & Sell")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", backgroundColor: "#111827", borderRadius: 8, borderWidth: 1, borderColor: "#1f2937", padding: 2 }}>
          <TouchableOpacity
            onPress={() => setTab("buy")}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: tab === "buy" ? "rgba(34,197,94,0.15)" : "transparent" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: tab === "buy" ? "#4ade80" : "#6b7280" }}>
              {t("buysell.buy", "Buy")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab("sell")}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: tab === "sell" ? "rgba(239,68,68,0.15)" : "transparent" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: tab === "sell" ? "#f87171" : "#6b7280" }}>
              {t("buysell.sell", "Sell")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ backgroundColor: "#111827", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#1f2937", gap: 12 }}>
          <Text style={{ fontSize: 12, color: "#6b7280" }}>{t("buysell.amount", "Amount")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="0.00"
              placeholderTextColor="#6b7280"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              style={{ flex: 1, backgroundColor: "#0a0e1a", borderWidth: 1, borderColor: "#1f2937", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 16 }}
            />
            <View style={{ backgroundColor: "#0a0e1a", borderWidth: 1, borderColor: "#1f2937", borderRadius: 8, justifyContent: "center", paddingHorizontal: 12 }}>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{currency}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {currencies.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCurrency(c)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: currency === c ? "#3b82f6" : "#1f2937", backgroundColor: currency === c ? "rgba(59,130,246,0.1)" : "transparent" }}
              >
                <Text style={{ fontSize: 11, color: currency === c ? "#3b82f6" : "#6b7280" }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setMethod("moneygram")}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: method === "moneygram" ? "#3b82f6" : "#1f2937", backgroundColor: method === "moneygram" ? "rgba(59,130,246,0.1)" : "transparent" }}
            >
              <Banknote size={16} color={method === "moneygram" ? "#3b82f6" : "#6b7280"} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: method === "moneygram" ? "#3b82f6" : "#6b7280" }}>MoneyGram</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMethod("quote")}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: method === "quote" ? "#3b82f6" : "#1f2937", backgroundColor: method === "quote" ? "rgba(59,130,246,0.1)" : "transparent" }}
            >
              <ArrowDownUp size={16} color={method === "quote" ? "#3b82f6" : "#6b7280"} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: method === "quote" ? "#3b82f6" : "#6b7280" }}>{t("buysell.quote", "Quote")}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => setMethod("transak")}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: method === "transak" ? "#818cf8" : "#1f2937", backgroundColor: method === "transak" ? "rgba(99,102,241,0.1)" : "transparent" }}
          >
            <DollarSign size={16} color={method === "transak" ? "#818cf8" : "#6b7280"} />
            <Text style={{ fontSize: 12, fontWeight: "500", color: method === "transak" ? "#818cf8" : "#6b7280" }}>{t("buysell.transak", "Card / Bank (Transak)")}</Text>
          </TouchableOpacity>

          {limits && (
            <Text style={{ fontSize: 10, color: "#6b7280" }}>
              {t("buysell.limits", "Limits")}: ${limits.min} – ${limits.max} USDC · {t("buysell.fee", "Fee")}: {mgInfo?.feePercent}%
            </Text>
          )}

          {method === "moneygram" ? (
            <TouchableOpacity
              onPress={handleMoneyGram}
              disabled={!amount || mgLoading}
              style={{ backgroundColor: "#3b82f6", borderRadius: 8, paddingVertical: 14, alignItems: "center", opacity: (!amount || mgLoading) ? 0.5 : 1 }}
            >
              {mgLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                  {tab === "buy" ? t("buysell.depositMG", "Deposit via MoneyGram") : t("buysell.withdrawMG", "Withdraw via MoneyGram")}
                </Text>
              )}
            </TouchableOpacity>
          ) : method === "transak" ? (
            <TouchableOpacity
              onPress={() => {
                const params = new URLSearchParams({
                  apiKey: "52a6703b-cb9b-4f77-83bc-3682394288fd",
                  environment: "PRODUCTION",
                  cryptoCurrencyCode: "XLM",
                  network: "stellar",
                  defaultCryptoCurrency: "XLM",
                  walletAddress: publicKey,
                  fiatCurrency: currency,
                  fiatAmount: amount || "50",
                  productsAvailed: tab === "buy" ? "BUY" : "SELL",
                  themeColor: "6366f1",
                });
                Linking.openURL("https://global.transak.com/?" + params.toString());
              }}
              disabled={!publicKey}
              style={{ backgroundColor: "#6366f1", borderRadius: 8, paddingVertical: 14, alignItems: "center", opacity: !publicKey ? 0.5 : 1 }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                {tab === "buy" ? t("buysell.transakBuy", "Buy with Transak") : t("buysell.transakSell", "Sell with Transak")}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => quoteMutation.mutate()}
              disabled={!amount || quoteMutation.isPending}
              style={{ backgroundColor: "#3b82f6", borderRadius: 8, paddingVertical: 14, alignItems: "center", opacity: (!amount || quoteMutation.isPending) ? 0.5 : 1 }}
            >
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                {quoteMutation.isPending ? "..." : t("buysell.getQuote", "Get Quote")}
              </Text>
            </TouchableOpacity>
          )}

          {quoteMutation.data && (() => {
            const q = quoteMutation.data as { rate?: string; estimatedAmount?: string; estimatedFiat?: string; fee?: string; feePercent?: number };
            const youGet = tab === "buy" ? `${q.estimatedAmount || "—"} XLM` : `${q.estimatedFiat || "—"} ${currency}`;
            return (
              <View style={{ backgroundColor: "#0a0e1a", borderRadius: 8, padding: 10, gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: "#6b7280" }}>{t("buysell.rate", "Rate")}</Text>
                  <Text style={{ fontSize: 12, color: "#fff" }}>{q.rate || "—"}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: "#6b7280" }}>{t("buysell.youGet", "You get")}</Text>
                  <Text style={{ fontSize: 12, color: "#fff" }}>{youGet}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: "#6b7280" }}>{t("buysell.fee", "Fee")}</Text>
                  <Text style={{ fontSize: 12, color: "#fff" }}>{q.fee || "—"} ({q.feePercent || 0}%)</Text>
                </View>
              </View>
            );
          })()}
        </View>

        {mgInfo?.status === "configured" && (
          <Text style={{ fontSize: 10, textAlign: "center", color: "#6b7280" }}>
            {t("buysell.mgPowered", "Powered by MoneyGram — 174 countries supported")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
