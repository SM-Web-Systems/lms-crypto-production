import { useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { useTranslation } from "react-i18next";
import { useWalletStore } from "../shared/store/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react-native";

export default function NetworkSwitcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const network = useWalletStore((s) => s.network);
  const setNetwork = useWalletStore((s) => s.setNetwork);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<"testnet" | "public">("testnet");

  const handleSwitch = (next: "testnet" | "public") => {
    if (next === network) return;
    setPendingNetwork(next);
    setShowConfirm(true);
  };

  const confirmSwitch = () => {
    setNetwork(pendingNetwork);
    queryClient.invalidateQueries();
    setShowConfirm(false);
  };

  return (
    <>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TouchableOpacity
          onPress={() => handleSwitch("testnet")}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            borderWidth: 1,
            alignItems: "center",
            backgroundColor: network === "testnet" ? "rgba(245,158,11,0.15)" : "#0a0e1a",
            borderColor: network === "testnet" ? "rgba(245,158,11,0.3)" : "#1f2937",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: network === "testnet" ? "#f59e0b" : "#6b7280" }} />
            <Text style={{ color: network === "testnet" ? "#f59e0b" : "#6b7280", fontSize: 13, fontWeight: "600" }}>
              Testnet
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSwitch("public")}
          style={{
            flex: 1,
            paddingVertical: 14,
            borderRadius: 12,
            borderWidth: 1,
            alignItems: "center",
            backgroundColor: network === "public" ? "rgba(16,185,129,0.15)" : "#0a0e1a",
            borderColor: network === "public" ? "rgba(16,185,129,0.3)" : "#1f2937",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: network === "public" ? "#10b981" : "#6b7280" }} />
            <Text style={{ color: network === "public" ? "#10b981" : "#6b7280", fontSize: 13, fontWeight: "600" }}>
              Mainnet
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Custom Confirmation Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#111827",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "#1f2937",
              padding: 24,
              width: "100%",
              maxWidth: 340,
              gap: 16,
            }}
          >
            {/* Icon */}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: pendingNetwork === "public" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertTriangle
                  size={28}
                  color={pendingNetwork === "public" ? "#10b981" : "#f59e0b"}
                />
              </View>
            </View>

            {/* Title */}
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              {t("settings.switchNetwork", "Switch Network")}
            </Text>

            {/* Network Badge */}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: pendingNetwork === "public" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: pendingNetwork === "public" ? "#10b981" : "#f59e0b",
                  }}
                />
                <Text
                  style={{
                    color: pendingNetwork === "public" ? "#10b981" : "#f59e0b",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {pendingNetwork === "public" ? "Public Mainnet" : "Testnet"}
                </Text>
              </View>
            </View>

            {/* Description */}
            <Text style={{ color: "#6b7280", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
              {pendingNetwork === "public"
                ? t(
                    "settings.mainnetWarning",
                    "Switching to PUBLIC mainnet. Real XLM will be used. Make sure you understand the risks."
                  )
                : t(
                    "settings.testnetInfo",
                    "Switching to testnet. Only test XLM, no real value."
                  )}
            </Text>

            {/* Buttons */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setShowConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#1f2937",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#6b7280", fontSize: 14, fontWeight: "500" }}>
                  {t("common.cancel", "Cancel")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={confirmSwitch}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: pendingNetwork === "public" ? "#10b981" : "#f59e0b",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                  {t("common.confirm", "Confirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
