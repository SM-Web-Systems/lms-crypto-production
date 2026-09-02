import { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useWalletStore } from "../../src/shared/store/wallet";
import { useBalances } from "../../src/shared/hooks/useBalances";
import { tokenApi, swapApi, txApi } from "../../src/shared/lib/api";
import TokenIcon from "../../src/components/TokenIcon";
import PinModal from "../../src/components/PinModal";
import { ArrowDownUp, ChevronDown, Search } from "lucide-react-native";

export default function SwapPage() {
  const { t } = useTranslation();
  const unlock = useWalletStore((s) => s.unlock);
  const getSecretKey = useWalletStore((s) => s.getSecretKey);
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );
  const network = useWalletStore((s) => s.network);
  const { data: balances } = useBalances();
  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: () => tokenApi.featured(),
  });

  const [fromToken, setFromToken] = useState<any>(null);
  const [toToken, setToToken] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [showPicker, setShowPicker] = useState<"from" | "to" | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const tokenList = useMemo(() => {
    const all: any[] = [];
    if (balances) all.push(...balances);
    const featList = Array.isArray(featured) ? featured : (featured as any)?.data || [];
    featList.forEach((ft: any) => {
      if (!all.find((a: any) => a.assetCode === ft.assetCode && a.assetIssuer === ft.assetIssuer)) {
        all.push({ ...ft, balance: "0" });
      }
    });
    return all;
  }, [balances, featured]);

  const filteredTokens = useMemo(() => {
    if (!pickerSearch) return tokenList;
    const q = pickerSearch.toLowerCase();
    return tokenList.filter(
      (t: any) => t.assetCode?.toLowerCase().includes(q) || t.tomlName?.toLowerCase().includes(q)
    );
  }, [tokenList, pickerSearch]);

  // Quote
  const quoteParams = useMemo(() => {
    if (!fromToken || !toToken || !amount || parseFloat(amount) <= 0) return null;
    return {
      from_code: fromToken.assetCode,
      from_issuer: fromToken.assetIssuer || "native",
      to_code: toToken.assetCode,
      to_issuer: toToken.assetIssuer || "native",
      amount,
    };
  }, [fromToken, toToken, amount]);

  const { data: quote, isLoading: quoteLoading } = useQuery({
    queryKey: ["swap-quote", quoteParams],
    queryFn: () => swapApi.quote(quoteParams!),
    enabled: !!quoteParams,
    refetchInterval: 10_000,
  });

  const flipTokens = () => {
    const tmp = fromToken;
    setFromToken(toToken);
    setToToken(tmp);
  };

  const selectToken = (token: any) => {
    if (showPicker === "from") setFromToken(token);
    else setToToken(token);
    setShowPicker(null);
    setPickerSearch("");
  };

  const handleSwap = () => {
    if (!fromToken || !toToken) {
      Alert.alert(t("common.error", "Error"), t("swap.selectBoth", "Select both tokens"));
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert(t("common.error", "Error"), t("swap.enterAmount", "Enter an amount"));
      return;
    }
    setShowPin(true);
  };

  const executeSwap = async (pin: string) => {
    await unlock(pin);
    const secret = getSecretKey();
    if (!secret) throw new Error("Could not retrieve secret key");

    setSwapping(true);
    try {
      const buildRes = await swapApi.build({
        source: publicKey,
        from_code: fromToken.assetCode,
        from_issuer: fromToken.assetIssuer || "native",
        to_code: toToken.assetCode,
        to_issuer: toToken.assetIssuer || "native",
        amount,
        network,
      });

      // Sign via backend
      const signRes = await fetch("https://ammawallet.com/api/v1/transactions/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: buildRes.xdr, secret, network }),
      });
      if (!signRes.ok) throw new Error("Failed to sign transaction");
      const { xdr: signedXdr } = await signRes.json();

      await txApi.submit(signedXdr);
      Alert.alert(t("swap.success", "Success"), t("swap.completed", "Swap completed!"));
      setAmount("");
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message);
    } finally {
      setSwapping(false);
    }
  };

  const TokenButton = ({ token, side }: { token: any; side: "from" | "to" }) => (
    <TouchableOpacity
      onPress={() => setShowPicker(side)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#0a0e1a",
        borderWidth: 1,
        borderColor: "#1f2937",
        borderRadius: 10,
        padding: 10,
        gap: 8,
      }}
    >
      {token ? (
        <>
          <TokenIcon code={token.assetCode} image={token.token?.tomlImage || token.tomlImage} size={28} />
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 }}>{token.assetCode}</Text>
        </>
      ) : (
        <Text style={{ color: "#6b7280", fontSize: 14, flex: 1 }}>
          {t("swap.select", "Select token")}
        </Text>
      )}
      <ChevronDown size={14} color="#6b7280" />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 24 }}>
          {t("nav.swap", "Swap")}
        </Text>

        {/* From */}
        <View style={{ backgroundColor: "#111827", borderRadius: 14, borderWidth: 1, borderColor: "#1f2937", padding: 14, marginBottom: 8 }}>
          <Text style={{ color: "#6b7280", fontSize: 11, marginBottom: 8 }}>{t("swap.from", "From")}</Text>
          <TokenButton token={fromToken} side="from" />
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
            style={{
              color: "#fff",
              fontSize: 24,
              fontWeight: "700",
              paddingVertical: 12,
            }}
          />
          {fromToken?.balance && (
            <TouchableOpacity onPress={() => setAmount(fromToken.balance)}>
              <Text style={{ color: "#6b7280", fontSize: 11 }}>
                {t("send.balance", "Balance")}: {parseFloat(fromToken.balance).toFixed(4)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Flip */}
        <View style={{ alignItems: "center", marginVertical: -12, zIndex: 1 }}>
          <TouchableOpacity
            onPress={flipTokens}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "#3b82f6",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 3,
              borderColor: "#0a0e1a",
            }}
          >
            <ArrowDownUp size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* To */}
        <View style={{ backgroundColor: "#111827", borderRadius: 14, borderWidth: 1, borderColor: "#1f2937", padding: 14, marginBottom: 16 }}>
          <Text style={{ color: "#6b7280", fontSize: 11, marginBottom: 8 }}>{t("swap.to", "To")}</Text>
          <TokenButton token={toToken} side="to" />
          {quoteLoading && <ActivityIndicator color="#3b82f6" style={{ marginTop: 12 }} />}
          {quote && !quoteLoading && (
            <View style={{ marginTop: 12, gap: 4 }}>
              <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700" }}>
                ≈ {parseFloat(quote.estimatedAmount || "0").toFixed(4)}
              </Text>
              {quote.rate && (
                <Text style={{ color: "#6b7280", fontSize: 11 }}>
                  1 {fromToken?.assetCode} ≈ {parseFloat(quote.rate).toFixed(6)} {toToken?.assetCode}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Swap Button */}
        <TouchableOpacity
          onPress={handleSwap}
          disabled={swapping || !fromToken || !toToken || !amount}
          style={{
            backgroundColor: "#3b82f6",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: swapping || !fromToken || !toToken || !amount ? 0.5 : 1,
          }}
        >
          {swapping ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {t("swap.swap", "Swap")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Token Picker Modal */}
      <Modal visible={!!showPicker} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowPicker(null)}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
              paddingBottom: 34,
            }}
          >
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#1f2937" }} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#0a0e1a", borderRadius: 10, marginHorizontal: 20, paddingHorizontal: 12, marginBottom: 8 }}>
              <Search size={14} color="#6b7280" />
              <TextInput
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder={t("tokens.search", "Search…")}
                placeholderTextColor="#6b7280"
                style={{ flex: 1, color: "#fff", paddingVertical: 10, paddingLeft: 8, fontSize: 14 }}
              />
            </View>
            <ScrollView>
              {filteredTokens.map((tk: any) => (
                <TouchableOpacity
                  key={`${tk.assetCode}-${tk.assetIssuer || "native"}`}
                  onPress={() => selectToken(tk)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    gap: 10,
                  }}
                >
                  <TokenIcon code={tk.assetCode} image={tk.token?.tomlImage || tk.tomlImage} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{tk.assetCode}</Text>
                    <Text style={{ color: "#6b7280", fontSize: 11 }}>
                      {tk.token?.tomlName || tk.tomlName || ""}
                    </Text>
                  </View>
                  {tk.balance && tk.balance !== "0" && (
                    <Text style={{ color: "#6b7280", fontSize: 11 }}>
                      {parseFloat(tk.balance).toFixed(2)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <PinModal
        visible={showPin}
        onClose={() => setShowPin(false)}
        onConfirm={executeSwap}
        title={t("swap.confirmSwap", "Confirm Swap")}
      />
    </View>
  );
}