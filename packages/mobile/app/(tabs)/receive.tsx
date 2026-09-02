import { useState, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Modal,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../../src/shared/store/wallet";
import { useBalances } from "../../src/shared/hooks/useBalances";
import { useQuery } from "@tanstack/react-query";
import { tokenApi } from "../../src/shared/lib/api";
import TokenIcon from "../../src/components/TokenIcon";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { Copy, Check, ChevronDown, Search, Share2 } from "lucide-react-native";
import { Share } from "react-native";

export default function ReceivePage() {
  const { t } = useTranslation();
  const publicKey = useWalletStore(
    (s) => s.accounts.find((a) => a.id === s.activeAccountId)?.publicKey ?? ""
  );
  const { data: balances } = useBalances();
  const { data: featured } = useQuery({
    queryKey: ["featured"],
    queryFn: () => tokenApi.featured(),
  });

  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedToken, setSelectedToken] = useState<any>(null);

  const tokenList = useMemo(() => {
    const all: any[] = [];
    if (balances) all.push(...balances);
    const featList = Array.isArray(featured) ? featured : (featured as any)?.data || [];
    featList.forEach((ft: any) => {
      if (!all.find((a) => a.assetCode === ft.assetCode && a.assetIssuer === ft.assetIssuer)) {
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

  // Build SEP-7 URI
  const sep7Uri = useMemo(() => {
    if (!publicKey) return "";
    const params = new URLSearchParams();
    params.set("destination", publicKey);
    if (amount) params.set("amount", amount);
    if (memo) params.set("memo", memo);
    if (selectedToken && selectedToken.assetCode !== "XLM") {
      params.set("asset_code", selectedToken.assetCode);
      if (selectedToken.assetIssuer) params.set("asset_issuer", selectedToken.assetIssuer);
    }
    return `web+stellar:pay?${params.toString()}`;
  }, [publicKey, amount, memo, selectedToken]);

  const qrValue = amount || memo || selectedToken ? sep7Uri : publicKey;

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(qrValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareAddress = async () => {
    try {
      await Share.share({ message: qrValue });
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0e1a" }}>
      <ScrollView contentContainerStyle={{ alignItems: "center", padding: 20, paddingTop: 60 }}>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 20 }}>
          {t("nav.receive", "Receive")}
        </Text>

        {/* Token Picker */}
        <TouchableOpacity
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            alignSelf: "stretch",
            gap: 10,
          }}
        >
          <TokenIcon
            code={selectedToken?.assetCode || "XLM"}
            image={selectedToken?.token?.tomlImage || selectedToken?.tomlImage}
            size={28}
          />
          <Text style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" }}>
            {selectedToken?.assetCode || "XLM"} – {t("receive.anyToken", "Any token")}
          </Text>
          <ChevronDown size={16} color="#6b7280" />
        </TouchableOpacity>

        {/* QR Code */}
        <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 16, marginBottom: 20 }}>
          <QRCode value={qrValue || "stellar"} size={200} />
        </View>

        {/* Amount & Memo */}
        <View style={{ alignSelf: "stretch", gap: 12, marginBottom: 16 }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder={t("receive.amount", "Amount (optional)")}
            placeholderTextColor="#6b7280"
            keyboardType="decimal-pad"
            style={{
              backgroundColor: "#111827",
              borderWidth: 1,
              borderColor: "#1f2937",
              borderRadius: 12,
              color: "#fff",
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 14,
            }}
          />
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder={t("receive.memo", "Memo (optional)")}
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
            }}
          />
        </View>

        {/* Address */}
        <TouchableOpacity
          onPress={copyToClipboard}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#111827",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#1f2937",
            paddingHorizontal: 14,
            paddingVertical: 12,
            alignSelf: "stretch",
            marginBottom: 12,
          }}
        >
          <Text
            style={{ flex: 1, color: "#6b7280", fontSize: 11, fontFamily: "monospace" }}
            numberOfLines={2}
          >
            {qrValue}
          </Text>
          {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} color="#6b7280" />}
        </TouchableOpacity>

        {/* Share Button */}
        <TouchableOpacity
          onPress={shareAddress}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#3b82f6",
            borderRadius: 14,
            paddingVertical: 14,
            alignSelf: "stretch",
          }}
        >
          <Share2 size={16} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
            {t("receive.share", "Share Address")}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Token Picker Modal */}
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
              {/* Default: any / XLM */}
              <TouchableOpacity
                onPress={() => { setSelectedToken(null); setShowPicker(false); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  gap: 10,
                  backgroundColor: !selectedToken ? "rgba(59,130,246,0.1)" : "transparent",
                }}
              >
                <TokenIcon code="XLM" size={32} />
                <Text style={{ color: "#fff", fontSize: 14 }}>XLM – {t("receive.default", "Default")}</Text>
              </TouchableOpacity>

              {filteredTokens.map((tk: any) => (
                <TouchableOpacity
                  key={`${tk.assetCode}-${tk.assetIssuer || "native"}`}
                  onPress={() => { setSelectedToken(tk); setShowPicker(false); setPickerSearch(""); }}
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
                  {tk.balance !== "0" && (
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
    </View>
  );
}