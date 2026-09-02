import { useState, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../src/shared/store/wallet";
import { useBalances, TokenBalance } from "../../src/shared/hooks/useBalances";
import { txApi } from "../../src/shared/lib/api";
import TokenIcon from "../../src/components/TokenIcon";
import PinModal from "../../src/components/PinModal";
import { ChevronDown, Search, X } from "lucide-react-native";

export default function SendPage() {
  const { t } = useTranslation();
  const unlock = useWalletStore((s) => s.unlock);
  const getSecretKey = useWalletStore((s) => s.getSecretKey);
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );
  const network = useWalletStore((s) => s.network);
  const { data: balances } = useBalances();

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<TokenBalance | null>(null);

  const xlm = balances?.find((b) => b.assetType === "native" || (!b.assetIssuer && b.assetCode === "XLM"));
  const activeAsset = selectedAsset || xlm || null;

  const filteredBalances = useMemo(() => {
    if (!balances) return [];
    if (!pickerSearch) return balances;
    const q = pickerSearch.toLowerCase();
    return balances.filter(
      (b) =>
        b.assetCode.toLowerCase().includes(q) ||
        b.token?.tomlName?.toLowerCase().includes(q)
    );
  }, [balances, pickerSearch]);

  const validate = (): string | null => {
    if (!destination.trim()) return t("send.enterDest", "Enter a destination address");
    if (destination.length !== 56 || !destination.startsWith("G"))
      return t("send.invalidAddress", "Invalid Stellar address");
    if (!amount || parseFloat(amount) <= 0) return t("send.enterAmount", "Enter a valid amount");
    if (activeAsset && parseFloat(amount) > parseFloat(activeAsset.balance))
      return t("send.insufficientBalance", "Insufficient balance");
    return null;
  };

  const handleSend = () => {
    const err = validate();
    if (err) {
      Alert.alert(t("common.error", "Error"), err);
      return;
    }
    setShowPin(true);
  };

  const executeSend = async (pin: string) => {
    await unlock(pin);
    const secret = getSecretKey();
    if (!secret) throw new Error("Could not retrieve secret key");

    setSending(true);
    try {
      const horizonUrl = network === "testnet"
        ? "https://horizon-testnet.stellar.org"
        : "https://horizon.stellar.org";
      const passphrase = network === "testnet"
        ? "Test SDF Network ; September 2015"
        : "Public Global Stellar Network ; September 2015";

      // Build tx via backend
      const assetCode = activeAsset?.assetCode || "XLM";
      const assetIssuer = activeAsset?.assetIssuer || null;

      const buildRes = await fetch(`${horizonUrl}/accounts/${publicKey}`);
      const accountData = await buildRes.json();

      // Use stellar-base would be ideal but we route through backend
      const res = await fetch("https://ammawallet.com/api/v1/transactions/build-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: publicKey,
          destination: destination.trim(),
          amount: amount.trim(),
          assetCode,
          assetIssuer,
          memo: memo.trim() || undefined,
          network,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to build transaction");
      }

      const { xdr: unsignedXdr } = await res.json();

      // Sign via backend
      const signRes = await fetch("https://ammawallet.com/api/v1/transactions/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xdr: unsignedXdr, secret, network }),
      });

      if (!signRes.ok) throw new Error("Failed to sign transaction");
      const { xdr: signedXdr } = await signRes.json();

      // Submit
      await txApi.submit(signedXdr);

      Alert.alert(t("send.success", "Success"), t("send.txSent", "Transaction sent!"));
      setDestination("");
      setAmount("");
      setMemo("");
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 24 }}>
          {t("nav.send", "Send")}
        </Text>

        {/* Asset Picker */}
        <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
          {t("send.asset", "Asset")}
        </Text>
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            gap: 10,
          }}
        >
          <TokenIcon code={activeAsset?.assetCode || "XLM"} image={activeAsset?.token?.tomlImage} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
              {activeAsset?.assetCode || "XLM"}
            </Text>
            <Text style={{ color: "#6b7280", fontSize: 11 }}>
              {t("send.balance", "Balance")}: {activeAsset ? parseFloat(activeAsset.balance).toFixed(4) : "0"}
            </Text>
          </View>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>

        {/* Destination */}
        <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
          {t("send.destination", "Destination")}
        </Text>
        <TextInput
          value={destination}
          onChangeText={setDestination}
          placeholder="G..."
          placeholderTextColor="#6b7280"
          autoCapitalize="characters"
          style={{
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            color: "#fff",
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 14,
            marginBottom: 16,
            fontFamily: "monospace",
          }}
        />

        {/* Amount */}
        <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
          {t("send.amount", "Amount")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
            style={{
              flex: 1,
              backgroundColor: "#111827",
              borderWidth: 1,
              borderColor: "#1f2937",
              borderRadius: 12,
              color: "#fff",
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 16,
            }}
          />
          <TouchableOpacity
            onPress={() => activeAsset && setAmount(activeAsset.balance)}
            style={{
              backgroundColor: "rgba(59,130,246,0.2)",
              borderRadius: 12,
              paddingHorizontal: 16,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#3b82f6", fontSize: 13, fontWeight: "600" }}>MAX</Text>
          </TouchableOpacity>
        </View>

        {/* Memo */}
        <Text style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
          {t("send.memo", "Memo")} ({t("common.optional", "optional")})
        </Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          placeholder={t("send.memoPlaceholder", "Optional memo")}
          placeholderTextColor="#6b7280"
          style={{
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            color: "#fff",
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 14,
            marginBottom: 24,
          }}
        />

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending}
          style={{
            backgroundColor: "#3b82f6",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: sending ? 0.5 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {t("send.send", "Send")} {activeAsset?.assetCode || "XLM"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Asset Picker Modal */}
      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setShowPicker(false)}
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
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", paddingHorizontal: 20, marginBottom: 12 }}>
              {t("send.selectAsset", "Select Asset")}
            </Text>
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
              {filteredBalances.map((b) => (
                <TouchableOpacity
                  key={`${b.assetCode}-${b.assetIssuer || "native"}`}
                  onPress={() => { setSelectedAsset(b); setShowPicker(false); setPickerSearch(""); }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    gap: 10,
                    backgroundColor: b === activeAsset ? "rgba(59,130,246,0.1)" : "transparent",
                  }}
                >
                  <TokenIcon code={b.assetCode} image={b.token?.tomlImage} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>{b.assetCode}</Text>
                    <Text style={{ color: "#6b7280", fontSize: 11 }}>
                      {b.token?.tomlName || ""}
                    </Text>
                  </View>
                  <Text style={{ color: "#6b7280", fontSize: 12 }}>
                    {parseFloat(b.balance).toFixed(4)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <PinModal
        visible={showPin}
        onClose={() => setShowPin(false)}
        onConfirm={executeSend}
        title={t("send.confirmSend", "Confirm Send")}
      />
    </View>
  );
}