import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../src/shared/store/auth";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const identifier = mode === "email" ? email.trim() : phoneNumber.trim();

  const handleRegister = async () => {
    setError("");
    if (!identifier) {
      setError(mode === "email" ? t("auth.emailRequired") : t("auth.phoneRequired", "Phone number is required"));
      return;
    }
    if (mode === "phone" && !phoneNumber.startsWith("+")) {
      setError(t("auth.phoneFormat", "Phone must start with + (e.g. +14155552671)"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordsMismatch"));
      return;
    }
    setLoading(true);
    try {
      await register({
        email: mode === "email" ? email.trim() : undefined,
        phoneNumber: mode === "phone" ? phoneNumber.trim() : undefined,
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      router.replace("/");
    } catch (e: any) {
      setError(e.message || t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "#1e293b",
    color: "#fff",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#334155",
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0f172a" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 28, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 8 }}>
          {t("auth.createAccount")}
        </Text>
        <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center", marginBottom: 32 }}>
          {t("auth.registerSubtitle")}
        </Text>

        {error ? (
          <View style={{ backgroundColor: "#7f1d1d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: "#fca5a5", fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        {/* Name fields */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.firstName")}</Text>
            <TextInput style={inputStyle} value={firstName} onChangeText={setFirstName} placeholder={t("auth.firstNamePlaceholder")} placeholderTextColor="#475569" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.lastName")}</Text>
            <TextInput style={inputStyle} value={lastName} onChangeText={setLastName} placeholder={t("auth.lastNamePlaceholder")} placeholderTextColor="#475569" />
          </View>
        </View>

        {/* Email / Phone toggle */}
        <View style={{ flexDirection: "row", backgroundColor: "#1e293b", borderRadius: 8, padding: 3, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setMode("email")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 6,
              alignItems: "center",
              backgroundColor: mode === "email" ? "#6366f1" : "transparent",
            }}
          >
            <Text style={{ color: mode === "email" ? "#fff" : "#94a3b8", fontSize: 14, fontWeight: "600" }}>
              {t("auth.email", "Email")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("phone")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 6,
              alignItems: "center",
              backgroundColor: mode === "phone" ? "#6366f1" : "transparent",
            }}
          >
            <Text style={{ color: mode === "phone" ? "#fff" : "#94a3b8", fontSize: 14, fontWeight: "600" }}>
              {t("auth.phone", "Phone")}
            </Text>
          </TouchableOpacity>
        </View>

        {mode === "email" ? (
          <>
            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.email")}</Text>
            <TextInput
              style={{ ...inputStyle, marginBottom: 16 }}
              value={email}
              onChangeText={setEmail}
              placeholder={t("auth.emailPlaceholder")}
              placeholderTextColor="#475569"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <>
            <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.phone", "Phone Number")}</Text>
            <TextInput
              style={{ ...inputStyle, marginBottom: 16 }}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+14155552671"
              placeholderTextColor="#475569"
              keyboardType="phone-pad"
            />
          </>
        )}

        <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.password")}</Text>
        <TextInput style={{ ...inputStyle, marginBottom: 16 }} value={password} onChangeText={setPassword} placeholder={t("auth.passwordPlaceholder")} placeholderTextColor="#475569" secureTextEntry />

        <Text style={{ color: "#94a3b8", fontSize: 14, marginBottom: 6 }}>{t("auth.confirmPassword")}</Text>
        <TextInput style={{ ...inputStyle, marginBottom: 24 }} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t("auth.confirmPasswordPlaceholder")} placeholderTextColor="#475569" secureTextEntry />

        <TouchableOpacity
          onPress={handleRegister}
          disabled={loading}
          style={{
            backgroundColor: loading ? "#4338ca" : "#6366f1",
            borderRadius: 8,
            padding: 16,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{t("auth.register")}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/login")}>
          <Text style={{ color: "#818cf8", fontSize: 14, textAlign: "center" }}>
            {t("auth.hasAccount")} <Text style={{ fontWeight: "600" }}>{t("auth.login")}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
