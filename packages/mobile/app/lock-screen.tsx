import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../src/shared/store/auth";

export default function LockScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const unlock = useAuthStore((s) => s.unlock);
  const logout = useAuthStore((s) => s.logout);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);

    // Auto-submit when 4+ digits and user might be done
    // We wait for explicit submit via button
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError("");
  };

  const handleSubmit = () => {
    if (unlock(pin)) {
      router.replace("/");
    } else {
      setAttempts((a) => a + 1);
      setError(t("pin.incorrect"));
      setPin("");

      // After 5 failed attempts, offer logout
      if (attempts >= 4) {
        setError(t("pin.tooManyAttempts"));
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 8 }}>
        {t("pin.unlockTitle")}
      </Text>
      <Text style={{ fontSize: 14, color: "#94a3b8", marginBottom: 32 }}>
        {t("pin.enterPin")}
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
              backgroundColor: i < pin.length ? "#6366f1" : "#334155",
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

      {pin.length >= 4 && (
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
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{t("pin.unlock")}</Text>
        </TouchableOpacity>
      )}

      {attempts >= 5 && (
        <TouchableOpacity onPress={handleLogout} style={{ marginTop: 24 }}>
          <Text style={{ color: "#f87171", fontSize: 14 }}>{t("settings.logout")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
