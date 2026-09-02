import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../src/shared/store/auth";

export default function SetupPinScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setPin = useAuthStore((s) => s.setPin);

  const [step, setStep] = useState<"create" | "confirm">("create");
  const [pin, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const current = step === "create" ? pin : confirmPin;
  const setCurrent = step === "create" ? setPinValue : setConfirmPin;

  const handleDigit = (digit: string) => {
    if (current.length >= 6) return;
    setCurrent(current + digit);
  };

  const handleDelete = () => {
    setCurrent(current.slice(0, -1));
  };

  const handleSubmit = () => {
    if (step === "create") {
      if (pin.length < 4) {
        setError(t("pin.tooShort"));
        return;
      }
      setStep("confirm");
      setError("");
    } else {
      if (confirmPin !== pin) {
        setError(t("pin.mismatch"));
        setConfirmPin("");
        return;
      }
      setPin(pin);
      router.replace("/");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 8 }}>
        {step === "create" ? t("pin.createTitle") : t("pin.confirmTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32 }}>
        {step === "create" ? t("pin.createSubtitle") : t("pin.confirmSubtitle")}
      </Text>

      {/* Dots */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: i < current.length ? "#6366f1" : "#334155",
            }}
          />
        ))}
      </View>

      {error ? <Text style={{ color: "#f87171", marginBottom: 16 }}>{error}</Text> : null}

      {/* Keypad */}
      <View style={{ width: 260 }}>
        {[[1, 2, 3], [4, 5, 6], [7, 8, 9], ["", 0, "del"]].map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 16 }}>
            {row.map((digit, ci) => {
              if (digit === "") return <View key={ci} style={{ width: 72, height: 72 }} />;
              if (digit === "del") {
                return (
                  <TouchableOpacity
                    key={ci}
                    onPress={handleDelete}
                    style={{ width: 72, height: 72, justifyContent: "center", alignItems: "center" }}
                  >
                    <Text style={{ color: "#94a3b8", fontSize: 18 }}>{t("common.delete")}</Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={ci}
                  onPress={() => handleDigit(String(digit))}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 36,
                    backgroundColor: "#1e293b",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 24, fontWeight: "600" }}>{digit}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {current.length >= 4 && (
        <TouchableOpacity
          onPress={handleSubmit}
          style={{
            backgroundColor: "#6366f1",
            borderRadius: 8,
            paddingHorizontal: 48,
            paddingVertical: 14,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
            {step === "create" ? t("common.next") : t("common.confirm")}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
